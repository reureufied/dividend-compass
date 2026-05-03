// Parse multiple dividend records from a user-uploaded screenshot using Lovable AI Vision.
// Returns: { results: Array<{ date?, asset_name?, amount?, currency?, category? }> }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = ["한국 주식", "한국 ETF", "미국 주식", "미국 ETF", "채권", "기타"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageDataUrl, knownAssetNames } = await req.json().catch(() => ({}));
    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      console.error("Invalid imageDataUrl payload");
      return json({ error: "이미지 파일이 올바르지 않습니다.", code: "BAD_IMAGE" }, 400);
    }
    const knownList: string[] = Array.isArray(knownAssetNames)
      ? knownAssetNames.filter((n) => typeof n === "string" && n.trim()).slice(0, 500)
      : [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY missing");
      return json({ error: "AI API Key가 설정되지 않았습니다.", code: "NO_API_KEY" }, 500);
    }

    const systemPrompt = `당신은 한국 증권사/뱅킹 앱(토스증권, 키움, 미래에셋, 한국투자, 삼성증권, NH, KB, 신한, 하나, IBK 등) 캡처 화면에서 **배당금/분배금 입금 내역**만 정확히 추출하는 금융 OCR 전문가입니다.

[집중 키워드]
"배당금", "분배금", "외화배당금", "현금배당", "주식배당", "Dividend", "Distribution", "입금", "수령", "지급", "달러", "원", "USD", "KRW", "$", "₩"

[추출 규칙]
- 화면에 보이는 **모든** 배당/분배금 거래를 끝까지 빠짐없이 스캔하여 records 배열에 담으세요.
- 매수/매도/이체/수수료/세금 환급/예수금 등 일반 거래는 제외하세요.
- 같은 종목이라도 날짜·금액이 다르면 별개의 행으로 분리하세요.

[필드]
- date: YYYY-MM-DD. 화면에 "03.15" 처럼 연도가 없으면 올해(${new Date().getFullYear()})로 가정.
- asset_name: 종목명 또는 티커. 한글이면 한글 그대로(예: 삼성전자, TIGER 미국S&P500). 영문 티커면 대문자(예: SCHD, JEPI).
- amount: 숫자만. 통화기호/콤마/+/- 모두 제외. 세전 금액 우선, 없으면 입금액.
- currency: 원화면 "KRW", 달러면 "USD". ₩/원 표시 → KRW, $/USD 표시 → USD.
- category: ${CATEGORIES.join(", ")} 중 추정. 미국 ETF/주식/한국 ETF/주식 여부를 종목명·통화로 추정. 모르면 "기타".

[중요]
- 반드시 fill_dividends 도구를 호출.
- 배당 내역이 한 건도 없으면 records: [] 로 호출.
- 추측·환각 금지. 화면에서 보이는 값만 사용.

[기존 보유 종목 리스트 — 매우 중요]
${knownList.length > 0
  ? `다음은 사용자가 이미 보유/기록한 종목명 목록입니다. 이미지에서 종목명을 추출할 때 띄어쓰기·영문/한글 혼용·약어 등 표현이 살짝 다르더라도 의미상 같은 종목이라면 반드시 아래 리스트에 있는 정확한 이름 그대로 출력하세요.\n${knownList.map((n) => `- ${n}`).join("\n")}`
  : "(등록된 기존 종목 없음 — 화면에서 보이는 이름 그대로 추출)"}`;

    const tools = [
      {
        type: "function",
        function: {
          name: "fill_dividends",
          description: "Return all dividend/distribution records visible in the screenshot.",
          parameters: {
            type: "object",
            properties: {
              records: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string", description: "YYYY-MM-DD" },
                    asset_name: { type: "string" },
                    amount: { type: "number" },
                    currency: { type: "string", enum: ["USD", "KRW"] },
                    category: { type: "string", enum: CATEGORIES },
                  },
                  additionalProperties: false,
                },
              },
              text_readable: {
                type: "boolean",
                description: "이미지에서 글자가 인식 가능했으면 true, 흐릿하거나 글자가 전혀 없으면 false",
              },
            },
            required: ["records", "text_readable"],
            additionalProperties: false,
          },
        },
      },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "이 한국 증권사/뱅킹 앱 스크린샷에서 모든 배당/분배금 입금 내역을 추출해 fill_dividends 도구를 호출하세요.",
              },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "fill_dividends" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => "");
      console.error("AI gateway error", aiResp.status, errText);
      if (aiResp.status === 401 || aiResp.status === 403) {
        return json({ error: "AI API Key가 설정되지 않았습니다.", code: "NO_API_KEY" }, 500);
      }
      if (aiResp.status === 429) {
        return json({ error: "AI 사용량이 많아요. 잠시 후 다시 시도해 주세요.", code: "RATE_LIMIT" }, 429);
      }
      if (aiResp.status === 402) {
        return json({ error: "Lovable AI 크레딧이 부족합니다.", code: "NO_CREDITS" }, 402);
      }
      return json({ error: "AI 분석 서버 오류가 발생했어요.", code: "AI_ERROR", detail: errText.slice(0, 500) }, 500);
    }

    const data = await aiResp.json();
    const message = data?.choices?.[0]?.message;
    const call = message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;

    if (!argsStr) {
      console.error("No tool_call in AI response", JSON.stringify(data).slice(0, 1000));
      return json(
        { error: "이미지에서 글자를 읽을 수 없습니다.", code: "OCR_UNREADABLE" },
        422
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch (e) {
      console.error("Failed to parse tool args", argsStr);
      return json({ error: "AI 응답을 해석하지 못했어요.", code: "PARSE_ERROR" }, 500);
    }

    const results = Array.isArray(parsed?.records) ? parsed.records : [];
    const readable = parsed?.text_readable !== false;

    console.log(`OCR result: readable=${readable}, records=${results.length}`);

    if (!readable && results.length === 0) {
      return json({ error: "이미지에서 글자를 읽을 수 없습니다.", code: "OCR_UNREADABLE" }, 422);
    }
    if (results.length === 0) {
      return json(
        { error: "배당 내역을 찾을 수 없습니다. 다시 촬영해 주세요.", code: "NO_DIVIDENDS" },
        422
      );
    }

    return json({ results });
  } catch (e) {
    console.error("parse-dividend-screenshot fatal:", e);
    return json(
      { error: e instanceof Error ? e.message : "Unknown error", code: "FATAL" },
      500
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

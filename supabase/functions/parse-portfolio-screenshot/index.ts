// Parse multiple portfolio holding records from a user-uploaded screenshot using Lovable AI Vision.
// Returns: { results: Array<{ asset_name, quantity, avg_purchase_price, current_price }> }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageDataUrl, knownAssetNames } = await req.json().catch(() => ({}));
    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return json({ error: "이미지 파일이 올바르지 않습니다.", code: "BAD_IMAGE" }, 400);
    }
    const knownList: string[] = Array.isArray(knownAssetNames)
      ? knownAssetNames.filter((n: any) => typeof n === "string" && n.trim()).slice(0, 500)
      : [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "AI API Key가 설정되지 않았습니다.", code: "NO_API_KEY" }, 500);
    }

    const systemPrompt = `당신은 한국 증권사 앱(토스증권, 키움, 미래에셋, 한국투자, 삼성증권, NH, KB, 신한 등) **자산/잔고/보유종목 화면** 캡처에서 보유 주식 정보를 추출하는 OCR 전문가입니다.

[목표 추출 항목]
- asset_name: 종목명/티커. 한글이면 한글, 영문이면 대문자
- quantity: 보유 수량(주). 숫자만
- avg_purchase_price: 평균 매수"단가" (1주당 가격). 화면에 단가가 없으면 비워두세요.
- current_price: 현재 "단가" (1주당 가격). 화면에 단가가 없으면 비워두세요.
- total_purchase_amount: 총 매수금액/매입금액 (총액). 컬럼이 있으면, 없으면 비워두세요.
- evaluation_amount: 평가금액 (현재 평가 총액). 컬럼이 있으면, 없으면 비워두세요.

[중요 - 단가 vs 총액 구분]
- "매수단가/평균단가/평단/매입가" → avg_purchase_price (단가)
- "매수금액/매입금액/원금" → total_purchase_amount (총액)
- "현재가/현재단가/시세" → current_price (단가)
- "평가금액/평가액" → evaluation_amount (총액)

[규칙]
- 화면의 모든 보유 종목을 빠짐없이 추출. 예수금/매도완료 제외.
- 손익·수익률 추출 금지. 추측 금지. 화면에 없는 값은 비워두세요(0이 아님).
- 반드시 fill_holdings 도구를 호출. 종목 없으면 records: [].

[기존 보유 종목 리스트 — 매우 중요]
${knownList.length > 0
  ? `다음은 사용자가 이미 보유/기록한 종목명 목록입니다. 이미지에서 종목명을 추출할 때 띄어쓰기·영문/한글 혼용·약어 등 표현이 살짝 다르더라도 의미상 같은 종목이라면 반드시 아래 리스트에 있는 정확한 이름 그대로 출력하세요.\n${knownList.map((n) => `- ${n}`).join("\n")}`
  : "(등록된 기존 종목 없음 — 화면에서 보이는 이름 그대로 추출)"}`;

    const tools = [
      {
        type: "function",
        function: {
          name: "fill_holdings",
          description: "Return all stock holdings visible in the portfolio screenshot.",
          parameters: {
            type: "object",
            properties: {
              records: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    asset_name: { type: "string" },
                    quantity: { type: "number" },
                    avg_purchase_price: { type: ["number", "null"] },
                    current_price: { type: ["number", "null"] },
                    total_purchase_amount: { type: ["number", "null"] },
                    evaluation_amount: { type: ["number", "null"] },
                  },
                  additionalProperties: false,
                },
              },
              text_readable: { type: "boolean" },
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
              { type: "text", text: "이 증권사 자산 화면에서 모든 보유 종목 정보를 추출해 fill_holdings 도구를 호출하세요." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "fill_holdings" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => "");
      console.error("AI gateway error", aiResp.status, errText);
      if (aiResp.status === 401 || aiResp.status === 403)
        return json({ error: "AI API Key가 설정되지 않았습니다.", code: "NO_API_KEY" }, 500);
      if (aiResp.status === 429)
        return json({ error: "AI 사용량이 많아요. 잠시 후 다시 시도해 주세요.", code: "RATE_LIMIT" }, 429);
      if (aiResp.status === 402)
        return json({ error: "Lovable AI 크레딧이 부족합니다.", code: "NO_CREDITS" }, 402);
      return json({ error: "AI 분석 서버 오류", code: "AI_ERROR" }, 500);
    }

    const data = await aiResp.json();
    const argsStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return json({ error: "이미지에서 글자를 읽을 수 없습니다.", code: "OCR_UNREADABLE" }, 422);

    let parsed: any;
    try { parsed = JSON.parse(argsStr); }
    catch { return json({ error: "AI 응답을 해석하지 못했어요.", code: "PARSE_ERROR" }, 500); }

    const rawResults = Array.isArray(parsed?.records) ? parsed.records : [];
    const readable = parsed?.text_readable !== false;
    if (!readable && rawResults.length === 0)
      return json({ error: "이미지에서 글자를 읽을 수 없습니다.", code: "OCR_UNREADABLE" }, 422);
    if (rawResults.length === 0)
      return json({ error: "보유 종목 정보를 찾을 수 없습니다. 다시 촬영해 주세요.", code: "NO_HOLDINGS" }, 422);

    // Post-process: derive unit prices from totals when missing (avoid divide-by-zero)
    const results = rawResults.map((r: any) => {
      const qty = Number(r?.quantity) || 0;
      let avg = Number(r?.avg_purchase_price) || 0;
      let cur = Number(r?.current_price) || 0;
      const totalBuy = Number(r?.total_purchase_amount) || 0;
      const evalAmt = Number(r?.evaluation_amount) || 0;
      const computed: string[] = [];
      if (avg <= 0 && totalBuy > 0 && qty > 0) {
        avg = totalBuy / qty;
        computed.push("avg_purchase_price");
      }
      if (cur <= 0 && evalAmt > 0 && qty > 0) {
        cur = evalAmt / qty;
        computed.push("current_price");
      }
      return {
        asset_name: r?.asset_name ?? "",
        quantity: qty,
        avg_purchase_price: avg,
        current_price: cur,
        computed_fields: computed,
      };
    });

    return json({ results });
  } catch (e) {
    console.error("parse-portfolio-screenshot fatal:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error", code: "FATAL" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

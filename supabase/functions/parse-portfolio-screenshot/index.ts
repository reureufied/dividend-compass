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
    const { imageDataUrl } = await req.json().catch(() => ({}));
    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return json({ error: "이미지 파일이 올바르지 않습니다.", code: "BAD_IMAGE" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "AI API Key가 설정되지 않았습니다.", code: "NO_API_KEY" }, 500);
    }

    const systemPrompt = `당신은 한국 증권사 앱(토스증권, 키움, 미래에셋, 한국투자, 삼성증권, NH, KB, 신한 등) **자산/잔고/보유종목 화면** 캡처에서 보유 주식 정보를 추출하는 OCR 전문가입니다.

[목표 추출 항목]
- asset_name: 종목명/티커. 한글이면 한글, 영문이면 대문자 (예: 삼성전자, TIGER 미국S&P500, SCHD)
- quantity: 보유 수량(주). 숫자만, 콤마/단위(주) 제외
- avg_purchase_price: 평균 매수단가. 숫자만, 통화기호/콤마 제외
- current_price: 현재가/현재단가. 숫자만, 통화기호/콤마 제외

[키워드]
"보유수량", "수량", "잔고", "평균단가", "매수평균가", "평단", "매입가", "현재가", "현재단가", "시세", "평가금액", "평가손익", "수익률"

[규칙]
- 화면에 보이는 모든 보유 종목을 끝까지 빠짐없이 추출하세요.
- 매도 완료된/이미 청산된 종목, 예수금, 입출금 내역은 제외.
- 평가금액·손익·수익률은 따로 추출하지 마세요(클라이언트가 계산).
- 추측 금지. 화면에 없는 값은 0으로 두지 말고 비워두세요.
- 반드시 fill_holdings 도구를 호출하세요.
- 보유 종목이 한 건도 없으면 records: [] 로 호출.`;

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
                    avg_purchase_price: { type: "number" },
                    current_price: { type: "number" },
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

    const results = Array.isArray(parsed?.records) ? parsed.records : [];
    const readable = parsed?.text_readable !== false;
    if (!readable && results.length === 0)
      return json({ error: "이미지에서 글자를 읽을 수 없습니다.", code: "OCR_UNREADABLE" }, 422);
    if (results.length === 0)
      return json({ error: "보유 종목 정보를 찾을 수 없습니다. 다시 촬영해 주세요.", code: "NO_HOLDINGS" }, 422);

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

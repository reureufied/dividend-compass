// Parse a dividend record from a user-uploaded screenshot using Lovable AI Vision.
// Returns: { date?: 'YYYY-MM-DD', asset_name?: string, amount?: number, currency?: 'USD'|'KRW', category?: string }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = ["한국 주식", "한국 ETF", "미국 주식", "미국 ETF", "채권", "기타"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageDataUrl } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return json({ error: "imageDataUrl(data:image/...) is required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY is not configured" }, 500);

    const systemPrompt = `당신은 한국어/영어 증권/뱅킹 앱의 배당금 입력 화면 스크린샷을 분석하는 OCR 전문가입니다.
이미지에서 단일 배당 거래에 해당하는 값을 추출해 주어진 도구를 호출하세요.
- date: YYYY-MM-DD (예: 2025-03-15). 연도가 없으면 올해로 가정.
- asset_name: 종목명 또는 티커 (예: SCHD, 삼성전자).
- amount: 숫자만, 통화기호/콤마 제외.
- currency: 원화면 KRW, 달러면 USD.
- category: ${CATEGORIES.join(", ")} 중 하나로 추정. 미국 종목/ETF/한국 종목 여부를 보고 결정. 모르면 "기타".
값을 못 찾으면 해당 필드를 생략하세요. 추측은 금지.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "fill_dividend",
          description: "Return extracted dividend record fields.",
          parameters: {
            type: "object",
            properties: {
              date: { type: "string", description: "YYYY-MM-DD" },
              asset_name: { type: "string" },
              amount: { type: "number" },
              currency: { type: "string", enum: ["USD", "KRW"] },
              category: { type: "string", enum: CATEGORIES },
              confidence: { type: "number", description: "0~1 사이 확신도" },
            },
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
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "이 스크린샷에서 배당 정보를 추출해 fill_dividend 도구를 호출하세요." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "fill_dividend" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "AI 사용량이 많아요. 잠시 후 다시 시도해 주세요." }, 429);
      if (aiResp.status === 402) return json({ error: "Lovable AI 크레딧이 부족합니다." }, 402);
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return json({ error: "AI 분석에 실패했습니다." }, 500);
    }

    const data = await aiResp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) return json({ error: "이미지에서 배당 정보를 찾지 못했어요." }, 422);

    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return json({ error: "AI 응답을 해석하지 못했어요." }, 500);
    }

    return json({ result: parsed });
  } catch (e) {
    console.error("parse-dividend-screenshot error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

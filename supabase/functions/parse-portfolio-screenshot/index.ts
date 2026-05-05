// Parse portfolio holdings from a screenshot using Google Gemini 1.5 Flash directly.
// Returns: { results: Array<{ asset_name, quantity, avg_purchase_price, current_price, computed_fields }> }

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

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return json({ error: "Gemini API Key가 설정되지 않았습니다. 수동 입력을 이용해 주세요.", code: "NO_API_KEY" }, 500);
    }

    const m = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) return json({ error: "이미지 형식을 인식할 수 없습니다.", code: "BAD_IMAGE" }, 400);
    const mimeType = m[1];
    const base64 = m[2];

    const systemPrompt = `당신은 한국 증권사 앱 자산/잔고/보유종목 화면 캡처에서 보유 주식 정보를 추출하는 OCR 전문가입니다.

[추출 항목]
- asset_name: 종목명/티커 (한글이면 한글, 영문은 대문자)
- quantity: 보유 수량(주)
- avg_purchase_price: 평균 매수 단가(1주당). 화면에 단가가 없으면 null
- current_price: 현재 단가(1주당). 화면에 단가가 없으면 null
- total_purchase_amount: 총 매수금액(총액). 컬럼 없으면 null
- evaluation_amount: 평가금액(총액). 컬럼 없으면 null

[단가 vs 총액 구분]
- "매수단가/평균단가/평단/매입가" → avg_purchase_price
- "매수금액/매입금액/원금" → total_purchase_amount
- "현재가/현재단가/시세" → current_price
- "평가금액/평가액" → evaluation_amount

[규칙]
- 모든 보유 종목을 빠짐없이 추출. 예수금/매도완료 제외.
- 손익·수익률 추출 금지. 화면에 없는 값은 null (0이 아님).
- 반드시 JSON만 반환. 코드블록·설명 없이 순수 JSON.
- 종목 없으면 records: [].

[기존 보유 종목 리스트]
${knownList.length > 0
  ? `이미지의 종목명이 표기 차이가 있어도 의미상 같다면 아래 이름 그대로 출력:\n${knownList.map((n) => `- ${n}`).join("\n")}`
  : "(없음)"}`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        records: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              asset_name: { type: "STRING" },
              quantity: { type: "NUMBER" },
              avg_purchase_price: { type: "NUMBER", nullable: true },
              current_price: { type: "NUMBER", nullable: true },
              total_purchase_amount: { type: "NUMBER", nullable: true },
              evaluation_amount: { type: "NUMBER", nullable: true },
            },
            required: ["asset_name", "quantity"],
          },
        },
        text_readable: { type: "BOOLEAN" },
      },
      required: ["records", "text_readable"],
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const aiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: "user",
          parts: [
            { text: "이 자산 화면에서 모든 보유 종목 정보를 JSON으로 추출하세요." },
            { inlineData: { mimeType, data: base64 } },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.1,
        },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => "");
      console.error("Gemini error", aiResp.status, errText);
      if (aiResp.status === 401 || aiResp.status === 403)
        return json({ error: "Gemini API Key가 유효하지 않습니다. 수동 입력을 이용해 주세요.", code: "NO_API_KEY" }, 500);
      if (aiResp.status === 429)
        return json({ error: "Gemini 사용량 한도를 초과했어요. 잠시 후 다시 시도하거나 수동 입력을 이용해 주세요.", code: "RATE_LIMIT" }, 429);
      return json({ error: "AI 분석에 실패했어요. 수동 입력을 이용해 주세요.", code: "AI_ERROR" }, 500);
    }

    const data = await aiResp.json();
    const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("[Gemini raw response - portfolio]", JSON.stringify(data).slice(0, 4000));
    if (!textOut) return json({ error: "이미지에서 글자를 읽을 수 없습니다. 수동 입력을 이용해 주세요.", code: "OCR_UNREADABLE", rawResponse: data }, 422);

    const cleaned = cleanJsonText(textOut);
    console.log("[Gemini cleaned text - portfolio]", cleaned.slice(0, 2000));
    let parsed: any;
    try { parsed = JSON.parse(cleaned); }
    catch (err) {
      console.error("Failed to parse Gemini JSON:", err, cleaned.slice(0, 500));
      return json({ error: "AI 응답을 해석하지 못했어요. 수동 입력을 이용해 주세요.", code: "PARSE_ERROR", rawText: textOut }, 500);
    }

    const rawResults = Array.isArray(parsed?.records) ? parsed.records : [];
    const readable = parsed?.text_readable !== false;
    if (!readable && rawResults.length === 0)
      return json({ error: "이미지에서 글자를 읽을 수 없습니다. 수동 입력을 이용해 주세요.", code: "OCR_UNREADABLE" }, 422);
    if (rawResults.length === 0)
      return json({ error: "보유 종목을 찾을 수 없습니다. 다시 촬영하거나 수동 입력을 이용해 주세요.", code: "NO_HOLDINGS" }, 422);

    // Derive unit prices from totals when missing (avoid divide-by-zero)
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
    return json({ error: "분석 중 오류가 발생했어요. 수동 입력을 이용해 주세요.", code: "FATAL" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

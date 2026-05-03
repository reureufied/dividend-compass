// Parse multiple dividend records from a screenshot using Google Gemini 1.5 Flash directly.
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
      return json({ error: "이미지 파일이 올바르지 않습니다.", code: "BAD_IMAGE" }, 400);
    }
    const knownList: string[] = Array.isArray(knownAssetNames)
      ? knownAssetNames.filter((n: any) => typeof n === "string" && n.trim()).slice(0, 500)
      : [];

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return json({ error: "Gemini API Key가 설정되지 않았습니다. 수동 입력을 이용해 주세요.", code: "NO_API_KEY" }, 500);
    }

    // Parse data URL → mimeType + base64
    const m = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) return json({ error: "이미지 형식을 인식할 수 없습니다.", code: "BAD_IMAGE" }, 400);
    const mimeType = m[1];
    const base64 = m[2];

    const systemPrompt = `당신은 한국 증권사/뱅킹 앱(토스증권, 키움, 미래에셋, 한국투자, 삼성증권, NH, KB, 신한, 하나, IBK 등) 캡처 화면에서 **배당금/분배금 입금 내역**만 정확히 추출하는 금융 OCR 전문가입니다.

[추출 규칙]
- "배당금","분배금","외화배당금","현금배당","Dividend","Distribution" 등 배당 관련 거래만 모두 추출.
- 매수/매도/이체/수수료/세금환급/예수금 등 일반 거래 제외.
- 같은 종목이라도 날짜·금액이 다르면 별개의 행.

[필드]
- date: YYYY-MM-DD. 연도가 없으면 ${new Date().getFullYear()}로 가정.
- asset_name: 종목명 또는 티커(영문은 대문자).
- amount: 숫자만(콤마/통화기호 제외, 세전 우선).
- currency: "KRW" 또는 "USD".
- category: ${CATEGORIES.join(", ")} 중 하나. 모르면 "기타".

[응답 형식]
- 반드시 JSON만 반환. 코드블록(\`\`\`)이나 설명문 없이 순수 JSON.
- 형식: { "records": [...], "text_readable": true|false }
- 배당 내역이 없으면 records: [].

[기존 보유 종목 리스트 — 매우 중요]
${knownList.length > 0
  ? `다음은 사용자가 이미 보유/기록한 종목명 목록입니다. 이미지의 종목명이 띄어쓰기·표기 차이가 있어도 의미상 같다면 반드시 아래 이름 그대로 출력하세요.\n${knownList.map((n) => `- ${n}`).join("\n")}`
  : "(등록된 기존 종목 없음)"}`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        records: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              date: { type: "STRING" },
              asset_name: { type: "STRING" },
              amount: { type: "NUMBER" },
              currency: { type: "STRING", enum: ["USD", "KRW"] },
              category: { type: "STRING", enum: CATEGORIES },
            },
            required: ["date", "asset_name", "amount", "currency", "category"],
          },
        },
        text_readable: { type: "BOOLEAN" },
      },
      required: ["records", "text_readable"],
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const aiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: "user",
          parts: [
            { text: "이 스크린샷에서 모든 배당/분배금 내역을 추출해 JSON으로 반환하세요." },
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
    if (!textOut) return json({ error: "이미지에서 글자를 읽을 수 없습니다. 수동 입력을 이용해 주세요.", code: "OCR_UNREADABLE" }, 422);

    let parsed: any;
    try { parsed = JSON.parse(textOut); }
    catch {
      console.error("Failed to parse Gemini JSON:", textOut.slice(0, 500));
      return json({ error: "AI 응답을 해석하지 못했어요. 수동 입력을 이용해 주세요.", code: "PARSE_ERROR" }, 500);
    }

    const results = Array.isArray(parsed?.records) ? parsed.records : [];
    const readable = parsed?.text_readable !== false;

    if (!readable && results.length === 0)
      return json({ error: "이미지에서 글자를 읽을 수 없습니다. 수동 입력을 이용해 주세요.", code: "OCR_UNREADABLE" }, 422);
    if (results.length === 0)
      return json({ error: "배당 내역을 찾을 수 없습니다. 다시 촬영하거나 수동 입력을 이용해 주세요.", code: "NO_DIVIDENDS" }, 422);

    return json({ results });
  } catch (e) {
    console.error("parse-dividend-screenshot fatal:", e);
    return json({ error: "분석 중 오류가 발생했어요. 수동 입력을 이용해 주세요.", code: "FATAL" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

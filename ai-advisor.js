// netlify/functions/ai-advisor.js
//
// Uses Google Gemini (free tier, no credit card required) instead of
// Anthropic's Claude API. Get a free key at https://aistudio.google.com
// → "Get API key" → "Create API key" — no billing setup needed.
//
// Requires the environment variable GEMINI_API_KEY to be set in
// Netlify (Site configuration → Environment variables).

const ADVISOR_SYSTEM_PROMPT = `You are the AI Financial Copilot inside Kinlgali Investing, an education-only financial planning tool — you are NOT a registered investment adviser, and nothing you say is personalized investment, legal, or tax advice. Answer using general, widely-known financial planning principles, keeping answers concise (3-6 short paragraphs max) and plain-spoken. Never recommend individual company stocks — only asset classes or diversified index funds/ETFs. Always keep in mind the user's drafted brief context if provided. If a question falls outside general education (e.g. asks you to guarantee returns, predict specific prices, or give personalized tax/legal conclusions), say so plainly and suggest a licensed professional. Do not use markdown headers or bullet lists heavy with asterisks — write in plain prose paragraphs.`;

const DEFAULT_GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
].filter(Boolean);

function parseGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('\n').trim();
}

function geminiFailureMessage(data, status) {
  const apiMessage = data?.error?.message;
  const finishReason = data?.candidates?.[0]?.finishReason;
  if (apiMessage) return apiMessage;
  if (finishReason) return 'Gemini stopped without text. Finish reason: ' + finishReason;
  return 'AI request failed (' + status + ')';
}

exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'AI service is not configured. Add GEMINI_API_KEY in Netlify environment variables.',
      }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { userText, contextNote } = body;
  if (!userText) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing userText' }) };
  }

  const prompt = contextNote
    ? `Context on my current drafted brief: ${contextNote}\n\nMy question: ${userText}`
    : userText;

  try {
    let lastError = null;

    for (const model of DEFAULT_GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: ADVISOR_SYSTEM_PROMPT }] },
          generationConfig: { maxOutputTokens: 700, temperature: 0.45 },
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = { error: { message: await res.text().catch(() => '') } };
      }

      if (!res.ok) {
        const message = geminiFailureMessage(data, res.status);
        lastError = { model, status: res.status, message };
        console.error('Gemini API error:', lastError);
        if (res.status === 404 || res.status === 429 || res.status >= 500) continue;
        return {
          statusCode: 502,
          headers,
          body: JSON.stringify({ error: message, model }),
        };
      }

      const text = parseGeminiText(data);
      if (text) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ text, model }),
        };
      }

      lastError = { model, status: 200, message: geminiFailureMessage(data, 200) };
    }

    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: lastError?.message || "I wasn't able to generate a response — try rephrasing your question.",
        model: lastError?.model,
      }),
    };
  } catch (err) {
    console.error('ai-advisor function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

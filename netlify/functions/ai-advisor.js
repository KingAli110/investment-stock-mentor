// netlify/functions/ai-advisor.js
//
// Uses Google Gemini (free tier, no credit card required) instead of
// Anthropic's Claude API. Get a free key at https://aistudio.google.com
// → "Get API key" → "Create API key" — no billing setup needed.
//
// Requires the environment variable GEMINI_API_KEY to be set in
// Netlify (Site configuration → Environment variables).

const ADVISOR_SYSTEM_PROMPT = `You are the AI Financial Copilot inside Kinlgali Investing, an education-only financial planning tool — you are NOT a registered investment adviser, and nothing you say is personalized investment, legal, or tax advice. Answer using general, widely-known financial planning principles, keeping answers concise (3-6 short paragraphs max) and plain-spoken. Never recommend individual company stocks — only asset classes or diversified index funds/ETFs. Always keep in mind the user's drafted brief context if provided. If a question falls outside general education (e.g. asks you to guarantee returns, predict specific prices, or give personalized tax/legal conclusions), say so plainly and suggest a licensed professional. Do not use markdown headers or bullet lists heavy with asterisks — write in plain prose paragraphs.`;

const GEMINI_MODEL = 'gemini-2.5-flash'; // free-tier model with the highest daily quota

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { userText, contextNote, systemOverride } = body;
  if (!userText) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing userText' }) };
  }

  const prompt = contextNote
    ? `Context on my current drafted brief: ${contextNote}\n\nMy question: ${userText}`
    : userText;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemOverride || ADVISOR_SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 700 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini API error:', res.status, errText);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'AI request failed (' + res.status + ')' }),
      };
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n').trim();

    return {
      statusCode: 200,
      body: JSON.stringify({ text: text || "I wasn't able to generate a response — try rephrasing your question." }),
    };
  } catch (err) {
    console.error('ai-advisor function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
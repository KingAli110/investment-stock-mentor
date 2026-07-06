// netlify/functions/ai-advisor.js
//
// The browser can't call api.anthropic.com directly — this function
// does it server-side instead, where it's safe to hold a real API key.
//
// Requires the environment variable ANTHROPIC_API_KEY to be set in
// Netlify (Site configuration → Environment variables). Get a key at
// https://console.anthropic.com/settings/keys — never put it in
// index.html or any file that ships to the browser.

const ADVISOR_SYSTEM_PROMPT = `You are the AI Financial Copilot inside Kinlgali Investing, an education-only financial planning tool — you are NOT a registered investment adviser, and nothing you say is personalized investment, legal, or tax advice. Answer using general, widely-known financial planning principles, keeping answers concise (3-6 short paragraphs max) and plain-spoken. Never recommend individual company stocks — only asset classes or diversified index funds/ETFs. Always keep in mind the user's drafted brief context if provided. If a question falls outside general education (e.g. asks you to guarantee returns, predict specific prices, or give personalized tax/legal conclusions), say so plainly and suggest a licensed professional. Do not use markdown headers or bullet lists heavy with asterisks — write in plain prose paragraphs.`;

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

  const { userText, contextNote, systemOverride, maxTokens } = body;
  if (!userText) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing userText' }) };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens || 700,
        system: systemOverride || ADVISOR_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: contextNote
              ? `Context on my current drafted brief: ${contextNote}\n\nMy question: ${userText}`
              : userText,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic API error:', res.status, errText);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'AI request failed (' + res.status + ')' }),
      };
    }

    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || '').join('\n').trim();

    return {
      statusCode: 200,
      body: JSON.stringify({ text: text || "I wasn't able to generate a response — try rephrasing your question." }),
    };
  } catch (err) {
    console.error('ai-advisor function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

function stripJsonFence(text = "") {
  return text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function normalizeSecret(value = "") {
  return String(value)
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function anthropicText(out) {
  return (out.content || [])
    .filter(x => x.type === "text")
    .map(x => x.text)
    .join("\n")
    .trim();
}

async function callAnthropic({ prompt, maxTokens, webSearch = false, maxSearches = 8 }) {
  const key = normalizeSecret(process.env.ANTHROPIC_API_KEY);
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured in Netlify.");

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }]
  };

  if (webSearch) {
    body.tools = [{
      type: "web_search_20250305",
      name: "web_search",
      max_uses: maxSearches,
      user_location: {
        type: "approximate",
        city: "Seoul",
        country: "KR",
        timezone: "Asia/Seoul"
      }
    }];
  }

  const r = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const text = await r.text();
    if (r.status === 401) {
      throw new Error("Anthropic rejected the API key. In Netlify, ANTHROPIC_API_KEY must contain only the API key value itself (normally beginning sk-ant-), with no ANTHROPIC_API_KEY= prefix. " + text.slice(0, 500));
    }
    throw new Error(`Anthropic API ${r.status}: ${text.slice(0, 700)}`);
  }

  const out = await r.json();
  const text = anthropicText(out);
  if (!text) throw new Error("Anthropic returned no text output.");

  return { provider: "anthropic", model, text: stripJsonFence(text) };
}

export async function generateJson(prompt, maxTokens = 5000) {
  const result = await callAnthropic({ prompt, maxTokens, webSearch: false });
  const json = JSON.parse(result.text);
  return { ...json, _ai: { provider: result.provider, model: result.model } };
}

export async function generateJsonWithWeb(prompt, maxTokens = 6000, maxSearches = 10) {
  const result = await callAnthropic({
    prompt,
    maxTokens,
    webSearch: true,
    maxSearches
  });

  const json = JSON.parse(result.text);
  return { ...json, _ai: { provider: result.provider, model: result.model } };
}

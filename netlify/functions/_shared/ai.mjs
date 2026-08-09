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
  if (!key) {
    throw new Error("No Anthropic credential is available. If using Netlify AI Gateway, make sure AI Features are enabled and redeploy the site.");
  }

  const baseUrl = String(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com")
    .trim()
    .replace(/\/$/, "");
  const usingNetlifyGateway = Boolean(process.env.ANTHROPIC_BASE_URL);
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const messages = [{ role: "user", content: prompt }];

  const tools = webSearch ? [{
    type: "web_search_20250305",
    name: "web_search",
    max_uses: maxSearches,
    user_location: {
      type: "approximate",
      city: "Seoul",
      country: "KR",
      timezone: "Asia/Seoul"
    }
  }] : undefined;

  const textParts = [];

  for (let turn = 0; turn < 6; turn++) {
    const body = {
      model,
      max_tokens: maxTokens,
      messages
    };
    if (tools) body.tools = tools;

    const r = await fetch(`${baseUrl}/v1/messages`, {
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
        throw new Error(
          usingNetlifyGateway
            ? `Netlify AI Gateway authentication failed. ${text.slice(0, 500)}`
            : `Anthropic rejected the API key. ${text.slice(0, 500)}`
        );
      }
      throw new Error(`${usingNetlifyGateway ? "Netlify AI Gateway" : "Anthropic API"} ${r.status}: ${text.slice(0, 700)}`);
    }

    const out = await r.json();
    const piece = anthropicText(out);
    if (piece) textParts.push(piece);

    if (out.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: out.content || [] });
      continue;
    }

    const text = textParts.join("\n").trim();
    if (!text) throw new Error("Anthropic returned no text output.");

    return {
      provider: usingNetlifyGateway ? "anthropic via netlify" : "anthropic",
      model,
      text: stripJsonFence(text)
    };
  }

  throw new Error("Anthropic web search paused too many times before completing.");
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

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
    .filter(x => x.type === "text" && typeof x.text === "string")
    .map(x => x.text)
    .join("\n")
    .trim();
}

function blockTypes(out) {
  return (out.content || []).map(x => x?.type || "unknown").join(", ") || "none";
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

  const searchTools = webSearch ? [{
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
  let allowSearch = Boolean(searchTools);
  let synthesisRetryUsed = false;

  for (let turn = 0; turn < 8; turn++) {
    const body = {
      model,
      max_tokens: maxTokens,
      messages
    };
    if (allowSearch && searchTools) body.tools = searchTools;

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

    // Anthropic server tools can explicitly pause a long-running turn.
    // Re-send the assistant content unchanged with the same tools so it can resume.
    if (out.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: out.content || [] });
      continue;
    }

    // If generation hit the token limit, preserve what Claude already emitted and
    // ask it to continue. This also protects against a partially emitted JSON object.
    if (out.stop_reason === "max_tokens") {
      messages.push({ role: "assistant", content: out.content || [] });
      messages.push({
        role: "user",
        content: "Continue exactly where you stopped. Finish the requested JSON only. Do not restart the answer or repeat earlier JSON."
      });
      allowSearch = false;
      continue;
    }

    if (out.stop_reason === "refusal") {
      throw new Error("Anthropic declined to produce this briefing.");
    }

    const text = textParts.join("\n").trim();
    if (text) {
      return {
        provider: usingNetlifyGateway ? "anthropic via netlify" : "anthropic",
        model,
        text: stripJsonFence(text)
      };
    }

    // A search-heavy turn can complete with server_tool_use/search-result blocks
    // but no final text. Treat the research as completed context, then make a clean
    // synthesis turn without tools so Claude must write the requested JSON.
    if (webSearch && !synthesisRetryUsed) {
      messages.push({ role: "assistant", content: out.content || [] });
      messages.push({
        role: "user",
        content: "Using the web research you just completed, now produce the final answer requested in my original message. Return ONLY the requested valid JSON. Do not perform any more web searches."
      });
      allowSearch = false;
      synthesisRetryUsed = true;
      continue;
    }

    throw new Error(
      `Anthropic returned no text output (stop_reason: ${out.stop_reason || "unknown"}; content: ${blockTypes(out)}).`
    );
  }

  throw new Error("Anthropic did not complete the briefing after several continuation attempts.");
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

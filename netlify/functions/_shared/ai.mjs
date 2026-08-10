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
    .replace(/^['\"]|['\"]$/g, "")
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

function collectSources(value, map = new Map()) {
  if (!value) return map;

  if (Array.isArray(value)) {
    for (const item of value) collectSources(item, map);
    return map;
  }

  if (typeof value !== "object") return map;

  const type = value.type || "";
  const url = typeof value.url === "string" ? value.url.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";

  if (
    url &&
    (type === "web_search_result_location" ||
      type === "web_search_result" ||
      type === "search_result")
  ) {
    if (!map.has(url)) map.set(url, { url, title: title || url });
  }

  for (const child of Object.values(value)) collectSources(child, map);
  return map;
}

async function callAnthropic({
  prompt,
  maxTokens,
  webSearch = false,
  maxSearches = 8,
  outputSchema = null
}) {
  const key = normalizeSecret(process.env.ANTHROPIC_API_KEY);
  if (!key) {
    throw new Error("No Anthropic credential is available. If using Netlify AI Gateway, make sure AI Features are enabled and redeploy the site.");
  }

  if (webSearch && outputSchema) {
    throw new Error("Internal configuration error: web search and structured output must run in separate stages.");
  }

  const baseUrl = String(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com")
    .trim()
    .replace(/\/$/, "");
  const usingNetlifyGateway = Boolean(process.env.ANTHROPIC_BASE_URL);
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  let tokenBudget = maxTokens;
  let messages = [{ role: "user", content: prompt }];

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

  let allowSearch = Boolean(searchTools);
  let synthesisRetryUsed = false;
  let structuredRetryUsed = false;
  let textParts = [];
  const sourceMap = new Map();

  for (let turn = 0; turn < 10; turn++) {
    const body = {
      model,
      max_tokens: tokenBudget,
      messages
    };

    if (allowSearch && searchTools) body.tools = searchTools;

    if (outputSchema) {
      body.output_config = {
        format: {
          type: "json_schema",
          schema: outputSchema
        }
      };
    }

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
    collectSources(out, sourceMap);

    const piece = anthropicText(out);
    if (piece) textParts.push(piece);

    if (out.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: out.content || [] });
      continue;
    }

    if (out.stop_reason === "refusal") {
      throw new Error("Anthropic declined to produce this briefing.");
    }

    if (out.stop_reason === "max_tokens") {
      if (outputSchema) {
        if (!structuredRetryUsed) {
          structuredRetryUsed = true;
          tokenBudget = Math.max(12000, tokenBudget * 2);
          messages = [{
            role: "user",
            content: `${prompt}\n\nKeep the structured answer concise enough to finish completely within the available output budget.`
          }];
          textParts = [];
          continue;
        }
        throw new Error("Anthropic's structured response hit the output limit twice before completing.");
      }

      messages.push({ role: "assistant", content: out.content || [] });
      messages.push({
        role: "user",
        content: "Continue the research memo exactly where you stopped. Do not restart or repeat earlier material."
      });
      allowSearch = false;
      continue;
    }

    const text = textParts.join("\n").trim();
    if (text) {
      return {
        provider: usingNetlifyGateway ? "anthropic via netlify" : "anthropic",
        model,
        text: stripJsonFence(text),
        sources: [...sourceMap.values()]
      };
    }

    if (webSearch && !synthesisRetryUsed) {
      messages.push({ role: "assistant", content: out.content || [] });
      messages.push({
        role: "user",
        content: "Summarize the web research you just completed as a factual research memo in plain text. Include the important source names and URLs explicitly. Do not return JSON."
      });
      allowSearch = false;
      synthesisRetryUsed = true;
      continue;
    }

    throw new Error(
      `Anthropic returned no text output (stop_reason: ${out.stop_reason || "unknown"}; content: ${blockTypes(out)}).`
    );
  }

  throw new Error("Anthropic did not complete the request after several continuation attempts.");
}

function sourceListText(sources = []) {
  if (!sources.length) return "No machine-extracted source URLs were available; use only URLs explicitly present in the research memo.";
  return sources
    .slice(0, 80)
    .map((s, i) => `${i + 1}. ${s.title || "Source"} — ${s.url}`)
    .join("\n");
}

async function parsePlainJson(result) {
  try {
    return JSON.parse(result.text);
  } catch (err) {
    const text = result.text || "";
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw err;
  }
}

export async function generateJson(prompt, maxTokens = 5000, schema = null) {
  const result = await callAnthropic({
    prompt,
    maxTokens,
    webSearch: false,
    outputSchema: schema
  });

  const json = await parsePlainJson(result);
  return { ...json, _ai: { provider: result.provider, model: result.model } };
}

export async function generateJsonWithWeb(prompt, maxTokens = 6000, maxSearches = 10, schema = null) {
  if (!schema) {
    const result = await callAnthropic({
      prompt,
      maxTokens,
      webSearch: true,
      maxSearches
    });
    const json = await parsePlainJson(result);
    return { ...json, _ai: { provider: result.provider, model: result.model } };
  }

  const researchPrompt = `${prompt}\n\nRESEARCH STAGE ONLY:\nUse web search strategically to verify, broaden, and fill gaps in the evidence already supplied in the task. Produce a factual research memo in ordinary prose or Markdown. Do NOT try to produce JSON in this stage. Preserve Korean headlines when useful. Explicitly mention outlet names and source URLs whenever possible. Gather enough evidence for a later formatter to build the requested briefing without searching again.`;

  const research = await callAnthropic({
    prompt: researchPrompt,
    maxTokens: Math.max(6000, maxTokens),
    webSearch: true,
    maxSearches
  });

  const synthesisPrompt = `You are the final editor and formatter. Convert the research memo below into the structured answer requested by the ORIGINAL TASK. The API is enforcing the JSON schema, so focus on factual accuracy, ranking, synthesis, and source selection rather than Markdown formatting.\n\nRULES:\n- Use ONLY facts supported by the research memo below.\n- Do not perform web search.\n- Do not invent facts, Korean headlines, outlet disagreements, or URLs.\n- For source URL fields, use URLs from VERIFIED SOURCE URLS or URLs explicitly present in the memo.\n- If evidence for a viewpoint difference is weak, use an empty viewpoints array.\n- Keep summaries concise enough for the full structured response to finish.\n\nORIGINAL TASK:\n${prompt}\n\nRESEARCH MEMO:\n${research.text}\n\nVERIFIED SOURCE URLS EXTRACTED FROM CLAUDE'S WEB-SEARCH CITATIONS:\n${sourceListText(research.sources)}`;

  const formatted = await callAnthropic({
    prompt: synthesisPrompt,
    maxTokens: Math.max(8000, maxTokens),
    webSearch: false,
    outputSchema: schema
  });

  let json;
  try {
    json = JSON.parse(formatted.text);
  } catch (err) {
    throw new Error(
      `Anthropic's structured formatting stage returned non-JSON unexpectedly: ${err.message}. Output began: ${formatted.text.slice(0, 120)}`
    );
  }

  return {
    ...json,
    _ai: { provider: formatted.provider, model: formatted.model }
  };
}

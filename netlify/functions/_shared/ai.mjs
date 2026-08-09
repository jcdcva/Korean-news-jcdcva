const OPENAI_URL = "https://api.openai.com/v1/responses";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

function stripJsonFence(text = "") {
  return text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function extractOpenAIText(out) {
  if (typeof out?.output_text === "string" && out.output_text.trim()) {
    return out.output_text.trim();
  }
  const chunks = [];
  for (const item of out?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function availableProviders() {
  const requested = (process.env.AI_PROVIDER || "auto").toLowerCase();
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  if (requested === "openai") {
    return [
      ...(hasOpenAI ? ["openai"] : []),
      ...(hasAnthropic && process.env.AI_FALLBACK !== "false" ? ["anthropic"] : [])
    ];
  }
  if (requested === "anthropic") {
    return [
      ...(hasAnthropic ? ["anthropic"] : []),
      ...(hasOpenAI && process.env.AI_FALLBACK !== "false" ? ["openai"] : [])
    ];
  }

  return [
    ...(hasOpenAI ? ["openai"] : []),
    ...(hasAnthropic ? ["anthropic"] : [])
  ];
}

async function callOpenAI(prompt, maxTokens) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      max_output_tokens: maxTokens,
      input: [{
        role: "user",
        content: [{ type: "input_text", text: prompt }]
      }]
    })
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`OpenAI API ${r.status}: ${text.slice(0, 500)}`);
  }

  const out = await r.json();
  const text = extractOpenAIText(out);
  if (!text) throw new Error("OpenAI returned no text output.");
  return { provider: "openai", model, text: stripJsonFence(text) };
}

async function callAnthropic(prompt, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const r = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Anthropic API ${r.status}: ${text.slice(0, 500)}`);
  }

  const out = await r.json();
  const text = (out.content || [])
    .filter(x => x.type === "text")
    .map(x => x.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Anthropic returned no text output.");
  return { provider: "anthropic", model, text: stripJsonFence(text) };
}

export async function generateJson(prompt, maxTokens = 5000) {
  const providers = availableProviders();
  if (!providers.length) {
    throw new Error(
      "No AI provider is configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Netlify environment variables."
    );
  }

  const errors = [];
  for (const provider of providers) {
    try {
      const result = provider === "openai"
        ? await callOpenAI(prompt, maxTokens)
        : await callAnthropic(prompt, maxTokens);

      const json = JSON.parse(result.text);
      return { ...json, _ai: { provider: result.provider, model: result.model } };
    } catch (err) {
      errors.push(`${provider}: ${err?.message || err}`);
    }
  }

  throw new Error(`All configured AI providers failed. ${errors.join(" | ")}`);
}

import { generateJsonWithWeb } from "./_shared/ai.mjs";

async function analyze(story) {
  const prompt = `You are producing the "Go deeper" section for Korean Morning Papers.

The reader has already seen this short briefing:
${JSON.stringify(story)}

Use live web search to investigate this specific story more deeply. Search Korean-language reporting first, using the Korean headline when available, and consult several reputable Korean outlets where possible. Focus on current reporting plus only the background needed to understand the issue.

Be analytical but cautious. Separate:
- well-supported current facts,
- relevant background/context,
- competing interpretations or framing,
- genuine uncertainty.

Do not invent quotations, facts, disagreements, or URLs. Do not copy long passages. If reporting is thin or contradictory, say so clearly.

Return ONLY valid JSON, no Markdown:
{
  "headline":"clear English title",
  "overview":"one substantial paragraph, about 120-180 words",
  "background":["3-5 concise bullets"],
  "nuances":["3-5 concise bullets about tensions, tradeoffs, or differing interpretations"],
  "uncertainty":["1-3 bullets on unresolved or unclear points"],
  "watch":["2-4 bullets on what developments would matter next"],
  "sources":[{"name":"outlet","url":"https://..."}]
}`;

  return generateJsonWithWeb(prompt, 5200, 8);
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({error:"POST required"}), {
      status:405,
      headers:{"content-type":"application/json; charset=utf-8"}
    });
  }

  try {
    const story = await req.json();
    if (!(story?.title_ko || story?.title_en)) throw new Error("Story title missing.");

    const deep = await analyze(story);
    const ai = deep._ai;
    delete deep._ai;

    deep.aiProvider = ai?.provider || "anthropic";
    deep.aiModel = ai?.model || "unknown";

    return new Response(JSON.stringify(deep), {
      status:200,
      headers:{
        "content-type":"application/json; charset=utf-8",
        "cache-control":"no-store"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err?.message || "Unable to build deeper briefing"
    }), {
      status:503,
      headers:{"content-type":"application/json; charset=utf-8"}
    });
  }
}

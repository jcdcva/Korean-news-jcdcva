import { getStore } from "@netlify/blobs";
import { generateJsonWithWeb } from "./_shared/ai.mjs";

const STORE_NAME = "korean-morning-papers";

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
  let jobId = "";
  let jobs;

  try {
    const body = await req.json();
    jobId = String(body?.jobId || "").trim();
    const story = body?.story;
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(jobId)) return;
    if (!(story?.title_ko || story?.title_en)) return;

    jobs = getStore({ name: STORE_NAME, consistency: "strong" });
    await jobs.setJSON(`deep-jobs/${jobId}`, {
      status: "working",
      startedAt: new Date().toISOString()
    });

    const deep = await analyze(story);
    const ai = deep._ai;
    delete deep._ai;
    deep.aiProvider = ai?.provider || "anthropic";
    deep.aiModel = ai?.model || "unknown";

    await jobs.setJSON(`deep-jobs/${jobId}`, {
      status: "done",
      finishedAt: new Date().toISOString(),
      data: deep
    });
  } catch (err) {
    if (jobs && jobId) {
      await jobs.setJSON(`deep-jobs/${jobId}`, {
        status: "error",
        finishedAt: new Date().toISOString(),
        error: err?.message || "Unable to build deeper briefing"
      });
    }
  }
}

export const config = {
  background: true
};

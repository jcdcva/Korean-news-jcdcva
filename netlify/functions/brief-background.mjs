import { getStore } from "@netlify/blobs";
import { generateJsonWithWeb } from "./_shared/ai.mjs";

const STORE_NAME = "korean-morning-papers";

const BRIEFING_SCHEMA = {
  type: "object",
  properties: {
    stories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rank: { type: "integer" },
          category: { type: "string" },
          title_en: { type: "string" },
          title_ko: { type: "string" },
          summary: { type: "string" },
          why: { type: "string" },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                url: { type: "string" }
              },
              required: ["name", "url"],
              additionalProperties: false
            }
          },
          viewpoints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                outlet: { type: "string" },
                text: { type: "string" }
              },
              required: ["outlet", "text"],
              additionalProperties: false
            }
          }
        },
        required: ["rank", "category", "title_en", "title_ko", "summary", "why", "sources", "viewpoints"],
        additionalProperties: false
      }
    },
    life: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          korean: { type: "string" },
          text: { type: "string" },
          source: {
            type: "object",
            properties: {
              name: { type: "string" },
              url: { type: "string" }
            },
            required: ["name", "url"],
            additionalProperties: false
          }
        },
        required: ["title", "korean", "text", "source"],
        additionalProperties: false
      }
    }
  },
  required: ["stories", "life"],
  additionalProperties: false
};

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

async function buildBriefing() {
  const prompt = `You are the editor of "Korean Morning Papers", an English-language morning briefing based on CURRENT Korean-language news.

Use web search actively. Search Korean-language reporting from South Korea, prioritizing the last 24-36 hours. Use multiple reputable Korean outlets and Korean-language queries. Look broadly across politics, economy, society, housing, weather, North Korea/security, international affairs as seen from Korea, culture, science/technology, sports, and everyday life.

Important source families to look for when useful include Yonhap (연합뉴스), Hankyoreh (한겨레), Kyunghyang (경향신문), Chosun (조선일보), JoongAng (중앙일보), Dong-A (동아일보), Hankook Ilbo (한국일보), major broadcasters, and other credible Korean-language outlets. Do not force a source if it is not relevant or accessible.

TASK
1. Identify the 10 genuinely most important stories Koreans are talking about now.
2. Cluster duplicate reports into real-world stories rather than listing ten newspaper headlines.
3. Translate and synthesize into clear natural English.
4. Preserve a representative Korean headline for each story.
5. Explain why each story matters in 1-2 sentences.
6. Give up to 4 representative source links per story, preferably from different outlets. Use actual URLs found in web search.
7. Where outlets clearly frame the same facts differently, add 1-3 short viewpoint notes describing the observable difference in emphasis. Do not assign ideological labels unless the reporting itself makes them relevant.
8. Include a small "Life in Korea" selection of 3-5 current social/cultural/everyday-life stories that help an English-speaking reader understand what Korea feels like now.
9. Do not invent facts, quotations, headlines, source URLs, or disagreements. If a point is uncertain, say so.
10. Do not reproduce long copyrighted passages. Summaries must be original.

Return only the requested structured briefing.`;

  return generateJsonWithWeb(prompt, 7000, 12, BRIEFING_SCHEMA);
}

function normalizeBriefing(briefing) {
  const stories = (briefing.stories || []).slice(0, 10);
  const urls = new Set();
  const outlets = new Set();

  for (const story of stories) {
    for (const source of story.sources || []) {
      if (source?.url) urls.add(source.url);
      if (source?.name) outlets.add(source.name);
    }
  }
  for (const item of briefing.life || []) {
    if (item?.source?.url) urls.add(item.source.url);
    if (item?.source?.name) outlets.add(item.source.name);
  }

  return {
    mode: "live",
    generatedAt: new Date().toISOString(),
    articlesScanned: urls.size,
    outlets: [...outlets],
    aiProvider: briefing._ai?.provider || "anthropic",
    aiModel: briefing._ai?.model || "unknown",
    stories,
    life: (briefing.life || []).slice(0, 5)
  };
}

export default async function handler(req) {
  let jobId = "";
  let jobs;

  try {
    const body = await req.json();
    jobId = String(body?.jobId || "").trim();
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(jobId)) return;

    jobs = store();
    await jobs.setJSON(`jobs/${jobId}`, {
      status: "working",
      startedAt: new Date().toISOString()
    });

    const briefing = normalizeBriefing(await buildBriefing());

    await jobs.setJSON(`jobs/${jobId}`, {
      status: "done",
      finishedAt: new Date().toISOString(),
      data: briefing
    });
    await jobs.setJSON("latest", briefing);
  } catch (err) {
    if (jobs && jobId) {
      await jobs.setJSON(`jobs/${jobId}`, {
        status: "error",
        finishedAt: new Date().toISOString(),
        error: err?.message || "Unable to build live briefing"
      });
    }
  }
}

export const config = {
  background: true
};

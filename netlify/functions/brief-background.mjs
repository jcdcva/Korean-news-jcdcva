import { getStore } from "@netlify/blobs";
import { generateJsonWithWeb } from "./_shared/ai.mjs";
import { fetchKoreanNews, selectBalancedArticles } from "./_shared/rss.mjs";

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

function koreaDateLabel() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function formatRssIntake(articles) {
  if (!articles.length) {
    return "RSS intake returned no usable articles. Use web search as the primary discovery source for this run.";
  }

  return articles.map((article, index) => {
    const date = article.pubDate || "date unavailable";
    const summary = article.summary ? ` — ${article.summary.slice(0, 320)}` : "";
    return `${index + 1}. [${article.source} | ${article.lang} | ${date}] ${article.title}${summary} — ${article.link}`;
  }).join("\n");
}

async function buildBriefing() {
  const rss = await fetchKoreanNews({ maxAgeHours: 60 });
  const intake = selectBalancedArticles(rss.articles, { perFeed: 18, maxTotal: 120 });
  const koreaDate = koreaDateLabel();

  const prompt = `You are the editor of "Korean Morning Papers", an English-language morning briefing based on CURRENT Korean-language news.

KOREA NEWS DATE: ${koreaDate} (Asia/Seoul)

You have two research layers:
1. PRIMARY INTAKE: a balanced packet of fresh public RSS headlines and summaries from Korean news outlets, pasted below.
2. SUPPLEMENTAL WEB SEARCH: use live web search strategically to verify important stories, fill gaps, find missing major outlets such as Korean-language Yonhap or JoongAng when useful, and obtain additional context or contrasting coverage.

Start by examining the RSS intake. Cluster duplicate reports into real-world stories. Do not ignore a major story merely because only one RSS feed captured it, but give extra weight to stories appearing across multiple independent outlets. Use web search to confirm importance and broaden the source mix rather than rediscovering every headline from scratch.

Look broadly across politics, economy, society, housing, weather, North Korea/security, international affairs as seen from Korea, culture, science/technology, sports, and everyday life.

Important source families to look for when useful include Yonhap (연합뉴스), Hankyoreh (한겨레), Kyunghyang (경향신문), Chosun (조선일보), JoongAng (중앙일보), Dong-A (동아일보), Hankook Ilbo (한국일보), major broadcasters, Newsis, Seoul Shinmun, and other credible Korean-language outlets. Do not force a source if it is not relevant or accessible.

TASK
1. Identify the 10 genuinely most important stories Koreans are talking about now.
2. Cluster duplicate reports into real-world stories rather than listing ten newspaper headlines.
3. Translate and synthesize into clear natural English.
4. Preserve a representative Korean headline for each story.
5. Explain why each story matters in 1-2 sentences.
6. Give up to 4 representative source links per story, preferably from different outlets. URLs may come from the RSS intake or verified web search.
7. Where outlets clearly frame the same facts differently, add 1-3 short viewpoint notes describing the observable difference in emphasis. Do not assign ideological labels unless the reporting itself makes them relevant.
8. Include a small "Life in Korea" selection of 3-5 current social/cultural/everyday-life stories that help an English-speaking reader understand what Korea feels like now.
9. Do not invent facts, quotations, headlines, source URLs, or disagreements. If a point is uncertain, say so.
10. Do not reproduce long copyrighted passages. Summaries must be original.
11. Prefer reporting from the Korean news date above and the preceding 24-36 hours; use older material only for necessary context.

RSS INTAKE (${intake.length} balanced articles from ${rss.successfulFeeds}/${rss.totalFeeds} responding feeds; ${rss.totalArticles} recent deduplicated RSS articles available):
${formatRssIntake(intake)}

Return only the requested structured briefing.`;

  const maxSearches = rss.totalArticles >= 25 ? 6 : 10;
  const briefing = await generateJsonWithWeb(prompt, 7000, maxSearches, BRIEFING_SCHEMA);
  return { briefing, rss };
}

function normalizeBriefing(briefing, rss) {
  const stories = (briefing.stories || []).slice(0, 10);
  const urls = new Set();
  const outlets = new Set(
    (rss?.feedStatus || []).filter(feed => feed.ok).map(feed => feed.feed)
  );

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
    articlesScanned: Math.max(rss?.totalArticles || 0, urls.size),
    outlets: [...outlets],
    rssArticles: rss?.totalArticles || 0,
    rssFeedsHealthy: rss?.successfulFeeds || 0,
    rssFeedsTotal: rss?.totalFeeds || 0,
    rssFeedStatus: rss?.feedStatus || [],
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

    const { briefing: rawBriefing, rss } = await buildBriefing();
    const briefing = normalizeBriefing(rawBriefing, rss);

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

import { generateJson } from "./_shared/ai.mjs";

const NAVER_URL = "https://openapi.naver.com/v1/search/news.json";

function clean(s = "") {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function outletFromUrl(url = "") {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const known = {
      "yna.co.kr":"연합뉴스", "hani.co.kr":"한겨레", "khan.co.kr":"경향신문",
      "chosun.com":"조선일보", "joongang.co.kr":"중앙일보", "donga.com":"동아일보",
      "hankookilbo.com":"한국일보", "mk.co.kr":"매일경제", "sedaily.com":"서울경제",
      "newsis.com":"뉴시스", "ytn.co.kr":"YTN", "kbs.co.kr":"KBS", "mbc.co.kr":"MBC", "sbs.co.kr":"SBS"
    };
    return known[host] || host;
  } catch { return "Unknown"; }
}

async function naverSearch(query, display = 40) {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing Naver API credentials.");

  const u = new URL(NAVER_URL);
  u.searchParams.set("query", query);
  u.searchParams.set("display", String(display));
  u.searchParams.set("sort", "date");

  const r = await fetch(u, {
    headers: {
      "X-Naver-Client-Id": id,
      "X-Naver-Client-Secret": secret
    }
  });
  if (!r.ok) throw new Error(`Naver API ${r.status}: ${(await r.text()).slice(0,500)}`);
  return r.json();
}

function dedupe(items) {
  const seen = new Set();
  return items.map(item => {
    const url = item.originallink || item.link || "";
    return {
      title: clean(item.title),
      snippet: clean(item.description),
      url,
      outlet: outletFromUrl(url || item.link),
      pubDate: item.pubDate
    };
  }).filter(x => {
    const key = (x.url || x.title).replace(/[#?].*$/, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function analyze(story, articles) {
  const prompt = `You are producing the "Go deeper" section for Korean Morning Papers.

The user has already read a short English briefing. Your job is to provide a richer, more nuanced explanation using ONLY the Korean-language news metadata below.

Be analytical but cautious. Distinguish:
- facts in the supplied material,
- background/context,
- interpretations or framing,
- genuine uncertainty.

Do not invent quotations or facts. Do not copy long text from articles. Where outlets differ, describe the observable difference in emphasis without stereotyping the publication.

Return ONLY valid JSON:
{
  "headline":"clear English title",
  "overview":"one substantial paragraph, 120-180 words",
  "background":["3-5 concise bullets"],
  "nuances":["3-5 concise bullets about tensions, tradeoffs, or differing interpretations"],
  "uncertainty":["1-3 bullets on unresolved or unclear points"],
  "watch":["2-4 bullets on what developments would matter next"],
  "sources":[{"name":"outlet","url":"https://..."}]
}

EXISTING SHORT BRIEFING:
${JSON.stringify(story)}

ADDITIONAL KOREAN COVERAGE:
${JSON.stringify(articles.slice(0, 35))}`;

  return generateJson(prompt, 4500);
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
    const query = (story.title_ko || story.title_en || "").trim();
    if (!query) throw new Error("Story title missing.");

    const result = await naverSearch(query, 40);
    const articles = dedupe(result.items || []);
    if (!articles.length) throw new Error("No additional Korean coverage found.");

    const deep = await analyze(story, articles);
    const ai = deep._ai;
    delete deep._ai;

    if (!Array.isArray(deep.sources) || !deep.sources.length) {
      deep.sources = articles.slice(0, 6).map(a => ({name:a.outlet, url:a.url}));
    }
    deep.aiProvider = ai?.provider || "unknown";
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

import { generateJson } from "./_shared/ai.mjs";

const NAVER_URL = "https://naverapihub.apigw.ntruss.com/search/v1/news";

const SEARCHES = [
  "대한민국 정치", "한국 경제", "한국 사회", "서울 부동산",
  "한국 날씨", "북한", "한국 국제", "한국 문화", "한국 과학", "한국 스포츠"
];

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

async function naverSearch(query, display = 35) {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("Missing NAVER_CLIENT_ID or NAVER_CLIENT_SECRET.");
  }

  const u = new URL(NAVER_URL);
  u.searchParams.set("query", query);
  u.searchParams.set("display", String(display));
  u.searchParams.set("sort", "date");
  u.searchParams.set("format", "json");

  const r = await fetch(u, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": id,
      "X-NCP-APIGW-API-KEY": secret
    }
  });
  if (!r.ok) throw new Error(`Naver API ${r.status}: ${(await r.text()).slice(0,500)}`);
  return r.json();
}

function dedupe(items) {
  const map = new Map();
  for (const item of items) {
    const url = item.originallink || item.link || "";
    const title = clean(item.title);
    const key = (url || title).replace(/[#?].*$/, "");
    if (!key || map.has(key)) continue;
    map.set(key, {
      title,
      description: clean(item.description),
      url,
      naverUrl: item.link || "",
      outlet: outletFromUrl(url || item.link),
      pubDate: item.pubDate
    });
  }
  return [...map.values()];
}

function keepRecent(items, hours = 36) {
  const cutoff = Date.now() - hours * 3600_000;
  const recent = items.filter(x => {
    const t = Date.parse(x.pubDate);
    return Number.isFinite(t) && t >= cutoff;
  });
  return recent.length >= 50 ? recent : items;
}

async function buildBriefing(articles) {
  const compact = articles.slice(0, 240).map((a, i) => ({
    id: i + 1,
    title: a.title,
    snippet: a.description,
    outlet: a.outlet,
    url: a.url,
    pubDate: a.pubDate
  }));

  const prompt = `You are the editor of "Korean Morning Papers", an English-language briefing based ONLY on Korean-language news metadata supplied below.

TASK
1. Cluster duplicate reports into real-world stories.
2. Rank the 10 stories that appear most important across a broad sampling of Korean news today. Favor stories covered by multiple distinct outlets, while still allowing a major exclusive or urgent event.
3. Translate/synthesize into clear, natural English. Do not invent facts beyond the supplied title/snippet metadata.
4. Preserve a representative Korean headline for each story.
5. Explain "why it matters" in 1-2 sentences.
6. Give up to 4 representative source links, preferably from different outlets.
7. For stories with clearly different framing across outlets, add 1-3 short viewpoint notes. Be cautious: describe observable emphasis, not assumed ideology.
8. Avoid copying long passages. Summaries must be original.

Return ONLY valid JSON, no Markdown, with this schema:
{
 "stories":[
  {
   "rank":1,
   "category":"Politics",
   "title_en":"...",
   "title_ko":"...",
   "summary":"2-3 concise sentences",
   "why":"1-2 sentences",
   "sources":[{"name":"연합뉴스","url":"https://..."}],
   "viewpoints":[{"outlet":"Hankyoreh","text":"Emphasizes ..."}]
  }
 ]
}

NEWS METADATA:
${JSON.stringify(compact)}`;

  return generateJson(prompt, 6500);
}

export default async function handler() {
  try {
    const batches = await Promise.all(SEARCHES.map(q => naverSearch(q)));
    let articles = dedupe(batches.flatMap(x => x.items || []));
    articles = keepRecent(articles);

    const briefing = await buildBriefing(articles);
    const outlets = [...new Set(articles.map(x => x.outlet).filter(Boolean))];

    return new Response(JSON.stringify({
      mode: "live",
      generatedAt: new Date().toISOString(),
      articlesScanned: articles.length,
      outlets,
      aiProvider: briefing._ai?.provider || "unknown",
      aiModel: briefing._ai?.model || "unknown",
      stories: (briefing.stories || []).slice(0, 10)
    }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err?.message || "Unable to build live briefing"
    }), {
      status: 503,
      headers: {"content-type":"application/json; charset=utf-8"}
    });
  }
}

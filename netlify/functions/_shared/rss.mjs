// Public RSS intake for Korean Morning Papers.
// Feed list is based on the supplied RSS integration handoff.

export const KOREAN_NEWS_FEEDS = [
  { name: "Chosun Ilbo", lang: "ko", bias: "conservative", url: "https://www.chosun.com/arc/outboundfeeds/rss/" },
  { name: "Hankyoreh", lang: "ko", bias: "progressive", url: "https://www.hani.co.kr/rss/" },
  { name: "Kyunghyang Shinmun", lang: "ko", bias: "progressive", url: "https://www.khan.co.kr/rss/rssdata/total_news.xml" },
  { name: "Donga Ilbo", lang: "ko", bias: "conservative", url: "https://rss.donga.com/total.xml" },
  { name: "Seoul Shinmun", lang: "ko", bias: "centrist", url: "https://www.seoul.co.kr/xml/rss/rss_top.xml" },
  { name: "Newsis", lang: "ko", bias: "wire", url: "https://www.newsis.com/RSS/sokbo.xml" },
  { name: "Yonhap English", lang: "en", bias: "wire", url: "https://en.yna.co.kr/RSS/news.xml" },
  { name: "Korea Herald", lang: "en", bias: "centrist", url: "https://www.koreaherald.com/rss/newsAll.xml" }
];

function decodeEntities(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .trim();
}

function stripHtml(value = "") {
  return decodeEntities(value)
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(xml).match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`, "i"));
  return match ? match[1] : null;
}

function parseRssItems(xml, feed) {
  const items = [];
  const itemBlocks = String(xml).split(/<item[\s>]/i).slice(1);

  for (const block of itemBlocks) {
    const endIdx = block.search(/<\/item>/i);
    const itemXml = endIdx >= 0 ? block.slice(0, endIdx) : block;

    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const guid = extractTag(itemXml, "guid");
    const pubDate = extractTag(itemXml, "pubDate") || extractTag(itemXml, "dc:date");
    const description = extractTag(itemXml, "description");
    const category = extractTag(itemXml, "category");

    const cleanTitle = title ? stripHtml(title) : "";
    const cleanLink = link ? decodeEntities(link) : (guid ? decodeEntities(guid) : "");
    if (!cleanTitle || !/^https?:\/\//i.test(cleanLink)) continue;

    items.push({
      title: cleanTitle,
      link: cleanLink,
      pubDate: pubDate ? decodeEntities(pubDate) : null,
      summary: description ? stripHtml(description).slice(0, 600) : null,
      category: category ? stripHtml(category) : null,
      source: feed.name,
      lang: feed.lang,
      bias: feed.bias
    });
  }

  return items;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; KoreanMorningPapers/1.0; +https://netlify.app/)"
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      return { feed: feed.name, ok: false, error: `HTTP ${res.status}`, articles: [] };
    }

    const xml = await res.text();
    const articles = parseRssItems(xml, feed);
    return {
      feed: feed.name,
      ok: true,
      count: articles.length,
      articles
    };
  } catch (err) {
    return {
      feed: feed.name,
      ok: false,
      error: err?.message || "Feed fetch failed",
      articles: []
    };
  }
}

function parseDate(value) {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function dedupeArticles(articles) {
  const seenLinks = new Set();
  const seenTitles = new Set();
  const out = [];

  for (const article of articles) {
    const linkKey = String(article.link || "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    const titleKey = String(article.title || "").replace(/\s+/g, " ").trim().toLowerCase();
    if ((linkKey && seenLinks.has(linkKey)) || (titleKey && seenTitles.has(titleKey))) continue;
    if (linkKey) seenLinks.add(linkKey);
    if (titleKey) seenTitles.add(titleKey);
    out.push(article);
  }

  return out;
}

export function selectBalancedArticles(articles, { perFeed = 18, maxTotal = 120 } = {}) {
  const bySource = new Map();
  for (const article of articles || []) {
    if (!bySource.has(article.source)) bySource.set(article.source, []);
    bySource.get(article.source).push(article);
  }

  for (const group of bySource.values()) {
    group.sort((a, b) => (parseDate(b.pubDate) || 0) - (parseDate(a.pubDate) || 0));
  }

  const selected = [];
  const sources = KOREAN_NEWS_FEEDS.map(feed => feed.name).filter(name => bySource.has(name));

  for (let index = 0; index < perFeed && selected.length < maxTotal; index++) {
    for (const source of sources) {
      const article = bySource.get(source)?.[index];
      if (article) selected.push(article);
      if (selected.length >= maxTotal) break;
    }
  }

  return selected;
}

export async function fetchKoreanNews({ maxAgeHours = 60 } = {}) {
  const results = await Promise.all(KOREAN_NEWS_FEEDS.map(fetchFeed));
  const now = Date.now();
  const cutoff = now - maxAgeHours * 60 * 60 * 1000;

  let articles = dedupeArticles(results.flatMap(result => result.articles));
  articles = articles.filter(article => {
    const ms = parseDate(article.pubDate);
    return ms === null || ms >= cutoff;
  });
  articles.sort((a, b) => (parseDate(b.pubDate) || 0) - (parseDate(a.pubDate) || 0));

  return {
    fetchedAt: new Date().toISOString(),
    totalArticles: articles.length,
    successfulFeeds: results.filter(result => result.ok).length,
    totalFeeds: KOREAN_NEWS_FEEDS.length,
    feedStatus: results.map(result => ({
      feed: result.feed,
      ok: result.ok,
      count: result.count || 0,
      error: result.error || null
    })),
    articles
  };
}

import { fetchKoreanNews } from "./_shared/rss.mjs";

export default async function handler() {
  try {
    const news = await fetchKoreanNews({ maxAgeHours: 60 });

    return Response.json(news, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=900"
      }
    });
  } catch (err) {
    return Response.json({
      error: err?.message || "Unable to fetch Korean RSS feeds."
    }, {
      status: 500,
      headers: { "cache-control": "no-store" }
    });
  }
}

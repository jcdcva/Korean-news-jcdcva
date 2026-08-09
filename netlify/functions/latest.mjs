import { getStore } from "@netlify/blobs";

const STORE_NAME = "korean-morning-papers";

export default async function handler() {
  try {
    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const latest = await store.get("latest", { type: "json" });

    if (!latest) {
      return Response.json({ available: false }, {
        headers: { "cache-control": "no-store" }
      });
    }

    return Response.json({ available: true, data: latest }, {
      headers: { "cache-control": "no-store" }
    });
  } catch (err) {
    return Response.json({
      error: err?.message || "Unable to load the latest briefing."
    }, { status: 500 });
  }
}

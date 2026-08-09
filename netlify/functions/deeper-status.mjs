import { getStore } from "@netlify/blobs";

const STORE_NAME = "korean-morning-papers";

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const jobId = String(url.searchParams.get("jobId") || "").trim();
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(jobId)) {
      return Response.json({ error: "Invalid deeper-analysis job ID." }, { status: 400 });
    }

    const jobs = getStore({ name: STORE_NAME, consistency: "strong" });
    const state = await jobs.get(`deep-jobs/${jobId}`, { type: "json" });

    if (!state) {
      return Response.json({ status: "pending" }, {
        headers: { "cache-control": "no-store" }
      });
    }

    return Response.json(state, {
      headers: { "cache-control": "no-store" }
    });
  } catch (err) {
    return Response.json({
      error: err?.message || "Unable to check deeper-analysis status."
    }, { status: 500 });
  }
}

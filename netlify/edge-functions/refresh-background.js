const PATCH = `<script>
(() => {
  const current = document.getElementById("refresh");
  if (!current) return;

  // Cloning removes the old synchronous click listener from the prototype page.
  const btn = current.cloneNode(true);
  current.replaceWith(btn);
  const err = document.getElementById("error");
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function setKoreaDateLabel() {
    const el = document.getElementById("date");
    if (!el) return;
    try {
      const instant = data?.generatedAt ? new Date(data.generatedAt) : new Date();
      const koreaDate = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      }).format(instant);
      el.textContent = \`Korea news date · \${koreaDate}\`;
      el.title = "Calendar date in South Korea (Asia/Seoul) for this briefing";
    } catch {
      el.textContent = "Korea news date";
    }
  }

  function setSourceLabel() {
    const el = document.getElementById("scan");
    if (!el || data?.mode !== "live") return;

    if (Number.isFinite(data?.rssFeedsHealthy) && data.rssFeedsTotal) {
      const articleCount = Number(data.rssArticles || data.articlesScanned || 0);
      el.textContent = \`${data.rssFeedsHealthy}/${data.rssFeedsTotal} RSS feeds · \${articleCount} recent articles · web verification\`;
      el.title = "RSS headlines are the first-pass intake; Claude web search verifies major stories and fills source gaps.";
      return;
    }

    el.textContent = \`${data.outlets?.length || 0} source families · \${data.articlesScanned || 0} articles\`;
  }

  function loadingCard(title, text) {
    return '<article class="story"><div class="story-head" style="grid-template-columns:1fr"><div>' +
      '<div class="category">Live edition</div>' +
      '<div class="title">' + title + '</div>' +
      '<div class="summary">' + text + '</div>' +
      '</div></div></article>';
  }

  function showLoadingState(message = "Checking the latest saved edition…") {
    const mode = document.getElementById("mode");
    mode.textContent = "LOADING LIVE BRIEFING";
    mode.className = "pill live";
    document.getElementById("scan").textContent = message;
    document.getElementById("article-count").textContent = "—";
    document.getElementById("stories").innerHTML = loadingCard(
      "Loading Korean Morning Papers…",
      "Looking for the most recent live Korean briefing."
    );
    document.getElementById("life-grid").innerHTML = "";
    document.getElementById("views-list").innerHTML = "";
    setKoreaDateLabel();
  }

  function showUnavailableState(message) {
    const mode = document.getElementById("mode");
    mode.textContent = "LIVE BRIEFING UNAVAILABLE";
    mode.className = "pill";
    document.getElementById("scan").textContent = "No demo edition is being shown";
    document.getElementById("article-count").textContent = "—";
    document.getElementById("stories").innerHTML = loadingCard(
      "No live briefing is loaded yet",
      message || "Press Refresh briefing to try the live Korean news search again."
    );
    document.getElementById("life-grid").innerHTML = "";
    document.getElementById("views-list").innerHTML = "";
    setKoreaDateLabel();
  }

  async function responseJson(r) {
    const text = await r.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { throw new Error(\`Server returned \${r.status} but not valid JSON: \${text.slice(0, 180)}\`); }
  }

  async function startJob(endpoint, payload) {
    const start = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!start.ok && start.status !== 202) {
      const body = await responseJson(start);
      throw new Error(body.error || \`Could not start background job (\${start.status}).\`);
    }
  }

  async function pollJob(endpoint, jobId, maxAttempts = 150) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleep(2000);
      const r = await fetch(
        \`\${endpoint}?jobId=\${encodeURIComponent(jobId)}\`,
        { cache: "no-store" }
      );
      const state = await responseJson(r);
      if (!r.ok) throw new Error(state.error || \`Background status error (\${r.status}).\`);
      if (state.status === "done") return state.data;
      if (state.status === "error") throw new Error(state.error || "The background job failed.");
    }
    throw new Error("The background search did not finish within five minutes.");
  }

  function hasLiveBriefing() {
    return data?.mode === "live" && Array.isArray(data?.stories) && data.stories.length > 0;
  }

  function applyLiveBriefing(briefing) {
    data = {
      ...briefing,
      life: Array.isArray(briefing?.life) ? briefing.life : [],
      mode: "live"
    };
    render();
    setKoreaDateLabel();
    setSourceLabel();
  }

  async function refreshInBackground({ automatic = false } = {}) {
    const hadLive = hasLiveBriefing();
    btn.disabled = true;
    btn.textContent = automatic ? "Building first live briefing…" : "Starting Korean news search…";
    err.classList.add("hidden");

    if (!hadLive) {
      showLoadingState("Collecting Korean RSS feeds and verifying the news…");
    }

    try {
      const jobId = crypto.randomUUID();
      await startJob("/.netlify/functions/brief-background", { jobId });
      btn.textContent = "Reading RSS + checking Korean news…";
      const briefing = await pollJob("/.netlify/functions/brief-status", jobId);
      applyLiveBriefing(briefing);
    } catch (e) {
      if (hadLive) {
        err.textContent = e.message + " Keeping the most recent live briefing on screen.";
        err.classList.remove("hidden");
        setKoreaDateLabel();
        setSourceLabel();
      } else {
        data = {
          mode: "empty",
          generatedAt: new Date().toISOString(),
          articlesScanned: 0,
          outlets: [],
          stories: [],
          life: []
        };
        err.textContent = e.message;
        err.classList.remove("hidden");
        showUnavailableState("The live search did not complete. Press Refresh briefing to try again.");
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "↻ Refresh briefing";
    }
  }

  async function loadLatestBriefing() {
    showLoadingState();
    try {
      const r = await fetch("/.netlify/functions/latest", { cache: "no-store" });
      const body = await responseJson(r);
      if (!r.ok) throw new Error(body.error || "Could not load the latest briefing.");

      if (body.available && body.data && Array.isArray(body.data.stories) && body.data.stories.length) {
        applyLiveBriefing(body.data);
        return;
      }

      await refreshInBackground({ automatic: true });
    } catch (e) {
      // If retrieving the saved edition fails, still try to build a fresh one.
      try {
        await refreshInBackground({ automatic: true });
      } catch {
        showUnavailableState(e.message);
      }
    }
  }

  btn.addEventListener("click", () => refreshInBackground({ automatic: false }));

  // Go deeper always uses the live background pipeline. There is no visible demo fallback.
  window.goDeeper = async function(deepBtn, storyIndex) {
    const story = data.stories[storyIndex];
    const panel = deepBtn.closest(".story-body")?.querySelector(".deep-panel");
    if (!story || !panel) return;

    if (panel.dataset.loaded === "1") {
      panel.classList.toggle("hidden");
      deepBtn.textContent = panel.classList.contains("hidden") ? "Go deeper" : "Hide deeper view";
      return;
    }

    deepBtn.disabled = true;
    deepBtn.textContent = "Reading more Korean coverage…";
    panel.classList.remove("hidden");
    panel.innerHTML = '<div class="deep-kicker">Go deeper</div><p>Building a fuller briefing from additional Korean coverage…</p>';

    try {
      if (!hasLiveBriefing()) throw new Error("A live briefing must be loaded first.");

      const jobId = crypto.randomUUID();
      await startJob("/.netlify/functions/deeper-background", {
        jobId,
        story: {
          title_ko: story.title_ko,
          title_en: story.title_en,
          summary: story.summary,
          category: story.category
        }
      });
      const deep = await pollJob("/.netlify/functions/deeper-status", jobId);

      panel.innerHTML = deepHtml(deep);
      panel.dataset.loaded = "1";
      deepBtn.textContent = "Hide deeper view";
    } catch (e) {
      panel.innerHTML = \`<div class="deep-kicker">Go deeper</div><p>\${escapeHtml(e.message)} The short briefing above is still available.</p>\`;
      deepBtn.textContent = "Try again";
    } finally {
      deepBtn.disabled = false;
    }
  };

  // Production startup: restore the most recent real briefing instead of the sample edition.
  loadLatestBriefing();
})();
</script>`;

export default async function handler(request, context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");

  return new Response(html.replace("</body>", `${PATCH}</body>`), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export const config = { path: "/" };

const PATCH = `<script>
(() => {
  const current = document.getElementById("refresh");
  if (!current) return;

  // Cloning removes the old synchronous click listener from the static demo.
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

  async function refreshInBackground() {
    btn.disabled = true;
    btn.textContent = "Starting Korean news search…";
    err.classList.add("hidden");

    try {
      const jobId = crypto.randomUUID();
      await startJob("/.netlify/functions/brief-background", { jobId });
      btn.textContent = "Searching Korean news…";
      const briefing = await pollJob("/.netlify/functions/brief-status", jobId);

      data = {
        ...briefing,
        life: (briefing.life && briefing.life.length) ? briefing.life : DEMO.life,
        mode: "live"
      };
      render();
      setKoreaDateLabel();
    } catch (e) {
      err.textContent = e.message + " Showing the built-in demo instead.";
      err.classList.remove("hidden");
      data = DEMO;
      render();
      setKoreaDateLabel();
    } finally {
      btn.disabled = false;
      btn.textContent = "↻ Refresh briefing";
    }
  }

  btn.addEventListener("click", refreshInBackground);

  // Replace the original synchronous Go deeper handler with a background version too.
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
      let deep;
      if (data.mode === "live") {
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
        deep = await pollJob("/.netlify/functions/deeper-status", jobId);
      } else {
        deep = demoDeepDive(story);
      }

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

  // Make the timezone explicit even before the first live refresh.
  setKoreaDateLabel();
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

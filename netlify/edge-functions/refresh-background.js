const PATCH = `<script>
(() => {
  const current = document.getElementById("refresh");
  if (!current) return;

  // Cloning removes the old synchronous click listener from the static demo.
  const btn = current.cloneNode(true);
  current.replaceWith(btn);
  const err = document.getElementById("error");
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function responseJson(r) {
    const text = await r.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { throw new Error(\`Server returned \${r.status} but not valid JSON: \${text.slice(0, 180)}\`); }
  }

  async function refreshInBackground() {
    btn.disabled = true;
    btn.textContent = "Starting Korean news search…";
    err.classList.add("hidden");

    try {
      const jobId = crypto.randomUUID();
      const start = await fetch("/.netlify/functions/brief-background", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId })
      });

      if (!start.ok && start.status !== 202) {
        const body = await responseJson(start);
        throw new Error(body.error || \`Could not start briefing (\${start.status}).\`);
      }

      let briefing = null;
      for (let attempt = 0; attempt < 150; attempt++) {
        await sleep(2000);
        btn.textContent = "Searching Korean news…";

        const r = await fetch(
          \`/.netlify/functions/brief-status?jobId=\${encodeURIComponent(jobId)}\`,
          { cache: "no-store" }
        );
        const state = await responseJson(r);

        if (!r.ok) throw new Error(state.error || \`Briefing status error (\${r.status}).\`);
        if (state.status === "done") {
          briefing = state.data;
          break;
        }
        if (state.status === "error") {
          throw new Error(state.error || "The background briefing failed.");
        }
      }

      if (!briefing) throw new Error("The Korean news search did not finish within five minutes.");

      data = {
        ...briefing,
        life: (briefing.life && briefing.life.length) ? briefing.life : DEMO.life,
        mode: "live"
      };
      render();
    } catch (e) {
      err.textContent = e.message + " Showing the built-in demo instead.";
      err.classList.remove("hidden");
      data = DEMO;
      render();
    } finally {
      btn.disabled = false;
      btn.textContent = "↻ Refresh briefing";
    }
  }

  btn.addEventListener("click", refreshInBackground);
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

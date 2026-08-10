# Korean Morning Papers

A Netlify app that builds a live English-language morning briefing from current Korean news. It combines public RSS intake with Anthropic web research, clusters overlapping coverage into a Top 10, translates and synthesizes it in English, compares framing, and offers an on-demand **Go deeper** view.

## News intake

The morning briefing now uses two layers:

1. **RSS first pass** — public feeds provide a fast, broad packet of fresh headlines and summaries.
2. **Claude web verification** — Anthropic web search verifies major stories, fills source gaps, and adds context or contrasting coverage.

Current RSS sources:

- Chosun Ilbo
- Hankyoreh
- Kyunghyang Shinmun
- Donga Ilbo
- Seoul Shinmun
- Newsis
- Yonhap English
- Korea Herald

RSS articles are deduplicated, age-filtered, and sampled across outlets so a high-volume feed cannot dominate the briefing. A failed RSS feed does not prevent the other feeds or the web-search layer from working.

The diagnostic RSS endpoint is:

`/.netlify/functions/fetch-korean-news`

It returns feed health plus normalized article objects containing title, link, publication date, summary, category, source, language, and source classification.

## AI access

The deployed app can use Netlify's Anthropic AI Gateway when it is available to the site. The code also supports a directly supplied `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL` configuration.

No Naver developer account, Naver Client ID, or Naver Client Secret is required.

## How the live briefing works

- `public/index.html` — front end / base page
- `netlify/edge-functions/refresh-background.js` — production startup, saved-live-edition loading, refresh polling, and Go deeper UI behavior
- `netlify/functions/_shared/rss.mjs` — RSS feed definitions, parsing, deduplication, age filtering, and balanced sampling
- `netlify/functions/fetch-korean-news.mjs` — public RSS diagnostic endpoint
- `netlify/functions/brief-background.mjs` — RSS-first Top 10 research job with supplemental Anthropic web search
- `netlify/functions/brief-status.mjs` — polling endpoint for the background briefing job
- `netlify/functions/latest.mjs` — returns the most recently saved successful live briefing
- `netlify/functions/deeper-background.mjs` — on-demand deeper web research for a selected story
- `netlify/functions/deeper-status.mjs` — polling endpoint for Go deeper
- `netlify/functions/_shared/ai.mjs` — Anthropic web-research and structured-output pipeline
- `netlify.toml` — Netlify publish/functions configuration

A successful briefing is saved in Netlify Blobs and restored automatically on the next page load. Refreshing builds a new edition while preserving the last successful live edition if a later update fails.

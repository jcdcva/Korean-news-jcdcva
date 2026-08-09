# Korean Morning Papers

A Netlify-ready prototype that uses Anthropic's live web search to find current Korean-language news, clusters coverage into a Top 10, translates and synthesizes it in English, compares framing, and offers an on-demand **Go deeper** view.

## Required credential

Only one API credential is required in Netlify:

- `ANTHROPIC_API_KEY`

Optional:

- `ANTHROPIC_MODEL=claude-sonnet-5`

No Naver developer account, Naver Client ID, or Naver Client Secret is required.

## How it works

- `public/index.html` — front end
- `netlify/functions/brief.mjs` — searches current Korean-language news and builds the Top 10
- `netlify/functions/deeper.mjs` — performs a fresh web search for deeper analysis of a selected story
- `netlify/functions/_shared/ai.mjs` — Anthropic API and web-search helper
- `netlify.toml` — Netlify publish/functions configuration
- `.env.example` — environment variable names only

The Anthropic web search feature must be enabled for the API organization associated with the key.

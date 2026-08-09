# Korean Morning Papers

A Netlify-ready prototype that discovers current Korean-language news through Naver News Search, clusters it into a Top 10, translates/synthesizes it in English, compares framing, and offers an on-demand **Go deeper** view.

## AI providers

This version supports both:

- OpenAI Responses API
- Anthropic Messages API

Set `AI_PROVIDER=auto`, `openai`, or `anthropic`. With `AI_FALLBACK=true`, the other configured provider can be tried if the first provider fails.

See **GITHUB-NETLIFY-SETUP.md** for step-by-step deployment instructions.

## Structure

- `public/index.html` — front end
- `netlify/functions/brief.mjs` — live Top 10
- `netlify/functions/deeper.mjs` — on-demand deeper analysis
- `netlify/functions/_shared/ai.mjs` — OpenAI/Anthropic provider switch
- `netlify.toml` — Netlify publish/functions configuration
- `.env.example` — environment variable names only

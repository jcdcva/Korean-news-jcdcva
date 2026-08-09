# Korean Morning Papers — GitHub + Netlify setup

This version supports both OpenAI and Anthropic.

## AI provider behavior

Set `AI_PROVIDER` to:

- `auto` — uses an available provider and can fall back to the other if both keys are configured.
- `openai` — prefer OpenAI.
- `anthropic` — prefer Anthropic.

With `AI_FALLBACK=true`, a configured second provider is tried if the preferred provider fails.

You need **one** AI API key, not both.

## Environment variables in Netlify

Always add:

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

For OpenAI add:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_MODEL=gpt-5-mini`

For Anthropic add:

- `ANTHROPIC_API_KEY`

Optional:

- `ANTHROPIC_MODEL=claude-sonnet-5`

Recommended:

- `AI_PROVIDER=auto`
- `AI_FALLBACK=true`

Do not put real secrets in `.env.example`, GitHub, or `index.html`.

## Put the project on GitHub

1. Sign in to GitHub.
2. Choose **New repository**.
3. Name it something like `korean-morning-papers`.
4. A private repository is fine.
5. Create the repository without adding a README, `.gitignore`, or license, because this project already has its own files.
6. Unzip this project on your computer.
7. On the empty GitHub repository page choose **uploading an existing file**.
8. Upload the project contents themselves — not an extra wrapper folder.

The repository root should visibly contain:

- `.env.example`
- `README.md`
- `netlify.toml`
- `package.json`
- `public/`
- `netlify/`

Inside `public/` should be `index.html`.

Inside `netlify/functions/` should be:

- `brief.mjs`
- `deeper.mjs`
- `_shared/ai.mjs`

Commit the upload to the `main` branch.

## Connect your EXISTING Netlify project to GitHub

In Netlify:

1. Open the Korean Morning Papers project you already created.
2. Go to **Project configuration → Build & deploy → Continuous deployment → Repository**.
3. Choose **Link repository**.
4. Select GitHub and authorize Netlify if asked.
5. Select your `korean-morning-papers` repository.
6. The included `netlify.toml` already tells Netlify:
   - publish directory: `public`
   - functions directory: `netlify/functions`
7. Save/link the repository.

A push to `main` should then trigger a new Netlify deploy automatically.

## Add secrets in Netlify

In the Netlify project, open the Environment variables area and add the Naver credentials plus at least one AI API key.

For the simplest setup:

- `AI_PROVIDER` = `auto`
- `AI_FALLBACK` = `true`
- `NAVER_CLIENT_ID` = your value
- `NAVER_CLIENT_SECRET` = your value
- `OPENAI_API_KEY` = your value

If you also have Anthropic, add `ANTHROPIC_API_KEY`.

After adding or changing environment variables, trigger a fresh production deploy.

## What happens after deployment

- The front page still loads even if the APIs are unavailable.
- **Refresh briefing** calls `/.netlify/functions/brief`.
- Naver supplies current Korean-language news metadata.
- OpenAI or Anthropic creates the English Top 10.
- **Go deeper** calls `/.netlify/functions/deeper` and performs a story-specific second Naver search.
- The page shows which AI provider produced the current live briefing.

## Security

API keys remain in Netlify's server-side environment. They are not shipped to the browser.

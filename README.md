# Backtranslation Practice

A focused, single-page tool for English backtranslation practice. Write an English version from a Chinese passage, compare it with a reference text, and optionally discuss your answer with an AI tutor.

The app keeps only the current exercise in the browser. There are no accounts, databases, or server-side chat records.

## Features

- Two-column writing and reference comparison
- One current exercise, automatically saved in local storage
- JSON backup export and import
- Optional AI feedback and follow-up chat
- Streaming AI responses with Markdown rendering
- Cloudflare Worker proxy for keeping the DeepSeek API key out of the browser
- Responsive, dependency-light static frontend

## Quick start

Requires Node.js 20 or later.

```powershell
npm install
Copy-Item materials.example.json materials.json
npm run sync-materials
npx serve dist
```

Open the local URL printed by `serve`. The example material is original and intended only to demonstrate the project structure. Replace `materials.json` with material you have the right to use, then rerun `npm run sync-materials`.

`materials.json` is intentionally ignored by Git. The sync command generates the matching frontend and Worker material files; do not edit generated copies directly.

## Optional AI setup

AI feedback uses a Cloudflare Worker as a private proxy for DeepSeek.

```powershell
Copy-Item worker/.dev.vars.example worker/.dev.vars
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY --config worker/wrangler.jsonc
npx wrangler secret put ACCESS_CODE --config worker/wrangler.jsonc
npm run worker:dry-run
npm run worker:deploy
```

Before deployment, update `ALLOWED_ORIGINS` in `worker/wrangler.jsonc` to the exact origin where the frontend will run. Then copy `dist/config.example.js` to `dist/config.js` and set its `apiUrl` to the deployed Worker endpoint.

`dist/config.js`, `worker/.dev.vars`, and Worker Secrets must never contain committed credentials. The browser asks for the access code only when AI is used; it is not stored as part of an exercise backup.

## Development commands

```powershell
npm run sync-materials
npm run check
npm test
npm run worker:dev
npm run worker:dry-run
```

## Project layout

- `dist/` — static browser application
- `worker/` — Cloudflare Worker that validates requests and streams DeepSeek responses
- `scripts/sync-materials.mjs` — produces runtime material files from a local source file
- `materials.example.json` — original sample material for a fresh clone

## Privacy and content

Your current exercise and AI conversation are stored in the browser on the device you use. AI requests send the selected material, your answer, and any follow-up question to the configured AI provider through your Worker.

Do not commit, deploy, or redistribute material unless you have the necessary rights to do so.

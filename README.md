# Place Libre

Pick a Pathé cinema, a date and a film, then open Pathé's official seat map.
Live at **https://corbiiy.github.io/place-libre/**.

## How it is hosted

GitHub Pages only serves static files, and Pathé's API refuses calls from other
websites, so the programme is fetched ahead of time:

1. `.github/workflows/pages.yml` runs on every push to `main`, on demand
   (Actions → Deploy to GitHub Pages → Run workflow), and every 30 minutes from
   07:00 to 01:00 Paris time when the Railway cron below starts it.
2. `npm run sync:pathe` (`scripts/sync-pathe.ts`) reads the Pathé API and writes
   `public/data/schedule.json` and `public/data/upcoming.json`.
3. `npm run build:pages` exports the site to `out/`, which is deployed to Pages.

If Pathé can't be reached, the run fails and the previous deployment stays online.
The page shows when the data was last synced. Seat maps always load live from Pathé.

## Refresh schedule (Railway)

GitHub's own `schedule:` trigger skipped most runs, so a Railway cron job starts
the workflow instead. `railway-trigger/` is that service: an Alpine image whose
`trigger.sh` calls GitHub's `workflow_dispatch` API, and skips 01:00–07:00 Paris
time itself, so daylight saving needs no changes.

Railway service settings:

- Source: this repo, **Root Directory** `/railway-trigger`, **Watch Paths** `/railway-trigger/**`
- **Cron Schedule** `0,30 5-23 * * *` (UTC; covers 07:00–01:00 Paris in summer and winter)
- **Restart Policy** Never
- Variable `GITHUB_TOKEN`: fine-grained token limited to `corbiiy/place-libre`
  with **Actions: Read and write**. When it expires, refreshes stop until it's replaced.

## TMDB (optional)

The original-language filter uses TMDB. Add a `TMDB_API_READ_TOKEN` repository
secret (Settings → Secrets and variables → Actions); without it the filter is
disabled. Locally the sync script reads the token from `.dev.vars`.

## Local development

Requires Node.js 22.18 or newer.

```bash
npm install
npm run sync:pathe
npm run dev
```

- `npm run build:pages`: production export to `out/` (assets under `/place-libre`)
- `npm test`: build, then check the exported page and data wiring
- `npm run lint`: ESLint

Built with [vinext](https://github.com/cloudflare/vinext).

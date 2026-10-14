# Place Libre

Pick a Pathé cinema, a date and a film, then open Pathé's official seat map.
Live at **https://corbiiy.github.io/place-libre/**.

## How it is hosted

GitHub Pages only serves static files, and Pathé's API refuses calls from other
websites, so the programme is fetched ahead of time:

1. `.github/workflows/pages.yml` runs on every push to `main`, every 30 minutes,
   and on demand (Actions → Deploy to GitHub Pages → Run workflow).
2. `npm run sync:pathe` (`scripts/sync-pathe.ts`) reads the Pathé API and writes
   `public/data/schedule.json` and `public/data/upcoming.json`.
3. `npm run build:pages` exports the site to `out/`, which is deployed to Pages.

If Pathé can't be reached, the run fails and the previous deployment stays online.
The page shows when the data was last synced. Seat maps always load live from Pathé.

GitHub pauses scheduled workflows after 60 days without a commit; re-enable it from
the Actions tab if that happens.

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

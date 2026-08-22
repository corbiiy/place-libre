import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Place Libre loading state", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Place Libre — vérifiez les places de cinéma<\/title>/i);
  assert.match(html, /Le bon film\./);
  assert.match(html, /Chargement du programme Pathé/);
  assert.match(html, /Analyse des films à venir/);
  assert.match(html, /données Pathé/);
});

test("uses live date-specific Pathé data with a saved fallback", async () => {
  const [page, route, api, cinemas] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pathe/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pathe/pathe-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/cinemas.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /fetch\(`\/api\/pathe\?\$\{params\}`\)/);
  assert.match(page, /fetch\("\/pathe-schedule\.json"\)/);
  assert.match(page, /programmeCache/);
  assert.doesNotMatch(page, /fetch\("\/pathe-schedule\.json"\)\s*\.then/);
  assert.match(route, /showtimes\/\$\{encodeURIComponent\(cinemaSlug\)\}\/\$\{date\}/);
  assert.match(route, /getParisCinemas\(\)/);
  assert.match(api, /pendingRequests/);
  assert.match(api, /responseCache/);
  assert.match(cinemas, /cinema-pathe-aquaboulevard/);
  assert.match(cinemas, /cinema-la-geode/);
  assert.match(cinemas, /cinema-pathe-montparnos/);
  assert.match(api, /!isExcludedCinema\(cinema\.slug\)/);
});

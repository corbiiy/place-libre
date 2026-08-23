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
  assert.match(html, /Programme officiel/);
  assert.match(html, /Films à venir/);
  assert.match(html, /données Pathé/);
});

test("uses live date-specific Pathé data with a saved fallback", async () => {
  const [page, styles, route, upcomingRoute, api, cinemas, tmdb] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pathe/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pathe/upcoming/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pathe/pathe-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/cinemas.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/tmdb.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /fetch\(`\/api\/pathe\?\$\{params\}`, \{ signal: controller\.signal \}\)/);
  assert.match(page, /controller\.abort\(\), 15_000/);
  assert.match(page, /fetch\("\/pathe-schedule\.json"\)/);
  assert.match(page, /programmeCache/);
  assert.doesNotMatch(page, /fetch\("\/pathe-schedule\.json"\)\s*\.then/);
  assert.match(route, /showtimes\/\$\{encodeURIComponent\(cinemaSlug\)\}\/\$\{date\}/);
  assert.match(route, /getParisCinemas\(\)/);
  assert.doesNotMatch(api, /pendingRequests/);
  assert.match(api, /responseCache/);
  assert.doesNotMatch(tmdb, /Map<string, Promise/);
  assert.match(upcomingRoute, /mapWithConcurrency\(result, 4/);
  assert.match(page, /Rechercher un film/);
  assert.match(page, /releaseDateLabel/);
  assert.match(route, /releaseDate: show\.releaseAt\?\.FR_FR/);
  assert.match(cinemas, /cinema-pathe-aquaboulevard/);
  assert.match(cinemas, /cinema-la-geode/);
  assert.match(cinemas, /cinema-pathe-montparnos/);
  assert.match(cinemas, /DEFAULT_CINEMA_SLUG = "cinema-pathe-alesia"/);
  assert.match(cinemas, /CINEMA_TRAVEL_RANK/);
  assert.match(cinemas, /compareCinemaRank/);
  assert.match(api, /!isExcludedCinema\(cinema\.slug\)/);
  assert.match(api, /\.sort\(compareCinemaRank\)/);
  assert.match(page, /selectedMovie\?\.cinemas\.find\(\(cinema\) => cinema\.slug === DEFAULT_CINEMA_SLUG\)/);
  assert.match(page, /setUpcomingCinemaSlug\(defaultCinema\?\.slug \?\? ""\)/);
  assert.match(page, /<span>Cinéma<\/span>/);
  assert.match(page, /<option value="">\{upcomingLoading \? "Chargement des cinémas…" : "Tous les cinémas"\}<\/option>/);
  assert.match(page, /cinema\.slug === upcomingCinemaFilter/);
  assert.match(page, /upcomingCinemaOptions\.map\(\(cinema\)/);
  assert.match(page, /setUpcomingCinemaFilter\(cinema\)/);
  assert.match(page, /Nationalité du film/);
  assert.match(page, /<option value="france">France<\/option>/);
  assert.match(page, /<option value="outside-france">Hors France<\/option>/);
  assert.match(page, /upcomingNationality === "outside-france" && movie\.nationality !== "France"/);
  assert.match(page, /UPCOMING_DATA_VERSION = "tmdb-language-v1"/);
  assert.match(page, /fetch\(`\/api\/pathe\/upcoming\?data=\$\{UPCOMING_DATA_VERSION\}`\)/);
  assert.match(page, /type="date" value=\{upcomingStartDate\}/);
  assert.match(page, /type="date" value=\{upcomingEndDate\}/);
  assert.match(page, /day >= upcomingStartDate/);
  assert.match(page, /day <= upcomingEndDate/);
  assert.match(page, /visibleUpcomingMovies\.find\(\(movie\) => movie\.slug === upcomingMovieSlug\)/);
  assert.match(upcomingRoute, /`\/show\/\$\{encodeURIComponent\(movie\.slug\)\}`/);
  assert.match(upcomingRoute, /detail\?\.nationality \?\? detail\?\.nationalityTracking/);
  assert.match(upcomingRoute, /matchTmdbMovie\(movie\.title, movie\.releaseDate\)/);
  assert.match(upcomingRoute, /sources: \{ pathe: true, tmdb: isTmdbConfigured\(\) \}/);
  assert.match(tmdb, /https:\/\/api\.themoviedb\.org\/3\/search\/movie/);
  assert.match(tmdb, /TMDB_API_READ_TOKEN/);
  assert.match(tmdb, /original_language/);
  assert.match(page, /Langue originale · TMDB/);
  assert.match(page, /movie\.originalLanguage === upcomingLanguage/);
  assert.match(page, /defaultCinema\?\.dates\.length === 1 \? defaultCinema\.dates\[0\] : null/);
  assert.match(page, /selectedCinema\?\.dates\.length === 1 \? selectedCinema\.dates\[0\] : null/);
  assert.match(page, /loadUpcomingDate\(selectedMovie, defaultCinema, onlyDate\)/);
  assert.match(page, /loadUpcomingDate\(upcomingMovie, selectedCinema, onlyDate\)/);
  assert.match(page, /type PageView = "programme" \| "upcoming"/);
  assert.match(page, /activePage === "programme"/);
  assert.match(page, /activePage === "upcoming"/);
  assert.match(page, /Pages de Place Libre/);
  assert.match(page, /if \(page === "upcoming"\) void loadUpcomingCatalogue\(\)/);
  assert.match(page, /\["#a-venir", "#films-a-venir"\]/);
  assert.match(page, /url\.searchParams\.set\("pos", SEATING_POSITION\)/);
  assert.match(page, /url\.searchParams\.delete\("token"\)/);
  assert.match(page, /Fenêtre Pathé chargée/);
  assert.match(page, /onLoad=\{\(\) => setSeatMapReady\(true\)\}/);
  assert.match(page, /Capacité \{session\.capacity\}/);
  assert.doesNotMatch(page, /<span>01<\/span>\s*Programme officiel/);
  assert.doesNotMatch(page, /<span>03<\/span>\s*Films à venir/);
  assert.match(page, /Version française/);
  assert.match(styles, /linear-gradient\(90deg, #0055a4/);
  assert.match(styles, /#ef4135/);
  assert.match(page, /Voir le plan officiel/);
  assert.doesNotMatch(page, /ExactSeatAnalysis|placelibrehelper|analyse exacte|helper Safari/i);
});

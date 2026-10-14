import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports the Place Libre loading state for GitHub Pages", async () => {
  const html = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Place Libre : vérifiez les places de cinéma<\/title>/i);
  assert.match(html, /Le bon film\./);
  assert.match(html, /Chargement du programme Pathé/);
  assert.match(html, /Programme officiel/);
  assert.match(html, /Films à venir/);
  assert.match(html, /données Pathé/);
  assert.match(html, /href="\/place-libre\/favicon\.svg\?v=2"/);
  assert.match(html, /src="\/place-libre\/_next\/static\/chunks\//);
  assert.match(html, /content="https:\/\/corbiiy\.github\.io\/place-libre\/og\.png"/);
});

test("reads the static Pathé data written by the sync script", async () => {
  const [page, styles, cinemas, tmdb, site, syncScript, favicon] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/cinemas.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/tmdb.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/site.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/sync-pathe.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
  ]);

  assert.match(site, /BASE_PATH = process\.env\.NODE_ENV === "production" \? "\/place-libre" : ""/);
  assert.match(page, /const dataUrl = \(file: string\) => `\$\{BASE_PATH\}\/data\/\$\{file\}`/);
  assert.match(page, /fetch\(dataUrl\("schedule\.json"\), \{ cache: "no-cache" \}\)/);
  assert.match(page, /fetch\(dataUrl\("upcoming\.json"\), \{ cache: "no-cache" \}\)/);
  assert.match(page, /upcomingFromSchedule\(await loadSchedule\(\)\)/);
  assert.match(page, /scheduleCache/);
  assert.doesNotMatch(page, /\/api\/pathe|pathe-schedule\.json/);
  assert.match(syncScript, /new URL\("\.\.\/public\/data\/", import\.meta\.url\)/);
  assert.match(syncScript, /showtimes\/\$\{encodeURIComponent\(cinemaSlug\)\}\/\$\{date\}/);
  assert.match(syncScript, /isSupportedCinema\(cinema\.slug, theater\.addressCity\)/);
  assert.doesNotMatch(tmdb, /Map<string, Promise|cloudflare:workers/);
  assert.match(page, /Rechercher un film/);
  assert.match(page, /releaseDateLabel/);
  assert.match(page, /left\.releaseDate\.localeCompare\(right\.releaseDate\)/);
  assert.match(page, /normalizedMovieSearch \? movies\.sort\(compareReleaseDate\) : movies/);
  assert.match(syncScript, /releaseDate: show\.releaseAt\?\.FR_FR/);
  assert.match(cinemas, /cinema-pathe-aquaboulevard/);
  assert.match(cinemas, /cinema-la-geode/);
  assert.match(cinemas, /cinema-pathe-montparnos/);
  assert.match(cinemas, /DEFAULT_CINEMA_SLUG = "cinema-pathe-alesia"/);
  assert.match(cinemas, /CINEMA_TRAVEL_RANK/);
  assert.match(cinemas, /cinema-pathe-grand-quevilly/);
  assert.match(cinemas, /cinema-pathe-odysseum/);
  assert.match(cinemas, /isSupportedCinema/);
  assert.match(page, /Paris, au Grand-Quevilly ou à Montpellier/);
  assert.match(page, /className="brand-mark" src=\{`\$\{BASE_PATH\}\/favicon\.svg`\} alt=""/);
  assert.match(favicon, /#FFE600/);
  assert.match(favicon, /#171714/);
  assert.match(cinemas, /compareCinemaRank/);
  assert.match(syncScript, /!isExcludedCinema\(cinema\.slug\)/);
  assert.match(syncScript, /\.sort\(compareCinemaRank\)/);
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
  assert.match(page, /type="date" value=\{upcomingStartDate\}/);
  assert.match(page, /type="date" value=\{upcomingEndDate\}/);
  assert.match(page, /upcomingCalendarRange\(dates, \{ months: 1 \}\)/);
  assert.match(page, /Semaine prochaine/);
  assert.match(page, /Prochains 3 mois/);
  assert.match(page, /Prochains 6 mois/);
  assert.match(page, /upcomingCalendarRange\(upcomingDates, \{ days: 7 \}\)/);
  assert.match(page, /upcomingCalendarRange\(upcomingDates, \{ months: 3 \}\)/);
  assert.match(page, /upcomingCalendarRange\(upcomingDates, \{ months: 6 \}\)/);
  assert.match(page, /day >= upcomingStartDate/);
  assert.match(page, /day <= upcomingEndDate/);
  assert.match(page, /visibleUpcomingMovies\.find\(\(movie\) => movie\.slug === upcomingMovieSlug\)/);
  assert.match(syncScript, /`\/show\/\$\{encodeURIComponent\(movie\.slug\)\}`/);
  assert.match(syncScript, /detail\?\.nationality \?\? detail\?\.nationalityTracking/);
  assert.match(syncScript, /matchTmdbMovie\(movie\.title, movie\.releaseDate\)/);
  assert.match(syncScript, /sources: \{ pathe: true, tmdb: isTmdbConfigured\(\) \}/);
  assert.match(syncScript, /releaseDate: movie\.releaseDate \?\? tmdbMatch\?\.releaseDate \?\? null/);
  assert.match(page, /setUpcomingError\(data\.sources\?\.pathe === false\)/);
  assert.match(tmdb, /https:\/\/api\.themoviedb\.org\/3\/search\/movie/);
  assert.match(tmdb, /TMDB_API_READ_TOKEN/);
  assert.match(tmdb, /original_language/);
  assert.match(page, /Langue originale \(TMDB\)/);
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
  assert.match(page, /Réponse de Pathé reçue/);
  assert.match(page, /Recharger le plan/);
  assert.match(page, /reloadedSeatMapUrl/);
  assert.match(page, /onLoad=\{\(\) => setSeatMapReady\(true\)\}/);
  assert.match(page, /\{session\.capacity\} places/);
  assert.doesNotMatch(page, /<span>01<\/span>\s*Programme officiel/);
  assert.doesNotMatch(page, /<span>03<\/span>\s*Films à venir/);
  assert.match(page, /Version française/);
  assert.match(styles, /linear-gradient\(90deg, #0055a4/);
  assert.match(styles, /#ef4135/);
  assert.match(page, /Voir le plan officiel/);
  assert.match(page, /function SessionResult/);
  assert.match(page, /Plan disponible/);
  assert.match(page, /id="upcoming-detail"/);
  assert.match(page, /Choisissez d’abord le film/);
  assert.match(page, /className="finder-skeleton"/);
  assert.match(page, /className="upcoming-skeleton"/);
  assert.doesNotMatch(page, /step-number|upcoming-step|Fermer ×/);
  assert.match(styles, /\.upcoming-intro h1/);
  assert.match(styles, /min-height: calc\(100dvh - 72px\)/);
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.doesNotMatch(page, /ExactSeatAnalysis|placelibrehelper|analyse exacte|helper Safari/i);
});

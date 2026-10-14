// Fetches the Pathé programme and writes the static data the site reads:
// - public/data/schedule.json: every session, per cinema and day
// - public/data/upcoming.json: films across cinemas, with nationality and TMDB original language
// GitHub Pages cannot call Pathé (no CORS), so the deploy workflow runs this on a schedule.
import { mkdir, writeFile } from "node:fs/promises";
import { compareCinemaRank, isExcludedCinema, isSupportedCinema } from "../lib/cinemas.ts";
import { isTmdbConfigured, matchTmdbMovie } from "../lib/tmdb.ts";

type PatheCinema = {
  slug: string;
  name: string;
  theaters?: Array<{ addressCity?: string; addressZip?: string }>;
};

type PatheShow = {
  slug: string;
  title: string;
  duration?: number;
  genres?: string[];
  posterPath?: { md?: string; lg?: string };
  contentRating?: { description?: string };
  releaseAt?: { FR_FR?: string };
};

type PatheShowDetail = {
  nationality?: string;
  nationalityTracking?: string;
};

type PatheProgramme = {
  shows?: Record<string, { days?: Record<string, unknown> }>;
};

type PatheSession = {
  time: string;
  endTime?: string;
  version?: string;
  tags?: string[];
  status?: string;
  refCmd?: string;
  auditoriumName?: string;
  auditoriumCapacity?: string | number;
};

const API = "https://www.pathe.fr/api";
const headers = {
  Accept: "application/json",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  Referer: "https://www.pathe.fr/",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getJson<T>(path: string): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${API}${path}`, { headers }).catch((error: Error) => error);
    if (response instanceof Response && response.ok) return response.json() as Promise<T>;
    const reason = response instanceof Response ? `Pathé ${response.status}` : `Pathé unreachable (${response.message})`;
    const retryable = !(response instanceof Response) || response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 3) throw new Error(`${reason}: ${path}`);
    await wait(1000 * attempt);
  }
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

// Event listings (IMAX 70mm, Ciné-Hits…) answer 403 on the all-days endpoint, so read them day by day.
async function getShowtimes(slug: string, cinemaSlug: string, dates: string[]): Promise<Record<string, PatheSession[]>> {
  try {
    return await getJson<Record<string, PatheSession[]>>(`/show/${encodeURIComponent(slug)}/showtimes/${encodeURIComponent(cinemaSlug)}`);
  } catch {
    const days = await mapLimit(dates, 2, async (date) => {
      try {
        const payload = await getJson<PatheSession[] | Record<string, PatheSession[]>>(`/show/${encodeURIComponent(slug)}/showtimes/${encodeURIComponent(cinemaSlug)}/${date}`);
        return [date, Array.isArray(payload) ? payload : payload?.[date] ?? []] as const;
      } catch (error) {
        console.warn(`Showtimes unavailable for ${cinemaSlug}/${slug}/${date}: ${(error as Error).message}`);
        return [date, []] as const;
      }
    });
    return Object.fromEntries(days);
  }
}

const filmFromShow = (show: PatheShow) => ({
  slug: show.slug,
  title: show.title,
  duration: show.duration ?? null,
  genres: show.genres ?? [],
  poster: show.posterPath?.md ?? show.posterPath?.lg ?? null,
  contentRating: show.contentRating?.description ?? null,
  releaseDate: show.releaseAt?.FR_FR ?? null,
});

const sessionFromPathe = (session: PatheSession) => ({
  time: session.time.slice(11, 16),
  endTime: session.endTime?.slice(11, 16) ?? null,
  version: session.version?.toUpperCase() ?? null,
  tags: session.tags ?? [],
  status: session.status,
  bookingUrl: session.refCmd,
  auditorium: session.auditoriumName,
  capacity: Number(session.auditoriumCapacity) || null,
});

const [allCinemas, cataloguePayload] = await Promise.all([
  getJson<PatheCinema[]>("/cinemas"),
  getJson<{ shows?: PatheShow[] } | PatheShow[]>("/shows"),
]);
const catalogueShows = Array.isArray(cataloguePayload) ? cataloguePayload : cataloguePayload.shows ?? [];
const catalogue = new Map(catalogueShows.map((show) => [show.slug, show]));
const showFor = (slug: string): PatheShow => catalogue.get(slug) ?? { slug, title: slug.replaceAll("-", " ") };

const supportedCinemas = allCinemas
  .filter((cinema) => cinema.theaters?.some((theater) => isSupportedCinema(cinema.slug, theater.addressCity)) && !isExcludedCinema(cinema.slug))
  .sort(compareCinemaRank);
if (!supportedCinemas.length) throw new Error("Pathé returned no supported cinemas");

const programmes = await Promise.all(supportedCinemas.map((cinema) => getJson<PatheProgramme>(`/cinema/${encodeURIComponent(cinema.slug)}/shows`)));

const syncedAt = new Date().toISOString();
const scheduleCinemas = [];
type UpcomingMovie = ReturnType<typeof filmFromShow> & {
  firstDate: string;
  lastDate: string;
  cinemas: Array<{ slug: string; name: string; district: string; dates: string[] }>;
};
const upcoming = new Map<string, UpcomingMovie>();

for (const [cinemaIndex, cinema] of supportedCinemas.entries()) {
  const district = cinema.theaters?.[0]?.addressZip ?? "Paris";
  const films = Object.entries(programmes[cinemaIndex].shows ?? {})
    .map(([slug, entry]) => ({ slug, dates: Object.keys(entry.days ?? {}).filter((date) => date >= today).sort() }))
    .filter((film) => film.dates.length > 0);

  const showtimes = await mapLimit(films, 6, (film) => getShowtimes(film.slug, cinema.slug, film.dates));

  const days: Record<string, Array<ReturnType<typeof filmFromShow> & { sessions: ReturnType<typeof sessionFromPathe>[] }>> = {};
  films.forEach((film, filmIndex) => {
    const show = filmFromShow(showFor(film.slug));
    for (const date of film.dates) {
      (days[date] ??= []).push({ ...show, sessions: (showtimes[filmIndex][date] ?? []).map(sessionFromPathe) });
    }

    const movie = upcoming.get(film.slug) ?? { ...show, firstDate: film.dates[0], lastDate: film.dates.at(-1)!, cinemas: [] };
    movie.firstDate = movie.firstDate < film.dates[0] ? movie.firstDate : film.dates[0];
    movie.lastDate = movie.lastDate > film.dates.at(-1)! ? movie.lastDate : film.dates.at(-1)!;
    movie.cinemas.push({ slug: cinema.slug, name: cinema.name, district, dates: film.dates });
    upcoming.set(film.slug, movie);
  });
  Object.values(days).forEach((dayFilms) => dayFilms.sort((a, b) => a.title.localeCompare(b.title, "fr")));

  scheduleCinemas.push({
    slug: cinema.slug,
    name: cinema.name,
    district,
    pageUrl: `https://www.pathe.fr/cinemas/${cinema.slug}`,
    days: Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b))),
  });
  console.log(`${cinema.name}: ${films.length} films`);
}

const dates = [...new Set(scheduleCinemas.flatMap((cinema) => Object.keys(cinema.days)))].sort();

const upcomingMovies = await mapLimit(
  [...upcoming.values()].sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.title.localeCompare(b.title, "fr")),
  4,
  async (movie) => {
    const [detail, tmdbMatch] = await Promise.all([
      getJson<PatheShowDetail>(`/show/${encodeURIComponent(movie.slug)}`).catch(() => null),
      matchTmdbMovie(movie.title, movie.releaseDate).catch(() => null),
    ]);
    return {
      ...movie,
      releaseDate: movie.releaseDate ?? tmdbMatch?.releaseDate ?? null,
      nationality: detail?.nationality ?? detail?.nationalityTracking ?? null,
      originalLanguage: tmdbMatch?.originalLanguage ?? null,
      tmdbId: tmdbMatch?.id ?? null,
    };
  },
);

const dataDir = new URL("../public/data/", import.meta.url);
await mkdir(dataDir, { recursive: true });
await writeFile(new URL("schedule.json", dataDir), `${JSON.stringify({ syncedAt, source: "https://www.pathe.fr/api", dates, cinemas: scheduleCinemas })}\n`);
await writeFile(new URL("upcoming.json", dataDir), `${JSON.stringify({ syncedAt, sources: { pathe: true, tmdb: isTmdbConfigured() }, movies: upcomingMovies })}\n`);
console.log(`Saved ${scheduleCinemas.length} cinemas (${dates[0]} to ${dates.at(-1)}) and ${upcomingMovies.length} films${isTmdbConfigured() ? " with TMDB" : " without TMDB"}`);

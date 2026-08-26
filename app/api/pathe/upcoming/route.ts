import { getPatheJson, getSupportedCinemas } from "../pathe-api";
import { compareCinemaRank, isExcludedCinema } from "../../../../lib/cinemas";
import { isTmdbConfigured, matchTmdbMovie } from "../../../../lib/tmdb";
import savedSchedule from "../../../../public/pathe-schedule.json";

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

type AggregatedMovie = {
  slug: string;
  title: string;
  duration: number | null;
  genres: string[];
  poster: string | null;
  contentRating: string | null;
  releaseDate: string | null;
  nationality: string | null;
  originalLanguage: string | null;
  tmdbId: number | null;
  firstDate: string;
  lastDate: string;
  cinemas: Array<{ slug: string; name: string; district: string; dates: string[] }>;
};

type SavedSchedule = {
  syncedAt: string;
  cinemas: Array<{
    slug: string;
    name: string;
    district: string;
    days: Record<string, Array<{
      slug: string;
      title: string;
      duration?: number | null;
      genres?: string[];
      poster?: string | null;
      contentRating?: string | null;
      releaseDate?: string | null;
    }>>;
  }>;
};

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

function upcomingFromSavedSchedule(schedule: SavedSchedule) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const movies = new Map<string, AggregatedMovie & { cinemaMap: Map<string, AggregatedMovie["cinemas"][number]> }>();

  schedule.cinemas.filter((cinema) => !isExcludedCinema(cinema.slug)).forEach((cinema) => {
    Object.entries(cinema.days).forEach(([day, films]) => {
      if (day < today) return;
      films.forEach((film) => {
        const movie = movies.get(film.slug) ?? {
          slug: film.slug,
          title: film.title,
          duration: film.duration ?? null,
          genres: film.genres ?? [],
          poster: film.poster ?? null,
          contentRating: film.contentRating ?? null,
          releaseDate: film.releaseDate ?? null,
          nationality: null,
          originalLanguage: null,
          tmdbId: null,
          firstDate: day,
          lastDate: day,
          cinemas: [],
          cinemaMap: new Map<string, AggregatedMovie["cinemas"][number]>(),
        };
        movie.firstDate = movie.firstDate < day ? movie.firstDate : day;
        movie.lastDate = movie.lastDate > day ? movie.lastDate : day;
        const venue = movie.cinemaMap.get(cinema.slug) ?? {
          slug: cinema.slug,
          name: cinema.name,
          district: cinema.district,
          dates: [],
        };
        if (!venue.dates.includes(day)) venue.dates.push(day);
        movie.cinemaMap.set(cinema.slug, venue);
        movies.set(film.slug, movie);
      });
    });
  });

  return [...movies.values()].map(({ cinemaMap, ...movie }) => ({
    ...movie,
    cinemas: [...cinemaMap.values()]
      .map((cinema) => ({ ...cinema, dates: cinema.dates.sort() }))
      .sort(compareCinemaRank),
  })).sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.title.localeCompare(b.title, "fr"));
}

async function enrichMovies(movies: AggregatedMovie[], includePatheDetails: boolean) {
  return mapWithConcurrency(movies, 4, async (movie) => {
    const [detail, tmdbMatch] = await Promise.all([
      includePatheDetails
        ? getPatheJson<PatheShowDetail>(`/show/${encodeURIComponent(movie.slug)}`, 86_400_000).catch(() => null)
        : Promise.resolve(null),
      matchTmdbMovie(movie.title, movie.releaseDate).catch(() => null),
    ]);
    return {
      ...movie,
      releaseDate: movie.releaseDate ?? tmdbMatch?.releaseDate ?? null,
      nationality: detail?.nationality ?? detail?.nationalityTracking ?? null,
      originalLanguage: tmdbMatch?.originalLanguage ?? null,
      tmdbId: tmdbMatch?.id ?? null,
    };
  });
}

export async function GET() {
  try {
    const [cinemas, cataloguePayload] = await Promise.all([
      getSupportedCinemas(),
      getPatheJson<{ shows?: PatheShow[] } | PatheShow[]>("/shows", 3_600_000),
    ]);
    const programmes = await Promise.all(cinemas.map(async (cinema) => {
      try {
        return await getPatheJson<PatheProgramme>(`/cinema/${encodeURIComponent(cinema.slug)}/shows`, 300_000);
      } catch {
        return { shows: {} };
      }
    }));
    const catalogueShows = Array.isArray(cataloguePayload) ? cataloguePayload : cataloguePayload.shows ?? [];
    const catalogue = new Map<string, PatheShow>(catalogueShows.map((show) => [show.slug, show]));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
    const movies = new Map<string, AggregatedMovie>();

    programmes.forEach((programme, cinemaIndex) => {
      const cinema = cinemas[cinemaIndex];
      Object.entries(programme.shows ?? {}).forEach(([slug, entry]) => {
        const dates = Object.keys(entry.days ?? {}).filter((date) => date >= today).sort();
        if (!dates.length) return;
        const show = catalogue.get(slug) ?? { slug, title: slug.replaceAll("-", " ") };
        const movie = movies.get(slug) ?? {
          slug,
          title: show.title,
          duration: show.duration ?? null,
          genres: show.genres ?? [],
          poster: show.posterPath?.md ?? show.posterPath?.lg ?? null,
          contentRating: show.contentRating?.description ?? null,
          releaseDate: show.releaseAt?.FR_FR ?? null,
          nationality: null,
          originalLanguage: null,
          tmdbId: null,
          firstDate: dates[0],
          lastDate: dates.at(-1),
          cinemas: [],
        };
        movie.firstDate = movie.firstDate < dates[0] ? movie.firstDate : dates[0];
        movie.lastDate = movie.lastDate > dates.at(-1) ? movie.lastDate : dates.at(-1);
        movie.cinemas.push({
          slug: cinema.slug,
          name: cinema.name,
          district: cinema.theaters?.[0]?.addressZip ?? "Paris",
          dates,
        });
        movies.set(slug, movie);
      });
    });

    const result = [...movies.values()].sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.title.localeCompare(b.title, "fr"));
    const enrichedResult = await enrichMovies(result, true);
    return Response.json({ syncedAt: new Date().toISOString(), sources: { pathe: true, tmdb: isTmdbConfigured() }, movies: enrichedResult }, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error("Live Pathé catalogue unavailable; using the saved catalogue", error instanceof Error ? error.message : error);
    const fallbackMovies = upcomingFromSavedSchedule(savedSchedule as SavedSchedule);
    const enrichedFallback = await enrichMovies(fallbackMovies, false);
    return Response.json({
      syncedAt: (savedSchedule as SavedSchedule).syncedAt,
      sources: { pathe: false, tmdb: isTmdbConfigured() },
      movies: enrichedFallback,
    }, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600" },
    });
  }
}

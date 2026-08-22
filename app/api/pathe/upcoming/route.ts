import { getParisCinemas, getPatheJson } from "../pathe-api";

type PatheShow = {
  slug: string;
  title: string;
  duration?: number;
  genres?: string[];
  posterPath?: { md?: string; lg?: string };
  contentRating?: { description?: string };
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
  firstDate: string;
  lastDate: string;
  cinemas: Array<{ slug: string; name: string; district: string; dates: string[] }>;
};

export async function GET() {
  try {
    const [cinemas, cataloguePayload] = await Promise.all([
      getParisCinemas(),
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
    return Response.json({ syncedAt: new Date().toISOString(), movies: result }, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch {
    return Response.json({ error: "Films à venir indisponibles" }, { status: 502 });
  }
}

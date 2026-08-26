import { getPatheJson, getSupportedCinemas } from "./pathe-api";
import { isExcludedCinema } from "../../../lib/cinemas";

type PatheShow = {
  slug: string;
  title: string;
  duration?: number;
  genres?: string[];
  posterPath?: { md?: string; lg?: string };
  contentRating?: { description?: string };
  releaseAt?: { FR_FR?: string };
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cinemaSlug = url.searchParams.get("cinema") ?? "";
  const requestedDate = url.searchParams.get("date");

  if (!/^cinema-[a-z0-9-]+$/.test(cinemaSlug) || isExcludedCinema(cinemaSlug) || (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate))) {
    return Response.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  try {
    const [programme, cataloguePayload, supportedCinemas] = await Promise.all([
      getPatheJson<PatheProgramme>(`/cinema/${encodeURIComponent(cinemaSlug)}/shows`, 300_000),
      getPatheJson<{ shows?: PatheShow[] } | PatheShow[]>("/shows", 3_600_000),
      getSupportedCinemas(),
    ]);
    const catalogueShows = Array.isArray(cataloguePayload) ? cataloguePayload : cataloguePayload.shows ?? [];
    const catalogue = new Map<string, PatheShow>(catalogueShows.map((show) => [show.slug, show]));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
    const dates = [...new Set<string>(Object.values(programme.shows ?? {}).flatMap((entry) => Object.keys(entry.days ?? {})))]
      .filter((date) => date >= today)
      .sort();
    const date = requestedDate && dates.includes(requestedDate) ? requestedDate : dates[0];
    const selectedSlugs = date ? Object.entries(programme.shows ?? {})
      .filter(([, entry]) => entry.days?.[date])
      .map(([slug]) => slug) : [];

    const showtimes = await Promise.all(selectedSlugs.map(async (slug) => {
      try {
        const payload = await getPatheJson<PatheSession[] | Record<string, PatheSession[]>>(`/show/${encodeURIComponent(slug)}/showtimes/${encodeURIComponent(cinemaSlug)}/${date}`, 60_000);
        return [slug, Array.isArray(payload) ? payload : payload?.[date]] as const;
      } catch {
        return [slug, []] as const;
      }
    }));
    const showtimesBySlug = Object.fromEntries(showtimes);
    const films = selectedSlugs.map((slug) => {
      const show = catalogue.get(slug) ?? { slug, title: slug.replaceAll("-", " ") };
      const sessions = showtimesBySlug[slug] ?? [];
      return {
        slug,
        title: show.title,
        duration: show.duration ?? null,
        genres: show.genres ?? [],
        poster: show.posterPath?.md ?? show.posterPath?.lg ?? null,
        contentRating: show.contentRating?.description ?? null,
        releaseDate: show.releaseAt?.FR_FR ?? null,
        sessions: sessions.map((session) => ({
          time: session.time.slice(11, 16),
          endTime: session.endTime?.slice(11, 16) ?? null,
          version: session.version?.toUpperCase() ?? null,
          tags: session.tags ?? [],
          status: session.status,
          bookingUrl: session.refCmd,
          auditorium: session.auditoriumName,
          capacity: Number(session.auditoriumCapacity) || null,
        })),
      };
    }).sort((a, b) => a.title.localeCompare(b.title, "fr"));

    const cinemas = supportedCinemas.map((cinema) => ({
      slug: cinema.slug,
      name: cinema.name,
      district: cinema.theaters?.[0]?.addressZip ?? "Paris",
      pageUrl: `https://www.pathe.fr/cinemas/${cinema.slug}`,
    }));

    return Response.json({ syncedAt: new Date().toISOString(), dates, date, films, cinemas }, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return Response.json({ error: "Programme Pathé indisponible" }, { status: 502 });
  }
}

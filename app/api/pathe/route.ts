type PatheShow = {
  slug: string;
  title: string;
  duration?: number;
  genres?: string[];
  posterPath?: { md?: string; lg?: string };
  contentRating?: { description?: string };
};

const API = "https://www.pathe.fr/api";
const patheHeaders = {
  Accept: "application/json",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  Referer: "https://www.pathe.fr/",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
};

async function getJson(path: string) {
  const response = await fetch(`${API}${path}`, { headers: patheHeaders });
  if (!response.ok) throw new Error(`Pathé ${response.status}`);
  return response.json();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cinemaSlug = url.searchParams.get("cinema") ?? "";
  const requestedDate = url.searchParams.get("date");

  if (!/^cinema-[a-z0-9-]+$/.test(cinemaSlug) || (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate))) {
    return Response.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  try {
    const [programme, cataloguePayload] = await Promise.all([
      getJson(`/cinema/${encodeURIComponent(cinemaSlug)}/shows`),
      getJson("/shows"),
    ]);
    const catalogue = new Map<string, PatheShow>((cataloguePayload.shows ?? cataloguePayload).map((show: PatheShow) => [show.slug, show]));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
    const dates = [...new Set<string>(Object.values(programme.shows ?? {}).flatMap((entry: any) => Object.keys(entry.days ?? {})))]
      .filter((date) => date >= today)
      .sort();
    const date = requestedDate && dates.includes(requestedDate) ? requestedDate : dates[0];
    const selectedSlugs = date ? Object.entries(programme.shows ?? {})
      .filter(([, entry]: [string, any]) => entry.days?.[date])
      .map(([slug]) => slug) : [];

    const showtimes = await Promise.all(selectedSlugs.map(async (slug) => {
      try {
        return [slug, await getJson(`/show/${encodeURIComponent(slug)}/showtimes/${encodeURIComponent(cinemaSlug)}`)] as const;
      } catch {
        return [slug, {}] as const;
      }
    }));
    const showtimesBySlug = Object.fromEntries(showtimes);
    const films = selectedSlugs.map((slug) => {
      const show = catalogue.get(slug) ?? { slug, title: slug.replaceAll("-", " ") };
      const sessions = showtimesBySlug[slug]?.[date] ?? [];
      return {
        slug,
        title: show.title,
        duration: show.duration ?? null,
        genres: show.genres ?? [],
        poster: show.posterPath?.md ?? show.posterPath?.lg ?? null,
        contentRating: show.contentRating?.description ?? null,
        sessions: sessions.map((session: any) => ({
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

    return Response.json({ syncedAt: new Date().toISOString(), dates, date, films }, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch {
    return Response.json({ error: "Programme Pathé indisponible" }, { status: 502 });
  }
}

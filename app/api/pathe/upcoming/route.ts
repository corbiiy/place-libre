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

export async function GET() {
  try {
    const [allCinemas, cataloguePayload] = await Promise.all([getJson("/cinemas"), getJson("/shows")]);
    const cinemas: PatheCinema[] = allCinemas
      .filter((cinema: PatheCinema) => cinema.theaters?.some((theater) => theater.addressCity === "Paris"))
      .sort((a: PatheCinema, b: PatheCinema) => (a.theaters?.[0]?.addressZip ?? "").localeCompare(b.theaters?.[0]?.addressZip ?? "") || a.name.localeCompare(b.name));
    const programmes = await Promise.all(cinemas.map(async (cinema) => {
      try {
        return await getJson(`/cinema/${encodeURIComponent(cinema.slug)}/shows`);
      } catch {
        return { shows: {} };
      }
    }));
    const catalogue = new Map<string, PatheShow>((cataloguePayload.shows ?? cataloguePayload).map((show: PatheShow) => [show.slug, show]));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
    const movies = new Map<string, any>();

    programmes.forEach((programme, cinemaIndex) => {
      const cinema = cinemas[cinemaIndex];
      Object.entries(programme.shows ?? {}).forEach(([slug, entry]: [string, any]) => {
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

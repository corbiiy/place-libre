import { writeFile } from "node:fs/promises";

const API = "https://www.pathe.fr/api";
const headers = {
  Accept: "application/json",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  Referer: "https://www.pathe.fr/",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};
const INCLUDED_OUTSIDE_PARIS = new Set(["cinema-pathe-grand-quevilly"]);

async function getJson(path) {
  const response = await fetch(`${API}${path}`, { headers });
  if (!response.ok) throw new Error(`Pathé ${response.status}: ${path}`);
  return response.json();
}

const now = new Date();
const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

const [allCinemas, cataloguePayload] = await Promise.all([getJson("/cinemas"), getJson("/shows")]);
const catalogue = new Map((cataloguePayload.shows ?? cataloguePayload).map((show) => [show.slug, show]));
const supportedCinemas = allCinemas
  .filter((cinema) => cinema.theaters?.some((theater) => theater.addressCity === "Paris") || INCLUDED_OUTSIDE_PARIS.has(cinema.slug))
  .sort((a, b) => a.theaters[0].addressZip.localeCompare(b.theaters[0].addressZip) || a.name.localeCompare(b.name));
const programmes = await Promise.all(supportedCinemas.map((cinema) => getJson(`/cinema/${cinema.slug}/shows`)));
const dates = [...new Set(programmes.flatMap((programme) => Object.values(programme.shows ?? {}).flatMap((entry) => Object.keys(entry.days ?? {}))))]
  .filter((date) => date >= localToday)
  .sort();

const cinemas = [];
for (const [cinemaIndex, cinema] of supportedCinemas.entries()) {
  const programme = programmes[cinemaIndex];
  const selectedSlugs = Object.entries(programme.shows ?? {})
    .filter(([, entry]) => Object.keys(entry.days ?? {}).some((date) => date >= localToday))
    .map(([slug]) => slug);

  const showtimeEntries = await mapLimit(selectedSlugs, 6, async (slug) => {
    try {
      return [slug, await getJson(`/show/${slug}/showtimes/${cinema.slug}`)];
    } catch (error) {
      console.warn(`Showtimes unavailable for ${cinema.slug}/${slug}: ${error.message}`);
      return [slug, {}];
    }
  });
  const showtimesBySlug = Object.fromEntries(showtimeEntries);

  const days = {};
  for (const date of dates) {
    days[date] = selectedSlugs.flatMap((slug) => {
      const programmeEntry = programme.shows?.[slug]?.days?.[date];
      if (!programmeEntry) return [];
      const sessions = showtimesBySlug[slug]?.[date] ?? [];
      const show = catalogue.get(slug) ?? { slug, title: slug.replaceAll("-", " ") };
      return [{
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
      }];
    }).sort((a, b) => a.title.localeCompare(b.title, "fr"));
  }

  cinemas.push({
    slug: cinema.slug,
    name: cinema.name,
    district: cinema.theaters[0].addressZip,
    pageUrl: `https://www.pathe.fr/cinemas/${cinema.slug}`,
    days,
  });
  console.log(`${cinema.name}: ${selectedSlugs.length} films`);
}

const output = {
  syncedAt: new Date().toISOString(),
  source: "https://www.pathe.fr/api",
  dates,
  cinemas,
};

await writeFile(new URL("../public/pathe-schedule.json", import.meta.url), `${JSON.stringify(output)}\n`);
console.log(`Saved ${cinemas.length} supported cinemas, ${dates[0]} to ${dates.at(-1)}`);

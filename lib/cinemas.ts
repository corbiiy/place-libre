export const EXCLUDED_CINEMA_SLUGS = new Set([
  "cinema-pathe-aquaboulevard",
  "cinema-la-geode",
  "cinema-pathe-montparnos",
]);

export const DEFAULT_CINEMA_SLUG = "cinema-pathe-alesia";
export const GRAND_QUEVILLY_CINEMA_SLUG = "cinema-pathe-grand-quevilly";

export const isSupportedCinema = (slug: string, city?: string) =>
  city === "Paris" || slug === GRAND_QUEVILLY_CINEMA_SLUG;

export const CINEMA_TRAVEL_RANK = [
  "cinema-pathe-alesia",
  "cinema-pathe-parnasse",
  "cinema-pathe-convention",
  "cinema-pathe-les-fauvettes",
  "cinema-pathe-wepler",
  "cinema-pathe-palace",
  "cinema-pathe-bnp-paribas",
  "cinema-pathe-beaugrenelle",
  "cinema-les-7-batignolles",
  "cinema-pathe-la-villette",
  GRAND_QUEVILLY_CINEMA_SLUG,
] as const;

const cinemaRank = new Map<string, number>(CINEMA_TRAVEL_RANK.map((slug, index) => [slug, index]));

export const isExcludedCinema = (slug: string) => EXCLUDED_CINEMA_SLUGS.has(slug);

export const compareCinemaRank = <T extends { slug: string }>(a: T, b: T) =>
  (cinemaRank.get(a.slug) ?? Number.MAX_SAFE_INTEGER) - (cinemaRank.get(b.slug) ?? Number.MAX_SAFE_INTEGER);

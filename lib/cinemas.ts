export const EXCLUDED_CINEMA_SLUGS = new Set([
  "cinema-pathe-aquaboulevard",
  "cinema-la-geode",
  "cinema-pathe-montparnos",
]);

export const isExcludedCinema = (slug: string) => EXCLUDED_CINEMA_SLUGS.has(slug);

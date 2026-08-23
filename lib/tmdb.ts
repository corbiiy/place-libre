import { env } from "cloudflare:workers";

type TmdbSearchResult = {
  id: number;
  title: string;
  original_title: string;
  original_language: string;
  release_date?: string;
};

type TmdbSearchResponse = {
  results?: TmdbSearchResult[];
};

export type TmdbMatch = {
  id: number;
  originalLanguage: string;
};

const matchCache = new Map<string, Promise<TmdbMatch | null>>();

const tmdbToken = () => (env as unknown as { TMDB_API_READ_TOKEN?: string }).TMDB_API_READ_TOKEN?.trim() ?? "";

const normalizeTitle = (value: string) => value
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLocaleLowerCase("fr")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const cleanPatheTitle = (title: string) => title
  .replace(/\s*\(Version\s+[^)]+\)\s*$/i, "")
  .replace(/^(?:Les Rendez-vous de l'Anime|2h de colle|La Séance 70mm)\s*:\s*/i, "")
  .trim();

const matchScore = (patheTitle: string, patheReleaseDate: string | null, candidate: TmdbSearchResult) => {
  const expectedTitle = normalizeTitle(cleanPatheTitle(patheTitle));
  const candidateTitles = [candidate.title, candidate.original_title].map(normalizeTitle);
  const exactTitle = candidateTitles.some((title) => title === expectedTitle);
  const partialTitle = expectedTitle.length >= 6 && candidateTitles.some((title) => title.includes(expectedTitle) || expectedTitle.includes(title));
  if (!exactTitle && !partialTitle) return 0;

  let score = exactTitle ? 12 : 7;
  const expectedYear = Number(patheReleaseDate?.slice(0, 4));
  const candidateYear = Number(candidate.release_date?.slice(0, 4));
  if (expectedYear && candidateYear) {
    const yearDifference = Math.abs(expectedYear - candidateYear);
    if (yearDifference === 0) score += 4;
    else if (yearDifference === 1) score += 2;
    else if (yearDifference > 2) score -= 4;
  }
  return score;
};

export const isTmdbConfigured = () => Boolean(tmdbToken());

export async function matchTmdbMovie(title: string, releaseDate: string | null): Promise<TmdbMatch | null> {
  const token = tmdbToken();
  if (!token) return null;

  const cacheKey = `${title}:${releaseDate ?? ""}`;
  const cached = matchCache.get(cacheKey);
  if (cached) return cached;

  const request = (async () => {
    const url = new URL("https://api.themoviedb.org/3/search/movie");
    url.searchParams.set("query", cleanPatheTitle(title));
    url.searchParams.set("language", "fr-FR");
    url.searchParams.set("region", "FR");
    url.searchParams.set("include_adult", "false");

    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`TMDB ${response.status}`);

    const payload = await response.json() as TmdbSearchResponse;
    const candidates = (payload.results ?? [])
      .map((candidate) => ({ candidate, score: matchScore(title, releaseDate, candidate) }))
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 10 || !best.candidate.original_language) return null;
    return { id: best.candidate.id, originalLanguage: best.candidate.original_language };
  })();

  matchCache.set(cacheKey, request);
  return request;
}

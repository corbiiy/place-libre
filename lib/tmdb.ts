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
let requestSlot = Promise.resolve();

const tmdbToken = () => (env as unknown as { TMDB_API_READ_TOKEN?: string }).TMDB_API_READ_TOKEN?.trim() ?? "";

const normalizeTitle = (value: string) => value
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLocaleLowerCase("fr")
  .replace(/&/g, " et ")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\band\b/g, "et")
  .replace(/\b([0-9]+)(?:ere|er|re|eme|e)\b/g, "$1")
  .trim();

const cleanPatheTitle = (title: string) => title
  .replace(/\s*\(Version\s+[^)]+\)\s*$/i, "")
  .replace(/^Il était une fois\.{0,3}\s*/i, "")
  .replace(/^(?:Les Rendez-vous de l'Anime|2h de colle|La Séance 70mm|Ma Mini-Séance|La Soirée des Passionnés|La Séance Ciné-Hits|Elle\(s\) au cinéma)\s*:\s*/i, "")
  .trim();

const titleSimilarity = (left: string, right: string) => {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
};

const matchScore = (patheTitle: string, patheReleaseDate: string | null, candidate: TmdbSearchResult) => {
  const expectedTitle = normalizeTitle(cleanPatheTitle(patheTitle));
  const candidateTitles = [candidate.title, candidate.original_title].map(normalizeTitle);
  const exactTitle = candidateTitles.some((title) => title === expectedTitle);
  const partialTitle = expectedTitle.length >= 6 && candidateTitles.some((title) => title.includes(expectedTitle) || expectedTitle.includes(title));
  const similarity = Math.max(...candidateTitles.map((title) => titleSimilarity(expectedTitle, title)));
  if (!exactTitle && !partialTitle && similarity < 0.78) return 0;

  let score = exactTitle ? 12 : partialTitle ? 10 : 8 + similarity * 3;
  const expectedYear = Number(patheReleaseDate?.slice(0, 4));
  const candidateYear = Number(candidate.release_date?.slice(0, 4));
  if (expectedYear && candidateYear) {
    const yearDifference = Math.abs(expectedYear - candidateYear);
    if (yearDifference === 0) score += 4;
    else if (yearDifference === 1) score += 2;
    else if (yearDifference > 2) score -= 1;
  }
  return score;
};

export const isTmdbConfigured = () => Boolean(tmdbToken());

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForRequestSlot() {
  const slot = requestSlot.then(() => wait(60));
  requestSlot = slot.catch(() => undefined);
  await slot;
}

async function fetchTmdb(url: URL, token: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForRequestSlot();
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (response.ok) return response;
    if (response.status !== 429 && response.status < 500) throw new Error(`TMDB ${response.status}`);
    await wait(300 * (attempt + 1));
  }
  throw new Error("TMDB temporarily unavailable");
}

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

    const response = await fetchTmdb(url, token);

    const payload = await response.json() as TmdbSearchResponse;
    const candidates = (payload.results ?? [])
      .map((candidate) => ({ candidate, score: matchScore(title, releaseDate, candidate) }))
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 10 || !best.candidate.original_language) return null;
    return { id: best.candidate.id, originalLanguage: best.candidate.original_language };
  })();

  matchCache.set(cacheKey, request);
  void request.catch(() => matchCache.delete(cacheKey));
  return request;
}

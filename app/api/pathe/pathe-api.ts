import { compareCinemaRank, isExcludedCinema, isSupportedCinema } from "../../../lib/cinemas";

export type PatheCinema = {
  slug: string;
  name: string;
  theaters?: Array<{ addressCity?: string; addressZip?: string }>;
};

const API = "https://www.pathe.fr/api";
const patheHeaders = {
  Accept: "application/json",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  Referer: "https://www.pathe.fr/",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
};

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();

export async function getPatheJson<T = unknown>(path: string, ttlMs = 300_000): Promise<T> {
  const cached = responseCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const response = await fetch(`${API}${path}`, { headers: patheHeaders });
  if (!response.ok) throw new Error(`Pathé ${response.status}`);
  const value = await response.json();
  responseCache.set(path, { expiresAt: Date.now() + ttlMs, value });
  return value as T;
}

export async function getSupportedCinemas() {
  const allCinemas = await getPatheJson<PatheCinema[]>("/cinemas", 3_600_000);
  return allCinemas
    .filter((cinema) => cinema.theaters?.some((theater) => isSupportedCinema(cinema.slug, theater.addressCity)) && !isExcludedCinema(cinema.slug))
    .sort(compareCinemaRank);
}

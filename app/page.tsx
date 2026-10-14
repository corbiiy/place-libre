"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { compareCinemaRank, DEFAULT_CINEMA_SLUG, isExcludedCinema } from "../lib/cinemas";
import { BASE_PATH } from "../lib/site";

type Session = {
  time: string;
  endTime: string | null;
  version: string | null;
  tags: string[];
  status: string;
  bookingUrl: string | null;
  auditorium: string | null;
  capacity: number | null;
};

type SeatMapSelection = {
  url: string;
  time: string;
  capacity: number | null;
};

type PageView = "programme" | "upcoming";

type Film = {
  slug: string;
  title: string;
  duration: number | null;
  genres: string[];
  poster: string | null;
  contentRating: string | null;
  releaseDate: string | null;
  sessions: Session[];
};

type Cinema = {
  slug: string;
  name: string;
  district: string;
  pageUrl: string;
  days: Record<string, Film[]>;
};

type Schedule = {
  syncedAt: string;
  source: string;
  dates: string[];
  cinemas: Cinema[];
};

type LiveProgramme = {
  syncedAt: string;
  dates: string[];
  date: string;
  films: Film[];
  cinemas: Array<Omit<Cinema, "days">>;
};

type UpcomingCinema = {
  slug: string;
  name: string;
  district: string;
  dates: string[];
};

type UpcomingMovie = Omit<Film, "sessions"> & {
  nationality: string | null;
  originalLanguage: string | null;
  tmdbId: number | null;
  firstDate: string;
  lastDate: string;
  cinemas: UpcomingCinema[];
};

const dateLabel = (date: string, style: "long" | "short" = "long") => new Intl.DateTimeFormat("fr-FR", style === "long"
  ? { weekday: "long", day: "numeric", month: "long" }
  : { weekday: "short", day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));

const durationLabel = (minutes: number | null) => minutes ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : null;
const usefulTags = (tags: string[]) => tags.filter((tag) => !["DEFAULT", "pmr", "GRETA", "hearing-impaired"].includes(tag));
const isVost = (session: Session) => session.version?.toUpperCase() === "VOST";
const isVf = (session: Session) => session.version?.toUpperCase() === "VF";
const filterFilms = (films: Film[], vostOnly: boolean) => vostOnly ? films.filter((film) => film.sessions.some(isVost)) : films;
const filterSessions = (film: Film, vostOnly: boolean) => vostOnly ? film.sessions.filter(isVost) : film.sessions;
const releaseDateLabel = (date: string | null) => date ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`)) : null;
const rangeDateLabel = (date: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
const languageNames = new Intl.DisplayNames(["fr"], { type: "language" });
const languageLabel = (language: string | null) => {
  if (!language) return null;
  const label = languageNames.of(language) ?? language.toUpperCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const parisDateKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
const nextCalendarDate = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};
const addCalendarDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const addCalendarMonths = (date: string, months: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0, 12)).getUTCDate();
  value.setUTCDate(Math.min(day, lastDay));
  return value.toISOString().slice(0, 10);
};
const clampCalendarDate = (date: string, minimum?: string, maximum?: string) => {
  if (minimum && date < minimum) return minimum;
  if (maximum && date > maximum) return maximum;
  return date;
};
const upcomingCalendarRange = (dates: string[], duration: { days?: number; months?: number }) => {
  const minimum = dates[0];
  const maximum = dates.at(-1);
  if (!minimum || !maximum) return { start: "", end: "" };
  const start = clampCalendarDate(parisDateKey(), minimum, maximum);
  const requestedEnd = duration.days
    ? addCalendarDays(start, duration.days)
    : addCalendarMonths(start, duration.months ?? 1);
  return { start, end: clampCalendarDate(requestedEnd, start, maximum) };
};
const preferredScrollBehavior = (): ScrollBehavior => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr").trim();
const compareReleaseDate = (left: UpcomingMovie, right: UpcomingMovie) => {
  if (left.releaseDate && right.releaseDate) {
    const dateOrder = left.releaseDate.localeCompare(right.releaseDate);
    if (dateOrder !== 0) return dateOrder;
  } else if (left.releaseDate) {
    return -1;
  } else if (right.releaseDate) {
    return 1;
  }

  return left.title.localeCompare(right.title, "fr");
};

function SessionResult({
  session,
  index,
  idPrefix,
  mapSelection,
  mapControlsId,
  timeHeading = "h3",
  onOpenMap,
}: {
  session: Session;
  index: number;
  idPrefix: string;
  mapSelection: SeatMapSelection | null;
  mapControlsId: string;
  timeHeading?: "h3" | "h4";
  onOpenMap: (session: Session) => void;
}) {
  const tags = usefulTags(session.tags);
  const bookingOpen = session.status === "available";
  const available = Boolean(bookingOpen && session.bookingUrl);
  const mapIsOpen = Boolean(available && mapSelection?.url === session.bookingUrl && mapSelection.time === session.time);
  const TimeHeading = timeHeading;
  const timeId = `${idPrefix}-session-${index}-time`;

  return (
    <article className={`session-card programme-session ${bookingOpen ? "has-seats" : "sold-out"}`} aria-labelledby={timeId}>
      <div className="session-overview">
        <span>Séance</span>
        <TimeHeading id={timeId}>{session.time}</TimeHeading>
        {session.endTime && <small>Fin prévue à {session.endTime}</small>}
      </div>
      <div className="session-information">
        <div className="session-meta">
          <span className={`version-badge${isVf(session) ? " is-vf" : ""}`} aria-label={isVf(session) ? "Version française" : undefined}>{session.version}</span>
          {tags.map((tag) => <span key={tag}>{tag.toUpperCase()}</span>)}
          {session.auditorium && <span>Salle {session.auditorium}</span>}
          {session.capacity && <span>{session.capacity} places</span>}
        </div>
        <div className={`plan-availability ${available ? "available" : bookingOpen ? "unavailable" : "sold-out"}`}>
          <strong>{available ? "Plan disponible" : bookingOpen ? "Plan indisponible" : "Complet"}</strong>
          <span>{available ? "Vérifiez les fauteuils standards sur le plan officiel Pathé." : bookingOpen ? "Pathé n’a pas encore publié de plan consultable." : "La séance est indiquée complète par Pathé."}</span>
        </div>
      </div>
      <div className="session-action">
        {available
          ? <button className="seat-map-button" onClick={() => onOpenMap(session)} aria-expanded={mapIsOpen} aria-controls={mapControlsId}>Voir le plan officiel</button>
          : <span className="disabled-booking">{bookingOpen ? "Plan indisponible" : "Séance complète"}</span>}
      </div>
    </article>
  );
}
// Static files written by scripts/sync-pathe.ts, refreshed by the GitHub Pages deploy workflow.
const dataUrl = (file: string) => `${BASE_PATH}/data/${file}`;
let scheduleCache: { expiresAt: number; data: Promise<Schedule> } | null = null;
const SEATING_POSITION = "c2VhdGluZw==";

const bookingSeatUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== "s.pathe.fr" || !/^\/fr\/V[A-Za-z0-9]+S\d+\/booking\/?$/.test(url.pathname)) return rawUrl;
    url.searchParams.set("pos", SEATING_POSITION);
    url.searchParams.delete("token");
    return url.toString();
  } catch {
    return rawUrl;
  }
};

const reloadedSeatMapUrl = (rawUrl: string, attempt: number) => {
  if (attempt === 0) return rawUrl;
  try {
    const url = new URL(rawUrl);
    url.searchParams.set("place_libre_reload", String(attempt));
    return url.toString();
  } catch {
    return rawUrl;
  }
};

const seatMapSelection = (session: Session): SeatMapSelection | null => session.bookingUrl
  ? { url: bookingSeatUrl(session.bookingUrl), time: session.time, capacity: session.capacity }
  : null;

const filterUpcomingCinemas = (movies: UpcomingMovie[]) => movies
  .map((movie) => ({ ...movie, cinemas: movie.cinemas.filter((cinema) => !isExcludedCinema(cinema.slug)).sort(compareCinemaRank) }))
  .filter((movie) => movie.cinemas.length > 0);

function loadSchedule() {
  if (scheduleCache && scheduleCache.expiresAt > Date.now()) return scheduleCache.data;
  const data = fetch(dataUrl("schedule.json"), { cache: "no-cache" }).then((response) => {
    if (!response.ok) throw new Error("Programme indisponible");
    return response.json() as Promise<Schedule>;
  });
  const entry = { expiresAt: Date.now() + 60_000, data };
  scheduleCache = entry;
  data.catch(() => {
    if (scheduleCache === entry) scheduleCache = null;
  });
  return data;
}

async function loadProgramme(slug: string, requestedDate?: string): Promise<LiveProgramme> {
  const schedule = await loadSchedule();
  const cinema = schedule.cinemas.find((item) => item.slug === slug);
  if (!cinema) throw new Error("Programme indisponible");
  const dates = Object.keys(cinema.days).filter((day) => day >= parisDateKey()).sort();
  const date = requestedDate && dates.includes(requestedDate) ? requestedDate : dates[0] ?? "";
  return {
    syncedAt: schedule.syncedAt,
    dates,
    date,
    films: cinema.days[date] ?? [],
    cinemas: schedule.cinemas.map((item) => ({ slug: item.slug, name: item.name, district: item.district, pageUrl: item.pageUrl })),
  };
}

function upcomingFromSchedule(schedule: Schedule): UpcomingMovie[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const movies = new Map<string, UpcomingMovie & { cinemaMap: Map<string, UpcomingCinema> }>();
  schedule.cinemas.forEach((cinema) => {
    Object.entries(cinema.days).forEach(([day, films]) => {
      if (day < today) return;
      films.forEach((film) => {
        const movie = movies.get(film.slug) ?? {
          slug: film.slug,
          title: film.title,
          duration: film.duration,
          genres: film.genres,
          poster: film.poster,
          contentRating: film.contentRating,
          releaseDate: film.releaseDate ?? null,
          nationality: null,
          originalLanguage: null,
          tmdbId: null,
          firstDate: day,
          lastDate: day,
          cinemas: [],
          cinemaMap: new Map<string, UpcomingCinema>(),
        };
        movie.firstDate = movie.firstDate < day ? movie.firstDate : day;
        movie.lastDate = movie.lastDate > day ? movie.lastDate : day;
        const venue = movie.cinemaMap.get(cinema.slug) ?? { slug: cinema.slug, name: cinema.name, district: cinema.district, dates: [] };
        if (!venue.dates.includes(day)) venue.dates.push(day);
        movie.cinemaMap.set(cinema.slug, venue);
        movies.set(film.slug, movie);
      });
    });
  });
  return [...movies.values()].map(({ cinemaMap, ...movie }) => ({
    ...movie,
    cinemas: [...cinemaMap.values()].map((cinema) => ({ ...cinema, dates: cinema.dates.sort() })).sort(compareCinemaRank),
  })).sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.title.localeCompare(b.title, "fr"));
}

export default function Home() {
  const [activePage, setActivePage] = useState<PageView>("programme");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cinemaSlug, setCinemaSlug] = useState(DEFAULT_CINEMA_SLUG);
  const [date, setDate] = useState("");
  const [programmeDates, setProgrammeDates] = useState<string[]>([]);
  const [dayFilms, setDayFilms] = useState<Film[]>([]);
  const [syncedAt, setSyncedAt] = useState("");
  const [filmSlug, setFilmSlug] = useState("");
  const [vostOnly, setVostOnly] = useState(true);
  const [checked, setChecked] = useState(false);
  const [seatMap, setSeatMap] = useState<SeatMapSelection | null>(null);
  const [upcomingMovies, setUpcomingMovies] = useState<UpcomingMovie[]>([]);
  const [upcomingStartDate, setUpcomingStartDate] = useState("");
  const [upcomingEndDate, setUpcomingEndDate] = useState("");
  const [upcomingCinemaFilter, setUpcomingCinemaFilter] = useState("");
  const [upcomingNationality, setUpcomingNationality] = useState("");
  const [upcomingLanguage, setUpcomingLanguage] = useState("");
  const [tmdbAvailable, setTmdbAvailable] = useState(false);
  const [movieSearch, setMovieSearch] = useState("");
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingError, setUpcomingError] = useState(false);
  const [upcomingMovieSlug, setUpcomingMovieSlug] = useState("");
  const [upcomingCinemaSlug, setUpcomingCinemaSlug] = useState("");
  const [upcomingDate, setUpcomingDate] = useState("");
  const [upcomingFilm, setUpcomingFilm] = useState<Film | null>(null);
  const [upcomingChecking, setUpcomingChecking] = useState(false);
  const [upcomingSeatMap, setUpcomingSeatMap] = useState<SeatMapSelection | null>(null);
  const [seatMapReady, setSeatMapReady] = useState(false);
  const [upcomingSeatMapReady, setUpcomingSeatMapReady] = useState(false);
  const [seatMapReload, setSeatMapReload] = useState(0);
  const [upcomingSeatMapReload, setUpcomingSeatMapReload] = useState(0);
  const resultsRef = useRef<HTMLElement>(null);
  const seatMapRef = useRef<HTMLDivElement>(null);
  const upcomingDetailRef = useRef<HTMLDivElement>(null);
  const upcomingMapRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const upcomingRequestIdRef = useRef(0);
  const upcomingLoadStartedRef = useRef(false);
  const vostOnlyRef = useRef(true);

  function changePage(page: PageView) {
    setActivePage(page);
    if (page === "upcoming") void loadUpcomingCatalogue();
    window.history.replaceState(null, "", page === "upcoming" ? "#films-a-venir" : `${window.location.pathname}${window.location.search}`);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: preferredScrollBehavior() }));
  }

  const cinema = useMemo(() => schedule?.cinemas.find((item) => item.slug === cinemaSlug) ?? null, [schedule, cinemaSlug]);
  const films = filterFilms(dayFilms, vostOnly);
  const film = films.find((item) => item.slug === filmSlug) ?? films[0] ?? null;
  const sessions = film ? filterSessions(film, vostOnly) : [];
  const availablePlanCount = sessions.filter((session) => session.status === "available" && session.bookingUrl).length;
  const todayInParis = parisDateKey();
  const tomorrowInParis = nextCalendarDate(todayInParis);
  const quickProgrammeDates = useMemo(() => {
    const futureDates = programmeDates.filter((item) => item >= todayInParis);
    const firstDates = (futureDates.length ? futureDates : programmeDates).slice(0, 7);
    if (!date || firstDates.includes(date)) return firstDates;
    return [...firstDates.slice(0, 6), date].sort();
  }, [programmeDates, date, todayInParis]);
  const upcomingDates = useMemo(() => [...new Set(upcomingMovies.flatMap((movie) => movie.cinemas.flatMap((cinema) => cinema.dates)))].sort(), [upcomingMovies]);
  const upcomingCinemaOptions = useMemo(() => {
    const cinemas = new Map<string, UpcomingCinema>();
    upcomingMovies.forEach((movie) => movie.cinemas.forEach((cinema) => cinemas.set(cinema.slug, cinema)));
    return [...cinemas.values()].sort(compareCinemaRank);
  }, [upcomingMovies]);
  const upcomingCinemaFilterName = upcomingCinemaOptions.find((cinema) => cinema.slug === upcomingCinemaFilter)?.name ?? "";
  const upcomingLanguages = useMemo(() => [...new Set(upcomingMovies.map((movie) => movie.originalLanguage).filter((language): language is string => Boolean(language)))].sort((a, b) => (languageLabel(a) ?? a).localeCompare(languageLabel(b) ?? b, "fr")), [upcomingMovies]);
  const normalizedMovieSearch = normalizeSearch(movieSearch);
  const visibleUpcomingMovies = useMemo(() => {
    const movies = upcomingMovies
      .filter((movie) => !normalizedMovieSearch || normalizeSearch(movie.title).includes(normalizedMovieSearch))
      .filter((movie) => !upcomingNationality
        || (upcomingNationality === "france" && movie.nationality === "France")
        || (upcomingNationality === "outside-france" && movie.nationality !== "France"))
      .filter((movie) => !upcomingLanguage || movie.originalLanguage === upcomingLanguage)
      .map((movie) => ({
        ...movie,
        cinemas: movie.cinemas.filter((cinema) => !upcomingCinemaFilter || cinema.slug === upcomingCinemaFilter).map((cinema) => ({
          ...cinema,
          dates: cinema.dates.filter((day) => (!upcomingStartDate || day >= upcomingStartDate) && (!upcomingEndDate || day <= upcomingEndDate)),
        })).filter((cinema) => cinema.dates.length > 0),
      }))
      .filter((movie) => movie.cinemas.length > 0);

    return normalizedMovieSearch ? movies.sort(compareReleaseDate) : movies;
  }, [upcomingMovies, normalizedMovieSearch, upcomingCinemaFilter, upcomingNationality, upcomingLanguage, upcomingStartDate, upcomingEndDate]);
  const upcomingMovie = visibleUpcomingMovies.find((movie) => movie.slug === upcomingMovieSlug) ?? null;
  const upcomingCinema = upcomingMovie?.cinemas.find((cinema) => cinema.slug === upcomingCinemaSlug) ?? null;
  const upcomingPlanCount = upcomingFilm?.sessions.filter((session) => session.status === "available" && session.bookingUrl).length ?? 0;
  const nextWeekRange = upcomingCalendarRange(upcomingDates, { days: 7 });
  const nextThreeMonthsRange = upcomingCalendarRange(upcomingDates, { months: 3 });
  const nextSixMonthsRange = upcomingCalendarRange(upcomingDates, { months: 6 });

  async function refreshProgramme(slug: string, requestedDate?: string, initial = false) {
    const requestId = ++requestIdRef.current;
    setRefreshing(true);
    setRefreshError(false);
    try {
      const data = await loadProgramme(slug, requestedDate);
      if (requestId !== requestIdRef.current) return;
      const visibleFilms = filterFilms(data.films, vostOnlyRef.current);
      setSchedule((current) => current ?? {
        syncedAt: data.syncedAt,
        source: "https://www.pathe.fr/",
        dates: data.dates,
        cinemas: data.cinemas.filter((cinema) => !isExcludedCinema(cinema.slug)).sort(compareCinemaRank).map((cinema) => ({ ...cinema, days: {} })),
      });
      setCinemaSlug(slug);
      setProgrammeDates(data.dates);
      setDate(data.date);
      setDayFilms(data.films);
      setSyncedAt(data.syncedAt);
      setFilmSlug(visibleFilms[0]?.slug ?? "");
      setChecked(false);
      updateSeatMap(null);
    } catch {
      if (requestId !== requestIdRef.current) return;
      if (initial) setLoadError(true);
      else setRefreshError(true);
    } finally {
      if (requestId === requestIdRef.current) setRefreshing(false);
    }
  }

  function applyUpcomingCatalogue(movies: UpcomingMovie[], hasTmdb: boolean) {
    const filteredMovies = filterUpcomingCinemas(movies);
    setUpcomingMovies(filteredMovies);
    setTmdbAvailable(hasTmdb);
    const dates = [...new Set(filteredMovies.flatMap((movie) => movie.cinemas.flatMap((venue) => venue.dates)))].sort();
    const initialRange = upcomingCalendarRange(dates, { months: 1 });
    setUpcomingStartDate((current) => current || initialRange.start);
    setUpcomingEndDate((current) => current || initialRange.end);
  }

  async function loadUpcomingCatalogue() {
    if (upcomingLoadStartedRef.current) return;
    upcomingLoadStartedRef.current = true;
    setUpcomingLoading(true);
    setUpcomingError(false);
    try {
      const response = await fetch(dataUrl("upcoming.json"), { cache: "no-cache" });
      if (!response.ok) throw new Error("Films à venir indisponibles");
      const data: { movies: UpcomingMovie[]; sources?: { pathe?: boolean; tmdb?: boolean } } = await response.json();
      applyUpcomingCatalogue(data.movies, Boolean(data.sources?.tmdb));
      setUpcomingError(data.sources?.pathe === false);
    } catch {
      try {
        applyUpcomingCatalogue(upcomingFromSchedule(await loadSchedule()), false);
      } catch {
        setUpcomingMovies([]);
      }
      setUpcomingError(true);
    } finally {
      setUpcomingLoading(false);
    }
  }

  function retryUpcomingCatalogue() {
    upcomingLoadStartedRef.current = false;
    void loadUpcomingCatalogue();
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      void refreshProgramme(DEFAULT_CINEMA_SLUG, undefined, true);
      if (["#a-venir", "#films-a-venir"].includes(window.location.hash)) {
        setActivePage("upcoming");
        void loadUpcomingCatalogue();
      }
    });
    // The first Pathé synchronization is intentionally limited to the initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSeatMap(selection: SeatMapSelection | null) {
    setSeatMapReady(false);
    setSeatMapReload(0);
    setSeatMap(selection);
  }

  function updateUpcomingSeatMap(selection: SeatMapSelection | null) {
    setUpcomingSeatMapReady(false);
    setUpcomingSeatMapReload(0);
    setUpcomingSeatMap(selection);
  }

  function reloadSeatMap() {
    setSeatMapReady(false);
    setSeatMapReload((attempt) => attempt + 1);
  }

  function reloadUpcomingSeatMap() {
    setUpcomingSeatMapReady(false);
    setUpcomingSeatMapReload((attempt) => attempt + 1);
  }

  function changeCinema(slug: string) {
    const nextCinema = schedule?.cinemas.find((item) => item.slug === slug);
    const fallbackDate = schedule?.dates.find((day) => day >= parisDateKey() && nextCinema?.days[day]) ?? schedule?.dates[0] ?? "";
    const fallbackFilms = nextCinema?.days[fallbackDate] ?? [];
    setCinemaSlug(slug);
    setDate(fallbackDate);
    setProgrammeDates(schedule?.dates ?? []);
    setDayFilms(fallbackFilms);
    setFilmSlug(filterFilms(fallbackFilms, vostOnly)[0]?.slug ?? "");
    setChecked(false);
    updateSeatMap(null);
    void refreshProgramme(slug);
  }

  function changeDate(nextDate: string) {
    const fallbackFilms = cinema?.days[nextDate] ?? [];
    setDate(nextDate);
    setDayFilms(fallbackFilms);
    setFilmSlug(filterFilms(fallbackFilms, vostOnly)[0]?.slug ?? "");
    setChecked(false);
    updateSeatMap(null);
    void refreshProgramme(cinemaSlug, nextDate);
  }

  function showSessions() {
    if (!film) return;
    const onlySession = sessions.length === 1 ? sessions[0] : null;
    const mapSelection = onlySession?.status === "available" ? seatMapSelection(onlySession) : null;
    setChecked(true);
    updateSeatMap(mapSelection);
    window.setTimeout(() => (mapSelection ? seatMapRef : resultsRef).current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" }), 80);
  }

  function selectFilm(slug: string) {
    const selectedFilm = films.find((item) => item.slug === slug);
    const selectedSessions = selectedFilm ? filterSessions(selectedFilm, vostOnly) : [];
    const onlySession = selectedSessions.length === 1 ? selectedSessions[0] : null;
    const mapSelection = onlySession?.status === "available" ? seatMapSelection(onlySession) : null;
    setFilmSlug(slug);
    setChecked(Boolean(onlySession));
    updateSeatMap(mapSelection);
    if (onlySession) {
      window.setTimeout(() => (mapSelection ? seatMapRef : resultsRef).current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" }), 80);
    }
  }

  function toggleVost() {
    const nextVostOnly = !vostOnly;
    const nextFilms = filterFilms(dayFilms, nextVostOnly);
    const currentStillAvailable = nextFilms.some((item) => item.slug === filmSlug);
    vostOnlyRef.current = nextVostOnly;
    setVostOnly(nextVostOnly);
    setFilmSlug(currentStillAvailable ? filmSlug : (nextFilms[0]?.slug ?? ""));
    setChecked(false);
    updateSeatMap(null);
  }

  function openSeatMap(session: Session) {
    const selection = seatMapSelection(session);
    if (!selection) return;
    updateSeatMap(selection);
    window.setTimeout(() => seatMapRef.current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" }), 80);
  }

  function resetUpcomingSelection() {
    upcomingRequestIdRef.current += 1;
    setUpcomingMovieSlug("");
    setUpcomingCinemaSlug("");
    setUpcomingDate("");
    setUpcomingFilm(null);
    updateUpcomingSeatMap(null);
  }

  function changeUpcomingStartDate(nextDate: string) {
    setUpcomingStartDate(nextDate);
    if (upcomingEndDate && nextDate > upcomingEndDate) setUpcomingEndDate(nextDate);
    resetUpcomingSelection();
  }

  function changeUpcomingEndDate(nextDate: string) {
    setUpcomingEndDate(nextDate);
    if (upcomingStartDate && nextDate < upcomingStartDate) setUpcomingStartDate(nextDate);
    resetUpcomingSelection();
  }

  function applyUpcomingRange(range: { start: string; end: string }) {
    if (!range.start || !range.end) return;
    setUpcomingStartDate(range.start);
    setUpcomingEndDate(range.end);
    resetUpcomingSelection();
  }

  function changeUpcomingNationality(nationality: string) {
    setUpcomingNationality(nationality);
    resetUpcomingSelection();
  }

  function changeUpcomingCinemaFilter(cinema: string) {
    setUpcomingCinemaFilter(cinema);
    resetUpcomingSelection();
  }

  function changeUpcomingLanguage(language: string) {
    setUpcomingLanguage(language);
    resetUpcomingSelection();
  }

  function changeMovieSearch(value: string) {
    setMovieSearch(value);
    resetUpcomingSelection();
  }

  function selectUpcomingMovie(slug: string) {
    upcomingRequestIdRef.current += 1;
    const selectedMovie = visibleUpcomingMovies.find((movie) => movie.slug === slug);
    const defaultCinema = selectedMovie?.cinemas.find((cinema) => cinema.slug === DEFAULT_CINEMA_SLUG)
      ?? selectedMovie?.cinemas[0]
      ?? null;
    const onlyDate = defaultCinema?.dates.length === 1 ? defaultCinema.dates[0] : null;
    setUpcomingMovieSlug(slug);
    setUpcomingCinemaSlug(defaultCinema?.slug ?? "");
    setUpcomingDate(onlyDate ?? "");
    setUpcomingFilm(null);
    updateUpcomingSeatMap(null);
    if (selectedMovie && defaultCinema && onlyDate) void loadUpcomingDate(selectedMovie, defaultCinema, onlyDate);
    window.setTimeout(() => upcomingDetailRef.current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" }), 80);
  }

  function selectUpcomingCinema(slug: string) {
    upcomingRequestIdRef.current += 1;
    const selectedCinema = upcomingMovie?.cinemas.find((cinema) => cinema.slug === slug) ?? null;
    const onlyDate = selectedCinema?.dates.length === 1 ? selectedCinema.dates[0] : null;
    setUpcomingCinemaSlug(slug);
    setUpcomingDate(onlyDate ?? "");
    setUpcomingFilm(null);
    updateUpcomingSeatMap(null);
    if (upcomingMovie && selectedCinema && onlyDate) void loadUpcomingDate(upcomingMovie, selectedCinema, onlyDate);
  }

  async function selectUpcomingDate(day: string) {
    if (!upcomingMovie || !upcomingCinema) return;
    await loadUpcomingDate(upcomingMovie, upcomingCinema, day);
  }

  async function loadUpcomingDate(movie: UpcomingMovie, cinema: UpcomingCinema, day: string) {
    const requestId = ++upcomingRequestIdRef.current;
    setUpcomingDate(day);
    setUpcomingChecking(true);
    setUpcomingFilm(null);
    updateUpcomingSeatMap(null);
    try {
      const data = await loadProgramme(cinema.slug, day);
      if (requestId !== upcomingRequestIdRef.current) return;
      const selectedFilm = data.films.find((item) => item.slug === movie.slug) ?? null;
      setUpcomingFilm(selectedFilm);
      const onlySession = selectedFilm?.sessions.length === 1 ? selectedFilm.sessions[0] : null;
      const mapSelection = onlySession?.status === "available" ? seatMapSelection(onlySession) : null;
      updateUpcomingSeatMap(mapSelection);
      window.setTimeout(() => (mapSelection ? upcomingMapRef : upcomingDetailRef).current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" }), 100);
    } catch {
      if (requestId !== upcomingRequestIdRef.current) return;
      const fallbackCinema = schedule?.cinemas.find((item) => item.slug === cinema.slug);
      setUpcomingFilm(fallbackCinema?.days[day]?.find((item) => item.slug === movie.slug) ?? null);
      setUpcomingError(true);
    } finally {
      if (requestId === upcomingRequestIdRef.current) setUpcomingChecking(false);
    }
  }

  function openUpcomingSeatMap(session: Session) {
    const selection = seatMapSelection(session);
    if (!selection || !upcomingCinema) return;
    updateUpcomingSeatMap(selection);
    window.setTimeout(() => upcomingMapRef.current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" }), 80);
  }

  const sourcePage = cinema && date ? `${cinema.pageUrl}/filters/date-${date}` : "https://www.pathe.fr/cinemas";

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" onClick={() => changePage("programme")} aria-label="Place Libre - accueil"><Image className="brand-mark" src={`${BASE_PATH}/favicon.svg`} alt="" width={40} height={40} priority /><span>PLACE LIBRE</span></a>
        <div className="topbar-actions">
          <nav className="page-switcher" aria-label="Pages de Place Libre">
            <button className={activePage === "programme" ? "active" : ""} onClick={() => changePage("programme")} aria-pressed={activePage === "programme"}>Programme officiel</button>
            <button className={activePage === "upcoming" ? "active" : ""} onClick={() => changePage("upcoming")} aria-pressed={activePage === "upcoming"}>Films à venir</button>
          </nav>
          <span className={`live-pill ${schedule && !refreshError ? "verified" : refreshError ? "saved" : ""}`} role="status" aria-live="polite">
            <i />{refreshing ? "mise à jour Pathé" : refreshError ? "données enregistrées" : "données Pathé"}
          </span>
        </div>
      </header>

      {activePage === "programme" && <>
      <section className="hero" id="top">
        <div className="hero-copy">
          <h1>Le bon film.<br />La vraie séance.</h1>
          <p className="lede">À Paris, au Grand-Quevilly ou à Montpellier, choisissez cinéma, date et film. Ouvrez le plan officiel Pathé.</p>
        </div>

        {loadError ? (
          <div className="load-message error">Le programme Pathé n’a pas pu être chargé. <button onClick={() => window.location.reload()}>Réessayer</button></div>
        ) : !schedule ? (
          <div className="finder-skeleton" role="status" aria-live="polite">
            <span>Chargement du programme Pathé…</span>
            <div aria-hidden="true"><i /><i /><i /><i /></div>
          </div>
        ) : (
          <>
            <div className="finder" role="group" aria-label="Recherche de séance">
              <label>
                <span>Cinéma Pathé</span>
                <select value={cinemaSlug} onChange={(event) => changeCinema(event.target.value)}>
                  {schedule.cinemas.map((item) => <option key={item.slug} value={item.slug}>{item.name} - {item.district}</option>)}
                </select>
              </label>
              <label>
                <span>Date</span>
                <select value={date} onChange={(event) => changeDate(event.target.value)} disabled={refreshing && !programmeDates.length}>
                  {programmeDates.map((item) => <option key={item} value={item}>{dateLabel(item)}</option>)}
                </select>
              </label>
              <label>
                <span>Film ({films.length} {vostOnly ? "en VOST" : "au programme"})</span>
                <select value={film?.slug ?? ""} onChange={(event) => selectFilm(event.target.value)} disabled={refreshing || !films.length}>
                  {films.length ? films.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>) : <option>{vostOnly ? "Aucun film en VOST ce jour" : "Aucun film ce jour"}</option>}
                </select>
              </label>
              <button onClick={showSessions} disabled={refreshing || !film}>{refreshing ? "Actualisation…" : "Voir les séances"}</button>
            </div>

            <div className="format-filter">
              <button className={vostOnly ? "active" : ""} onClick={toggleVost} aria-pressed={vostOnly}>
                <span className="filter-check" aria-hidden="true">{vostOnly ? "✓" : ""}</span>
                <span><strong>VOST uniquement</strong><small>Version originale sous-titrée</small></span>
              </button>
              {vostOnly && <span className="filter-result">{films.length} film{films.length !== 1 ? "s" : ""} disponible{films.length !== 1 ? "s" : ""}</span>}
              <span className="access-rule">Fauteuils standards uniquement. Emplacements PMR exclus.</span>
            </div>

            {!films.length && <div className="programme-empty" role="status"><strong>Aucun film pour ces critères.</strong><span>Essayez une autre date ou désactivez le filtre VOST.</span></div>}

            <div className="date-strip" aria-label="Dates disponibles">
              {quickProgrammeDates.map((item) => {
                return <button key={item} className={date === item ? "active" : ""} onClick={() => changeDate(item)} aria-pressed={date === item}>
                  <small>{item === todayInParis ? "Aujourd’hui" : item === tomorrowInParis ? "Demain" : dateLabel(item, "short").split(" ")[0]}</small>
                  <strong>{item.slice(8, 10)}</strong>
                  <span>{dateLabel(item, "short").split(" ").at(-1)}</span>
                </button>;
              })}
            </div>
            <p className={`sync-note${refreshError ? " fallback" : ""}`} role="status">{refreshing ? "Actualisation du programme Pathé…" : refreshError ? <>Données enregistrées le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(syncedAt || schedule.syncedAt))}. La synchronisation Pathé est momentanément indisponible.</> : <>Actualisé avec Pathé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(syncedAt || schedule.syncedAt))}</>}</p>
          </>
        )}
      </section>

      {checked && cinema && film && (
        <section className="results is-visible" aria-live="polite" ref={resultsRef}>
          <div className="result-heading official-heading">
            <div>
              <div className="eyebrow">Séances Pathé</div>
              <h2>{film.title}</h2>
              <p>{[durationLabel(film.duration), film.genres.join(", "), film.contentRating, film.releaseDate && `Sortie le ${releaseDateLabel(film.releaseDate)}`, cinema.name, dateLabel(date)].filter(Boolean).join(" / ")}</p>
            </div>
            <div className="heading-actions">
              <div className="availability-summary"><strong>{availablePlanCount}</strong><span>plan{availablePlanCount !== 1 ? "s" : ""} disponible{availablePlanCount !== 1 ? "s" : ""}<br />hors PMR</span></div>
              <a className="source-link" href={sourcePage} target="_blank" rel="noreferrer">Voir la source Pathé</a>
            </div>
          </div>

          {sessions.length ? (
            <div className="session-grid">
              {sessions.map((session, index) => <SessionResult key={`${session.time}-${index}`} session={session} index={index} idPrefix="programme" mapSelection={seatMap} mapControlsId="programme-seat-map" onOpenMap={openSeatMap} />)}
            </div>
          ) : (
            <div className="no-sessions">
              <h3>Séances visibles sur Pathé</h3>
              <p>Pathé référence ce film ce jour-là, mais ne fournit pas ses horaires via son flux de séances.</p>
              <a href={sourcePage} target="_blank" rel="noreferrer">Consulter le programme officiel</a>
            </div>
          )}

          {seatMap && (
            <div className="embedded-seat-map" id="programme-seat-map" ref={seatMapRef}>
              <div className="map-toolbar">
                <div><span>PLAN OFFICIEL PATHÉ</span><strong>{film.title} - {seatMap.time}</strong><em>{seatMap.capacity ? `Salle de ${seatMap.capacity} places. ` : ""}Le compteur Pathé peut inclure des emplacements PMR : vérifiez les fauteuils standards directement sur le plan.</em></div>
                <div className="map-actions">
                  <a href={seatMap.url} target="_blank" rel="noreferrer">Ouvrir sur Pathé</a>
                  <button onClick={reloadSeatMap}>Recharger le plan</button>
                  <button onClick={() => updateSeatMap(null)} aria-label="Fermer le plan des sièges">Fermer</button>
                </div>
              </div>
              <div className="map-load-status" aria-live="polite"><i />{seatMapReady ? "Cadre Pathé chargé. Si le plan reste vide, ouvrez-le directement sur Pathé." : "Chargement du cadre Pathé…"}</div>
              <iframe key={`${seatMap.url}:${seatMapReload}`} src={reloadedSeatMapUrl(seatMap.url, seatMapReload)} title={`Plan des sièges Pathé pour ${film.title} à ${seatMap.time}`} onLoad={() => setSeatMapReady(true)} loading="eager" referrerPolicy="origin-when-cross-origin" />
            </div>
          )}

          <details className="truth-note">
            <summary>Fauteuils standards et emplacements PMR</summary>
            <p>Pathé ne distingue pas les fauteuils standards des emplacements PMR dans son statut de séance. Place Libre ne compte donc jamais une séance « ouverte » comme disponible hors PMR : seul le plan officiel permet de confirmer qu’un fauteuil standard est libre. « COMPLET » reste le statut officiel Pathé.</p>
          </details>
        </section>
      )}
      </>}

      {activePage === "upcoming" && <section className="upcoming" id="films-a-venir">
        <div className="upcoming-heading">
          <div className="upcoming-intro">
            <h1>Choisissez d’abord le film.</h1>
            <p>Recherchez un film, puis voyez où et quand Pathé le programme à Paris, au Grand-Quevilly ou à Montpellier.</p>
          </div>
          <div className="upcoming-controls" role="group" aria-label="Filtres des films à venir">
            <label className="movie-search">
              <span>Rechercher un film</span>
              <input type="search" value={movieSearch} onChange={(event) => changeMovieSearch(event.target.value)} placeholder="Titre du film…" autoComplete="off" />
            </label>
            <label className="cinema-picker">
              <span>Cinéma</span>
              <select value={upcomingCinemaFilter} onChange={(event) => changeUpcomingCinemaFilter(event.target.value)} disabled={upcomingLoading}>
                <option value="">{upcomingLoading ? "Chargement des cinémas…" : "Tous les cinémas"}</option>
                {upcomingCinemaOptions.map((cinema) => <option key={cinema.slug} value={cinema.slug}>{cinema.name} - {cinema.district}</option>)}
              </select>
            </label>
            <label className="nationality-picker">
              <span>Nationalité du film</span>
              <select value={upcomingNationality} onChange={(event) => changeUpcomingNationality(event.target.value)} disabled={upcomingLoading}>
                <option value="">{upcomingLoading ? "Chargement des nationalités…" : "Tous les films"}</option>
                <option value="france">France</option>
                <option value="outside-france">Hors France</option>
              </select>
            </label>
            <label className="language-picker">
              <span>Langue originale (TMDB)</span>
              <select value={upcomingLanguage} onChange={(event) => changeUpcomingLanguage(event.target.value)} disabled={upcomingLoading || !tmdbAvailable}>
                <option value="">{upcomingLoading ? "Chargement des langues…" : tmdbAvailable ? "Toutes les langues" : "Connexion TMDB requise"}</option>
                {upcomingLanguages.map((language) => <option key={language} value={language}>{languageLabel(language)}</option>)}
              </select>
            </label>
            <div className="date-range" aria-label="Période de programmation">
              <label>
                <span>À partir du</span>
                <input type="date" value={upcomingStartDate} min={upcomingDates[0]} max={upcomingDates.at(-1)} onChange={(event) => changeUpcomingStartDate(event.target.value)} disabled={!upcomingDates.length} />
              </label>
              <span className="date-range-arrow" aria-hidden="true">au</span>
              <label>
                <span>Jusqu’au</span>
                <input type="date" value={upcomingEndDate} min={upcomingDates[0]} max={upcomingDates.at(-1)} onChange={(event) => changeUpcomingEndDate(event.target.value)} disabled={!upcomingDates.length} />
              </label>
            </div>
            <div className="range-presets" role="group" aria-label="Périodes rapides">
              <button type="button" onClick={() => applyUpcomingRange(nextWeekRange)} aria-pressed={upcomingStartDate === nextWeekRange.start && upcomingEndDate === nextWeekRange.end} disabled={!upcomingDates.length}>Semaine prochaine</button>
              <button type="button" onClick={() => applyUpcomingRange(nextThreeMonthsRange)} aria-pressed={upcomingStartDate === nextThreeMonthsRange.start && upcomingEndDate === nextThreeMonthsRange.end} disabled={!upcomingDates.length}>Prochains 3 mois</button>
              <button type="button" onClick={() => applyUpcomingRange(nextSixMonthsRange)} aria-pressed={upcomingStartDate === nextSixMonthsRange.start && upcomingEndDate === nextSixMonthsRange.end} disabled={!upcomingDates.length}>Prochains 6 mois</button>
            </div>
          </div>
        </div>

        {upcomingLoading && !upcomingMovies.length ? (
          <div className="upcoming-skeleton" role="status" aria-live="polite">
            <span>Analyse des films à venir…</span>
            <div aria-hidden="true"><i /><i /><i /><i /></div>
          </div>
        ) : (
          <>
            {upcomingError && upcomingMovies.length > 0 && <p className="source-status" role="status">Programme enregistré affiché. La synchronisation Pathé est momentanément indisponible.</p>}
            <p className="upcoming-count">{visibleUpcomingMovies.length} film{visibleUpcomingMovies.length !== 1 ? "s" : ""} trouvé{visibleUpcomingMovies.length !== 1 ? "s" : ""}{upcomingStartDate && upcomingEndDate && ` du ${rangeDateLabel(upcomingStartDate)} au ${rangeDateLabel(upcomingEndDate)}`}{upcomingCinemaFilterName && ` / ${upcomingCinemaFilterName}`}{upcomingNationality && ` / ${upcomingNationality === "france" ? "France" : "Hors France"}`}{upcomingLanguage && ` / ${languageLabel(upcomingLanguage)}`}{normalizedMovieSearch && ` / « ${movieSearch.trim()} »`}</p>
            {upcomingError && !upcomingMovies.length ? <div className="empty-search error-state"><strong>Programme indisponible</strong><p>Les films à venir n’ont pas pu être chargés. Réessayez dans quelques instants.</p><button onClick={retryUpcomingCatalogue}>Réessayer</button></div> : visibleUpcomingMovies.length ? <div className="movie-grid">
              {visibleUpcomingMovies.map((movie) => (
                <button className={movie.slug === upcomingMovieSlug ? "selected" : ""} key={movie.slug} onClick={() => selectUpcomingMovie(movie.slug)} aria-pressed={movie.slug === upcomingMovieSlug} aria-expanded={movie.slug === upcomingMovieSlug} aria-controls="upcoming-detail">
                  <span className="poster-wrap">{movie.poster ? <Image src={movie.poster} alt="" loading="lazy" width={240} height={330} unoptimized /> : <span className="poster-fallback">PL</span>}</span>
                  <span className="movie-card-copy">
                    <strong>{movie.title}</strong>
                    <small>{[durationLabel(movie.duration), movie.genres[0]].filter(Boolean).join(" / ") || "Film"}</small>
                    {movie.nationality && <small className="nationality">{movie.nationality}</small>}
                    {movie.originalLanguage && <small className="language">Langue originale : {languageLabel(movie.originalLanguage)}</small>}
                    {movie.releaseDate && <small className="release-date">Sortie le {releaseDateLabel(movie.releaseDate)}</small>}
                    <span>{movie.cinemas.length} cinéma{movie.cinemas.length !== 1 ? "s" : ""} disponible{movie.cinemas.length !== 1 ? "s" : ""}</span>
                  </span>
                </button>
              ))}
            </div> : <div className="empty-search"><strong>Aucun film trouvé</strong><p>Essayez un autre titre ou effacez la recherche pour parcourir les films par mois.</p><button onClick={() => changeMovieSearch("")}>Effacer la recherche</button></div>}
          </>
        )}

        {upcomingMovie && (
          <div className="upcoming-detail" id="upcoming-detail" ref={upcomingDetailRef}>
            <div className="upcoming-title-row">
              <div><h2>{upcomingMovie.title}</h2><p>{[upcomingMovie.nationality, upcomingMovie.originalLanguage && `Langue originale : ${languageLabel(upcomingMovie.originalLanguage)}`, upcomingMovie.releaseDate && `Sortie le ${releaseDateLabel(upcomingMovie.releaseDate)}`, durationLabel(upcomingMovie.duration), upcomingMovie.genres[0]].filter(Boolean).join(" / ")}</p></div>
              <button onClick={() => selectUpcomingMovie("")} aria-label="Fermer le film sélectionné">Fermer</button>
            </div>

            <section className="choice-section" aria-labelledby="cinema-choice-title">
              <header><h3 id="cinema-choice-title">Où le voir ?</h3><p>Choisissez un cinéma Pathé qui a annoncé ce film.</p></header>
              <div className="cinema-options">
                {upcomingMovie.cinemas.map((venue) => (
                  <button className={venue.slug === upcomingCinemaSlug ? "active" : ""} key={venue.slug} onClick={() => selectUpcomingCinema(venue.slug)} aria-pressed={venue.slug === upcomingCinemaSlug}>
                    <strong>{venue.name}</strong><span>{venue.district} / {venue.dates.length} date{venue.dates.length !== 1 ? "s" : ""}</span>
                  </button>
                ))}
              </div>
            </section>

            {upcomingCinema && (
              <section className="choice-section" aria-labelledby="date-choice-title">
                <header><h3 id="date-choice-title">À quelle date ?</h3><p>Les dates ci-dessous sont celles annoncées par {upcomingCinema.name}.</p></header>
                <div className="upcoming-dates">
                  {upcomingCinema.dates.map((day) => <button className={day === upcomingDate ? "active" : ""} key={day} onClick={() => void selectUpcomingDate(day)} aria-pressed={day === upcomingDate}>{dateLabel(day)}</button>)}
                </div>
              </section>
            )}

            {upcomingDate && (
              <section className="choice-section upcoming-availability" aria-labelledby="availability-choice-title">
                <header><h3 id="availability-choice-title">Places et plan de salle</h3><p>{dateLabel(upcomingDate)} / {upcomingCinema?.name}</p></header>
                {upcomingChecking ? (
                  <div className="upcoming-checking" role="status" aria-live="polite"><span className="checking-mark" aria-hidden="true" /> Vérification des séances et des places…</div>
                ) : upcomingFilm?.sessions.length ? (
                  <>
                    <div className="availability-banner">
                      <strong>{upcomingPlanCount ? `${upcomingPlanCount} plan${upcomingPlanCount !== 1 ? "s" : ""} disponible${upcomingPlanCount !== 1 ? "s" : ""}` : "Aucun plan disponible"}</strong>
                      <span>Fauteuils standards à vérifier sur le plan officiel Pathé. Les espaces PMR sont signalés séparément.</span>
                    </div>
                    <div className="session-grid upcoming-session-grid">
                      {upcomingFilm.sessions.map((session, index) => <SessionResult key={`${session.time}-${index}`} session={session} index={index} idPrefix="upcoming" mapSelection={upcomingSeatMap} mapControlsId="upcoming-seat-map" timeHeading="h4" onOpenMap={openUpcomingSeatMap} />)}
                    </div>
                  </>
                ) : (
                  <div className="upcoming-unreleased"><strong>Réservation pas encore ouverte</strong><p>Pathé a annoncé le film à cette date, mais les horaires ou le statut des places ne sont pas encore publiés.</p></div>
                )}

                {upcomingSeatMap && (
                  <div className="embedded-seat-map" id="upcoming-seat-map" ref={upcomingMapRef}>
                    <div className="map-toolbar">
                      <div><span>PLAN OFFICIEL PATHÉ</span><strong>{upcomingMovie.title} / {upcomingSeatMap.time}</strong><em>{upcomingSeatMap.capacity ? `Salle de ${upcomingSeatMap.capacity} places. ` : ""}Le compteur Pathé peut inclure des emplacements PMR : vérifiez les fauteuils standards directement sur le plan.</em></div>
                      <div className="map-actions"><a href={upcomingSeatMap.url} target="_blank" rel="noreferrer">Ouvrir sur Pathé</a><button onClick={reloadUpcomingSeatMap}>Recharger le plan</button><button onClick={() => updateUpcomingSeatMap(null)}>Fermer</button></div>
                    </div>
                    <div className="map-load-status" aria-live="polite"><i />{upcomingSeatMapReady ? "Réponse de Pathé reçue. Si le plan reste blanc, utilisez « Recharger le plan »." : "Chargement du plan Pathé en direct…"}</div>
                    <iframe key={`${upcomingSeatMap.url}:${upcomingSeatMapReload}`} src={reloadedSeatMapUrl(upcomingSeatMap.url, upcomingSeatMapReload)} title={`Plan des sièges Pathé pour ${upcomingMovie.title} à ${upcomingSeatMap.time}`} onLoad={() => setUpcomingSeatMapReady(true)} loading="eager" referrerPolicy="origin-when-cross-origin" />
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </section>}
    </main>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareCinemaRank, DEFAULT_CINEMA_SLUG, isExcludedCinema } from "../lib/cinemas";

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
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr").trim();
const programmeCache = new Map<string, { expiresAt: number; data: LiveProgramme }>();
const UPCOMING_DATA_VERSION = "tmdb-language-v1";
const filterUpcomingCinemas = (movies: UpcomingMovie[]) => movies
  .map((movie) => ({ ...movie, cinemas: movie.cinemas.filter((cinema) => !isExcludedCinema(cinema.slug)).sort(compareCinemaRank) }))
  .filter((movie) => movie.cinemas.length > 0);

async function loadProgramme(slug: string, requestedDate?: string) {
  const key = `${slug}:${requestedDate ?? "default"}`;
  const cached = programmeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const params = new URLSearchParams({ cinema: slug });
  if (requestedDate) params.set("date", requestedDate);
  const response = await fetch(`/api/pathe?${params}`);
  if (!response.ok) throw new Error("Programme indisponible");
  const data: LiveProgramme = await response.json();
  const cachedProgramme = { expiresAt: Date.now() + 60_000, data };
  programmeCache.set(key, cachedProgramme);
  programmeCache.set(`${slug}:${data.date}`, cachedProgramme);
  return data;
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
  const [seatMap, setSeatMap] = useState<{ url: string; time: string } | null>(null);
  const [upcomingMovies, setUpcomingMovies] = useState<UpcomingMovie[]>([]);
  const [upcomingStartDate, setUpcomingStartDate] = useState("");
  const [upcomingEndDate, setUpcomingEndDate] = useState("");
  const [upcomingNationality, setUpcomingNationality] = useState("");
  const [upcomingLanguage, setUpcomingLanguage] = useState("");
  const [tmdbAvailable, setTmdbAvailable] = useState(false);
  const [movieSearch, setMovieSearch] = useState("");
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState(false);
  const [upcomingMovieSlug, setUpcomingMovieSlug] = useState("");
  const [upcomingCinemaSlug, setUpcomingCinemaSlug] = useState("");
  const [upcomingDate, setUpcomingDate] = useState("");
  const [upcomingFilm, setUpcomingFilm] = useState<Film | null>(null);
  const [upcomingChecking, setUpcomingChecking] = useState(false);
  const [upcomingSeatMap, setUpcomingSeatMap] = useState<{ url: string; time: string } | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const seatMapRef = useRef<HTMLDivElement>(null);
  const upcomingDetailRef = useRef<HTMLDivElement>(null);
  const upcomingMapRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const upcomingRequestIdRef = useRef(0);
  const vostOnlyRef = useRef(true);

  const cinema = useMemo(() => schedule?.cinemas.find((item) => item.slug === cinemaSlug) ?? null, [schedule, cinemaSlug]);
  const films = filterFilms(dayFilms, vostOnly);
  const film = films.find((item) => item.slug === filmSlug) ?? films[0] ?? null;
  const sessions = film ? filterSessions(film, vostOnly) : [];
  const upcomingDates = useMemo(() => [...new Set(upcomingMovies.flatMap((movie) => movie.cinemas.flatMap((cinema) => cinema.dates)))].sort(), [upcomingMovies]);
  const upcomingLanguages = useMemo(() => [...new Set(upcomingMovies.map((movie) => movie.originalLanguage).filter((language): language is string => Boolean(language)))].sort((a, b) => (languageLabel(a) ?? a).localeCompare(languageLabel(b) ?? b, "fr")), [upcomingMovies]);
  const normalizedMovieSearch = normalizeSearch(movieSearch);
  const visibleUpcomingMovies = useMemo(() => upcomingMovies
    .filter((movie) => !normalizedMovieSearch || normalizeSearch(movie.title).includes(normalizedMovieSearch))
    .filter((movie) => !upcomingNationality
      || (upcomingNationality === "france" && movie.nationality === "France")
      || (upcomingNationality === "outside-france" && movie.nationality !== "France"))
    .filter((movie) => !upcomingLanguage || movie.originalLanguage === upcomingLanguage)
    .map((movie) => ({
      ...movie,
      cinemas: movie.cinemas.map((cinema) => ({
        ...cinema,
        dates: cinema.dates.filter((day) => (!upcomingStartDate || day >= upcomingStartDate) && (!upcomingEndDate || day <= upcomingEndDate)),
      })).filter((cinema) => cinema.dates.length > 0),
    }))
    .filter((movie) => movie.cinemas.length > 0), [upcomingMovies, normalizedMovieSearch, upcomingNationality, upcomingLanguage, upcomingStartDate, upcomingEndDate]);
  const upcomingMovie = visibleUpcomingMovies.find((movie) => movie.slug === upcomingMovieSlug) ?? null;
  const upcomingCinema = upcomingMovie?.cinemas.find((cinema) => cinema.slug === upcomingCinemaSlug) ?? null;

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
      setSeatMap(null);
    } catch {
      if (requestId !== requestIdRef.current) return;
      if (initial) {
        try {
          const response = await fetch("/pathe-schedule.json");
          if (!response.ok) throw new Error("Programme indisponible");
          const data: Schedule = await response.json();
          const filteredSchedule = { ...data, cinemas: data.cinemas.filter((cinema) => !isExcludedCinema(cinema.slug)).sort(compareCinemaRank) };
          const fallbackCinema = filteredSchedule.cinemas.find((item) => item.slug === slug) ?? filteredSchedule.cinemas[0];
          const fallbackDate = requestedDate && fallbackCinema.days[requestedDate] ? requestedDate : data.dates[0];
          const fallbackFilms = fallbackCinema.days[fallbackDate] ?? [];
          setSchedule(filteredSchedule);
          setCinemaSlug(fallbackCinema.slug);
          setDate(fallbackDate);
          setProgrammeDates(data.dates);
          setDayFilms(fallbackFilms);
          setSyncedAt(data.syncedAt);
          setFilmSlug(filterFilms(fallbackFilms, vostOnlyRef.current)[0]?.slug ?? "");
          const fallbackUpcoming = upcomingFromSchedule(filteredSchedule);
          setUpcomingMovies((current) => current.length ? current : fallbackUpcoming);
          const fallbackDates = [...new Set(fallbackUpcoming.flatMap((movie) => movie.cinemas.flatMap((venue) => venue.dates)))].sort();
          const fallbackStart = fallbackDates[0] ?? "";
          setUpcomingStartDate((current) => current || fallbackStart);
          setUpcomingEndDate((current) => current || fallbackDates.filter((day) => day.startsWith(fallbackStart.slice(0, 7))).at(-1) || fallbackStart);
          setRefreshError(true);
        } catch {
          setLoadError(true);
        }
      } else {
        setRefreshError(true);
      }
    } finally {
      if (requestId === requestIdRef.current) setRefreshing(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => refreshProgramme(DEFAULT_CINEMA_SLUG, undefined, true));

    fetch(`/api/pathe/upcoming?data=${UPCOMING_DATA_VERSION}`)
      .then((response) => {
        if (!response.ok) throw new Error("Films à venir indisponibles");
        return response.json();
      })
      .then((data: { movies: UpcomingMovie[]; sources?: { tmdb?: boolean } }) => {
        const movies = filterUpcomingCinemas(data.movies);
        setUpcomingMovies(movies);
        setTmdbAvailable(Boolean(data.sources?.tmdb));
        const dates = [...new Set(movies.flatMap((movie) => movie.cinemas.flatMap((venue) => venue.dates)))].sort();
        const firstDate = dates[0] ?? "";
        setUpcomingStartDate((current) => current || firstDate);
        setUpcomingEndDate((current) => current || dates.filter((day) => day.startsWith(firstDate.slice(0, 7))).at(-1) || firstDate);
      })
      .catch(() => setUpcomingError(true))
      .finally(() => setUpcomingLoading(false));
  }, []);

  function changeCinema(slug: string) {
    const nextCinema = schedule?.cinemas.find((item) => item.slug === slug);
    const fallbackDate = schedule?.dates[0] ?? "";
    const fallbackFilms = nextCinema?.days[fallbackDate] ?? [];
    setCinemaSlug(slug);
    setDate(fallbackDate);
    setProgrammeDates(schedule?.dates ?? []);
    setDayFilms(fallbackFilms);
    setFilmSlug(filterFilms(fallbackFilms, vostOnly)[0]?.slug ?? "");
    setChecked(false);
    setSeatMap(null);
    void refreshProgramme(slug);
  }

  function changeDate(nextDate: string) {
    const fallbackFilms = cinema?.days[nextDate] ?? [];
    setDate(nextDate);
    setDayFilms(fallbackFilms);
    setFilmSlug(filterFilms(fallbackFilms, vostOnly)[0]?.slug ?? "");
    setChecked(false);
    setSeatMap(null);
    void refreshProgramme(cinemaSlug, nextDate);
  }

  function showSessions() {
    if (!film) return;
    const onlySession = sessions.length === 1 ? sessions[0] : null;
    const showMap = onlySession?.status === "available" && onlySession.bookingUrl;
    setChecked(true);
    setSeatMap(showMap ? { url: showMap, time: onlySession.time } : null);
    window.setTimeout(() => (showMap ? seatMapRef : resultsRef).current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function selectFilm(slug: string) {
    const selectedFilm = films.find((item) => item.slug === slug);
    const selectedSessions = selectedFilm ? filterSessions(selectedFilm, vostOnly) : [];
    const onlySession = selectedSessions.length === 1 ? selectedSessions[0] : null;
    const showMap = onlySession?.status === "available" && onlySession.bookingUrl;
    setFilmSlug(slug);
    setChecked(Boolean(onlySession));
    setSeatMap(showMap ? { url: showMap, time: onlySession.time } : null);
    if (onlySession) {
      window.setTimeout(() => (showMap ? seatMapRef : resultsRef).current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
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
    setSeatMap(null);
  }

  function openSeatMap(url: string, time: string) {
    setSeatMap({ url, time });
    window.setTimeout(() => seatMapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function resetUpcomingSelection() {
    upcomingRequestIdRef.current += 1;
    setUpcomingMovieSlug("");
    setUpcomingCinemaSlug("");
    setUpcomingDate("");
    setUpcomingFilm(null);
    setUpcomingSeatMap(null);
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

  function changeUpcomingNationality(nationality: string) {
    setUpcomingNationality(nationality);
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
    setUpcomingMovieSlug(slug);
    setUpcomingCinemaSlug(defaultCinema?.slug ?? "");
    setUpcomingDate("");
    setUpcomingFilm(null);
    setUpcomingSeatMap(null);
    window.setTimeout(() => upcomingDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function selectUpcomingCinema(slug: string) {
    upcomingRequestIdRef.current += 1;
    setUpcomingCinemaSlug(slug);
    setUpcomingDate("");
    setUpcomingFilm(null);
    setUpcomingSeatMap(null);
  }

  async function selectUpcomingDate(day: string) {
    if (!upcomingMovie || !upcomingCinema) return;
    const requestId = ++upcomingRequestIdRef.current;
    setUpcomingDate(day);
    setUpcomingChecking(true);
    setUpcomingFilm(null);
    setUpcomingSeatMap(null);
    try {
      const data = await loadProgramme(upcomingCinema.slug, day);
      if (requestId !== upcomingRequestIdRef.current) return;
      const selectedFilm = data.films.find((item) => item.slug === upcomingMovie.slug) ?? null;
      setUpcomingFilm(selectedFilm);
      const onlySession = selectedFilm?.sessions.length === 1 ? selectedFilm.sessions[0] : null;
      const showMap = onlySession?.status === "available" && onlySession.bookingUrl;
      setUpcomingSeatMap(showMap ? { url: showMap, time: onlySession.time } : null);
      window.setTimeout(() => (showMap ? upcomingMapRef : upcomingDetailRef).current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch {
      if (requestId !== upcomingRequestIdRef.current) return;
      const fallbackCinema = schedule?.cinemas.find((item) => item.slug === upcomingCinema.slug);
      setUpcomingFilm(fallbackCinema?.days[day]?.find((item) => item.slug === upcomingMovie.slug) ?? null);
      setUpcomingError(true);
    } finally {
      if (requestId === upcomingRequestIdRef.current) setUpcomingChecking(false);
    }
  }

  function openUpcomingSeatMap(url: string, time: string) {
    setUpcomingSeatMap({ url, time });
    window.setTimeout(() => upcomingMapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  const sourcePage = cinema && date ? `${cinema.pageUrl}/filters/date-${date}` : "https://www.pathe.fr/cinemas/ville/paris";

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Place Libre — accueil"><span className="brand-mark">PL</span><span>PLACE LIBRE</span></a>
        <span className="live-pill verified"><i /> données Pathé</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>01</span> Programme officiel</div>
        <h1>Le bon film.<br />La vraie séance.</h1>
        <p className="lede">Choisissez un cinéma parisien et une date. Les films et horaires ci-dessous viennent directement du programme Pathé.</p>
        <a className="upcoming-jump" href="#a-venir">Explorer les films des prochains mois ↓</a>

        {loadError ? (
          <div className="load-message error">Le programme Pathé n’a pas pu être chargé. <button onClick={() => window.location.reload()}>Réessayer</button></div>
        ) : !schedule ? (
          <div className="load-message"><span className="spinner" /> Chargement du programme Pathé…</div>
        ) : (
          <>
            <div className="finder" aria-label="Recherche de séance">
              <label>
                <span>1 · Cinéma à Paris</span>
                <select value={cinemaSlug} onChange={(event) => changeCinema(event.target.value)}>
                  {schedule.cinemas.map((item) => <option key={item.slug} value={item.slug}>{item.name} — {item.district}</option>)}
                </select>
              </label>
              <label>
                <span>2 · Date</span>
                <select value={date} onChange={(event) => changeDate(event.target.value)} disabled={refreshing && !programmeDates.length}>
                  {programmeDates.map((item) => <option key={item} value={item}>{dateLabel(item)}</option>)}
                </select>
              </label>
              <label>
                <span>3 · Film · {films.length} {vostOnly ? "en VOST" : "au programme"}</span>
                <select value={film?.slug ?? ""} onChange={(event) => selectFilm(event.target.value)} disabled={refreshing || !films.length}>
                  {films.length ? films.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>) : <option>{vostOnly ? "Aucun film en VOST ce jour" : "Aucun film ce jour"}</option>}
                </select>
              </label>
              <button onClick={showSessions} disabled={refreshing || !film}>{refreshing ? "Actualisation…" : "Voir les séances"} {!refreshing && <span>→</span>}</button>
            </div>

            <div className="format-filter">
              <button className={vostOnly ? "active" : ""} onClick={toggleVost} aria-pressed={vostOnly}>
                <span className="filter-check" aria-hidden="true">{vostOnly ? "✓" : ""}</span>
                <span><strong>VOST uniquement</strong><small>Version originale sous-titrée</small></span>
              </button>
              {vostOnly && <span className="filter-result">{films.length} film{films.length !== 1 ? "s" : ""} disponible{films.length !== 1 ? "s" : ""}</span>}
              <span className="access-rule">Disponibilité standard uniquement · places PMR exclues</span>
            </div>

            <div className="date-strip" aria-label="Dates disponibles">
              {programmeDates.map((item, index) => (
                <button key={item} className={date === item ? "active" : ""} onClick={() => changeDate(item)}>
                  <small>{index === 0 ? "Aujourd’hui" : index === 1 ? "Demain" : dateLabel(item, "short").split(" ")[0]}</small>
                  <strong>{item.slice(8, 10)}</strong>
                  <span>{dateLabel(item, "short").split(" ").at(-1)}</span>
                </button>
              ))}
            </div>
            <p className="sync-note">{refreshing ? "Actualisation du programme Pathé…" : <>Actualisé automatiquement avec Pathé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(syncedAt || schedule.syncedAt))}{refreshError && " · version enregistrée affichée"}</>}</p>
          </>
        )}
      </section>

      {checked && cinema && film && (
        <section className="results is-visible" aria-live="polite" ref={resultsRef}>
          <div className="result-heading official-heading">
            <div>
              <div className="eyebrow"><span>02</span> Séances Pathé</div>
              <h2>{film.title}</h2>
              <p>{[durationLabel(film.duration), film.genres.join(", "), film.contentRating, film.releaseDate && `Sortie le ${releaseDateLabel(film.releaseDate)}`, cinema.name, dateLabel(date)].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="heading-actions">
              <div className="availability-summary"><strong>{sessions.filter((session) => session.status === "available" && session.bookingUrl).length}</strong><span>plan{sessions.filter((session) => session.status === "available" && session.bookingUrl).length > 1 ? "s" : ""} à vérifier<br />hors PMR</span></div>
              <a className="source-link" href={sourcePage} target="_blank" rel="noreferrer">Voir la source Pathé ↗</a>
            </div>
          </div>

          {sessions.length ? (
            <div className="session-grid">
              {sessions.map((session, index) => {
                const tags = usefulTags(session.tags);
                const bookingOpen = session.status === "available";
                const available = bookingOpen && session.bookingUrl;
                return (
                  <article className={`session-card ${bookingOpen ? "has-seats" : "sold-out"}`} key={`${session.time}-${index}`}>
                    <div className="session-time"><strong>{session.time}</strong>{session.endTime && <span>fin {session.endTime}</span>}</div>
                    <div className="session-meta">
                      <span>{session.version}</span>
                      {tags.map((tag) => <span key={tag}>{tag.toUpperCase()}</span>)}
                      {session.auditorium && <span>Salle {session.auditorium}</span>}
                    </div>
                    <div className={`seat-answer ${bookingOpen ? "pending" : "no"}`}>
                      <strong>{bookingOpen ? "À VÉRIFIER" : "COMPLET"}</strong>
                      <span>{bookingOpen ? "Place standard non confirmée" : "Aucune place disponible"}</span>
                    </div>
                    {available ? <button className="seat-map-button" onClick={() => openSeatMap(session.bookingUrl!, session.time)}>Vérifier les sièges hors PMR <span>↓</span></button> : <span className="disabled-booking">{bookingOpen ? "Plan indisponible" : "Séance complète"}</span>}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="no-sessions">
              <h3>Séances visibles sur Pathé</h3>
              <p>Pathé référence ce film ce jour-là, mais ne fournit pas ses horaires via son flux de séances.</p>
              <a href={sourcePage} target="_blank" rel="noreferrer">Consulter le programme officiel ↗</a>
            </div>
          )}

          {seatMap && (
            <div className="embedded-seat-map" ref={seatMapRef}>
              <div className="map-toolbar">
                <div><span>PLAN OFFICIEL PATHÉ</span><strong>{film.title} · {seatMap.time}</strong><em>Ignorez les emplacements PMR : ils ne comptent pas comme fauteuils standards disponibles.</em></div>
                <div className="map-actions">
                  <a href={seatMap.url} target="_blank" rel="noreferrer">Ouvrir sur Pathé ↗</a>
                  <button onClick={() => setSeatMap(null)} aria-label="Fermer le plan des sièges">Fermer ×</button>
                </div>
              </div>
              <iframe src={seatMap.url} title={`Plan des sièges Pathé pour ${film.title} à ${seatMap.time}`} />
            </div>
          )}

          <div className="truth-note">
            <strong>À propos des places</strong>
            <p>Pathé ne distingue pas les fauteuils standards des emplacements PMR dans son statut de séance. Place Libre ne compte donc jamais une séance « ouverte » comme disponible hors PMR : seul le plan officiel permet de confirmer qu’un fauteuil standard est libre. « COMPLET » reste le statut officiel Pathé.</p>
          </div>
        </section>
      )}

      <section className="upcoming" id="a-venir">
        <div className="upcoming-heading">
          <div>
            <div className="eyebrow"><span>03</span> Films à venir</div>
            <h2>Choisissez d’abord<br />le film.</h2>
            <p>Place Libre analyse le programme des cinémas Pathé à Paris et rassemble les dates annoncées pour les prochains mois.</p>
          </div>
          <div className="upcoming-controls">
            <label className="movie-search">
              <span>Rechercher un film</span>
              <input type="search" value={movieSearch} onChange={(event) => changeMovieSearch(event.target.value)} placeholder="Titre du film…" autoComplete="off" />
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
              <span>Langue originale · TMDB</span>
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
              <span className="date-range-arrow" aria-hidden="true">→</span>
              <label>
                <span>Jusqu’au</span>
                <input type="date" value={upcomingEndDate} min={upcomingDates[0]} max={upcomingDates.at(-1)} onChange={(event) => changeUpcomingEndDate(event.target.value)} disabled={!upcomingDates.length} />
              </label>
            </div>
          </div>
        </div>

        {upcomingLoading && !upcomingMovies.length ? (
          <div className="load-message"><span className="spinner" /> Analyse des films à venir…</div>
        ) : (
          <>
            <p className="upcoming-count">{visibleUpcomingMovies.length} film{visibleUpcomingMovies.length !== 1 ? "s" : ""} trouvé{visibleUpcomingMovies.length !== 1 ? "s" : ""}{upcomingStartDate && upcomingEndDate && ` du ${rangeDateLabel(upcomingStartDate)} au ${rangeDateLabel(upcomingEndDate)}`}{upcomingNationality && ` · ${upcomingNationality === "france" ? "France" : "Hors France"}`}{upcomingLanguage && ` · ${languageLabel(upcomingLanguage)}`}{normalizedMovieSearch && ` · « ${movieSearch.trim()} »`}{upcomingError && " · programme enregistré affiché"}</p>
            {visibleUpcomingMovies.length ? <div className="movie-grid">
              {visibleUpcomingMovies.map((movie) => (
                <button className={movie.slug === upcomingMovieSlug ? "selected" : ""} key={movie.slug} onClick={() => selectUpcomingMovie(movie.slug)}>
                  <span className="poster-wrap">{movie.poster ? <img src={movie.poster} alt="" loading="lazy" /> : <span className="poster-fallback">PL</span>}</span>
                  <span className="movie-card-copy">
                    <strong>{movie.title}</strong>
                    <small>{[durationLabel(movie.duration), movie.genres[0]].filter(Boolean).join(" · ") || "Film"}</small>
                    {movie.nationality && <small className="nationality">{movie.nationality}</small>}
                    {movie.originalLanguage && <small className="language">Langue originale : {languageLabel(movie.originalLanguage)}</small>}
                    {movie.releaseDate && <small className="release-date">Sortie le {releaseDateLabel(movie.releaseDate)}</small>}
                    <span>{movie.cinemas.length} cinéma{movie.cinemas.length !== 1 ? "s" : ""} à Paris <b>→</b></span>
                  </span>
                </button>
              ))}
            </div> : <div className="empty-search"><strong>Aucun film trouvé</strong><p>Essayez un autre titre ou effacez la recherche pour parcourir les films par mois.</p><button onClick={() => changeMovieSearch("")}>Effacer la recherche</button></div>}
          </>
        )}

        {upcomingMovie && (
          <div className="upcoming-detail" ref={upcomingDetailRef}>
            <div className="upcoming-title-row">
              <div><span>FILM SÉLECTIONNÉ</span><h3>{upcomingMovie.title}</h3><p>{[upcomingMovie.nationality, upcomingMovie.originalLanguage && `Langue originale : ${languageLabel(upcomingMovie.originalLanguage)}`, upcomingMovie.releaseDate && `Sortie le ${releaseDateLabel(upcomingMovie.releaseDate)}`, durationLabel(upcomingMovie.duration), upcomingMovie.genres[0]].filter(Boolean).join(" · ")}</p></div>
              <button onClick={() => selectUpcomingMovie("")} aria-label="Fermer le film sélectionné">Fermer ×</button>
            </div>

            <div className="upcoming-step">
              <span className="step-number">1</span>
              <div><h4>Où le voir à Paris ?</h4><p>Choisissez un cinéma Pathé qui a annoncé ce film.</p></div>
            </div>
            <div className="cinema-options">
              {upcomingMovie.cinemas.map((venue) => (
                <button className={venue.slug === upcomingCinemaSlug ? "active" : ""} key={venue.slug} onClick={() => selectUpcomingCinema(venue.slug)}>
                  <strong>{venue.name}</strong><span>{venue.district} · {venue.dates.length} date{venue.dates.length !== 1 ? "s" : ""}</span>
                </button>
              ))}
            </div>

            {upcomingCinema && (
              <>
                <div className="upcoming-step">
                  <span className="step-number">2</span>
                  <div><h4>À quelle date ?</h4><p>Les dates ci-dessous sont celles annoncées par {upcomingCinema.name}.</p></div>
                </div>
                <div className="upcoming-dates">
                  {upcomingCinema.dates.map((day) => <button className={day === upcomingDate ? "active" : ""} key={day} onClick={() => void selectUpcomingDate(day)}>{dateLabel(day)}</button>)}
                </div>
              </>
            )}

            {upcomingDate && (
              <div className="upcoming-availability">
                <div className="upcoming-step">
                  <span className="step-number">3</span>
                  <div><h4>Places et plan de salle</h4><p>{dateLabel(upcomingDate)} · {upcomingCinema?.name}</p></div>
                </div>
                {upcomingChecking ? (
                  <div className="upcoming-checking"><span className="spinner" /> Vérification des séances et des places…</div>
                ) : upcomingFilm?.sessions.length ? (
                  <>
                    <div className="availability-banner">
                      <strong>{upcomingFilm.sessions.some((session) => session.status === "available") ? "VÉRIFIER LE PLAN" : "COMPLET"}</strong>
                      <span>{upcomingFilm.sessions.filter((session) => session.status === "available" && session.bookingUrl).length} plan{upcomingFilm.sessions.filter((session) => session.status === "available" && session.bookingUrl).length !== 1 ? "s" : ""} consultable{upcomingFilm.sessions.filter((session) => session.status === "available" && session.bookingUrl).length !== 1 ? "s" : ""} · hors PMR</span>
                    </div>
                    <div className="session-grid upcoming-session-grid">
                      {upcomingFilm.sessions.map((session, index) => {
                        const bookingOpen = session.status === "available";
                        const available = bookingOpen && session.bookingUrl;
                        return (
                          <article className={`session-card ${bookingOpen ? "has-seats" : "sold-out"}`} key={`${session.time}-${index}`}>
                            <div className="session-time"><strong>{session.time}</strong>{session.endTime && <span>fin {session.endTime}</span>}</div>
                            <div className="session-meta"><span>{session.version}</span>{usefulTags(session.tags).map((tag) => <span key={tag}>{tag.toUpperCase()}</span>)}{session.auditorium && <span>Salle {session.auditorium}</span>}</div>
                            <div className={`seat-answer ${bookingOpen ? "pending" : "no"}`}><strong>{bookingOpen ? "À VÉRIFIER" : "COMPLET"}</strong><span>{bookingOpen ? "Place standard non confirmée" : "Aucune place disponible"}</span></div>
                            {available ? <button className="seat-map-button" onClick={() => openUpcomingSeatMap(session.bookingUrl!, session.time)}>Vérifier les sièges hors PMR <span>↓</span></button> : <span className="disabled-booking">{bookingOpen ? "Plan indisponible" : "Séance complète"}</span>}
                          </article>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="upcoming-unreleased"><strong>Réservation pas encore ouverte</strong><p>Pathé a annoncé le film à cette date, mais les horaires ou le statut des places ne sont pas encore publiés.</p></div>
                )}

                {upcomingSeatMap && (
                  <div className="embedded-seat-map" ref={upcomingMapRef}>
                    <div className="map-toolbar">
                      <div><span>PLAN OFFICIEL PATHÉ</span><strong>{upcomingMovie.title} · {upcomingSeatMap.time}</strong><em>Ignorez les emplacements PMR : ils ne comptent pas comme fauteuils standards disponibles.</em></div>
                      <div className="map-actions"><a href={upcomingSeatMap.url} target="_blank" rel="noreferrer">Ouvrir sur Pathé ↗</a><button onClick={() => setUpcomingSeatMap(null)}>Fermer ×</button></div>
                    </div>
                    <iframe src={upcomingSeatMap.url} title={`Plan des sièges Pathé pour ${upcomingMovie.title} à ${upcomingSeatMap.time}`} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

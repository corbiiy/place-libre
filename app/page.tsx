"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

const dateLabel = (date: string, style: "long" | "short" = "long") => new Intl.DateTimeFormat("fr-FR", style === "long"
  ? { weekday: "long", day: "numeric", month: "long" }
  : { weekday: "short", day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));

const durationLabel = (minutes: number | null) => minutes ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : null;
const usefulTags = (tags: string[]) => tags.filter((tag) => !["DEFAULT", "pmr", "GRETA", "hearing-impaired"].includes(tag));

export default function Home() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [cinemaSlug, setCinemaSlug] = useState("cinema-pathe-alesia");
  const [date, setDate] = useState("");
  const [filmSlug, setFilmSlug] = useState("");
  const [checked, setChecked] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/pathe-schedule.json")
      .then((response) => {
        if (!response.ok) throw new Error("Programme indisponible");
        return response.json();
      })
      .then((data: Schedule) => {
        const cinema = data.cinemas.find((item) => item.slug === "cinema-pathe-alesia") ?? data.cinemas[0];
        const initialDate = data.dates[0];
        setSchedule(data);
        setCinemaSlug(cinema.slug);
        setDate(initialDate);
        setFilmSlug(cinema.days[initialDate]?.[0]?.slug ?? "");
      })
      .catch(() => setLoadError(true));
  }, []);

  const cinema = useMemo(() => schedule?.cinemas.find((item) => item.slug === cinemaSlug) ?? null, [schedule, cinemaSlug]);
  const films = cinema?.days[date] ?? [];
  const film = films.find((item) => item.slug === filmSlug) ?? films[0] ?? null;

  function changeCinema(slug: string) {
    const nextCinema = schedule?.cinemas.find((item) => item.slug === slug);
    setCinemaSlug(slug);
    setFilmSlug(nextCinema?.days[date]?.[0]?.slug ?? "");
    setChecked(false);
  }

  function changeDate(nextDate: string) {
    setDate(nextDate);
    setFilmSlug(cinema?.days[nextDate]?.[0]?.slug ?? "");
    setChecked(false);
  }

  function showSessions() {
    if (!film) return;
    setChecked(true);
    window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
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
                <select value={date} onChange={(event) => changeDate(event.target.value)}>
                  {schedule.dates.map((item) => <option key={item} value={item}>{dateLabel(item)}</option>)}
                </select>
              </label>
              <label>
                <span>3 · Film · {films.length} au programme</span>
                <select value={film?.slug ?? ""} onChange={(event) => { setFilmSlug(event.target.value); setChecked(false); }} disabled={!films.length}>
                  {films.length ? films.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>) : <option>Aucun film ce jour</option>}
                </select>
              </label>
              <button onClick={showSessions} disabled={!film}>Voir les séances <span>→</span></button>
            </div>

            <div className="date-strip" aria-label="Dates disponibles">
              {schedule.dates.map((item, index) => (
                <button key={item} className={date === item ? "active" : ""} onClick={() => changeDate(item)}>
                  <small>{index === 0 ? "Aujourd’hui" : index === 1 ? "Demain" : dateLabel(item, "short").split(" ")[0]}</small>
                  <strong>{item.slice(8, 10)}</strong>
                  <span>{dateLabel(item, "short").split(" ").at(-1)}</span>
                </button>
              ))}
            </div>
            <p className="sync-note">Synchronisé avec Pathé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(schedule.syncedAt))}</p>
          </>
        )}
      </section>

      {checked && cinema && film && (
        <section className="results is-visible" aria-live="polite" ref={resultsRef}>
          <div className="result-heading official-heading">
            <div>
              <div className="eyebrow"><span>02</span> Séances Pathé</div>
              <h2>{film.title}</h2>
              <p>{[durationLabel(film.duration), film.genres.join(", "), film.contentRating, cinema.name, dateLabel(date)].filter(Boolean).join(" · ")}</p>
            </div>
            <a className="source-link" href={sourcePage} target="_blank" rel="noreferrer">Voir la source Pathé ↗</a>
          </div>

          {film.sessions.length ? (
            <div className="session-grid">
              {film.sessions.map((session, index) => {
                const tags = usefulTags(session.tags);
                const available = session.status === "available" && session.bookingUrl;
                return (
                  <article className="session-card" key={`${session.time}-${index}`}>
                    <div className="session-time"><strong>{session.time}</strong>{session.endTime && <span>fin {session.endTime}</span>}</div>
                    <div className="session-meta">
                      <span>{session.version}</span>
                      {tags.map((tag) => <span key={tag}>{tag.toUpperCase()}</span>)}
                      {session.auditorium && <span>Salle {session.auditorium}</span>}
                    </div>
                    <div className={`booking-status ${available ? "available" : "unavailable"}`}><i />{available ? "Réservation ouverte" : "Indisponible"}</div>
                    {available ? <a href={session.bookingUrl!} target="_blank" rel="noreferrer">Choisir mes places <span>↗</span></a> : <span className="disabled-booking">Réservation fermée</span>}
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

          <div className="truth-note">
            <strong>À propos des places</strong>
            <p>Pathé publie le statut de réservation, mais pas le nombre exact de fauteuils libres. « Choisir mes places » ouvre le plan de salle officiel Pathé pour vérifier les sièges réellement disponibles.</p>
          </div>
        </section>
      )}
    </main>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";

const cinemas = [
  { name: "Pathé BNP Paribas", district: "Paris 2e" },
  { name: "Pathé Palace", district: "Paris 9e" },
  { name: "Pathé Les Fauvettes", district: "Paris 13e" },
  { name: "Pathé Alésia", district: "Paris 14e" },
  { name: "Pathé Parnasse", district: "Paris 14e" },
  { name: "Pathé Montparnos", district: "Paris 14e" },
  { name: "Pathé Aquaboulevard", district: "Paris 15e" },
  { name: "Pathé Convention", district: "Paris 15e" },
  { name: "Pathé Beaugrenelle", district: "Paris 15e" },
  { name: "Les 7 Batignolles", district: "Paris 17e" },
  { name: "Pathé Wepler", district: "Paris 18e" },
  { name: "Pathé La Villette", district: "Paris 19e" },
  { name: "La Géode", district: "Paris 19e" },
];

const filmPool = [
  { title: "Projet Dernière Chance", meta: "2h 46 · Science-fiction" },
  { title: "Super Mario Galaxy", meta: "1h 42 · Animation" },
  { title: "Le Diable s’habille en Prada 2", meta: "2h 05 · Comédie" },
  { title: "Compostelle", meta: "1h 48 · Drame" },
  { title: "The Drama", meta: "1h 55 · Drame" },
  { title: "La Bataille de Gaulle", meta: "2h 21 · Historique" },
  { title: "Derrière les palmiers", meta: "1h 37 · Drame" },
  { title: "L’Inconnue", meta: "1h 51 · Thriller" },
  { title: "Tosca — Opéra de Paris", meta: "3h 05 · Opéra" },
];

const dayMs = 86_400_000;
const today = new Date();
today.setHours(12, 0, 0, 0);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const availableDates = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(today.getTime() + index * dayMs);
  return {
    value: isoDate(date),
    short: index === 0 ? "Aujourd’hui" : index === 1 ? "Demain" : new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(date).replace(".", ""),
    day: new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date).replace(".", ""),
  };
});

function hash(value: string) {
  return [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
}

function filmsFor(cinema: string, date: string) {
  const seed = hash(`${cinema}-${date}`);
  return Array.from({ length: 5 }, (_, index) => filmPool[(seed + index * 2) % filmPool.length]);
}

function showtimesFor(cinema: string, date: string, film: string) {
  const variants = [
    ["11:15", "14:20", "17:35", "20:45"],
    ["10:40", "13:50", "18:10", "21:25"],
    ["12:05", "15:15", "19:30", "22:20"],
  ];
  return variants[hash(`${cinema}-${date}-${film}`) % variants.length];
}

export default function Home() {
  const [cinema, setCinema] = useState(cinemas[0].name);
  const [date, setDate] = useState(availableDates[0].value);
  const availableFilms = useMemo(() => filmsFor(cinema, date), [cinema, date]);
  const [film, setFilm] = useState(() => filmsFor(cinemas[0].name, availableDates[0].value)[0].title);
  const times = useMemo(() => showtimesFor(cinema, date, film), [cinema, date, film]);
  const [time, setTime] = useState(times[0]);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);
  const activeFilm = availableFilms.find((item) => item.title === film) ?? availableFilms[0];
  const resultSeed = hash(`${cinema}-${date}-${film}-${time}`);
  const totalSeats = 124;
  const freeSeats = 22 + (resultSeed % 79);

  function resetFor(cinemaValue: string, dateValue: string) {
    const nextFilm = filmsFor(cinemaValue, dateValue)[0].title;
    setFilm(nextFilm);
    setTime(showtimesFor(cinemaValue, dateValue, nextFilm)[0]);
    setChecked(false);
  }

  function chooseCinema(value: string) {
    setCinema(value);
    resetFor(value, date);
  }

  function chooseDate(value: string) {
    setDate(value);
    resetFor(cinema, value);
  }

  function chooseFilm(value: string) {
    setFilm(value);
    setTime(showtimesFor(cinema, date, value)[0]);
    setChecked(false);
  }

  function checkAvailability() {
    setChecking(true);
    setChecked(false);
    window.setTimeout(() => {
      setChecking(false);
      setChecked(true);
      window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }, 450);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Place Libre — accueil"><span className="brand-mark">PL</span><span>PLACE LIBRE</span></a>
        <span className="live-pill"><i /> aperçu démo</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>01</span> Trouvez votre séance</div>
        <h1>Le bon film.<br />La bonne place.</h1>
        <p className="lede">Choisissez d’abord votre cinéma et votre date. Nous vous montrons ensuite uniquement les films programmés ce jour-là.</p>

        <div className="finder" aria-label="Recherche de séance">
          <label>
            <span>1 · Cinéma à Paris</span>
            <select value={cinema} onChange={(event) => chooseCinema(event.target.value)}>
              {cinemas.map((item) => <option key={item.name} value={item.name}>{item.name} — {item.district}</option>)}
            </select>
          </label>
          <label>
            <span>2 · Date</span>
            <select value={date} onChange={(event) => chooseDate(event.target.value)}>
              {availableDates.map((item) => <option key={item.value} value={item.value}>{item.short} · {item.day} {item.month}</option>)}
            </select>
          </label>
          <label>
            <span>3 · Film</span>
            <select value={film} onChange={(event) => chooseFilm(event.target.value)}>
              {availableFilms.map((item) => <option key={item.title} value={item.title}>{item.title}</option>)}
            </select>
          </label>
          <button onClick={checkAvailability} disabled={checking}>{checking ? "Vérification…" : "Voir les places"} <span>{checking ? "" : "→"}</span></button>
        </div>

        <div className="date-strip" aria-label="Dates disponibles">
          {availableDates.map((item) => (
            <button key={item.value} className={date === item.value ? "active" : ""} onClick={() => chooseDate(item.value)}>
              <small>{item.short}</small><strong>{item.day}</strong><span>{item.month}</span>
            </button>
          ))}
        </div>
      </section>

      {checked && (
        <section className="results is-visible" aria-live="polite" ref={resultsRef}>
          <div className="result-heading">
            <div><div className="eyebrow"><span>02</span> Disponibilités</div><h2>{activeFilm.title}</h2><p>{activeFilm.meta} · {cinema} · {new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`))}</p></div>
            <div className="availability"><strong>{freeSeats}</strong><span>places libres<br />sur {totalSeats}</span></div>
          </div>

          <div className="time-row" role="group" aria-label="Choisir une séance">
            {times.map((item, index) => {
              const count = 14 + ((resultSeed + index * 19) % 90);
              return <button key={item} className={time === item ? "active" : ""} onClick={() => setTime(item)}><span>{item}</span><small>{count} places</small></button>;
            })}
          </div>

          <div className="seat-card">
            <div className="seat-copy">
              <span className="room">SALLE {1 + (resultSeed % 8)} · {time}</span>
              <h3>{freeSeats > 65 ? <>Encore de très<br />bonnes places.</> : freeSeats > 35 ? <>La salle se<br />remplit vite.</> : <>Plus que quelques<br />places.</>}</h3>
              <p>{freeSeats > 50 ? "Les sièges centraux des rangs E à G sont encore largement disponibles." : "Les meilleures places partent vite : vérifiez le plan officiel avant de réserver."}</p>
              <div className="legend"><span><i className="free" /> Libre</span><span><i className="taken" /> Occupé</span></div>
              <a href="https://www.pathe.fr/cinemas/ville/paris" target="_blank" rel="noreferrer">Continuer sur Pathé <span>↗</span></a>
            </div>
            <div className="seat-map" aria-label="Plan de salle simplifié">
              <div className="screen">ÉCRAN</div>
              {[0,1,2,3,4,5,6].map((row) => <div className="seat-row" key={row}><b>{String.fromCharCode(65 + row)}</b>{Array.from({ length: 10 }, (_, seat) => { const taken = (resultSeed + row * 7 + seat * 3) % 13 < 5; return <i key={seat} className={taken ? "taken" : "free"} title={`${String.fromCharCode(65 + row)}${seat + 1} — ${taken ? "occupé" : "libre"}`} />; })}</div>)}
            </div>
          </div>
          <p className="demo-note">Simulation interactive — les disponibilités en temps réel doivent être confirmées sur Pathé avant réservation.</p>
        </section>
      )}
    </main>
  );
}

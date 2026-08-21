"use client";

import { useMemo, useState } from "react";

const cinemas = ["Pathé Palace — Paris 9e", "Pathé Parnasse — Paris 14e", "Pathé Wepler — Paris 18e", "Pathé Beaugrenelle — Paris 15e"];
const films = [
  { title: "Projet Dernière Chance", meta: "2h 46 · Science-fiction" },
  { title: "Super Mario Galaxy", meta: "1h 42 · Animation" },
  { title: "The Drama", meta: "1h 55 · Drame" },
];
const times = ["14:10", "17:25", "20:40", "22:15"];

export default function Home() {
  const [cinema, setCinema] = useState(cinemas[0]);
  const [film, setFilm] = useState(films[0].title);
  const [date, setDate] = useState("2026-08-22");
  const [time, setTime] = useState(times[2]);
  const [checked, setChecked] = useState(true);
  const activeFilm = useMemo(() => films.find((item) => item.title === film) ?? films[0], [film]);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Place Libre — accueil"><span className="brand-mark">PL</span><span>PLACE LIBRE</span></a>
        <span className="live-pill"><i /> aperçu démo</span>
      </header>
      <section className="hero" id="top">
        <div className="eyebrow"><span>01</span> Trouvez votre séance</div>
        <h1>Le bon film.<br />La bonne place.</h1>
        <p className="lede">Vérifiez les sièges disponibles avant d’ouvrir la réservation Pathé.</p>
        <div className="finder" aria-label="Recherche de séance">
          <label><span>Cinéma</span><select value={cinema} onChange={(e) => { setCinema(e.target.value); setChecked(false); }}>{cinemas.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Film</span><select value={film} onChange={(e) => { setFilm(e.target.value); setChecked(false); }}>{films.map((item) => <option key={item.title}>{item.title}</option>)}</select></label>
          <label><span>Date</span><input type="date" value={date} min="2026-08-22" onChange={(e) => { setDate(e.target.value); setChecked(false); }} /></label>
          <button onClick={() => setChecked(true)}>Vérifier les places <span>→</span></button>
        </div>
      </section>
      <section className={`results ${checked ? "is-visible" : ""}`} aria-live="polite">
        <div className="result-heading">
          <div><div className="eyebrow"><span>02</span> Disponibilités</div><h2>{activeFilm.title}</h2><p>{activeFilm.meta} · {cinema}</p></div>
          <div className="availability"><strong>68</strong><span>places libres<br />sur 124</span></div>
        </div>
        <div className="time-row" role="group" aria-label="Choisir une séance">
          {times.map((item, index) => <button key={item} className={time === item ? "active" : ""} onClick={() => setTime(item)}><span>{item}</span><small>{index === 3 ? "24 places" : index === 2 ? "68 places" : "disponible"}</small></button>)}
        </div>
        <div className="seat-card">
          <div className="seat-copy">
            <span className="room">SALLE 4 · {time}</span><h3>Encore de très<br />bonnes places.</h3>
            <p>Les sièges centraux des rangs E à G sont encore largement disponibles.</p>
            <div className="legend"><span><i className="free" /> Libre</span><span><i className="taken" /> Occupé</span></div>
            <a href="https://www.pathe.fr/" target="_blank" rel="noreferrer">Continuer sur Pathé <span>↗</span></a>
          </div>
          <div className="seat-map" aria-label="Plan de salle simplifié">
            <div className="screen">ÉCRAN</div>
            {[0,1,2,3,4,5,6].map((row) => <div className="seat-row" key={row}><b>{String.fromCharCode(65 + row)}</b>{Array.from({length: 10}, (_, seat) => { const taken = (row * 7 + seat * 3) % 11 < 4; return <i key={seat} className={taken ? "taken" : "free"} title={`${String.fromCharCode(65 + row)}${seat + 1} — ${taken ? "occupé" : "libre"}`} />; })}</div>)}
          </div>
        </div>
        <p className="demo-note">Données de démonstration — la connexion aux disponibilités Pathé reste à configurer.</p>
      </section>
    </main>
  );
}

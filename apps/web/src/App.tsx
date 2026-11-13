import { useEffect, useState } from 'react';
import { getAppMessage } from './app-message';
import { ButtonLink, Panel, ThemeToggle } from './components';
import { getInitialTheme, getNextTheme, type Theme } from './theme';
import './styles.css';

const themeStorageKey = 'codequest-theme';

function readThemePreference(): Theme {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const savedTheme = window.localStorage.getItem(themeStorageKey);
  const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';

  return getInitialTheme(savedTheme, systemTheme);
}

export function App() {
  const [theme, setTheme] = useState<Theme>(readThemePreference);

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  return (
    <div className="app-shell" data-theme={theme}>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="topbar">
        <a className="brand" href="#accueil" aria-label="CodeQuest, accueil">
          <span className="brand__mark" aria-hidden="true">CQ</span>
          <span>CODE<span className="brand__accent">QUEST</span></span>
        </a>
        <nav className="topbar__nav" aria-label="Navigation principale">
          <a href="#missions">Missions</a>
          <a href="#atelier">Atelier</a>
        </nav>
        <ThemeToggle
          theme={theme}
          onToggle={() => setTheme((currentTheme) => getNextTheme(currentTheme))}
        />
      </header>

      <main id="contenu" className="main-content">
        <section className="hero" id="accueil" aria-labelledby="welcome-title">
          <div className="hero__copy">
            <p className="eyebrow"><span aria-hidden="true">✳</span> TERMINAL DE DÉPART · SAISON 01</p>
            <h1 id="welcome-title">{getAppMessage()}<br /><span>du futur.</span></h1>
            <p className="hero__description">
              Déchiffre, expérimente et progresse à ton rythme. Chaque ligne de code
              est une nouvelle porte à ouvrir.
            </p>
            <ButtonLink href="#missions">
              Explorer les missions <span aria-hidden="true">↗</span>
            </ButtonLink>
          </div>
          <div
            className="hero__console"
            role="img"
            aria-label="Illustration décorative d'une console rétro-futuriste"
          >
            <div className="console-screen">
              <span className="console-screen__label">SIGNAL REÇU</span>
              <span className="console-screen__orb" aria-hidden="true" />
              <span className="console-screen__message">READY WHEN<br />YOU ARE<span className="cursor" aria-hidden="true">_</span></span>
              <span className="console-screen__coordinates">42° 01' · SECTEUR 0</span>
            </div>
            <div className="console-controls" aria-hidden="true">
              <span className="d-pad"><i /><i /><i /><i /><i /></span>
              <span className="action-buttons"><i /><i /></span>
            </div>
          </div>
        </section>

        <section className="mission-section" id="missions" aria-labelledby="mission-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TON PROCHAIN DÉFI</p>
              <h2 id="mission-title">Prêt·e à jouer ?</h2>
            </div>
            <span className="section-index">01 / 03</span>
          </div>
          <div className="mission-grid">
            <Panel className="mission-card mission-card--featured">
              <div className="card-topline">
                <span className="badge badge--accent">NOUVEAU</span>
                <span className="card-code">MISSION_001</span>
              </div>
              <div className="mission-icon" aria-hidden="true">&lt;/&gt;</div>
              <h3>Le langage des machines</h3>
              <p>Découvre les bases du code et écris ton premier message venu d’ailleurs.</p>
              <div className="card-footer">
                <span><span className="status-dot" aria-hidden="true" /> Débutant·e</span>
                <span>~ 10 min</span>
              </div>
            </Panel>
            <Panel className="mission-card" id="atelier">
              <div className="card-topline">
                <span className="badge">À VENIR</span>
                <span className="card-code">MISSION_002</span>
              </div>
              <div className="mission-icon mission-icon--secondary" aria-hidden="true">✳</div>
              <h3>Cartographier la galaxie</h3>
              <p>Les coordonnées se brouillent. Aide l’équipage à retrouver son chemin.</p>
              <div className="card-footer">
                <span><span className="status-dot" aria-hidden="true" /> Logique</span>
                <span>~ 15 min</span>
              </div>
            </Panel>
          </div>
        </section>

      </main>
      <footer className="page-footer">
        <span>CODEQUEST <span aria-hidden="true">✳</span> APPRENDRE EN JOUANT</span>
        <span>Pas de son nécessaire, juste de la curiosité.</span>
      </footer>
    </div>
  );
}

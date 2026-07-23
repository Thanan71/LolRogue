import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/config/routes';
import '@/styles/main-menu.css';

const credits = [
  { section: 'Game Design & Development', entries: ['LolRogue Team'] },
  { section: 'Built With', entries: ['React 18', 'TypeScript', 'Vite', 'Zustand'] },
  {
    section: 'Inspiration',
    entries: ['League of Legends — Riot Games', 'Pokémon Rogue (Pokémon community)'],
  },
  { section: 'Art & Assets', entries: ['Riot Games — League of Legends Data Dragon'] },
];

export function CreditsPage() {
  const navigate = useAppNavigate();

  return (
    <div className="main-menu">
      <div className="main-menu__logo-section">
        <h1 className="main-menu__title" style={{ fontSize: '2.5rem' }}>
          Credits
        </h1>
        <p className="main-menu__subtitle">Acknowledgements</p>
      </div>

      <div className="main-menu__divider" />

      <div style={{ position: 'relative', zIndex: 2, width: 460, maxWidth: '90%' }}>
        {credits.map((group) => (
          <div key={group.section} style={groupStyle}>
            <h2 style={sectionTitleStyle}>{group.section}</h2>
            {group.entries.map((entry) => (
              <p key={entry} style={entryStyle}>
                {entry}
              </p>
            ))}
          </div>
        ))}

        <div style={disclaimerStyle}>
          LolRogue is a non-commercial fan project inspired by League of Legends (© Riot Games).
          League of Legends and all related assets are trademarks of Riot Games, Inc. This project
          is not affiliated with or endorsed by Riot Games.
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 2, marginTop: '2rem' }}>
        <button
          className="main-menu__btn main-menu__btn--ghost"
          onClick={() => navigate(ROUTES.MENU)}
          style={{ width: 200 }}
        >
          Back to Menu
        </button>
      </div>
    </div>
  );
}

const groupStyle: React.CSSProperties = {
  marginBottom: '1.5rem',
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#c8aa6e',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '0.5rem',
};

const entryStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#7a6f55',
  lineHeight: 1.8,
  letterSpacing: '0.05em',
};

const disclaimerStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#3d4a5c',
  lineHeight: 1.7,
  textAlign: 'center',
  marginTop: '2rem',
  paddingTop: '1rem',
  borderTop: '1px solid rgba(200,170,110,0.1)',
};

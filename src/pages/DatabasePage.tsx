import { useMemo, useState } from 'react';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { championDB } from '@/data/championDatabase';
import { gameStatsAtLevel } from '@/utils/statConversion';
import { DDRAGON_CONFIG } from '@/config/ddragon';
import type { Champion } from '@/types/champion';

export function DatabasePage() {
  const navigate = useAppNavigate();
  const [search, setSearch] = useState('');
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null);

  const allChampions = useMemo(() => championDB.getAll(), []);

  const filteredChampions = useMemo(() => {
    if (!search.trim()) return allChampions;
    const q = search.toLowerCase();
    return allChampions.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [allChampions, search]);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <button style={backBtnStyle} onClick={() => navigate(ROUTES.MENU)}>
          ← Menu
        </button>
        <h1 style={{ color: '#c8aa6e', fontSize: 20, margin: 0 }}>Champion Database</h1>
        <span style={{ color: '#8b949e', fontSize: 12 }}>{allChampions.length} champions</span>
      </div>

      <div style={bodyStyle}>
        <div style={sidebarStyle}>
          <input
            type="text"
            placeholder="Search champions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchStyle}
          />
          <div style={listStyle}>
            {filteredChampions.map((champ) => (
              <div
                key={champ.id}
                style={{
                  ...listItemStyle,
                  background: selectedChampion?.id === champ.id ? '#1e2a3a' : 'transparent',
                }}
                onClick={() => setSelectedChampion(champ)}
              >
                <img
                  src={champ.iconUrl}
                  alt={champ.name}
                  style={{ width: 32, height: 32, borderRadius: 4 }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div>
                  <div style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>{champ.name}</div>
                  <div style={{ color: '#8b949e', fontSize: 11 }}>{champ.tags.join(', ')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={detailStyle}>
          {selectedChampion ? (
            <ChampionDetail champion={selectedChampion} />
          ) : (
            <div style={placeholderStyle}>
              <p style={{ color: '#8b949e' }}>Select a champion to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChampionDetail({ champion }: { champion: Champion }) {
  const gameStats = gameStatsAtLevel(champion.stats, 1);
  const splashUrl = DDRAGON_CONFIG.championSplashUrl(champion.id);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <img
          src={splashUrl}
          alt={champion.name}
          style={{ width: 120, height: 120, borderRadius: 8, objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div>
          <h2 style={{ color: '#c8aa6e', margin: '0 0 4px 0' }}>{champion.name}</h2>
          <p style={{ color: '#8b949e', margin: '0 0 8px 0', fontStyle: 'italic' }}>{champion.title}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {champion.tags.map((tag) => (
              <span key={tag} style={tagStyle}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      <h3 style={sectionTitleStyle}>Stats (Level 1)</h3>
      <div style={statsGridStyle}>
        {[
          { label: 'HP', value: gameStats.hp },
          { label: 'ATK', value: gameStats.atk },
          { label: 'DEF', value: gameStats.def },
          { label: 'AP', value: gameStats.ap },
          { label: 'SPD', value: gameStats.spd },
          { label: 'CRIT', value: gameStats.crit },
        ].map((s) => (
          <div key={s.label} style={statBlockStyle}>
            <div style={statLabelStyle}>{s.label}</div>
            <div style={statValueStyle}>{s.value}</div>
          </div>
        ))}
      </div>

      <h3 style={sectionTitleStyle}>Abilities</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {champion.spells.map((spell) => (
          <div key={spell.id} style={abilityCardStyle}>
            <div style={{ color: '#e6edf3', fontWeight: 600, fontSize: 13 }}>{spell.name}</div>
            <div
              style={{ color: '#8b949e', fontSize: 11, marginTop: 4 }}
              dangerouslySetInnerHTML={{ __html: spell.description }}
            />
          </div>
        ))}
        <div style={abilityCardStyle}>
          <div style={{ color: '#e6edf3', fontWeight: 600, fontSize: 13 }}>
            Passive: {champion.passive.name}
          </div>
          <div
            style={{ color: '#8b949e', fontSize: 11, marginTop: 4 }}
            dangerouslySetInnerHTML={{ __html: champion.passive.description }}
          />
        </div>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
  background: '#0d1117', color: '#e6edf3', fontFamily: 'sans-serif',
  display: 'flex', flexDirection: 'column',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px',
  background: '#161b22', borderBottom: '1px solid #1e2a3a', flexShrink: 0,
};
const backBtnStyle: React.CSSProperties = {
  padding: '6px 12px', background: '#21262d', color: '#e6edf3',
  border: '1px solid #30363d', borderRadius: 6, fontSize: 12, cursor: 'pointer',
};
const bodyStyle: React.CSSProperties = { flex: 1, display: 'flex', overflow: 'hidden' };
const sidebarStyle: React.CSSProperties = {
  width: 260, display: 'flex', flexDirection: 'column',
  borderRight: '1px solid #1e2a3a', flexShrink: 0,
};
const searchStyle: React.CSSProperties = {
  padding: '8px 12px', background: '#161b22', border: 'none',
  borderBottom: '1px solid #1e2a3a', color: '#e6edf3', fontSize: 13, outline: 'none',
};
const listStyle: React.CSSProperties = { flex: 1, overflow: 'auto' };
const listItemStyle: React.CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center',
  padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #1e2a3a',
};
const detailStyle: React.CSSProperties = { flex: 1, overflow: 'auto' };
const placeholderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
};
const sectionTitleStyle: React.CSSProperties = { color: '#c8aa6e', fontSize: 14, marginBottom: 8 };
const statsGridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16,
};
const statBlockStyle: React.CSSProperties = {
  background: '#0d1117', borderRadius: 6, padding: 8, textAlign: 'center',
};
const statLabelStyle: React.CSSProperties = { color: '#8b949e', fontSize: 10, textTransform: 'uppercase' as const };
const statValueStyle: React.CSSProperties = { color: '#e6edf3', fontSize: 18, fontWeight: 700 };
const abilityCardStyle: React.CSSProperties = { background: '#0d1117', borderRadius: 6, padding: 10 };
const tagStyle: React.CSSProperties = {
  background: '#21262d', color: '#e6edf3', padding: '2px 8px', borderRadius: 4, fontSize: 11,
};

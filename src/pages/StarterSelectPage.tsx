import { useMemo } from 'react';
import { Champion } from '@/types/champion';
import { useGameStore } from '@/stores/gameStore';
import { useRunStore } from '@/stores/runStore';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { championDB } from '@/data/championDatabase';
import { gameStatsAtLevel } from '@/utils/statConversion';
import { DDRAGON_CONFIG } from '@/config/ddragon';
import '@/styles/starter-select.css';
import { playUIClick } from '@/audio';

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function StarterSelectPage() {
  const choices = useMemo(() => pickRandom(championDB.getAll(), 6), []);
  const { selectedStarterId, setSelectedStarterId } = useGameStore();
  const startRun = useRunStore((s) => s.startRun);
  const navigate = useAppNavigate();

  function handleConfirm() {
    playUIClick();
    if (!selectedStarterId) return;
    startRun([selectedStarterId]);
    navigate(ROUTES.RUN);
  }

  function handleBack() {
    playUIClick();
    navigate(ROUTES.MENU);
  }

  return (
    <div className="starter-select">
      <div className="starter-select__header">
        <button className="starter-select__back" onClick={handleBack}>
          ← Back
        </button>
        <h1 className="starter-select__title">Choisis ton Champion</h1>
      </div>
      <p className="starter-select__subtitle">Sélectionne ton starter pour la run</p>

      <div className="starter-select__grid">
        {choices.map((champ) => (
          <ChampionCard
            key={champ.id}
            champion={champ}
            selected={selectedStarterId === champ.id}
            onSelect={() => setSelectedStarterId(champ.id)}
          />
        ))}
      </div>

      <div className="starter-select__actions">
        <button
          className="starter-select__confirm"
          disabled={!selectedStarterId}
          onClick={handleConfirm}
        >
          Confirmer le choix
        </button>
      </div>
    </div>
  );
}

function ChampionCard({
  champion,
  selected,
  onSelect,
}: {
  champion: Champion;
  selected: boolean;
  onSelect: () => void;
}) {
  const gameStats = gameStatsAtLevel(champion.stats, 1);
  const splashUrl = DDRAGON_CONFIG.championSplashUrl(champion.id);

  const statRows: { label: string; value: number }[] = [
    { label: 'HP', value: gameStats.hp },
    { label: 'ATK', value: gameStats.atk },
    { label: 'DEF', value: gameStats.def },
    { label: 'AP', value: gameStats.ap },
    { label: 'SPD', value: gameStats.spd },
    { label: 'CRIT', value: gameStats.crit },
  ];

  return (
    <div
      className={`champion-card${selected ? ' champion-card--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="champion-card__splash-wrapper">
        <img
          className="champion-card__splash"
          src={splashUrl}
          alt={champion.name}
          loading="lazy"
        />
        <div className="champion-card__splash-overlay" />
      </div>

      <div className="champion-card__info">
        <div className="champion-card__name">{champion.name}</div>
        <div className="champion-card__title-text">{champion.title}</div>

        <div className="champion-card__tags">
          {champion.tags.map((tag) => (
            <span key={tag} className={`champion-card__tag champion-card__tag--${tag}`}>
              {tag}
            </span>
          ))}
        </div>

        <div className="champion-card__stats">
          {statRows.map((row) => (
            <div key={row.label} className="champion-card__stat">
              <span className="champion-card__stat-label">{row.label}</span>
              <span className="champion-card__stat-value">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface HardcodedCopyFixtureProps {
  playerName: string;
  ready: boolean;
  score: number;
}

export const message = 'Impossible de rejoindre la partie';

export const cardCopy = {
  label: 'Choisir ce champion',
  title: 'Champion details',
  subtitle: 'Maîtrise actuelle',
  description: 'Build a stronger team',
  notice: 'Récompense disponible',
  hint: 'Press Enter to continue',
  tooltip: 'Afficher les statistiques',
  statusMessage: 'Loading your run',
};

export function HardcodedCopyFixture({ playerName, ready, score }: HardcodedCopyFixtureProps) {
  const title = 'Préparer la partie';
  const technicalId = 'run-card-42';
  const route = '/runs/active';
  const className = 'rounded-xl text-white';
  const status = ready ? 'ready' : 'waiting';
  const modeMatches = status === 'ready';

  return (
    <section
      id={technicalId}
      data-route={route}
      data-status={status}
      data-mode-matches={modeMatches}
      className={className}
      aria-label="Écran de préparation"
      title={title}
    >
      Bienvenue dans la Faille
      <img alt="Portrait du champion sélectionné" src="/champion.png" />
      <input placeholder="Search champions" aria-description="Saisissez un nom de champion" />
      <output aria-live="polite" aria-valuetext="Progression à cinquante pour cent">
        {ready ? 'Continuer' : 'Try again'}
      </output>
      <p>{`Bonjour ${playerName}`}</p>
      <p>{'Score final: ' + score}</p>
      <span>{ready && 'Votre équipe est prête'}</span>
      <span>ARAM</span>
      <span>{'XP'}</span>
    </section>
  );
}

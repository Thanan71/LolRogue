declare function t(key: string, values?: Record<string, unknown>): string;

declare const fr: {
  actions: { continue: string };
  common: { loading: string; search: string };
  preparation: { description: string; title: string };
};

declare const copy: {
  championPortrait: string;
  score: string;
};

export interface LocalizedCopyFixtureProps {
  locale: string;
  playerName: string;
  ready: boolean;
  score: number;
}

export function LocalizedCopyFixture({
  locale,
  playerName,
  ready,
  score,
}: LocalizedCopyFixtureProps) {
  const message = t('run.joinError');
  const title = fr.preparation.title;
  const route = '/runs/active';
  const className = 'rounded-xl text-white';
  const isEnglish = locale === 'en';
  const content = {
    label: t('champion.choose'),
    statusMessage: ready ? fr.actions.continue : fr.common.loading,
  };

  return (
    <section
      id="localized-run-card"
      data-route={route}
      data-locale-ready={isEnglish}
      className={className}
      aria-label={title}
      aria-describedby="localized-run-description"
      title={ready ? t('run.readyTitle') : fr.preparation.title}
    >
      {message}
      <img alt={copy.championPortrait} src="/champion.png" />
      <input placeholder={fr.common.search} />
      <p id="localized-run-description">{fr.preparation.description}</p>
      <p>{ready ? t('actions.continue') : fr.common.loading}</p>
      <p>{`${t('welcome.player', { playerName })}`}</p>
      <p>{t('score.label') + String(score)}</p>
      <span>{content.label}</span>
      <span>{content.statusMessage}</span>
      <span>ARAM</span>
      <span>{'XP'}</span>
      <style>{'.localized-run-card { color: red; }'}</style>
    </section>
  );
}

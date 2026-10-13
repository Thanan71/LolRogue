import { getChampionEconomyContent } from '@/i18n/championEconomyContent';
import { localizeChampion } from '@/i18n/content';
import { runPreparationCopy } from '@/i18n/runPreparationContent';
import { DatabaseChampionDetail } from '@/pages/database/DatabaseChampionDetail';
import { Dialog } from '@/shared/ui/Feedback';
import { useStarterSelection } from '../hooks/useStarterSelection';
import { StarterCatalog } from './StarterCatalog';
import { StarterSelectionFooter } from './StarterSelectionFooter';
import { StarterTeamPanel } from './StarterTeamPanel';
import '@/styles/starter-select.css';
import '@/styles/database.css';

const starterCopy = runPreparationCopy.starter;
const economyCopy = getChampionEconomyContent();

export function StarterSelectScreen() {
  const controller = useStarterSelection();
  const {
    isDaily,
    isGuest,
    resumableStart,
    starterSlotLimit,
    handleBack,
    previewChampion,
    setPreviewChampion,
  } = controller;

  return (
    <main className="starter-select">
      <header className="starter-select__header">
        <button type="button" className="starter-select__back" onClick={handleBack}>
          {starterCopy.back}
        </button>
        <h1 className="starter-select__title">
          {isDaily ? starterCopy.dailyTitle : starterCopy.normalTitle}
        </h1>
        <span className="starter-select__header-spacer" aria-hidden="true" />
      </header>
      <p className="starter-select__subtitle">
        {resumableStart
          ? starterCopy.resumableSubtitle
          : isDaily
            ? starterCopy.dailySubtitle
            : starterCopy.normalSubtitle(starterSlotLimit, isGuest)}
      </p>

      <div className="starter-select__journey" aria-label={starterCopy.journeyLabel}>
        <span className="starter-select__journey-step starter-select__journey-step--active">
          <b>01</b> {starterCopy.journeyTeam}
        </span>
        <span className="starter-select__journey-line" aria-hidden="true" />
        <span className="starter-select__journey-step">
          <b>02</b> {starterCopy.journeyRunes}
        </span>
        <span className="starter-select__journey-line" aria-hidden="true" />
        <span className="starter-select__journey-step">
          <b>03</b> {starterCopy.journeyStart}
        </span>
      </div>

      <div className="starter-select__workspace">
        <StarterTeamPanel controller={controller} />
        <StarterCatalog controller={controller} />
      </div>
      <StarterSelectionFooter controller={controller} />
      <Dialog
        open={previewChampion !== null}
        title={previewChampion ? economyCopy.details(localizeChampion(previewChampion).name) : ''}
        onClose={() => setPreviewChampion(null)}
        actions={
          <button type="button" onClick={() => setPreviewChampion(null)}>
            {economyCopy.close}
          </button>
        }
      >
        {previewChampion && (
          <div className="champion-economy__preview">
            <DatabaseChampionDetail champion={previewChampion} />
          </div>
        )}
      </Dialog>
    </main>
  );
}

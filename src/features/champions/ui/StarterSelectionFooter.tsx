import { localizeChampion } from '@/i18n/content';
import { fr } from '@/i18n/fr';
import { runPreparationCopy } from '@/i18n/runPreparationContent';
import type { StarterSelectionController } from '../hooks/useStarterSelection';

const starterCopy = runPreparationCopy.starter;

export function StarterSelectionFooter({ controller }: { controller: StarterSelectionController }) {
  const {
    error,
    selectedStarters,
    starterSlotLimit,
    selectedStarterIds,
    isStarting,
    isLoadingDaily,
    economyNotLoaded,
    handleConfirm,
    resumableStart,
    dailyLoadFailed,
    retryDaily,
  } = controller;
  return (
    <div className="starter-select__action-footer">
      {error && (
        <p className="starter-select__error" role="alert">
          {error}
        </p>
      )}
      {dailyLoadFailed && (
        <button
          className="starter-select__back"
          type="button"
          disabled={isLoadingDaily}
          onClick={retryDaily}
        >
          {fr.common.retry}
        </button>
      )}
      <p className="starter-select__selection-status" aria-live="polite">
        {selectedStarters.length > 0
          ? starterCopy.selectedTeam(
              selectedStarters.map((champion) => localizeChampion(champion).name),
              selectedStarters.length,
              starterSlotLimit,
            )
          : starterCopy.emptySelection}
      </p>
      <button
        className="starter-select__confirm"
        type="button"
        disabled={
          selectedStarterIds.length !== starterSlotLimit ||
          isStarting ||
          isLoadingDaily ||
          economyNotLoaded
        }
        onClick={() => void handleConfirm()}
      >
        {isLoadingDaily
          ? starterCopy.loadingDaily
          : isStarting
            ? starterCopy.verifying
            : resumableStart
              ? starterCopy.resumeVerifiedRun
              : starterCopy.confirmChoice}
      </button>
    </div>
  );
}

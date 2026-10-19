import { ChampionEconomyPanel } from '@/components/ChampionEconomy';
import { getKeystoneRunes } from '@/data/items/runeDatabase';
import { getChampionEconomyContent } from '@/i18n/championEconomyContent';
import { localizeChampion } from '@/i18n/content';
import { formatChampionTag, formatNumber } from '@/i18n/format';
import { runeDescription, runeNameFr } from '@/i18n/runes.fr';
import { runPreparationCopy } from '@/i18n/runPreparationContent';
import type { StarterSelectionController } from '../hooks/useStarterSelection';

const starterCopy = runPreparationCopy.starter;

const economyCopy = getChampionEconomyContent();

export function StarterTeamPanel({ controller }: { controller: StarterSelectionController }) {
  const {
    starterSlotLimit,
    selectedStarterIds,
    selectedStarters,
    teamSlotsRef,
    resumableStart,
    removeStarter,
    selectedRuneIds,
    setSelectedRuneIds,
    economyNotLoaded,
    economy,
    isDaily,
  } = controller;
  return (
    <aside
      className="starter-select__loadout starter-select__actions"
      aria-labelledby="starter-team-title"
    >
      <div className="starter-select__team-heading">
        <h2 id="starter-team-title">{starterCopy.teamTitle}</h2>
        <span>
          {formatNumber(selectedStarterIds.length)}/{formatNumber(starterSlotLimit)}
        </span>
      </div>
      <ol className="starter-select__team-slots" ref={teamSlotsRef}>
        {Array.from({ length: starterSlotLimit }, (_, index) => {
          const champion = selectedStarters[index];
          return (
            <li key={index} className={champion ? 'is-filled' : ''}>
              {champion ? (
                <>
                  <img src={champion.iconUrl} alt="" width={44} height={44} />
                  <span>
                    <strong>{localizeChampion(champion).name}</strong>
                    <small>{champion.tags.map(formatChampionTag).join(' · ')}</small>
                  </span>
                  {!resumableStart && (
                    <button
                      type="button"
                      aria-label={starterCopy.removeChampion(localizeChampion(champion).name)}
                      onClick={() => removeStarter(champion.id, index)}
                    >
                      ×
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="starter-select__slot-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{starterCopy.emptySlot(index + 1)}</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <details className="starter-select__rune-disclosure">
        <summary>
          <span>{starterCopy.optionalRunes}</span>
          <span>{starterCopy.selectedRunes(selectedRuneIds.length, 3)}</span>
        </summary>
        <fieldset className="starter-select__runes" aria-describedby="starter-runes-help">
          <legend className="starter-select__runes-title">{starterCopy.chooseRunes}</legend>
          <div className="starter-select__runes-heading">
            <p id="starter-runes-help">{starterCopy.runesHelp}</p>
            <output className="starter-select__runes-count" aria-live="polite">
              {formatNumber(selectedRuneIds.length)}/3
            </output>
          </div>
          <div className="starter-select__rune-grid">
            {getKeystoneRunes().map((rune) => {
              const selected = selectedRuneIds.includes(rune.id);
              const disabled =
                resumableStart !== null || (!selected && selectedRuneIds.length >= 3);

              return (
                <label
                  key={rune.id}
                  className={`starter-rune${selected ? ' starter-rune--selected' : ''}${
                    disabled ? ' starter-rune--disabled' : ''
                  }`}
                >
                  <input
                    className="starter-rune__input"
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
                    onChange={() =>
                      setSelectedRuneIds((current) =>
                        current.includes(rune.id)
                          ? current.filter((id) => id !== rune.id)
                          : [...current, rune.id],
                      )
                    }
                  />
                  <span className="starter-rune__indicator" aria-hidden="true" />
                  <span
                    className={`starter-rune__icon starter-rune__icon--${rune.path}`}
                    aria-hidden="true"
                  >
                    <span className="starter-rune__icon-fallback">✦</span>
                    <img
                      src={rune.iconUrl}
                      alt=""
                      width={44}
                      height={44}
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  </span>
                  <span className="starter-rune__content">
                    <span className="starter-rune__name">{runeNameFr(rune.id, rune.name)}</span>
                    <span className="starter-rune__description">
                      {starterCopy.effectBeforeSelection}:{' '}
                      {runeDescription(rune.id, rune.description)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </details>
      <details className="starter-select__economy-disclosure" open={economyNotLoaded}>
        <summary>{starterCopy.economyDetails}</summary>
        <ChampionEconomyPanel
          snapshot={economy.snapshot}
          status={economy.status}
          serverNow={economy.serverNow}
          onRefresh={economy.refresh}
        />
      </details>
      {economy.snapshot?.enabled && isDaily && (
        <p className="champion-economy__daily">{economyCopy.dailyExemption}</p>
      )}
    </aside>
  );
}

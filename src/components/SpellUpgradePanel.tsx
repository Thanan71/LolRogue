import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { riotSpellIconUrl } from '@/config/riotSpellAssets';
import { championDB } from '@/data/championDatabase';
import type { SpellSlot } from '@/game/ChampionInstance';
import { buildSpellImpactPreview } from '@/game/presentation/spellPreview';
import { buildRunPlayerTeam } from '@/game/run/runCombatant';
import { canUpgradeSpell, getSpellRankCap, SPELL_SLOTS } from '@/game/run/spellUpgradeRules';
import { fr } from '@/i18n/fr';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import type { TeamMember } from '@/types/run';
import type { CalculatedStats } from '@/utils/champion';
import { calculateFullStats } from '@/utils/statCalculator';
import '@/styles/spell-upgrade.css';

export interface SpellUpgradePanelProps {
  championId: string;
  member: TeamMember;
  onUpgrade: (slot: SpellSlot) => boolean;
  onResult?: (feedback: SpellUpgradeFeedback) => void;
  autoFocus?: boolean;
  /** Optional run-aware stats, mainly useful when the parent already calculated them. */
  stats?: Pick<CalculatedStats, 'attackDamage' | 'abilityPower'>;
}

export interface SpellUpgradeFeedback {
  tone: 'success' | 'error';
  message: string;
}

function valueAtRank(values: readonly number[], rank: number): number | undefined {
  return values[rank - 1] ?? values[values.length - 1];
}

function formatValue(value: number | undefined): string {
  return Number.isFinite(value) ? String(value) : '—';
}

function fallbackInitials(name: string): string {
  const letters = Array.from(name).filter((letter) => /[\p{L}\p{N}]/u.test(letter));
  return letters.slice(0, 2).join('').toLocaleUpperCase('fr') || '?';
}

function disabledReason(rank: number, maximumRank: number): string {
  return rank >= maximumRank ? fr.run.maximumRank : fr.run.levelRequired;
}

function firstAvailableSlot(member: TeamMember): SpellSlot {
  return SPELL_SLOTS.find((slot) => canUpgradeSpell(member, slot)) ?? 'Q';
}

function ImpactList({
  label,
  impacts,
}: {
  label: string;
  impacts: ReturnType<typeof buildSpellImpactPreview>;
}) {
  return (
    <section className="spell-upgrade__impact-rank" aria-label={label}>
      <h4>{label}</h4>
      <div className="spell-upgrade__impacts">
        {impacts.length > 0 ? (
          impacts.map((impact) => (
            <span
              key={impact.id}
              className={`spell-upgrade__impact spell-upgrade__impact--${impact.tone}`}
            >
              <span>{impact.label}</span>
              <strong>
                {impact.amount !== undefined ? impact.amount : null}
                {impact.amount !== undefined && impact.suffix ? ' · ' : null}
                {impact.suffix}
              </strong>
            </span>
          ))
        ) : (
          <span className="spell-upgrade__impact spell-upgrade__impact--utility">
            <span>Effet utilitaire</span>
          </span>
        )}
      </div>
    </section>
  );
}

export function SpellUpgradePanel({
  championId,
  member,
  onUpgrade,
  onResult,
  autoFocus = false,
  stats,
}: SpellUpgradePanelProps) {
  const panelId = useId();
  const champion = championDB.getById(championId);
  const normalizedChampionId = championId.toLowerCase();
  const [selectedSlot, setSelectedSlot] = useState<SpellSlot>(() => firstAvailableSlot(member));
  const [localFeedback, setLocalFeedback] = useState<SpellUpgradeFeedback | null>(null);
  const spellButtonRefs = useRef<Partial<Record<SpellSlot, HTMLButtonElement | null>>>({});
  const inventory = useRunStore((state) => state.inventory);
  const augmentIds = useRunStore((state) => state.augmentIds);
  const currentBiomeIndex = useRunStore((state) => state.currentBiomeIndex);
  const hasAuthorityAttempt = useRunStore((state) => state.authorityAttempt !== null);
  const authorityEnhancements = useRunStore(
    (state) =>
      state.authorityAttempt?.enhancementSnapshot[championId] ??
      state.authorityAttempt?.enhancementSnapshot[normalizedChampionId],
  );
  const authorityMasteryLevel = useRunStore(
    (state) =>
      state.authorityAttempt?.masterySnapshot?.[championId] ??
      state.authorityAttempt?.masterySnapshot?.[normalizedChampionId],
  );
  const localEnhancements = useEnhancementStore(
    (state) =>
      state.enhancements[championId]?.unlockedNodes ??
      state.enhancements[normalizedChampionId]?.unlockedNodes,
  );
  const localMasteryLevel = useMasteryStore(
    (state) =>
      state.champions[championId]?.level ?? state.champions[normalizedChampionId]?.level ?? 0,
  );
  const level = member.level ?? 1;
  const championName = champion?.name ?? championId;

  useEffect(() => {
    const firstSlot = firstAvailableSlot(member);
    setSelectedSlot(firstSlot);
    setLocalFeedback(null);
    if (!autoFocus) return;

    const focusChoice = () => spellButtonRefs.current[firstSlot]?.focus();
    focusChoice();

    // The contextual tutorial owns focus while its modal is open. If it opens
    // during this effect, claim focus only after that modal has restored its trigger.
    let tutorialWasOpen = document.body.classList.contains('tutorial-open');
    const observer = new MutationObserver(() => {
      const tutorialIsOpen = document.body.classList.contains('tutorial-open');
      if (tutorialWasOpen && !tutorialIsOpen) focusChoice();
      tutorialWasOpen = tutorialIsOpen;
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [autoFocus, championId, member]);

  const previewStats = useMemo(() => {
    if (stats) return stats;
    const runChampion = buildRunPlayerTeam([member], {
      inventory,
      augmentIds,
      currentBiomeIndex,
      getUnlockedEnhancements: () =>
        hasAuthorityAttempt ? (authorityEnhancements ?? {}) : (localEnhancements ?? {}),
      getMasteryLevel: () =>
        hasAuthorityAttempt ? (authorityMasteryLevel ?? 0) : localMasteryLevel,
    })[0];
    return (
      runChampion?.getEnhancedStats() ??
      calculateFullStats(
        champion,
        level,
        undefined,
        inventory,
        championId,
        0,
        member.statBoosts,
        member.statMultiplier,
      )
    );
  }, [
    stats,
    member,
    inventory,
    augmentIds,
    currentBiomeIndex,
    hasAuthorityAttempt,
    authorityEnhancements,
    authorityMasteryLevel,
    localEnhancements,
    localMasteryLevel,
    champion,
    level,
    championId,
  ]);

  const selectedIndex = SPELL_SLOTS.indexOf(selectedSlot);
  const selectedSpell = champion?.spells[selectedIndex];
  const selectedRank = member.spellRanks?.[selectedSlot] ?? 1;
  const selectedMaximumRank = selectedSpell?.maxRank ?? 0;
  const selectedCap = getSpellRankCap(championId, selectedSlot, level);
  const selectedCanUpgrade = Boolean(selectedSpell && canUpgradeSpell(member, selectedSlot));
  const selectedIsMaximum = selectedMaximumRank > 0 && selectedRank >= selectedMaximumRank;
  const selectedState = selectedCanUpgrade ? 'available' : selectedIsMaximum ? 'maximum' : 'locked';
  const selectedReason = disabledReason(selectedRank, selectedMaximumRank);
  const selectedNextRank = selectedCanUpgrade
    ? Math.min(selectedRank + 1, selectedMaximumRank)
    : selectedRank;
  const selectedImpacts = selectedSpell
    ? buildSpellImpactPreview(selectedSpell, selectedRank, previewStats)
    : [];
  const selectedNextImpacts =
    selectedSpell && selectedCanUpgrade
      ? buildSpellImpactPreview(selectedSpell, selectedNextRank, previewStats)
      : [];
  const detailId = `${panelId}-detail`;
  const detailTitleId = `${panelId}-detail-title`;
  const confirmReasonId = `${panelId}-confirm-reason`;

  return (
    <section className="spell-upgrade" aria-labelledby={`${panelId}-title`}>
      <header className="spell-upgrade__header">
        <span className="spell-upgrade__portrait" aria-hidden="true">
          <span>{fallbackInitials(championName)}</span>
          {champion?.iconUrl ? (
            <img
              src={champion.iconUrl}
              alt=""
              width={52}
              height={52}
              decoding="async"
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : null}
        </span>
        <div className="spell-upgrade__heading-copy">
          <span className="spell-upgrade__eyebrow">Point de compétence disponible</span>
          <h2 id={`${panelId}-title`}>{championName}</h2>
          <p>Niveau {level} · Choisissez un sort à améliorer</p>
        </div>
      </header>

      <div className="spell-upgrade__grid" aria-label={`Compétences de ${championName}`}>
        {SPELL_SLOTS.map((slot, index) => {
          const spell = champion?.spells[index];
          const rank = member.spellRanks?.[slot] ?? 1;
          const maximumRank = spell?.maxRank ?? 0;
          const cap = getSpellRankCap(championId, slot, level);
          const upgradeAvailable = Boolean(spell && canUpgradeSpell(member, slot));
          const isMaximum = maximumRank > 0 && rank >= maximumRank;
          const state = upgradeAvailable ? 'available' : isMaximum ? 'maximum' : 'locked';
          const isSelected = selectedSlot === slot;
          const iconUrl = spell ? riotSpellIconUrl(championId, spell.image) : undefined;
          const stateLabel = upgradeAvailable ? 'Disponible' : isMaximum ? 'Maximum' : 'Verrouillé';
          const selectSlot = () => {
            setSelectedSlot(slot);
            setLocalFeedback(null);
          };

          return (
            <button
              type="button"
              key={slot}
              ref={(element) => {
                spellButtonRefs.current[slot] = element;
              }}
              className={`spell-upgrade__spell spell-upgrade__spell--${state}${isSelected ? ' spell-upgrade__spell--selected' : ''}`}
              aria-pressed={isSelected}
              aria-controls={detailId}
              onMouseEnter={selectSlot}
              onFocus={selectSlot}
              onPointerDown={selectSlot}
              onClick={selectSlot}
            >
              <span className="spell-upgrade__icon" aria-hidden="true">
                <span>{slot}</span>
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt=""
                    width={48}
                    height={48}
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                ) : null}
                <kbd>{slot}</kbd>
              </span>
              <span className="spell-upgrade__name">{spell?.name ?? `Sort ${slot}`}</span>
              <span className="spell-upgrade__rank">
                Rang <strong>{rank}</strong>/{maximumRank || cap || '—'}
              </span>
              <span className={`spell-upgrade__card-status spell-upgrade__card-status--${state}`}>
                {stateLabel}
              </span>
            </button>
          );
        })}
      </div>

      <section
        id={detailId}
        className={`spell-upgrade__detail spell-upgrade__detail--${selectedState}`}
        aria-labelledby={detailTitleId}
        aria-live="polite"
      >
        <header className="spell-upgrade__detail-header">
          <div>
            <span className="spell-upgrade__eyebrow">Compétence {selectedSlot}</span>
            <h3 id={detailTitleId}>{selectedSpell?.name ?? `Sort ${selectedSlot}`}</h3>
          </div>
          <span
            className={`spell-upgrade__detail-state spell-upgrade__detail-state--${selectedState}`}
          >
            {selectedCanUpgrade ? 'Améliorable' : selectedIsMaximum ? 'Rang maximum' : 'Verrouillé'}
          </span>
        </header>

        <dl className="spell-upgrade__metrics">
          <div>
            <dt>Rang</dt>
            <dd>
              {selectedRank}
              {selectedCanUpgrade ? ` → ${selectedNextRank}` : ''}/
              {selectedMaximumRank || selectedCap || '—'}
            </dd>
          </div>
          <div>
            <dt>PM</dt>
            <dd>
              {selectedSpell ? formatValue(valueAtRank(selectedSpell.cost, selectedRank)) : '—'}
              {selectedSpell && selectedCanUpgrade
                ? ` → ${formatValue(valueAtRank(selectedSpell.cost, selectedNextRank))}`
                : ''}
            </dd>
          </div>
          <div>
            <dt>Recharge</dt>
            <dd>
              {selectedSpell
                ? formatValue(valueAtRank(selectedSpell.cooldownTurns, selectedRank))
                : '—'}{' '}
              tours
              {selectedSpell && selectedCanUpgrade
                ? ` → ${formatValue(valueAtRank(selectedSpell.cooldownTurns, selectedNextRank))} tours`
                : ''}
            </dd>
          </div>
        </dl>

        <div className="spell-upgrade__impact-comparison" aria-label="Effets estimés">
          <ImpactList label={`Rang actuel · ${selectedRank}`} impacts={selectedImpacts} />
          {selectedCanUpgrade ? (
            <ImpactList
              label={`Prochain rang · ${selectedNextRank}`}
              impacts={selectedNextImpacts}
            />
          ) : null}
        </div>

        <div className="spell-upgrade__confirmation">
          <p
            id={confirmReasonId}
            className={`spell-upgrade__status spell-upgrade__status--${selectedState}`}
          >
            {selectedCanUpgrade ? fr.run.upgradeConsequence : selectedReason}
          </p>
          <button
            type="button"
            className="spell-upgrade__confirm"
            disabled={!selectedCanUpgrade}
            aria-describedby={confirmReasonId}
            onClick={() => {
              if (!selectedCanUpgrade) return;
              const succeeded = onUpgrade(selectedSlot);
              const feedback: SpellUpgradeFeedback = succeeded
                ? {
                    tone: 'success',
                    message: `${selectedSlot} de ${championName} amélioré au rang ${selectedNextRank}.`,
                  }
                : {
                    tone: 'error',
                    message: `Impossible d’améliorer ${selectedSlot} de ${championName}. Réessayez.`,
                  };
              if (onResult) onResult(feedback);
              else setLocalFeedback(feedback);
            }}
          >
            {selectedCanUpgrade
              ? `Améliorer ${selectedSlot} · rang ${selectedRank} → ${selectedNextRank}`
              : selectedIsMaximum
                ? `${selectedSlot} · rang maximum`
                : `${selectedSlot} · niveau requis`}
          </button>
        </div>
        {localFeedback ? (
          <p
            className={`spell-upgrade__feedback spell-upgrade__feedback--${localFeedback.tone}`}
            role={localFeedback.tone === 'error' ? 'alert' : 'status'}
          >
            {localFeedback.message}
          </p>
        ) : null}
      </section>

      <p className="spell-upgrade__footnote">
        Dégâts estimés avec les statistiques actuelles, avant les défenses de la cible.
      </p>
    </section>
  );
}

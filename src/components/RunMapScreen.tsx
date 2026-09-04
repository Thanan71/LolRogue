import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { playUIClick } from '@/audio';
import { ROUTES } from '@/config/routes';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { getRuneDefinition } from '@/data/items/runeDatabase';
import { toEncounterNodeType } from '@/game/map/mapProgression';
import { findNode } from '@/game/map/mapUtils';
import { NodeType } from '@/game/map/types';
import { finalizeCombatRun } from '@/game/run/runFinalization';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { augmentDescription, augmentName } from '@/i18n/content';
import { fr } from '@/i18n/fr';
import { runeNameFr } from '@/i18n/runes.fr';
import { useRunStore } from '@/stores/runStore';
import '@/styles/run-map.css';
import type { Biome } from '@/types/run';
import { ContextTutorial } from './ContextTutorial';
import { RunInventoryPanel } from './RunInventoryPanel';
import { NODE_LABELS, NODE_NAMES, RunMapCanvas } from './RunMapCanvas';
import { RunTeamStatsPanel } from './RunTeamStatsPanel';
import { buildRunMapViewModel } from './runMapViewModel';
import { type SpellUpgradeFeedback, SpellUpgradePanel } from './SpellUpgradePanel';

const BIOME_NAMES: Record<Biome, string> = {
  top_lane: 'Voie du haut',
  jungle: 'Jungle',
  mid_lane: 'Voie du milieu',
  bot_lane: 'Voie du bas',
  river: 'Rivière',
  base: 'Base ennemie',
};

export function RunMapScreen() {
  const reducedMotion = useReducedMotion();
  const biomeMaps = useRunStore((s) => s.biomeMaps);
  const currentBiomeIndex = useRunStore((s) => s.currentBiomeIndex);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const frontierNodeIds = useRunStore((s) => s.frontierNodeIds);
  const chosenPathNodeIds = useRunStore((s) => s.chosenPathNodeIds);
  const completedNodeIds = useRunStore((s) => s.completedNodeIds);
  const team = useRunStore((s) => s.team);
  const inventory = useRunStore((s) => s.inventory);
  const gold = useRunStore((s) => s.gold);
  const runLevel = useRunStore((s) => s.runLevel);
  const currentWave = useRunStore((s) => s.currentWave);
  const currentBiome = useRunStore((s) => s.currentBiome);
  const generateRunMap = useRunStore((s) => s.generateRunMap);
  const moveToNode = useRunStore((s) => s.moveToNode);
  const startEncounter = useRunStore((s) => s.startEncounter);
  const advanceToNextBiome = useRunStore((s) => s.advanceToNextBiome);
  const completeCurrentNode = useRunStore((s) => s.completeCurrentNode);
  const pendingAugmentIds = useRunStore((s) => s.pendingAugmentIds);
  const augmentIds = useRunStore((s) => s.augmentIds);
  const runeIds = useRunStore((s) => s.runeIds);
  const chooseAugment = useRunStore((s) => s.chooseAugment);
  const lastCombatRewards = useRunStore((s) => s.lastCombatRewards);
  const setLastCombatRewards = useRunStore((s) => s.setLastCombatRewards);
  const pendingSpellUpgradeChampionIds = useRunStore((s) => s.pendingSpellUpgradeChampionIds);
  const upgradeSpell = useRunStore((s) => s.upgradeSpell);

  const navigate = useNavigate();

  const { currentMap, hasPendingChoice, pendingUpgradeChampionId, pendingUpgradeMember } =
    buildRunMapViewModel({
      biomeMaps,
      currentBiomeIndex,
      pendingAugmentIds,
      pendingSpellUpgradeChampionIds,
      team,
    });
  const [spellUpgradeFeedback, setSpellUpgradeFeedback] = useState<SpellUpgradeFeedback | null>(
    null,
  );
  const firstAugmentChoiceRef = useRef<HTMLButtonElement>(null);
  const mapFocusRef = useRef<HTMLDivElement>(null);
  const previousHasPendingChoiceRef = useRef(hasPendingChoice);
  const previousSpellUpgradeCountRef = useRef(pendingSpellUpgradeChampionIds.length);
  const firstPendingAugmentId = pendingAugmentIds[0];

  useEffect(() => {
    if (!firstPendingAugmentId) return;
    const focusChoice = () => firstAugmentChoiceRef.current?.focus();
    focusChoice();
    let tutorialWasOpen = document.body.classList.contains('tutorial-open');
    const observer = new MutationObserver(() => {
      const tutorialIsOpen = document.body.classList.contains('tutorial-open');
      if (tutorialWasOpen && !tutorialIsOpen) focusChoice();
      tutorialWasOpen = tutorialIsOpen;
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [firstPendingAugmentId]);

  useEffect(() => {
    const previousCount = previousSpellUpgradeCountRef.current;
    if (previousCount === 0 && pendingSpellUpgradeChampionIds.length > 0) {
      setSpellUpgradeFeedback(null);
    }
    previousSpellUpgradeCountRef.current = pendingSpellUpgradeChampionIds.length;
  }, [pendingSpellUpgradeChampionIds.length]);

  useEffect(() => {
    const previouslyBlocked = previousHasPendingChoiceRef.current;
    previousHasPendingChoiceRef.current = hasPendingChoice;
    if (!previouslyBlocked || hasPendingChoice) return;
    const frame = window.requestAnimationFrame(() => mapFocusRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [hasPendingChoice]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (hasPendingChoice) return;
      playUIClick();
      if (!moveToNode(nodeId)) return;

      // Look up the node to determine encounter type
      if (!currentMap) return;
      const node = findNode(currentMap, nodeId);
      if (!node) return;

      // Legacy structural Start nodes open their frontier but never choose a
      // branch on behalf of the player.
      if (node.type === NodeType.Start) {
        completeCurrentNode();
        return;
      }

      const encounterType = toEncounterNodeType(node);
      if (encounterType && (!node.encounter || !startEncounter(nodeId, encounterType))) {
        return;
      }

      // Navigate to the appropriate encounter page
      switch (node.type) {
        case NodeType.Combat:
        case NodeType.Elite:
        case NodeType.Boss:
          navigate(ROUTES.COMBAT);
          break;
        case NodeType.Shop:
          navigate(ROUTES.SHOP);
          break;
        case NodeType.Rest:
          navigate(ROUTES.REST);
          break;
        case NodeType.Event:
          navigate(ROUTES.EVENT);
          break;
        case NodeType.Recruit:
          navigate(ROUTES.RECRUIT);
          break;
        case NodeType.Treasure:
          // Navigate to treasure page to display rewards
          navigate(ROUTES.TREASURE);
          break;
        case NodeType.Exit:
          // Exit completion, level progression, augment offer and biome
          // transition are one atomic domain action.
          if (!advanceToNextBiome()) {
            // A configuration without another biome still ends in a persisted victory.
            void finalizeCombatRun('player', []).then((outcome) => {
              if (outcome.completed || outcome.queuedForRetry) {
                navigate(ROUTES.GAME_OVER, { state: { summary: outcome.summary } });
              }
            });
          }
          // If advanceToNextBiome succeeded, we're now on the new biome map
          // No additional navigation needed - the map will re-render with the new biome
          break;
        default:
          // Unknown or non-interactive node type
          break;
      }
    },
    [
      hasPendingChoice,
      moveToNode,
      startEncounter,
      navigate,
      currentMap,
      completeCurrentNode,
      advanceToNextBiome,
    ],
  );

  if (!currentMap) {
    return (
      <main className="run-map-page">
        <div className="run-map-empty">
          <h1>{fr.run.noActive}</h1>
          <p>{fr.run.noActiveDetail}</p>
          <button type="button" className="run-map-primary-button" onClick={() => generateRunMap()}>
            Générer la carte de la partie
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={`run-map-page run-map-page--${currentMap.biome}`}>
      <div className="run-map-layout">
        <div className="run-map-main">
          <header className="run-map-page-header">
            <div className="run-map-heading">
              <div>
                <span className="run-map-heading__eyebrow">
                  Expédition · Biome {currentBiomeIndex + 1} sur {biomeMaps.length}
                </span>
                <h1>Carte de la partie</h1>
                <p className="run-map-instruction">
                  {currentBiome ? BIOME_NAMES[currentBiome] : 'Territoire inconnu'} · Choisis ton
                  prochain nœud accessible
                </p>
              </div>
              <div className="run-map-biome-progress">
                <span>{currentBiome ? BIOME_NAMES[currentBiome] : 'Biome'}</span>
                <progress
                  max={Math.max(1, biomeMaps.length)}
                  value={Math.min(biomeMaps.length, currentBiomeIndex + 1)}
                  aria-label={`Progression des biomes : ${currentBiomeIndex + 1} sur ${biomeMaps.length}`}
                />
              </div>
            </div>
            <div className="run-map-header">
              <button
                type="button"
                className="run-map-menu-button"
                onClick={() => navigate(ROUTES.MENU)}
                title={fr.run.saveAndMenu}
              >
                ← Menu
              </button>
              <span className="run-map-header__stat run-map-header__stat--gold">
                <small>Trésor</small>
                <strong>{gold} or</strong>
              </span>
              <ContextTutorial
                storageKey="lolrogue:tutorial:map:v1"
                title="Comprendre la carte"
                buttonLabel="Tutoriel carte"
                steps={[
                  {
                    title: 'Choisir un chemin',
                    body: 'Active uniquement un nœud annoncé accessible. Ce choix ferme les autres branches de la même étape.',
                  },
                  {
                    title: 'Résoudre la rencontre',
                    body: 'Combat, boutique, repos, événement, recrutement et trésor doivent être terminés avant de poursuivre.',
                  },
                  {
                    title: 'Améliorer la run',
                    body: 'Lis les valeurs des objets, sorts et augments avant de confirmer. Les récompenses apparaissent au retour sur la carte.',
                  },
                  {
                    title: 'Terminer et sauvegarder',
                    body: 'La sortie ouvre le biome suivant. Le boss final de la Base termine la run ; la progression connectée est ensuite vérifiée par le serveur.',
                  },
                ]}
              />
              <span className="run-map-header__stat">
                <small>Vague</small>
                <strong>{currentWave}</strong>
              </span>
              <span className="run-map-header__stat">
                <small>Niveau</small>
                <strong>{runLevel}</strong>
              </span>
            </div>
          </header>
          <details className="run-map-guide run-map-panel run-map-panel--section">
            <summary>
              <span>Repères et équipement de la run</span>
              <small>Légende · Runes · Augments</small>
            </summary>
            <div className="run-map-guide__content">
              <aside className="run-map-legend" aria-label="Légende de la carte">
                <strong>Légende</strong>
                <div>
                  {Object.entries(NODE_LABELS).map(([type, label]) => (
                    <span
                      key={type}
                      className={`run-map-legend__item run-map-legend__item--${type}`}
                    >
                      <span aria-hidden="true">{label}</span> {NODE_NAMES[type] ?? type}
                    </span>
                  ))}
                </div>
              </aside>
              <div className="run-map-loadout">
                <div>
                  <strong>{fr.run.runes}</strong>
                  <span className="run-map-loadout__chips">
                    {runeIds.length > 0
                      ? runeIds.map((id) => (
                          <span key={id}>{runeNameFr(id, getRuneDefinition(id)?.name ?? id)}</span>
                        ))
                      : 'Aucune'}
                  </span>
                </div>
                <div>
                  <strong>{fr.run.augments}</strong>
                  <span className="run-map-loadout__chips">
                    {augmentIds.length > 0
                      ? augmentIds.map((id, index) => (
                          <span key={`${id}-${index}`}>
                            {augmentName(id, AUGMENT_DATABASE[id]?.name ?? id)}
                          </span>
                        ))
                      : 'Aucun'}
                  </span>
                </div>
              </div>
            </div>
          </details>
          {pendingAugmentIds.length > 0 && (
            <section
              className="run-map-choice-panel run-map-panel run-map-panel--section"
              aria-label="Choix d'augment"
            >
              <h2>{fr.run.biomeComplete}</h2>
              {pendingAugmentIds.map((id, index) => {
                const augment = AUGMENT_DATABASE[id];
                return (
                  <button
                    type="button"
                    key={id}
                    ref={index === 0 ? firstAugmentChoiceRef : undefined}
                    onClick={() => chooseAugment(id)}
                    className="run-map-choice-button"
                  >
                    <strong>{augmentName(id, augment?.name ?? id)}</strong> —{' '}
                    {fr.run.effectBeforeValidation}:{' '}
                    {augmentDescription(id, augment?.description ?? '')}
                  </button>
                );
              })}
            </section>
          )}
          {lastCombatRewards && (
            <section
              className="run-map-notice run-map-panel run-map-panel--section"
              aria-label="Récompenses du combat"
              aria-live="polite"
            >
              <strong>{fr.run.combatComplete} :</strong> +{lastCombatRewards.gold} {fr.common.gold},
              +{lastCombatRewards.xp} XP/champion (KO inclus)
              {lastCombatRewards.levelsGained > 0 &&
                `, ${lastCombatRewards.levelsGained} niveau(x) gagné(s)`}
              {lastCombatRewards.itemName && `, objet : ${lastCombatRewards.itemName}`}
              {lastCombatRewards.itemBlockedByCapacity && <p>{fr.run.combatItemLeft}</p>}
              <button
                type="button"
                className="run-map-inline-action"
                onClick={() => setLastCombatRewards(null)}
              >
                Fermer
              </button>
            </section>
          )}
          {pendingUpgradeChampionId && pendingUpgradeMember && (
            <section
              className="run-map-spell-upgrade run-map-panel--section"
              aria-label={fr.run.upgradeSpell}
            >
              <SpellUpgradePanel
                key={`${pendingUpgradeChampionId}-${pendingSpellUpgradeChampionIds.length}`}
                championId={pendingUpgradeChampionId}
                member={pendingUpgradeMember}
                onUpgrade={(slot) => upgradeSpell(pendingUpgradeChampionId, slot)}
                onResult={setSpellUpgradeFeedback}
                autoFocus={pendingAugmentIds.length === 0}
              />
            </section>
          )}
          {spellUpgradeFeedback ? (
            <p
              className={`spell-upgrade-feedback spell-upgrade-feedback--${spellUpgradeFeedback.tone}`}
              role={spellUpgradeFeedback.tone === 'error' ? 'alert' : 'status'}
            >
              {spellUpgradeFeedback.message}
            </p>
          ) : null}
          <div
            ref={mapFocusRef}
            className="run-map-focus-target"
            role="region"
            tabIndex={-1}
            aria-label="Carte des prochains nœuds"
            data-run-map-focus
          >
            <RunMapCanvas
              map={currentMap}
              currentNodeId={currentNodeId}
              frontierNodeIds={frontierNodeIds}
              chosenPathNodeIds={chosenPathNodeIds}
              completedNodeIds={completedNodeIds}
              hasPendingChoice={hasPendingChoice}
              reducedMotion={reducedMotion}
              onNodeClick={handleNodeClick}
            />
          </div>
        </div>
        <div className="run-map-sidebar">
          <RunTeamStatsPanel team={team} inventory={inventory} />
          <RunInventoryPanel inventory={inventory} team={team} />
        </div>
      </div>
    </main>
  );
}

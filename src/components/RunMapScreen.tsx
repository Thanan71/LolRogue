import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { playUIClick } from '@/audio';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data/championDatabase';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { toEncounterNodeType } from '@/game/map/mapProgression';
import { findNode } from '@/game/map/mapUtils';
import { NodeType } from '@/game/map/types';
import { finalizeCombatRun } from '@/game/run/runFinalization';
import { canUpgradeSpell, getSpellRankCap } from '@/game/run/spellUpgradeRules';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fr } from '@/i18n/fr';
import { useRunStore } from '@/stores/runStore';
import '@/styles/run-map.css';
import type { Biome } from '@/types/run';
import { ContextTutorial } from './ContextTutorial';
import { NODE_LABELS, NODE_NAMES, RunMapCanvas } from './RunMapCanvas';
import { InventoryPanel, TeamPanel } from './RunMapPanels';
import { buildRunMapViewModel } from './runMapViewModel';

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
  const pendingUpgradeChampion = pendingUpgradeChampionId
    ? championDB.getById(pendingUpgradeChampionId)
    : undefined;

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
    <main className="run-map-page">
      <div className="run-map-layout">
        <div className="run-map-main">
          <header className="run-map-page-header">
            <div className="run-map-heading">
              <h1>Carte de la partie</h1>
              <p className="run-map-instruction">Choisis ton prochain nœud accessible</p>
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
              <span className="run-map-header__stat run-map-header__stat--gold">Or : {gold}</span>
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
                    body: 'La sortie ouvre le biome suivant. Le boss du sixième biome termine la run ; la progression connectée est ensuite vérifiée par le serveur.',
                  },
                ]}
              />
              <span className="run-map-header__stat">Vague {currentWave}</span>
              <span className="run-map-header__stat">Niveau {runLevel}</span>
              <span className="run-map-header__secondary">
                {currentBiome ? BIOME_NAMES[currentBiome] : '???'}
              </span>
              {currentBiomeIndex >= 0 && (
                <span className="run-map-header__secondary">
                  [{currentBiomeIndex + 1}/{biomeMaps.length}]
                </span>
              )}
            </div>
          </header>
          <aside
            className="run-map-legend run-map-panel run-map-panel--section"
            aria-label="Légende de la carte"
          >
            <strong>Légende :</strong>{' '}
            {Object.entries(NODE_LABELS).map(([type, label]) => (
              <span key={type} className="run-map-legend__item">
                {label} {NODE_NAMES[type] ?? type}
              </span>
            ))}
          </aside>
          <div className="run-map-loadout run-map-panel run-map-panel--section">
            <strong>{fr.run.runes} :</strong> {runeIds.join(', ') || 'aucune'} ·{' '}
            <strong>{fr.run.augments} :</strong> {augmentIds.join(', ') || 'aucun'}
          </div>
          {pendingAugmentIds.length > 0 && (
            <section
              className="run-map-choice-panel run-map-panel run-map-panel--section"
              aria-label="Choix d'augment"
            >
              <h2>{fr.run.biomeComplete}</h2>
              {pendingAugmentIds.map((id) => {
                const augment = AUGMENT_DATABASE[id];
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => chooseAugment(id)}
                    className="run-map-choice-button"
                  >
                    <strong>{augment?.name ?? id}</strong> — Effet avant validation :{' '}
                    {augment?.description}
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
              className="run-map-choice-panel run-map-panel run-map-panel--section"
              aria-label={fr.run.upgradeSpell}
            >
              <strong>
                Améliorez un sort de {pendingUpgradeChampion?.name ?? pendingUpgradeChampionId}
              </strong>
              <p>{fr.run.upgradeConsequence}</p>
              {(['Q', 'W', 'E', 'R'] as const).map((slot, index) => {
                const spell = pendingUpgradeChampion?.spells[index];
                const rank = pendingUpgradeMember.spellRanks?.[slot] ?? 1;
                const cap = getSpellRankCap(
                  pendingUpgradeChampionId,
                  slot,
                  pendingUpgradeMember.level ?? 1,
                );
                const canUpgrade = canUpgradeSpell(pendingUpgradeMember, slot);
                const nextRank = Math.min(rank + 1, spell?.maxRank ?? rank);
                const beforeCost = spell?.cost[rank - 1];
                const afterCost = spell?.cost[nextRank - 1];
                const beforeCooldown = spell?.cooldown[rank - 1];
                const afterCooldown = spell?.cooldown[nextRank - 1];
                const reason =
                  rank >= (spell?.maxRank ?? 0) ? fr.run.maximumRank : fr.run.levelRequired;
                return (
                  <button
                    type="button"
                    key={slot}
                    disabled={!canUpgrade}
                    title={canUpgrade ? fr.run.upgradeConsequence : reason}
                    onClick={() => upgradeSpell(pendingUpgradeChampionId, slot)}
                    className="run-map-choice-button"
                  >
                    <strong>
                      {slot} — {spell?.name ?? slot}
                    </strong>
                    <span className="run-map-choice-detail">
                      {fr.run.currentRank} {rank} → {fr.run.nextRank} {nextRank} (maximum{' '}
                      {spell?.maxRank ?? cap})
                    </span>
                    {spell && (
                      <span className="run-map-choice-detail">
                        PM {beforeCost} → {afterCost} · Recharge {beforeCooldown} → {afterCooldown}{' '}
                        s
                      </span>
                    )}
                    {!canUpgrade && <span className="run-map-choice-detail">{reason}</span>}
                  </button>
                );
              })}
            </section>
          )}
          <RunMapCanvas
            map={currentMap}
            currentNodeId={currentNodeId}
            frontierNodeIds={frontierNodeIds}
            hasPendingChoice={hasPendingChoice}
            reducedMotion={reducedMotion}
            onNodeClick={handleNodeClick}
          />
        </div>
        <div className="run-map-sidebar">
          <TeamPanel team={team} inventory={inventory} />
          <InventoryPanel inventory={inventory} team={team} />
        </div>
      </div>
    </main>
  );
}

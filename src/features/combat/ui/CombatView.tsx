import { playUIClick } from '@/audio';
import { ContextTutorial } from '@/components/ContextTutorial';
import { ROUTES } from '@/config/routes';
import { ActionType } from '@/game/battle/types';
import { canLeaveActiveCombat } from '@/game/run/routeAccess';
import { combatCopy } from '@/i18n/combatContent';
import { formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { combatTargetKey, SLOT_TO_ACTION } from '../application/combatSelection';
import type { useCombatController } from '../hooks/useCombatController';
import type { useCombatEncounter } from '../hooks/useCombatEncounter';
import { AbilityBar } from './AbilityBar';
import { BattleSpeedControl } from './BattleSpeedControl';
import { CombatantPortrait } from './CombatantPortrait';
import { CombatLog } from './CombatLog';
import { CombatStage } from './CombatStage';
import { TurnIndicator } from './TurnIndicator';

type CombatViewProps = ReturnType<typeof useCombatController> &
  Pick<
    ReturnType<typeof useCombatEncounter>,
    | 'isActive'
    | 'battlePhase'
    | 'round'
    | 'playerTeam'
    | 'enemyTeam'
    | 'currentTurnChampionId'
    | 'currentTurnSide'
    | 'winner'
    | 'visualEvent'
    | 'requiresServerAutoPlay'
    | 'keyboardShortcutsEnabled'
    | 'setKeyboardShortcutsEnabled'
    | 'playerEnhancementBonuses'
    | 'navigate'
  >;

export function CombatView({
  isActive,
  battlePhase,
  round,
  playerTeam,
  enemyTeam,
  currentTurnChampionId,
  currentTurnSide,
  winner,
  visualEvent,
  requiresServerAutoPlay,
  keyboardShortcutsEnabled,
  setKeyboardShortcutsEnabled,
  playerEnhancementBonuses,
  navigate,
  autoPlay,
  targetSelection,
  pendingActionType,
  currentChampion,
  chooseAction,
  handleCast,
  handleTargetSelect,
  confirmAction,
  visibleActionOptions,
  canConfirm,
  selectableTargetKeys,
  selectedTarget,
  showPlayerControls,
  showManualConfirmation,
  confirmationLabel,
  commandStatus,
  targetStepText,
  arenaStatus,
  isVisualSource,
  isVisualTarget,
  toggleAutoPlay,
}: CombatViewProps) {
  if (!isActive) return null;
  const autoLabel = requiresServerAutoPlay
    ? fr.combat.serverAuto
    : `${fr.combat.auto} : ${autoPlay ? fr.combat.on : fr.combat.off}`;
  const autoActionLabel = requiresServerAutoPlay
    ? fr.combat.serverAutoEnabled
    : autoPlay
      ? fr.combat.disableAuto
      : fr.combat.enableAuto;

  return (
    <main className="combat-page">
      {/* Header */}
      <header className="combat-header">
        <button
          className="combat-header__back"
          disabled={!canLeaveActiveCombat(battlePhase)}
          onClick={() => {
            playUIClick();
            navigate(ROUTES.RUN);
          }}
          aria-label={fr.common.backToMap}
          title={
            canLeaveActiveCombat(battlePhase) ? fr.common.backToMap : fr.combat.finishBeforeMap
          }
        >
          {fr.common.backToMap}
        </button>
        <span className="combat-header__title">
          {combatCopy.page.title} — {fr.combat.round} {formatNumber(round)}
        </span>
        <TurnIndicator champion={currentChampion} side={currentTurnSide} />
        <BattleSpeedControl />
        <ContextTutorial
          storageKey="lolrogue:tutorial:combat:v2"
          title={combatCopy.page.tutorial.title}
          buttonLabel={combatCopy.page.tutorial.buttonLabel}
          steps={[...combatCopy.page.tutorial.steps]}
        />
        <button
          type="button"
          disabled={requiresServerAutoPlay}
          onClick={() => {
            if (requiresServerAutoPlay) return;
            playUIClick();
            toggleAutoPlay();
          }}
          className="combat-auto-toggle"
          aria-label={`${autoLabel}, ${autoActionLabel}`}
          aria-pressed={requiresServerAutoPlay || autoPlay}
          aria-describedby="combat-auto-status"
          title={requiresServerAutoPlay ? fr.combat.serverAutoRequired : fr.combat.autoHelp}
        >
          {autoLabel}
        </button>
      </header>

      {/* Main area */}
      <div className="combat-layout combat-main">
        {/* Player team panel */}
        <div className="combat-team-panel">
          <div className="combat-team-panel__title combat-team-panel__title--player">
            {fr.combat.playerTeam}
          </div>
          {playerTeam.map((c) => (
            <CombatantPortrait
              key={`player-${c.targetId}`}
              combatant={c}
              isActive={c.side === currentTurnSide && c.targetId === currentTurnChampionId}
              enhancementBonuses={playerEnhancementBonuses[c.id] || []}
              isSelected={
                targetSelection?.side === c.side && targetSelection.targetId === c.targetId
              }
              isAttacking={isVisualSource(c)}
              isActualTarget={isVisualTarget(c)}
              onSelect={
                !c.isDefeated && selectableTargetKeys.has(combatTargetKey(c.side, c.targetId))
                  ? () => handleTargetSelect(c.targetId, c.side)
                  : undefined
              }
            />
          ))}
          {playerTeam.length === 0 && (
            <div className="combat-team-panel__empty">{fr.run.noChampions}</div>
          )}
        </div>

        {/* Center: battle arena / status */}
        <div className="combat-center">
          {battlePhase === 'idle' && (
            <div className="combat-arena">
              <div className="combat-arena__eyebrow">{combatCopy.page.arenaTitle}</div>
              <div className="combat-arena__icon">⚔️</div>
              <div className="combat-arena__preparing">{fr.combat.preparing}</div>
            </div>
          )}
          {(battlePhase === 'turn_active' ||
            battlePhase === 'starting' ||
            battlePhase === 'turn_transition') && (
            <CombatStage
              key={visualEvent?.id ?? 'combat-stage-idle'}
              round={round}
              currentTurnChampionId={currentTurnChampionId}
              currentTurnSide={currentTurnSide}
              playerTeam={playerTeam}
              enemyTeam={enemyTeam}
              selectedTarget={selectedTarget}
              pendingActionType={pendingActionType}
              visualEvent={visualEvent}
              status={arenaStatus}
            />
          )}
          {battlePhase === 'finished' && (
            <div className="combat-arena">
              <div className="combat-arena__eyebrow">{combatCopy.page.resultTitle}</div>
              <div className="combat-result__icon">
                {winner === 'player' ? '🏆' : winner === 'draw' ? '🤝' : '💀'}
              </div>
              <div className={`combat-result__title combat-result__title--${winner ?? 'enemy'}`}>
                {winner === 'player'
                  ? `${fr.common.victory.toUpperCase()} !`
                  : winner === 'draw'
                    ? fr.combat.draw
                    : fr.common.defeat.toUpperCase()}
              </div>
              <div className="combat-result__actions">
                {winner === 'player' && (
                  <button
                    type="button"
                    onClick={() => {
                      playUIClick();
                      navigate(ROUTES.RUN);
                    }}
                    className="combat-result__continue"
                  >
                    {fr.common.continue} →
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MENU)}
                  className="combat-result__menu"
                >
                  {fr.gameOver.mainMenu}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Enemy team panel */}
        <div className="combat-team-panel">
          <div className="combat-team-panel__title combat-team-panel__title--enemy">
            {fr.combat.enemies}
          </div>
          {enemyTeam.map((c) => (
            <CombatantPortrait
              key={`enemy-${c.targetId}`}
              combatant={c}
              isActive={c.side === currentTurnSide && c.targetId === currentTurnChampionId}
              isSelected={
                targetSelection?.side === c.side && targetSelection.targetId === c.targetId
              }
              isAttacking={isVisualSource(c)}
              isActualTarget={isVisualTarget(c)}
              onSelect={
                !c.isDefeated && selectableTargetKeys.has(combatTargetKey(c.side, c.targetId))
                  ? () => handleTargetSelect(c.targetId, c.side)
                  : undefined
              }
            />
          ))}
          {enemyTeam.length === 0 && (
            <div className="combat-team-panel__empty">{fr.common.none}</div>
          )}
        </div>
      </div>

      {/* Bottom: coherent command tray + log */}
      <div className="combat-bottom">
        <section className="combat-command" aria-labelledby="combat-command-title">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="combat-command__status"
          >
            <span aria-hidden="true" className="combat-command__index">
              CMD
            </span>
            <span className="combat-command__copy">
              <span id="combat-command-title" className="combat-command__label">
                {commandStatus.label}
              </span>
              <span className="combat-command__text">{commandStatus.text}</span>
            </span>
          </div>

          {showPlayerControls && currentChampion && (
            <div className="combat-command__controls">
              <div className="combat-command__choice">
                <span className="combat-command__step-label">{combatCopy.page.steps.action}</span>
                <button
                  type="button"
                  disabled={
                    !visibleActionOptions.some(
                      (candidate) => candidate.type === ActionType.BasicAttack,
                    )
                  }
                  onClick={() => chooseAction(ActionType.BasicAttack)}
                  className="combat-action-button"
                  aria-label={fr.combat.baseAttack}
                  aria-pressed={pendingActionType === ActionType.BasicAttack}
                >
                  ⚔ {fr.combat.attack}
                </button>
                <AbilityBar
                  champion={currentChampion}
                  onCast={handleCast}
                  selectedSlot={
                    currentChampion.spells.find(
                      (spell) => SLOT_TO_ACTION[spell.slot] === pendingActionType,
                    )?.slot
                  }
                  availableSlots={currentChampion.spells
                    .filter((spell) =>
                      visibleActionOptions.some(
                        (option) => option.type === SLOT_TO_ACTION[spell.slot],
                      ),
                    )
                    .map((spell) => spell.slot)}
                />
              </div>

              <div className="combat-command__target">
                <span className="combat-command__step-label">{combatCopy.page.steps.target}</span>
                <span className="combat-command__target-value" title={targetStepText}>
                  {targetStepText}
                </span>
              </div>

              {showManualConfirmation && (
                <div className="combat-command__confirm">
                  <span className="combat-command__step-label">
                    {combatCopy.page.steps.confirmation}
                  </span>
                  <button
                    type="button"
                    onClick={confirmAction}
                    disabled={!canConfirm}
                    className="combat-action-button combat-action-button--confirm"
                    aria-label={combatCopy.page.spaceAria(confirmationLabel)}
                    aria-keyshortcuts="Space Enter"
                  >
                    ▶ {confirmationLabel}
                    <span className="combat-action-button__shortcut">
                      {combatCopy.page.spaceShortcut}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <details className="combat-shortcuts">
          <summary className="combat-shortcuts__summary">
            {fr.combat.shortcuts} —{' '}
            {keyboardShortcutsEnabled ? fr.combat.shortcutsEnabled : fr.combat.shortcutsDisabled}
          </summary>
          <div className="combat-shortcuts__body">
            <div>{combatCopy.page.shortcuts.spells}</div>
            <div>{combatCopy.page.shortcuts.execute}</div>
            <div>{combatCopy.page.shortcuts.leave}</div>
            <div>{combatCopy.page.shortcuts.focus}</div>
            <button
              type="button"
              onClick={() => setKeyboardShortcutsEnabled(!keyboardShortcutsEnabled)}
              aria-pressed={keyboardShortcutsEnabled}
              className="combat-action-button combat-shortcuts__toggle"
            >
              {keyboardShortcutsEnabled ? fr.combat.disableShortcuts : fr.combat.enableShortcuts}
            </button>
          </div>
        </details>
        <div className="combat-log-region">
          <CombatLog />
        </div>
      </div>
    </main>
  );
}

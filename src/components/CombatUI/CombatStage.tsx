import { getCombatVisualProfile, slotForAction } from '@/game/presentation/combatVisuals';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { CombatantInfo, CombatVisualEvent } from '@/stores/battleStore';
import { useSettingsStore } from '@/stores/settingsStore';

interface CombatStageProps {
  round: number;
  currentTurnChampionId: string | null;
  currentTurnSide: 'player' | 'enemy' | null;
  playerTeam: CombatantInfo[];
  enemyTeam: CombatantInfo[];
  selectedTarget?: CombatantInfo;
  visualEvent: CombatVisualEvent | null;
  status: string;
}

function findCombatant(
  team: readonly CombatantInfo[],
  championId: string | undefined,
  combatantId?: string,
) {
  return (
    (combatantId ? team.find((combatant) => combatant.targetId === combatantId) : undefined) ??
    team.find((combatant) => combatant.id === championId)
  );
}

function effectLabel(kind: CombatVisualEvent['kind'], amount?: number, isCrit?: boolean) {
  if (kind === 'damage' && amount !== undefined) {
    return `${isCrit ? 'Critique · ' : ''}-${Math.round(amount)} PV`;
  }
  if (kind === 'heal' && amount !== undefined) return `+${Math.round(amount)} PV`;
  if (kind === 'shield' && amount !== undefined) return `+${Math.round(amount)} bouclier`;
  if (kind === 'revive' && amount !== undefined) return `Ranimé · ${Math.round(amount)} PV`;
  return null;
}

function CombatantCard({
  combatant,
  role,
}: {
  combatant?: CombatantInfo;
  role: 'source' | 'target';
}) {
  if (!combatant) {
    return (
      <div className={`combat-stage__fighter combat-stage__fighter--${role}`} aria-hidden="true" />
    );
  }
  return (
    <article
      className={`combat-stage__fighter combat-stage__fighter--${role} combat-stage__fighter--${combatant.side}`}
      aria-label={`${role === 'source' ? 'Attaquant' : 'Cible'} : ${combatant.name}`}
    >
      <span className="combat-stage__fighter-role">
        {role === 'source' ? 'Attaquant' : 'Cible'}
      </span>
      <div className="combat-stage__portrait-wrap">
        <span className="combat-stage__portrait-ring" aria-hidden="true" />
        {combatant.iconUrl ? (
          <img
            src={combatant.iconUrl}
            alt=""
            width={104}
            height={104}
            decoding="async"
            className="combat-stage__portrait"
          />
        ) : (
          <span className="combat-stage__portrait combat-stage__portrait--fallback">
            {combatant.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <strong className="combat-stage__fighter-name">{combatant.name}</strong>
      <progress
        className="combat-stage__health"
        aria-label={`PV de ${combatant.name}`}
        max={Math.max(1, Math.round(combatant.maxHp))}
        value={Math.max(0, Math.round(combatant.currentHp))}
      />
      <span className="combat-stage__health-copy">
        {Math.max(0, Math.round(combatant.currentHp))} / {Math.round(combatant.maxHp)} PV
      </span>
    </article>
  );
}

export function CombatStage({
  round,
  currentTurnChampionId,
  currentTurnSide,
  playerTeam,
  enemyTeam,
  selectedTarget,
  visualEvent,
  status,
}: CombatStageProps) {
  const reducedMotion = useReducedMotion();
  const particlesEnabled = useSettingsStore((state) => state.particlesEnabled);
  const battleSpeed = useSettingsStore((state) => state.battleSpeed);
  const allTeams = { player: playerTeam, enemy: enemyTeam } as const;
  const sourceSide = visualEvent?.sourceSide ?? currentTurnSide ?? 'player';
  const sourceTeam = allTeams[sourceSide];
  const source = visualEvent
    ? findCombatant(sourceTeam, visualEvent.sourceId, visualEvent.sourceCombatantId)
    : findCombatant(
        sourceTeam,
        currentTurnChampionId ?? undefined,
        currentTurnChampionId ?? undefined,
      );
  const resolvedSource =
    source ?? sourceTeam.find((combatant) => combatant.id === currentTurnChampionId);
  const targetSide = visualEvent?.targetSide ?? (sourceSide === 'player' ? 'enemy' : 'player');
  const targetTeam = allTeams[targetSide];
  const eventTarget = visualEvent
    ? findCombatant(
        targetTeam,
        visualEvent.targetIds?.[0] ?? visualEvent.targetId,
        visualEvent.targetCombatantIds?.[0] ?? visualEvent.targetCombatantId,
      )
    : undefined;
  const target =
    eventTarget ??
    selectedTarget ??
    targetTeam.find((combatant) => !combatant.isDefeated) ??
    targetTeam[0];
  const profile = getCombatVisualProfile(resolvedSource?.id, visualEvent?.action);
  const spellSlot = slotForAction(visualEvent?.action);
  const activeSpell = spellSlot
    ? resolvedSource?.spells.find((spell) => spell.slot === spellSlot)
    : undefined;
  const spellName = activeSpell?.name;
  const spellIconUrl = activeSpell?.iconUrl;
  const actionName = spellName ?? profile.title;
  const amountLabel = visualEvent
    ? effectLabel(visualEvent.kind, visualEvent.amount, visualEvent.isCrit)
    : null;
  const targetCount = Math.max(
    visualEvent?.targetCombatantIds?.length ?? 0,
    visualEvent?.targetIds?.length ?? 0,
    target ? 1 : 0,
  );
  const liveText = visualEvent
    ? `${resolvedSource?.name ?? visualEvent.sourceId} utilise ${actionName}${targetCount > 1 ? ` sur ${targetCount} cibles` : target ? ` sur ${target.name}` : ''}${amountLabel ? ` : ${amountLabel}` : ''}.`
    : status;

  return (
    <div
      className={`combat-arena combat-stage combat-stage--${profile.shape} combat-stage--${profile.tone} combat-stage--from-${sourceSide} combat-stage--speed-${battleSpeed}${visualEvent ? ` combat-stage--animating combat-stage--effect-${visualEvent.kind}` : ''}${reducedMotion ? ' combat-stage--reduced-motion' : ''}${particlesEnabled ? '' : ' combat-stage--no-particles'}`}
      data-combat-effect={visualEvent?.id}
      data-combat-source={resolvedSource?.targetId}
      data-combat-target={target?.targetId}
    >
      <div className="combat-stage__scrim" aria-hidden="true" />
      <div className="combat-stage__topline">
        <span>Round {round}</span>
        <strong>
          {visualEvent
            ? sourceSide === 'player'
              ? 'Action alliée'
              : 'Action ennemie'
            : currentTurnSide === 'player'
              ? 'Votre initiative'
              : 'Initiative ennemie'}
        </strong>
      </div>

      <div className="combat-stage__duel">
        <CombatantCard combatant={resolvedSource} role="source" />
        <div className="combat-stage__effect-lane" aria-hidden="true">
          <span className="combat-stage__versus">VS</span>
          {visualEvent && (
            <div className="combat-stage__effect" key={visualEvent.id}>
              <span className="combat-stage__effect-core">
                {spellIconUrl ? (
                  <img src={spellIconUrl} alt="" width={72} height={72} decoding="async" />
                ) : (
                  profile.glyph
                )}
              </span>
              <span className="combat-stage__effect-trail" />
              <span className="combat-stage__effect-ring" />
              <span className="combat-stage__effect-ring combat-stage__effect-ring--second" />
              {particlesEnabled && !reducedMotion
                ? Array.from({ length: 8 }, (_, index) => (
                    <span
                      key={index}
                      className={`combat-stage__particle combat-stage__particle--${index + 1}`}
                    />
                  ))
                : null}
            </div>
          )}
        </div>
        <CombatantCard combatant={target} role="target" />
      </div>

      <div className="combat-stage__action" aria-hidden={!visualEvent}>
        <span className="combat-stage__action-glyph">
          {spellIconUrl ? (
            <img src={spellIconUrl} alt="" width={32} height={32} decoding="async" />
          ) : (
            profile.glyph
          )}
        </span>
        <span className="combat-stage__action-copy">
          <span>{visualEvent ? actionName : 'Arène tactique'}</span>
          <strong>
            {visualEvent && resolvedSource
              ? `${resolvedSource.name} → ${targetCount > 1 ? `${targetCount} cibles` : (target?.name ?? 'cible')}`
              : currentTurnSide === 'player'
                ? 'Préparez votre prochaine action'
                : 'Observez le tour adverse'}
          </strong>
        </span>
        {amountLabel && (
          <span
            className={`combat-stage__amount combat-stage__amount--${visualEvent?.kind}${visualEvent?.isCrit ? ' combat-stage__amount--critical' : ''}`}
          >
            {amountLabel}
          </span>
        )}
      </div>
      <p id="combat-auto-status" className="combat-stage__status">
        {status}
      </p>
      {visualEvent && (
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {liveText}
        </p>
      )}
    </div>
  );
}

/** Stable IDs for duplicate champions, shared by engine, encounters and replay. */
export function getCombatantTargetId(champions: readonly { id: string }[], index: number): string {
  const championId = champions[index].id;
  if (champions.filter((champion) => champion.id === championId).length === 1) return championId;
  const occurrence = champions
    .slice(0, index + 1)
    .filter((champion) => champion.id === championId).length;
  return `${championId}#${occurrence}`;
}

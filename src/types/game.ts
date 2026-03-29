/**
 * GameStats — the 6 roguelike stats derived from LoL champion data.
 *
 * Mapping:
 *   HP  = LoL HP (direct)
 *   ATK = LoL Attack Damage (direct)
 *   DEF = average of LoL Armor + Magic Resist
 *   AP  = derived from LoL Mana pool (magical potential proxy)
 *   SPD = mapped from LoL Move Speed (325–355) → 1–10 roguelike scale
 *   CRIT = LoL Crit Chance (direct, 0–100)
 */

export interface GameStats {
  /** Hit Points — survivability */
  hp: number;
  /** Attack Power — physical damage output */
  atk: number;
  /** Defense — combined physical + magical resistance */
  def: number;
  /** Ability Power — magical damage potential, derived from mana pool */
  ap: number;
  /** Speed — roguelike move/action speed (1–10 scale) */
  spd: number;
  /** Critical Strike Chance (0–100) */
  crit: number;
}

/**
 * LoL stat ranges used for conversion calibration (level 1 base, approximate):
 *
 * | Stat           | Min   | Max   | Unit  |
 * |----------------|-------|-------|-------|
 * | hp             | 410   | 690   | HP    |
 * | armor          | 21    | 39    |       |
 * | magicResist    | 30    | 34    |       |
 * | attackDamage   | 50    | 66    | AD    |
 * | moveSpeed      | 325   | 355   |       |
 * | mp             | 0     | 495   |       |
 * | crit           | 0     | 0     | %     |
 * | hpPerLevel     | 90    | 120   |       |
 * | armorPerLevel  | 3     | 5     |       |
 * | attackSpeed    | 0.625 | 0.736 |       |
 *
 * Game stat targets (level 1):
 *   HP   ~400–700    (direct LoL HP)
 *   ATK  ~50–66      (direct LoL AD)
 *   DEF  ~25–37      (avg armor+MR)
 *   AP   ~0–15       (mp * 0.03)
 *   SPD  ~1.5–8.5    (moveSpeed mapped to 1–10)
 *   CRIT ~0          (base is 0 for all champs)
 *
 * Level 1→18 growth:
 *   HP   +90–120 per level curve (≈ 60–80% total increase)
 *   ATK  +0 (parsed data has 0 per-level AD growth — treated as flat)
 *   DEF  +3–5 armor + ~1.3–2 MR per level
 *   AP   +0–35 MP per level → +0–1 AP per level
 *   SPD  +0 (moveSpeed doesn't scale in LoL)
 *   CRIT +0 (base crit doesn't scale in LoL)
 */

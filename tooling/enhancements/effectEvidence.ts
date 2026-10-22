/** Audited enhancement contracts. Runtime availability and graph reachability are separate. */
export type EnhancementEffectStatus = 'implemented' | 'partial' | 'descriptive';
export type EnhancementEffectFollowUp = 'TREE-03' | 'TREE-04';

export interface EnhancementEvidenceSource {
  path: string;
  symbol: string;
}

export interface EnhancementEffectContribution {
  kind: 'stat' | 'effect';
  id: string;
  status: EnhancementEffectStatus;
  appliedBehavior: string;
  discrepancies: readonly string[];
  runtimeConsumers: readonly EnhancementEvidenceSource[];
  owner: string;
  followUp: readonly EnhancementEffectFollowUp[];
}

export interface EnhancementNodeEffectEvidence {
  status: EnhancementEffectStatus;
  effectTypes: string[];
  appliedBehavior: string[];
  discrepancies: string[];
  runtimeConsumers: EnhancementEvidenceSource[];
  owner: string[];
  followUp: EnhancementEffectFollowUp[];
  contributions: EnhancementEffectContribution[];
  sharedContractIds: readonly string[];
}

/** Structural input keeps this audit tooling independent from application imports. */
export interface AuditableEnhancementNode {
  id: string;
  statBonuses?: Readonly<Partial<Record<string, number>>>;
  percentBonuses?: Readonly<Partial<Record<string, number>>>;
  effects?: readonly { type: string }[];
}

const runtime = (symbol: string): EnhancementEvidenceSource => ({
  path: 'src/game/rules/CombatRuleRuntime.ts',
  symbol: `CombatRuleRuntime.${symbol}`,
});
const battle = (symbol: string): EnhancementEvidenceSource => ({
  path: 'src/game/battle/BattleManager.ts',
  symbol: `BattleManager.${symbol}`,
});
const resolver: EnhancementEvidenceSource = {
  path: 'src/game/battle/BattleRuleEffectResolver.ts',
  symbol: 'resolveBattleRuleEffect',
};
const statSources: readonly EnhancementEvidenceSource[] = [
  { path: 'src/services/enhancementService.ts', symbol: 'EnhancementService._processNodes' },
  { path: 'src/utils/statCalculator.ts', symbol: 'enhancementModifiers' },
  { path: 'src/game/stats/statContract.ts', symbol: 'applyCanonicalModifiers' },
  { path: 'src/game/ChampionInstance.ts', symbol: 'ChampionInstance.getStatsWithEnhancements' },
];

function effect(
  id: string,
  appliedBehavior: string,
  runtimeConsumers: readonly EnhancementEvidenceSource[],
  discrepancies: readonly string[] = [],
): EnhancementEffectContribution {
  return {
    kind: 'effect',
    id,
    status: discrepancies.length ? 'partial' : 'implemented',
    appliedBehavior,
    discrepancies,
    runtimeConsumers,
    owner: 'CombatRuleRuntime / résolveurs combat / catalogue et traductions',
    followUp: discrepancies.length ? ['TREE-03', 'TREE-04'] : ['TREE-04'],
  };
}

const unavailableReasons: Readonly<Record<string, string>> = {
  out_of_combat_speed: 'Le déplacement hors combat n’a pas de consommateur moteur.',
  ambush_damage: 'Les broussailles et la dissimulation ne sont pas modélisées.',
  stealth_on_kill: 'L’invisibilité et sa durée en secondes ne sont pas modélisées.',
  heal_share: 'Aucun transfert de soin vers un allié proche n’est implémenté.',
  damage_intercept: 'Aucune interception ciblée ni recharge de 90 secondes n’est implémentée.',
  spell_echo: 'Aucune répétition de sort de zone n’est implémentée.',
  riposte: 'Aucune mémoire esquive → prochaine attaque n’est implémentée.',
  smoke_screen: 'Aucune invisibilité, accélération conditionnelle ou recharge n’est implémentée.',
  damage_sacrifice: 'Aucune interception des dégâts mortels d’un allié n’est implémentée.',
  bush_vision: 'Aucun champ de vision ou broussailles n’est modélisé.',
  aoe_slow: 'Aucun bonus spécifique au ralentissement de zone n’est consommé.',
  cc_aoe: 'Aucune extension spatiale de zone de contrôle n’est consommée.',
};

export const ENHANCEMENT_EFFECT_EVIDENCE: Readonly<Record<string, EnhancementEffectContribution>> =
  Object.fromEntries([
    ...[
      effect(
        'execute_damage',
        'Dégâts × (1 + value) sous 40 % des PV max de la cible, seuil strict.',
        [runtime('beforeDamage')],
      ),
      effect(
        'burst_amplify',
        'Dégâts de la compétence R × (1 + value), autres actions inchangées.',
        [runtime('beforeDamage')],
      ),
      effect(
        'survival_shield',
        'Sous 20 % PV avant un coup, émet et applique le bouclier avant ce coup, pour duration tours ; une utilisation par combat.',
        [runtime('beforeDamage'), battle('_applyDamageToTarget'), resolver],
      ),
      effect(
        'revive',
        'Une fois par champion et par combat, reste à 1 PV après un coup mortel ; aucune immunité ni recharge temps réel.',
        [runtime('beforeDefeat'), battle('_applyDamageToTarget')],
      ),
      effect(
        'ally_damage_reduction',
        'Les porteurs vivants contribuent à la réduction des dégâts de toute leur équipe, eux inclus ; valeurs additionnées puis réduction totale plafonnée à 100 %.',
        [runtime('beforeDamage'), runtime('getAllTeamEnhancements')],
      ),
      effect(
        'thornmail',
        'Après les dégâts non absorbés reçus, renvoie round(amount × value) dégâts vrais, quel que soit le type entrant, sans récursion.',
        [runtime('afterDamage'), resolver],
      ),
      effect(
        'burn_reflect',
        'Après une attaque de base reçue, renvoie round(PV max attaquant × value) dégâts vrais.',
        [runtime('afterDamage'), resolver],
      ),
      effect(
        'vengeance_burst',
        'Après 500 dégâts HP reçus, inflige value dégâts vrais à chaque ennemi vivant, une fois par combat.',
        [runtime('afterDamage'), resolver],
      ),
      effect(
        'slow',
        'Après un dégât de sort, applique value de ralentissement pour duration tours, modifiés par extension et ténacité, puis arrondi supérieur et caps ; cumul des ralentissements plafonné à 60 %.',
        [runtime('afterDamage'), resolver],
      ),
      effect(
        'root_chance',
        'Après chaque événement de dégâts de sort, random() < value applique Snare pour duration tours, avec modificateurs et plafonds de durée.',
        [runtime('afterDamage'), resolver],
      ),
      effect(
        'mana_restore',
        'Chaque élimination créditée au porteur restaure value PM, avec plafond maxMp.',
        [runtime('onKill'), resolver],
      ),
      effect(
        'cdr_ultimate',
        'Pour R, recharge × (1 - somme(value)) après le facteur 100 / (100 + hâte), multiplicateur final minimum 0,1.',
        [
          runtime('getCooldownMultiplier'),
          {
            path: 'src/game/battle/BattleActionExecutor.ts',
            symbol: 'executeValidatedBattleAction',
          },
        ],
      ),
      effect(
        'attack_speed_on_kill',
        'Une élimination pose un bonus relatif attackSpeed pendant duration fins de tour du porteur ; une nouvelle élimination rafraîchit ce bonus sans cumul.',
        [runtime('onKill'), runtime('getStatBonuses'), runtime('onTurnEnd')],
      ),
      effect(
        'bleed',
        'Sur une attaque de base infligeant des dégâts HP, tirage chance (absent = 100 %), puis total round(PV max cible × value) en dégâts vrais répartis exactement sur duration tours ; applications indépendantes et boucliers absorbants.',
        [
          runtime('afterDamage'),
          runtime('shouldTriggerEnhancementChance'),
          resolver,
          { path: 'src/game/effects/DamageEffect.ts', symbol: 'DamageEffect.tick' },
          battle('_tickTurnEffects'),
        ],
      ),
      effect(
        'dodge',
        'Sur une attaque de base, random() < value porte la réduction entrante à 100 %.',
        [runtime('beforeDamage')],
      ),
      effect(
        'berserker',
        'Dégâts × (1 + value) lorsque les PV du porteur sont strictement sous 50 %.',
        [runtime('beforeDamage')],
      ),
      effect(
        'champion_damage',
        'Dégâts des attaques, sorts et DoT × (1 + value), sur toute cible ; renvois sans récursion exclus.',
        [runtime('beforeDamage')],
      ),
      effect(
        'duelist',
        'Avec exactement un acteur vivant par camp, dégâts sortants × (1 + value) et 15 % de réduction entrante.',
        [runtime('beforeDamage')],
      ),
      effect(
        'heal_on_kill',
        'Une élimination créditée au porteur soigne ses PV max × value, puis amplification et plafond des PV.',
        [runtime('onKill'), resolver, battle('_applyHeal')],
      ),
      effect(
        'heal_amp',
        'Ajoute value au multiplicateur des soins émis par le porteur ; cumul additif avec Spirit Visage du destinataire.',
        [runtime('getHealMultiplier'), battle('_applyHeal')],
      ),
      effect(
        'shield_amp',
        'Ajoute value au multiplicateur des boucliers émis par le porteur, y compris les boucliers des règles.',
        [
          runtime('getShieldMultiplier'),
          resolver,
          {
            path: 'src/game/battle/BattleSpellEffectResolver.ts',
            symbol: 'BattleSpellEffectResolver.resolve',
          },
        ],
      ),
      effect(
        'damage_aura',
        'Les porteurs vivants ajoutent leurs values au multiplicateur des dégâts de toute leur équipe, eux inclus ; aucune notion spatiale.',
        [runtime('beforeDamage'), runtime('getAllTeamEnhancements')],
      ),
      effect(
        'cc_extension',
        'Durée des contrôles × (1 + somme(value)), puis ténacité, arrondi supérieur et plafonds ; hard CC limité à 1 tour.',
        [
          runtime('getAppliedControlDurationMultiplier'),
          resolver,
          {
            path: 'src/game/battle/BattleSpellEffectResolver.ts',
            symbol: 'BattleSpellEffectResolver.resolve',
          },
        ],
      ),
    ].map((entry) => [entry.id, entry] as const),
    ...Object.entries(unavailableReasons).map(
      ([id, reason]) =>
        [
          id,
          {
            kind: 'effect' as const,
            id,
            status: 'descriptive' as const,
            appliedBehavior: 'Aucun effet appliqué ; type explicitement indisponible dans ce mode.',
            discrepancies: [reason],
            runtimeConsumers: [
              {
                path: 'src/game/rules/catalogSupport.ts',
                symbol: 'UNAVAILABLE_ENHANCEMENT_EFFECTS',
              },
              runtime('getEnhancements'),
            ],
            owner: 'Catalogue / disponibilité du moteur / traductions',
            followUp: ['TREE-03', 'TREE-04'] as const,
          },
        ] as const,
    ),
  ]);

const statBehavior: Readonly<Record<string, string>> = {
  hp: 'PV maximum canoniques ; bonus appliqué avant le multiplicateur de santé de run.',
  mp: 'PM maximum canoniques.',
  atk: 'Dégâts d’attaque canoniques, pas un multiplicateur global de dégâts.',
  ap: 'Puissance canonique, utilisée uniquement par les ratios AP des effets.',
  def: 'Armure canonique, utilisée par la mitigation physique.',
  mr: 'Résistance magique canonique, utilisée par la mitigation magique.',
  spd: 'Vitesse de déplacement canonique, composante de l’initiative ; aucun déplacement spatial.',
  attackSpeed:
    'Initiative d’attaque canonique, plafonnée entre 0,1 et 10 ; aucune attaque supplémentaire.',
  crit: 'Points de pourcentage de critique canonique, plafonnés entre 0 et 100.',
  hpRegen: 'Stat canonique ; le bonus plat est aussi émis en soin au début du tour du porteur.',
  mpRegen: 'Stat canonique ; le bonus plat est aussi émis en PM au début du tour du porteur.',
  armorPen: 'Bonus secondaire plat : multiplie les dégâts physiques par 1 + max(0, valeur) / 200.',
  magicPen: 'Bonus secondaire plat : multiplie les dégâts magiques par 1 + max(0, valeur) / 200.',
  lifesteal:
    'Bonus secondaire plat divisé par 100, appliqué aux dégâts HP des attaques de base du porteur.',
  omnivamp:
    'Bonus secondaire plat divisé par 100 sur tous les dégâts HP du porteur ; s’ajoute au vol de vie seulement pour les attaques de base.',
  tenacity:
    'Bonus secondaire plat : max(0,2 ; 1 - max(0, valeur) / 100), appliqué aux contrôles de sort et aux contrôles émis par les règles.',
  abilityHaste:
    'Hâte effective = flat + percent × 100 ; recharge × 100 / (100 + max(0, hâte)), minimum ×0,1.',
};

const statRuntimeSources: Readonly<Record<string, readonly EnhancementEvidenceSource[]>> = {
  hpRegen: [runtime('onTurnStart')],
  mpRegen: [runtime('onTurnStart')],
  armorPen: [runtime('beforeDamage')],
  magicPen: [runtime('beforeDamage')],
  lifesteal: [runtime('afterDamage')],
  omnivamp: [runtime('afterDamage')],
  tenacity: [runtime('getControlDurationMultiplier')],
  abilityHaste: [runtime('getCooldownMultiplier')],
};

export const ENHANCEMENT_SHARED_EFFECT_CONTRACTS = [
  {
    id: 'rank-aggregation',
    behavior:
      'calculateStatBonuses additionne stat × rang ; les effets sont copiés une fois par nœud sans multiplier value par rang. Les émissions numériques créées par CombatRuleRuntime.effect sont bornées et arrondies par max(0, round(amount)) avant leur résolution.',
    limit:
      'Ce calcul ne valide ni prérequis, ni indisponibilité, ni plafond du rang ; il ne prouve pas qu’un achat est légal.',
    evidence: [
      { path: 'src/services/enhancementService.ts', symbol: 'EnhancementService._processNodes' },
      runtime('effect'),
    ],
  },
  {
    id: 'preview-and-combat',
    behavior:
      'Les alias sont normalisés ; aperçu et ChampionInstance partagent applyEnhancementBonuses et la formule (base + plats) × (1 + somme %) avant caps.',
    limit:
      'L’aperçu canonique exclut les stats secondaires et n’exécute aucun effet conditionnel ; la présence d’un texte FR/EN ne prouve aucun handler.',
    evidence: [
      ...statSources,
      { path: 'src/i18n/enhancementContent.ts', symbol: 'getEnhancementNodeContent' },
    ],
  },
  {
    id: 'combatant-identity',
    behavior:
      'Les événements du bus conservent id=champion.id et side ; les effets instantanés émis ne transportent que sourceId/targetId. Le résolveur retrouve le premier champion correspondant, en parcourant les joueurs avant les ennemis.',
    limit:
      'Combat miroir : avec Garen dans chaque camp, une attaque du joueur peut appliquer son saignement au Garen joueur au lieu du Garen ennemi. Renvois et contrôles émis partagent cette résolution ambiguë. TREE-04 : porter une identité de combattant non ambiguë et tester les deux camps, sans retoucher les replays historiques.',
    evidence: [
      battle('_toRuleActor'),
      battle('_findCombatantByChampionId'),
      { path: 'src/game/rules/types.ts', symbol: 'CombatRuleInstantEffect' },
      resolver,
    ],
  },
  {
    id: 'serialized-snapshot',
    behavior:
      'Le serveur capture champion_enhancements.unlocked_nodes dans run_attempts.enhancement_snapshot ; le client lit enhancementSnapshot et la sauvegarde locale valide sa forme.',
    limit:
      'Le client n’est pas l’autorité de l’achat ; l’Edge reconstruit depuis le claim serveur, pas depuis une description ou une liste d’effets UI.',
    evidence: [
      { path: 'src/services/runAttemptService.ts', symbol: 'parseEnhancementSnapshot' },
      { path: 'src/game/run/runPersistenceValidation.ts', symbol: 'authorityAttempt' },
      {
        path: 'supabase/functions/verify-run/index.ts',
        symbol: 'enhancementSnapshot: claim.enhancement_snapshot',
      },
    ],
  },
  {
    id: 'authority-validation',
    behavior:
      'validateRunAttempt contrôle champion disponible, ID du nœud, entier sûr de 0 à maxRanks et chaque parent acquis au moins au rang 1 ; le moteur utilise le même buildCombatRuleLoadout.',
    limit:
      'La validation d’une forme et de parents ne démontre pas la parité de chaque effet manuel/autoplay/Edge. TREE-04 doit fournir ces fixtures.',
    evidence: [
      { path: 'src/game/authority/RunCommandValidator.ts', symbol: 'validateRunAttempt' },
      { path: 'src/game/authority/AuthorityRunEngine.ts', symbol: 'AuthorityReplayState' },
      { path: 'src/game/rules/loadout.ts', symbol: 'buildCombatRuleLoadout' },
    ],
  },
  {
    id: 'daily-neutrality',
    behavior:
      'cloneRunAttempt remplace masterySnapshot et enhancementSnapshot par {} en mode daily.',
    limit:
      'Aucun investissement Candies ne doit changer le Daily officiel ; audit courant uniquement, sans requalification des bundles historiques.',
    evidence: [{ path: 'src/game/authority/AuthorityRunEngine.ts', symbol: 'cloneRunAttempt' }],
  },
  {
    id: 'historical-replay',
    behavior:
      'La registry sélectionne une version de moteur et un hash de contenu ; les bundles historiques sont conservés.',
    limit:
      'Les corrections TREE-03/04 appartiennent au moteur futur 0.3.0 ; les bundles et hashes historiques restent figés et ne reçoivent pas le nouveau runtime.',
    evidence: [{ path: 'src/game/authority/index.ts', symbol: 'getAuthorityVerifier' }],
  },
  {
    id: 'veigar-separation',
    behavior:
      'ChampionInstance applique les bonus intra-run après les bonus de niveau, maîtrise et améliorations.',
    limit:
      'Les rangs d’amélioration ne constituent pas des stacks Veigar ; aucun compteur runProgress n’est créé par calculateStatBonuses.',
    evidence: [
      { path: 'src/game/ChampionInstance.ts', symbol: 'ChampionInstance.getStatsWithEnhancements' },
      { path: 'src/game/runProgression.ts', symbol: 'applyRunProgressStatBonuses' },
    ],
  },
] as const;

export function getNodeEffectEvidence(
  node: AuditableEnhancementNode,
): EnhancementNodeEffectEvidence {
  const contributions: EnhancementEffectContribution[] = [];
  for (const [kind, bonuses] of [
    ['flat', node.statBonuses],
    ['percent', node.percentBonuses],
  ] as const) {
    for (const [id, value] of Object.entries(bonuses ?? {})) {
      const behavior = statBehavior[id];
      if (!behavior || typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Unaudited enhancement stat: ${node.id}:${kind}:${id}`);
      }
      const discrepancies: string[] = [];
      contributions.push({
        kind: 'stat',
        id: `${kind}.${id}`,
        status: discrepancies.length ? 'partial' : 'implemented',
        appliedBehavior: `${kind}.${id}=${value}. ${behavior}`,
        discrepancies,
        runtimeConsumers: [...statSources, ...(statRuntimeSources[id] ?? [])],
        owner: 'EnhancementService / statCalculator / CombatRuleRuntime / traductions',
        followUp: discrepancies.length ? ['TREE-03', 'TREE-04'] : ['TREE-04'],
      });
    }
  }
  for (const { type } of node.effects ?? []) {
    const entry = ENHANCEMENT_EFFECT_EVIDENCE[type];
    if (!entry) throw new Error(`Unaudited enhancement effect: ${node.id}:${type}`);
    contributions.push(entry);
  }
  if (contributions.length === 0)
    throw new Error(`Enhancement without audited contribution: ${node.id}`);
  const statuses = new Set(contributions.map((entry) => entry.status));
  const status = statuses.size === 1 ? contributions[0].status : 'partial';
  return {
    status,
    effectTypes: (node.effects ?? []).map(({ type }) => type),
    appliedBehavior: contributions.map((entry) => entry.appliedBehavior),
    discrepancies: [...new Set(contributions.flatMap((entry) => entry.discrepancies))],
    runtimeConsumers: [
      ...new Map(
        contributions
          .flatMap((entry) => entry.runtimeConsumers)
          .map((source) => [`${source.path}:${source.symbol}`, source]),
      ).values(),
    ],
    owner: [...new Set(contributions.map((entry) => entry.owner))],
    followUp: [...new Set(contributions.flatMap((entry) => entry.followUp))],
    contributions,
    sharedContractIds: ENHANCEMENT_SHARED_EFFECT_CONTRACTS.map(({ id }) => id),
  };
}

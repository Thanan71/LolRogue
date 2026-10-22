/** TREE-01 observations, not gameplay rules. Runtime availability and graph reachability are separate. */
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
        'Multiplie les dégâts par 1 + value si les PV courants de la cible sont strictement sous 40 %.',
        [runtime('beforeDamage')],
      ),
      effect('burst_amplify', 'Multiplie les dégâts de l’action SpellR par 1 + value.', [
        runtime('beforeDamage'),
      ]),
      effect(
        'survival_shield',
        'Sous 20 % PV avant le coup, le bus émet un bouclier puis marque la source utilisée jusqu’au reset du combat.',
        [runtime('beforeDamage'), battle('_applyDamageToTarget'), resolver],
        [
          'Phénix : le texte FR/EN annonce 60 secondes ; le bus autorise une seule émission par combat et ignore cooldown.',
          'BattleManager ne résout pas beforeRules.instantEffects : le bouclier émis n’est pas appliqué au combat normal.',
          'Le seuil est testé avant les dégâts ; le passage de plus de 20 % à moins de 20 % ne déclenche pas le bouclier sur ce coup.',
        ],
      ),
      effect(
        'revive',
        'Une fois par champion et par combat, before_defeat conserve 1 PV après les priorités augment puis objet.',
        [runtime('beforeDefeat'), battle('_applyDamageToTarget')],
        [
          'Aucune immunité de 2 secondes ni recharge de 120 secondes n’est appliquée ; duration et cooldown sont ignorés.',
        ],
      ),
      effect(
        'ally_damage_reduction',
        'Additionne les valeurs de tous les loadouts de l’équipe aux réductions entrantes, plafonnées à 100 %.',
        [runtime('beforeDamage'), runtime('getAllTeamEnhancements')],
        [
          'La proximité n’est pas représentée ; le porteur est inclus et un allié vaincu reste contributeur tant que son loadout existe.',
        ],
      ),
      effect(
        'thornmail',
        'Renvoie amount × value en dégâts vrais sans déclenchement récursif des règles après les dégâts reçus.',
        [runtime('afterDamage'), resolver],
        [
          'Le texte limite aux dégâts physiques ; le bus ne filtre pas damageType et le renvoi est vrai.',
        ],
      ),
      effect(
        'burn_reflect',
        'Après une attaque de base reçue, renvoie les PV max de l’attaquant × value en dégâts vrais.',
        [runtime('afterDamage'), resolver],
        ['Le texte FR/EN annonce des dégâts magiques ; le résolveur applique des dégâts vrais.'],
      ),
      effect(
        'vengeance_burst',
        'Cumule les dégâts HP reçus ; à partir de 500, émet value dégâts vrais vers tous les ennemis vivants, une fois par combat.',
        [runtime('afterDamage'), resolver],
        [
          'La proximité annoncée n’est pas représentée ; la protection par bouclier ne contribue pas au compteur damage_dealt.',
        ],
      ),
      effect(
        'slow',
        'Après un dégât de sort, applique value de ralentissement pendant max(1, round(duration)) tours ; les ralentissements cumulés sont plafonnés à 60 %.',
        [
          runtime('afterDamage'),
          resolver,
          { path: 'src/game/effects/EffectManager.ts', symbol: 'EffectManager.getSpeedMultiplier' },
        ],
        [
          'La seconde annoncée devient un tour ; les contrôles émis par ce résolveur ne passent pas par les multiplicateurs ténacité/extension des sorts.',
        ],
      ),
      effect(
        'root_chance',
        'Après chaque événement de dégâts de sort, tire random() < value et applique Snare pendant max(1, round(duration)) tours.',
        [runtime('afterDamage'), resolver],
        [
          'La seconde annoncée devient un tour ; le tirage est par événement de dégâts et le résolveur ne passe pas par ténacité/extension.',
        ],
      ),
      effect(
        'mana_restore',
        'Sur une élimination créditée au porteur, restaure value PM avec plafond maxMp.',
        [runtime('onKill'), resolver],
        ['Le texte annonce des sbires ; aucun test de type de victime n’existe dans le bus.'],
      ),
      effect(
        'cdr_ultimate',
        'Pour R, multiplie la recharge par 1 - somme(value), après 100 / (100 + hâte) ; multiplicateur minimum 0,1.',
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
        'Une élimination du porteur pose un bonus relatif attackSpeed pendant round(duration) tours ; une nouvelle élimination remplace et rafraîchit ce bonus.',
        [runtime('onKill'), runtime('getStatBonuses'), runtime('onTurnEnd')],
      ),
      effect(
        'bleed',
        'Après chaque attaque de base infligeant des dégâts HP, émet un DoT de PV max cible × value, réparti en round(duration) tours, en dégâts vrais.',
        [
          runtime('afterDamage'),
          resolver,
          { path: 'src/game/effects/DamageEffect.ts', symbol: 'DamageEffect.tick' },
          { path: 'src/game/effects/EffectManager.ts', symbol: 'EffectManager.apply' },
          battle('_tickTurnEffects'),
        ],
        [
          'Aucun tirage de chance : Tir Déchirant s’applique à chaque événement éligible malgré les 15 % annoncés.',
          'Les durées annoncées en secondes sont utilisées comme tours ; chaque tick est arrondi séparément, sans garantie d’un total exact.',
          'Chaque application crée une instance indépendante (maxStacks=1), sans plafond global ni rafraîchissement ; les ticks repassent par before_damage et les boucliers.',
        ],
      ),
      effect('dodge', 'Sur attaque de base, random() < value met la réduction entrante à 100 %.', [
        runtime('beforeDamage'),
      ]),
      effect(
        'berserker',
        'Multiplie les dégâts par 1 + value quand les PV du porteur sont strictement sous 50 %.',
        [runtime('beforeDamage')],
      ),
      effect(
        'champion_damage',
        'Multiplie tous les dégâts par 1 + value sans classification de la cible.',
        [runtime('beforeDamage')],
        ['Le texte annonce les champions ; aucun prédicat de type de cible n’est présent.'],
      ),
      effect(
        'duelist',
        'Quand chaque camp possède exactement un acteur vivant, multiplie les dégâts sortants par 1 + value et ajoute 15 % de réduction entrante.',
        [runtime('beforeDamage')],
        [
          'Aucun contrôle du type champion de l’adversaire malgré le texte ; le bonus défensif de 15 % est codé dans le handler.',
        ],
      ),
      effect(
        'heal_on_kill',
        'Une élimination créditée au porteur émet un soin de ses PV max × value ; amplification du soin et plafond HP ensuite.',
        [runtime('onKill'), resolver, battle('_applyHeal')],
      ),
      effect(
        'heal_amp',
        'Ajoute value au multiplicateur des soins dont le porteur est la source ; cumul additif avec Spirit Visage du destinataire.',
        [runtime('getHealMultiplier'), battle('_applyHeal')],
      ),
      effect(
        'shield_amp',
        'Ajoute value au multiplicateur des boucliers de sort dont le porteur est la source.',
        [
          runtime('getShieldMultiplier'),
          {
            path: 'src/game/battle/BattleSpellEffectResolver.ts',
            symbol: 'BattleSpellEffectResolver.resolve',
          },
        ],
      ),
      effect(
        'damage_aura',
        'Additionne les values de toute l’équipe puis multiplie les dégâts sortants par 1 + somme.',
        [runtime('beforeDamage'), runtime('getAllTeamEnhancements')],
        [
          'La proximité n’est pas représentée ; le porteur est inclus et la défaite du contributeur ne retire pas son aura du loadout.',
        ],
      ),
      effect(
        'cc_extension',
        'Multiplie la durée des contrôles de sort par 1 + somme(value), avant ténacité, arrondis et plafonds par type.',
        [
          runtime('getAppliedControlDurationMultiplier'),
          {
            path: 'src/game/battle/BattleSpellEffectResolver.ts',
            symbol: 'BattleSpellEffectResolver.resolve',
          },
        ],
        [
          'Les contrôles provenant de BattleRuleEffectResolver contournent ce multiplicateur ; les arrondis peuvent annuler le gain sur une courte durée.',
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
    'Bonus secondaire plat divisé par 100, appliqué à tous les événements damage_dealt du porteur.',
  omnivamp:
    'Même consommateur que lifesteal : les deux pourcentages plats s’additionnent aux soins après dégâts.',
  tenacity:
    'Bonus secondaire plat : max(0,2 ; 1 - max(0, valeur) / 100), appliqué aux contrôles de sort.',
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

const nodeDiscrepancies: Readonly<Record<string, readonly string[]>> = {
  mage_burst_2: [
    'Combustion annonce +15 % de dégâts magiques mais livre percent.ap=0,15 : +15 % de puissance ; dégâts de base et dégâts sans ratio AP inchangés.',
  ],
  fighter_bruiser_1: [
    'Frappe Lourde annonce +5 % de dégâts mais livre percent.atk=0,05 : +5 % de dégâts d’attaque, sans multiplication globale.',
  ],
  mage_control_2: [
    'Canalisation stocke percent.abilityHaste=0,1 ; le runtime convertit en 10 points, et non +10 % de hâte. L’aperçu canonique filtre cette stat secondaire.',
  ],
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
      'Toute future correction de mécanique attend TREE-03/04 et une version future ; cet audit ne modifie ni gameplay, ni hash, ni replay archivé.',
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
      const discrepancies = [...(nodeDiscrepancies[node.id] ?? [])];
      if (id === 'lifesteal')
        discrepancies.push(
          'Vol de vie appliqué aussi aux sorts et DoT, sans restriction aux attaques de base.',
        );
      if (id === 'tenacity')
        discrepancies.push(
          'Ne passe pas par les contrôles de BattleRuleEffectResolver ; les arrondis peuvent supprimer le gain.',
        );
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

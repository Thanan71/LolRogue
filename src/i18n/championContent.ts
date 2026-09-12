import englishChampionContentJson from '@/data/generated/champion-content.en-US.json';
import frenchChampionContentJson from '@/data/generated/champions-parsed.json';

export type ChampionContentLocale = 'fr-FR' | 'en-US';

export type ChampionContentCopy = Readonly<{
  name: string;
  description: string;
}>;

export type ChampionContentEntry = Readonly<{
  name: string;
  title: string;
  passive: ChampionContentCopy;
  spells: Readonly<Record<string, ChampionContentCopy>>;
}>;

export type ChampionContentById = Readonly<Record<string, ChampionContentEntry>>;

type ChampionContentOverride = Readonly<Omit<ChampionContentEntry, 'name'>>;
type ChampionContentOverridesById = Readonly<Record<string, ChampionContentOverride>>;

type ChampionContentSource = Readonly<{
  id: string;
  name: string;
  title: string;
  passive: ChampionContentCopy;
  spells: readonly (ChampionContentCopy & Readonly<{ id: string }>)[];
}>;

const implementedFrFR = {
  Garen: {
    title: 'Force de Demacia',
    passive: {
      name: 'Persévérance',
      description:
        'Si Garen n’a pas subi de dégâts ou de compétences ennemies récemment, il régénère un pourcentage de ses PV totaux chaque seconde.',
    },
    spells: {
      GarenQ: {
        name: 'Coup décisif',
        description:
          'Garen gagne un bonus de vitesse de déplacement et purge les ralentissements. Sa prochaine attaque inflige des dégâts supplémentaires et réduit la cible au silence.',
      },
      GarenW: {
        name: 'Courage',
        description:
          'Garen active un bouclier qui absorbe les dégâts et augmente temporairement son armure et sa résistance magique.',
      },
      GarenE: {
        name: 'Jugement',
        description:
          'Garen donne des coups d’épée tourbillonnants, infligeant des dégâts physiques aux ennemis proches.',
      },
      GarenR: {
        name: 'Justice de Demacia',
        description:
          'Garen invoque la puissance de Demacia pour exécuter un champion ennemi, infligeant des dégâts bruts dont le montant dépend des PV manquants.',
      },
    },
  },
  Annie: {
    title: 'Enfant des ténèbres',
    passive: {
      name: 'Pyromanie',
      description:
        'Après avoir utilisé 4 compétences, sa prochaine compétence offensive étourdit la cible pendant 1,75 s.',
    },
    spells: {
      AnnieQ: {
        name: 'Désintégration',
        description:
          'Annie projette une boule d’énergie magique infligeant des dégâts. Le mana dépensé lui est restitué si la cible est éliminée.',
      },
      AnnieW: {
        name: 'Incinération',
        description:
          'Annie projette un cône de flammes, infligeant des dégâts magiques à tous les ennemis dans la zone.',
      },
      AnnieE: {
        name: 'Bouclier en fusion',
        description:
          'Octroie à Annie ou à un allié un bonus de vitesse de déplacement et un bouclier.',
      },
      AnnieR: {
        name: 'Invocation : Tibbers',
        description:
          'Annie invoque Tibbers, infligeant des dégâts magiques dans la zone. Tibbers attaque et brûle les ennemis proches.',
      },
    },
  },
  Ashe: {
    title: 'Archère de givre',
    passive: {
      name: 'Tir givrant',
      description:
        'Les attaques d’Ashe ralentissent ses cibles et infligent des dégâts supplémentaires aux cibles affectées par le ralentissement.',
    },
    spells: {
      AsheQ: {
        name: 'Concentration du ranger',
        description:
          'Ashe génère des effets de Concentration. Au maximum, elle augmente son initiative d’attaque et transforme son attaque en volée de flèches.',
      },
      Volley: {
        name: 'Salve',
        description:
          'Ashe tire des flèches dans une zone conique pour infliger des dégâts supplémentaires et ralentir les cibles.',
      },
      AsheSpiritOfTheHawk: {
        name: 'Rapace',
        description:
          'Ashe envoie son faucon en reconnaissance. La vision n’étant pas simulée en combat, Rapace ne possède qu’un rang.',
      },
      EnchantedCrystalArrow: {
        name: 'Flèche de cristal enchantée',
        description:
          'Ashe tire un trait de glace en ligne droite. Si la flèche touche un champion, elle l’étourdit pendant une durée qui augmente avec la distance et inflige des dégâts.',
      },
    },
  },
  Darius: {
    title: 'Main de Noxus',
    passive: {
      name: 'Plaie béante',
      description:
        'Les attaques de Darius et ses compétences font saigner les ennemis pendant 5 tours (9 dégâts physiques par charge et par tour au niveau 1, jusqu’à 5 charges). À 5 charges, Darius gagne un bonus de dégâts d’attaque.',
    },
    spells: {
      DariusCleave: {
        name: 'Décimation',
        description:
          'Darius donne un coup circulaire avec sa hache. Les ennemis touchés par la lame subissent plus de dégâts. Darius récupère des PV par champion touché par la lame.',
      },
      DariusNoxianTacticsONH: {
        name: 'Estropiaison',
        description:
          'La prochaine attaque de Darius tranche une artère vitale, infligeant des dégâts supplémentaires et ralentissant la cible.',
      },
      DariusAxeGrabCone: {
        name: 'Crampon',
        description:
          'Darius aiguise sa hache, ignorant passivement un pourcentage de l’armure. À l’activation, il attire les ennemis avec sa hache.',
      },
      DariusExecute: {
        name: 'Guillotine noxienne',
        description:
          'Darius saute sur un champion ennemi et donne un coup fatal, infligeant des dégâts bruts. Plus la cible cumule de charges de Plaie béante, plus les dégâts augmentent. Si la cible est éliminée, le délai de récupération est annulé.',
      },
    },
  },
  Lux: {
    title: 'Dame de lumière',
    passive: {
      name: 'Illumination',
      description:
        'Les compétences de Lux marquent la cible pendant quelques secondes. La prochaine attaque de Lux inflige des dégâts magiques supplémentaires.',
    },
    spells: {
      LuxLightBinding: {
        name: 'Entrave de lumière',
        description:
          'Lux projette une sphère de lumière qui immobilise et blesse jusqu’à deux unités ennemies.',
      },
      LuxPrismaticWave: {
        name: 'Barrière prismatique',
        description:
          'Lux lance son bâton et courbe la lumière autour des cibles alliées, les protégeant contre les dégâts.',
      },
      LuxLightStrikeKugel: {
        name: 'Anomalie radieuse',
        description:
          'Crée une anomalie lumineuse ralentissant les ennemis. Peut être détonée pour infliger des dégâts.',
      },
      LuxR: {
        name: 'Éclat final',
        description:
          'Lux tire un rayon lumineux qui inflige des dégâts à toutes les cibles dans la zone. Déclenche l’effet passif Illumination.',
      },
    },
  },
  Soraka: {
    title: 'Enfant des étoiles',
    passive: {
      name: 'Salut',
      description: 'Soraka court plus vite en direction des alliés affaiblis à proximité.',
    },
    spells: {
      SorakaQ: {
        name: 'Appel de l’étoile',
        description:
          'Une étoile s’abat à l’endroit ciblé, infligeant des dégâts magiques et ralentissant. Si un champion est touché, Soraka récupère des PV.',
      },
      SorakaW: {
        name: 'Infusion astrale',
        description: 'Soraka sacrifie une partie de ses PV pour soigner un champion allié.',
      },
      SorakaE: {
        name: 'Équinoxe',
        description:
          'Crée une zone qui réduit au silence et ralentit les ennemis de 30 % pendant un tour.',
      },
      SorakaR: {
        name: 'Souhait',
        description:
          'Soraka remplit ses alliés d’espoir, rendant immédiatement des PV à tous les champions alliés.',
      },
    },
  },
  Jinx: {
    title: 'Gâchette folle',
    passive: {
      name: 'Enthousiasme !',
      description:
        'Jinx reçoit un bonus de vitesse de déplacement et d’initiative d’attaque après une élimination.',
    },
    spells: {
      JinxQ: {
        name: 'Flip flap !',
        description:
          'Jinx alterne entre Bang-Bang (bonus d’initiative d’attaque) et Poiscaille (dégâts de zone).',
      },
      JinxW: {
        name: 'Zap !',
        description:
          'Jinx tire un rayon qui inflige des dégâts au premier ennemi touché, le ralentit et le révèle.',
      },
      JinxE: {
        name: 'Pyromâcheurs !',
        description:
          'Jinx lance des grenades immobilisantes qui explosent au bout de 5 s. Les champions qui marchent dessus sont immobilisés.',
      },
      JinxR: {
        name: 'Super roquette de la mort !',
        description:
          'Jinx tire une super roquette qui traverse la carte. Les dégâts augmentent pendant le trajet et sont amplifiés par les PV manquants.',
      },
    },
  },
  Leona: {
    title: 'Aube radieuse',
    passive: {
      name: 'Rayon de soleil',
      description:
        'Les sorts marquent les ennemis d’un Rayon de soleil. Si des champions alliés blessent ces ennemis, ils dissipent le Rayon et infligent des dégâts magiques supplémentaires.',
    },
    spells: {
      LeonaShieldOfDaybreak: {
        name: 'Bouclier de l’aube',
        description:
          'Leona utilise son bouclier pour sa prochaine attaque de base, infligeant des dégâts magiques supplémentaires et étourdissant la cible.',
      },
      LeonaSolarBarrier: {
        name: 'Éclipse',
        description:
          'Leona lève son bouclier, gagnant armure et résistance magique. Après un délai, elle inflige des dégâts magiques aux ennemis proches.',
      },
      LeonaZenithBlade: {
        name: 'Lame du zénith',
        description:
          'Leona projette une image solaire, infligeant des dégâts magiques aux ennemis en ligne. Le dernier champion touché est immobilisé et Leona fonce vers lui.',
      },
      LeonaSolarFlare: {
        name: 'Éruption solaire',
        description:
          'Leona invoque un rayon d’énergie solaire. Les ennemis au centre sont étourdis, tandis que ceux situés en bordure sont ralentis.',
      },
    },
  },
  Malphite: {
    title: 'Éclat du monolithe',
    passive: {
      name: 'Bouclier de granit',
      description:
        'Malphite est protégé par un bouclier de roche qui absorbe des dégâts équivalents à 7 % de ses PV maximaux. Si Malphite n’est pas touché pendant quelques secondes, l’effet se recharge.',
    },
    spells: {
      SeismicShard: {
        name: 'Éclat sismique',
        description:
          'Malphite envoie un éclat de terre qui inflige des dégâts à la cible et lui dérobe de la vitesse de déplacement pendant 3 s.',
      },
      Obduracy: {
        name: 'Coup de tonnerre',
        description:
          'Pendant quelques secondes, les attaques de Malphite produisent des ondes de choc devant lui.',
      },
      Landslide: {
        name: 'Choc au sol',
        description:
          'Malphite frappe le sol, infligeant des dégâts magiques en fonction de son armure et ralentissant les ennemis.',
      },
      UFSlash: {
        name: 'Force indomptable',
        description:
          'Malphite fonce vers une position à grande vitesse, blessant les ennemis et les projetant dans les airs.',
      },
    },
  },
  Warwick: {
    title: 'Fureur déchaînée de Zaun',
    passive: {
      name: 'Soif inextinguible',
      description:
        'Les attaques de base de Warwick infligent des dégâts magiques supplémentaires. Si Warwick a moins de 50 % de ses PV, il récupère des PV équivalents à ces dégâts. En dessous de 25 % de ses PV, le soin est triplé.',
    },
    spells: {
      WarwickQ: {
        name: 'Dents de la bête',
        description:
          'Warwick mord sa cible, infligeant des dégâts en fonction des PV maximaux de la cible et récupérant des PV.',
      },
      WarwickW: {
        name: 'Traque sanguinaire',
        description:
          'Warwick repère les ennemis ayant moins de 50 % de leurs PV et obtient des bonus de vitesse de déplacement et d’initiative d’attaque contre eux.',
      },
      WarwickE: {
        name: 'Hurlement bestial',
        description:
          'Warwick subit moins de dégâts pendant 2,5 s. À la fin, il hurle, effrayant les ennemis proches.',
      },
      WarwickR: {
        name: 'Contrainte infinie',
        description:
          'Warwick bondit dans une direction, neutralisant le premier champion touché pendant 1,5 s et récupérant des PV à hauteur des dégâts infligés.',
      },
    },
  },
} as const satisfies ChampionContentOverridesById;

type MatchingLocaleCatalog<T extends ChampionContentOverridesById> = Readonly<{
  [ChampionId in keyof T]: Readonly<{
    title: string;
    passive: ChampionContentCopy;
    spells: Readonly<{
      [SpellId in keyof T[ChampionId]['spells']]: ChampionContentCopy;
    }>;
  }>;
}>;

const implementedEnUS = {
  Garen: {
    title: 'the Might of Demacia',
    passive: {
      name: 'Perseverance',
      description:
        'If Garen has not recently taken damage or been hit by an enemy ability, he regenerates a percentage of his total HP every second.',
    },
    spells: {
      GarenQ: {
        name: 'Decisive Strike',
        description:
          'Garen gains bonus movement speed and cleanses slows. His next attack deals bonus damage and silences the target.',
      },
      GarenW: {
        name: 'Courage',
        description:
          'Garen activates a shield that absorbs damage and temporarily increases his armor and magic resistance.',
      },
      GarenE: {
        name: 'Judgment',
        description:
          'Garen spins his sword around himself, dealing physical damage to nearby enemies.',
      },
      GarenR: {
        name: 'Demacian Justice',
        description:
          'Garen calls upon the might of Demacia to execute an enemy champion, dealing true damage based on missing HP.',
      },
    },
  },
  Annie: {
    title: 'the Dark Child',
    passive: {
      name: 'Pyromania',
      description:
        'After Annie casts 4 abilities, her next offensive ability stuns the target for 1.75 seconds.',
    },
    spells: {
      AnnieQ: {
        name: 'Disintegrate',
        description:
          'Annie launches a ball of magical energy that deals damage. The mana cost is refunded if the target is killed.',
      },
      AnnieW: {
        name: 'Incinerate',
        description: 'Annie casts a cone of fire, dealing magic damage to all enemies in the area.',
      },
      AnnieE: {
        name: 'Molten Shield',
        description: 'Grants Annie or an ally bonus movement speed and a shield.',
      },
      AnnieR: {
        name: 'Summon: Tibbers',
        description:
          'Annie summons Tibbers, dealing magic damage in the area. Tibbers attacks and burns nearby enemies.',
      },
    },
  },
  Ashe: {
    title: 'the Frost Archer',
    passive: {
      name: 'Frost Shot',
      description:
        "Ashe's attacks slow their targets, and she deals extra damage to enemies affected by the slow.",
    },
    spells: {
      AsheQ: {
        name: "Ranger's Focus",
        description:
          'Ashe generates Focus stacks. At maximum stacks, she increases her attack initiative and turns her attack into a flurry of arrows.',
      },
      Volley: {
        name: 'Volley',
        description: 'Ashe fires arrows in a cone, dealing bonus damage and slowing their targets.',
      },
      AsheSpiritOfTheHawk: {
        name: 'Hawkshot',
        description:
          'Ashe sends her hawk to scout ahead. Because vision is not simulated in combat, Hawkshot has only one rank.',
      },
      EnchantedCrystalArrow: {
        name: 'Enchanted Crystal Arrow',
        description:
          'Ashe fires a shard of ice in a straight line. If the arrow hits a champion, it stuns them for longer based on distance traveled and deals damage.',
      },
    },
  },
  Darius: {
    title: 'the Hand of Noxus',
    passive: {
      name: 'Hemorrhage',
      description:
        "Darius's attacks and abilities make enemies bleed for 5 turns (9 physical damage per stack per turn at level 1, stacking up to 5 times). At 5 stacks, Darius gains bonus attack damage.",
    },
    spells: {
      DariusCleave: {
        name: 'Decimate',
        description:
          'Darius swings his axe in a circle. Enemies struck by the blade take more damage. Darius restores HP for each champion hit by the blade.',
      },
      DariusNoxianTacticsONH: {
        name: 'Crippling Strike',
        description:
          "Darius's next attack severs a vital artery, dealing bonus damage and slowing the target.",
      },
      DariusAxeGrabCone: {
        name: 'Apprehend',
        description:
          'Darius sharpens his axe, passively ignoring a percentage of armor. When activated, he pulls enemies in with his axe.',
      },
      DariusExecute: {
        name: 'Noxian Guillotine',
        description:
          'Darius leaps onto an enemy champion and strikes a killing blow, dealing true damage. More Hemorrhage stacks mean more damage. If the target is killed, the cooldown is reset.',
      },
    },
  },
  Lux: {
    title: 'the Lady of Luminosity',
    passive: {
      name: 'Illumination',
      description:
        "Lux's abilities mark the target for a few seconds. Lux's next attack deals additional magic damage.",
    },
    spells: {
      LuxLightBinding: {
        name: 'Light Binding',
        description: 'Lux launches a sphere of light that roots and damages up to two enemy units.',
      },
      LuxPrismaticWave: {
        name: 'Prismatic Barrier',
        description:
          'Lux throws her wand and bends light around allied targets, shielding them from damage.',
      },
      LuxLightStrikeKugel: {
        name: 'Lucent Singularity',
        description:
          'Creates a zone of light that slows enemies. It can be detonated to deal damage.',
      },
      LuxR: {
        name: 'Final Spark',
        description:
          'Lux fires a beam of light that damages all targets in the area and triggers Illumination.',
      },
    },
  },
  Soraka: {
    title: 'the Starchild',
    passive: {
      name: 'Salvation',
      description: 'Soraka runs faster toward nearby low-health allies.',
    },
    spells: {
      SorakaQ: {
        name: 'Starcall',
        description:
          'A star falls at the target location, dealing magic damage and slowing enemies. If a champion is hit, Soraka restores HP.',
      },
      SorakaW: {
        name: 'Astral Infusion',
        description: 'Soraka sacrifices some of her HP to heal an allied champion.',
      },
      SorakaE: {
        name: 'Equinox',
        description: 'Creates a zone that silences enemies and slows them by 30% for one turn.',
      },
      SorakaR: {
        name: 'Wish',
        description:
          'Soraka fills her allies with hope, immediately restoring HP to all allied champions.',
      },
    },
  },
  Jinx: {
    title: 'the Loose Cannon',
    passive: {
      name: 'Get Excited!',
      description: 'Jinx gains bonus movement speed and attack initiative after a takedown.',
    },
    spells: {
      JinxQ: {
        name: 'Switcheroo!',
        description:
          'Jinx switches between Pow-Pow (bonus attack initiative) and Fishbones (area damage).',
      },
      JinxW: {
        name: 'Zap!',
        description: 'Jinx fires a beam that damages, slows, and reveals the first enemy hit.',
      },
      JinxE: {
        name: 'Flame Chompers!',
        description:
          'Jinx throws snaring grenades that explode after 5 seconds. Champions who step on them are rooted.',
      },
      JinxR: {
        name: 'Super Mega Death Rocket!',
        description:
          'Jinx fires a super rocket across the map. Its damage increases as it travels and is amplified by missing HP.',
      },
    },
  },
  Leona: {
    title: 'the Radiant Dawn',
    passive: {
      name: 'Sunlight',
      description:
        "Leona's abilities mark enemies with Sunlight. Allied champions who damage those enemies consume the mark and deal additional magic damage.",
    },
    spells: {
      LeonaShieldOfDaybreak: {
        name: 'Shield of Daybreak',
        description:
          'Leona uses her shield for her next basic attack, dealing additional magic damage and stunning the target.',
      },
      LeonaSolarBarrier: {
        name: 'Eclipse',
        description:
          'Leona raises her shield, gaining armor and magic resistance. After a delay, she deals magic damage to nearby enemies.',
      },
      LeonaZenithBlade: {
        name: 'Zenith Blade',
        description:
          'Leona projects a solar image, dealing magic damage to enemies in a line. The last champion hit is rooted, and Leona dashes to them.',
      },
      LeonaSolarFlare: {
        name: 'Solar Flare',
        description:
          'Leona calls down a beam of solar energy. Enemies in the center are stunned, while those at the edge are slowed.',
      },
    },
  },
  Malphite: {
    title: 'Shard of the Monolith',
    passive: {
      name: 'Granite Shield',
      description:
        'Malphite is protected by a rock shield that absorbs damage equal to 7% of his maximum HP. If Malphite has not been hit for a few seconds, the shield recharges.',
    },
    spells: {
      SeismicShard: {
        name: 'Seismic Shard',
        description:
          "Malphite launches a shard of earth, dealing damage and stealing the target's movement speed for 3 seconds.",
      },
      Obduracy: {
        name: 'Thunderclap',
        description: "For a few seconds, Malphite's attacks create shockwaves in front of him.",
      },
      Landslide: {
        name: 'Ground Slam',
        description:
          'Malphite slams the ground, dealing magic damage based on his armor and slowing enemies.',
      },
      UFSlash: {
        name: 'Unstoppable Force',
        description:
          'Malphite charges toward a location at high speed, damaging enemies and knocking them airborne.',
      },
    },
  },
  Warwick: {
    title: 'the Uncaged Wrath of Zaun',
    passive: {
      name: 'Eternal Hunger',
      description:
        "Warwick's basic attacks deal bonus magic damage. If Warwick is below 50% HP, he heals for the same amount. Below 25% HP, the healing is tripled.",
    },
    spells: {
      WarwickQ: {
        name: 'Jaws of the Beast',
        description:
          "Warwick bites his target, dealing damage based on the target's maximum HP and restoring HP.",
      },
      WarwickW: {
        name: 'Blood Hunt',
        description:
          'Warwick detects enemies below 50% HP and gains bonus movement speed and attack initiative against them.',
      },
      WarwickE: {
        name: 'Primal Howl',
        description:
          'Warwick gains damage reduction for 2.5 seconds. At the end, he howls and fears nearby enemies.',
      },
      WarwickR: {
        name: 'Infinite Duress',
        description:
          'Warwick leaps in a direction, suppressing the first champion hit for 1.5 seconds and healing for the damage dealt.',
      },
    },
  },
} as const satisfies MatchingLocaleCatalog<typeof implementedFrFR>;

function createCatalog(
  sources: readonly ChampionContentSource[],
  overrides: ChampionContentOverridesById,
): ChampionContentById {
  const catalog: Record<string, ChampionContentEntry> = Object.fromEntries(
    sources.map((champion) => [
      champion.id,
      {
        name: champion.name.trim(),
        title: champion.title.trim(),
        passive: {
          name: champion.passive.name.trim(),
          description: champion.passive.description.trim(),
        },
        spells: Object.fromEntries(
          champion.spells.map((spell) => [
            spell.id,
            { name: spell.name.trim(), description: spell.description.trim() },
          ]),
        ),
      },
    ]),
  );

  for (const [championId, override] of Object.entries(overrides)) {
    const generated = catalog[championId];
    if (!generated) throw new Error(`Missing generated champion content for ${championId}.`);
    catalog[championId] = { ...generated, ...override };
  }

  return catalog;
}

const frFR = createCatalog(
  frenchChampionContentJson as readonly ChampionContentSource[],
  implementedFrFR,
);
const enUS = createCatalog(
  englishChampionContentJson.champions as readonly ChampionContentSource[],
  implementedEnUS,
);

export const championContent: Readonly<Record<ChampionContentLocale, ChampionContentById>> = {
  'fr-FR': frFR,
  'en-US': enUS,
};

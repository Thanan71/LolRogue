import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'lol');

/**
 * Maps raw Data Dragon stats to our clean ChampionStats type.
 */
function parseStats(rawStats) {
  return {
    hp: rawStats.hp,
    mp: rawStats.mp,
    moveSpeed: rawStats.movespeed,
    armor: rawStats.armor,
    magicResist: rawStats.spellblock,
    attackDamage: rawStats.attackdamage,
    attackSpeed: rawStats.attackspeed,
    attackRange: rawStats.attackrange,
    hpPerLevel: rawStats.hpperlevel,
    mpPerLevel: rawStats.mpperlevel,
    armorPerLevel: rawStats.armorperlevel,
    magicResistPerLevel: rawStats.spellblockperlevel,
    attackDamagePerLevel: rawStats.attackdamageperlevel,
    attackSpeedPerLevel: rawStats.attackspeedperlevel,
    hpRegen: rawStats.hpregen,
    hpRegenPerLevel: rawStats.hpregenperlevel,
    mpRegen: rawStats.mpregen,
    mpRegenPerLevel: rawStats.mpregenperlevel,
    crit: rawStats.crit,
    critPerLevel: rawStats.critperlevel,
  };
}

/**
 * Maps raw Data Dragon spell to our clean Spell type.
 */
function parseSpell(rawSpell) {
  return {
    id: rawSpell.id,
    name: rawSpell.name,
    description: rawSpell.description,
    maxRank: rawSpell.maxrank,
    cooldown: rawSpell.cooldown,
    cost: rawSpell.cost,
    range: rawSpell.range,
    image: rawSpell.image.full,
  };
}

/**
 * Maps raw Data Dragon passive to our clean Passive type.
 */
function parsePassive(rawPassive) {
  return {
    name: rawPassive.name,
    description: rawPassive.description,
    image: rawPassive.image.full,
  };
}

/**
 * Normalizes tags to valid ChampionTag values.
 */
function parseTags(rawTags) {
  const validTags = ['Fighter', 'Mage', 'Assassin', 'Tank', 'Marksman', 'Support'];
  return rawTags.filter((tag) => validTags.includes(tag));
}

/**
 * Main parsing function.
 * Reads champions.json + per-champion detail JSONs, outputs a clean array.
 */
async function main() {
  try {
    console.log('🔧 Parsing Champion Data');
    console.log('========================\n');

    // Read champions.json (summary list)
    const summaryPath = path.join(OUTPUT_DIR, 'champions.json');
    const summaryRaw = await fs.readFile(summaryPath, 'utf-8');
    const summary = JSON.parse(summaryRaw);
    const version = summary.version;
    console.log(`📌 Data version: ${version}\n`);

    const championsDetailDir = path.join(OUTPUT_DIR, 'champions-detail');
    const championEntries = Object.values(summary.data);
    console.log(`📊 Found ${championEntries.length} champions to parse\n`);

    const parsed = [];

    for (const raw of championEntries) {
      // Try to load per-champion detail file
      const detailPath = path.join(championsDetailDir, `${raw.id}.json`);
      let detail = null;
      try {
        const detailRaw = await fs.readFile(detailPath, 'utf-8');
        const detailJson = JSON.parse(detailRaw);
        detail = detailJson.data[raw.id];
      } catch {
        // No detail file — skip spells/passive
      }

      const champion = {
        id: raw.id,
        key: raw.key,
        name: raw.name,
        title: raw.title,
        tags: parseTags(raw.tags),
        resourceType: raw.partype || 'None',
        stats: parseStats(raw.stats),
        spells: detail ? detail.spells.map(parseSpell) : [],
        passive: detail ? parsePassive(detail.passive) : { name: '', description: '', image: '' },
        iconUrl: `/data/lol/img/champions/${raw.image.full}`,
      };

      parsed.push(champion);
    }

    // Sort alphabetically by name
    parsed.sort((a, b) => a.name.localeCompare(b.name));

    // Write output
    const outputPath = path.join(OUTPUT_DIR, 'champions-parsed.json');
    await fs.writeFile(outputPath, JSON.stringify(parsed, null, 2), 'utf-8');
    console.log(`✅ Parsed ${parsed.length} champions → champions-parsed.json`);

    // Print summary stats
    const tagCounts = {};
    for (const c of parsed) {
      for (const tag of c.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    console.log('\n📊 Tag distribution:');
    for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${tag}: ${count}`);
    }

    const resourceCounts = {};
    for (const c of parsed) {
      resourceCounts[c.resourceType] = (resourceCounts[c.resourceType] || 0) + 1;
    }
    console.log('\n⚡ Resource type distribution:');
    for (const [res, count] of Object.entries(resourceCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${res}: ${count}`);
    }

    const withSpells = parsed.filter((c) => c.spells.length > 0).length;
    console.log(`\n🎯 Champions with spells data: ${withSpells}/${parsed.length}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

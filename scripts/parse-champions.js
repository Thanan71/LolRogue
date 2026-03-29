import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'lol');
const CD_BASE = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1';

function detectTargeting(rawSpell, tooltip) {
  const t = ((tooltip||'') + ' ' + (rawSpell.name||'') + ' ' + (rawSpell.description||'')).toLowerCase();
  if (/\b(alli|ally|soigne.*alli|bouclier.*alli)/.test(t)) return 'ally';
  if (/\b(zone|cercle|autour|proches|circulaire|dans la zone|aoe)/.test(t)) return 'area';
  if (/\b(self|soi|se |gagne.*vitesse)/.test(t) && !/\bennemi/.test(t.slice(0,100))) {
    if (!/\b(lance|projette|tire|frappe|inflige)/.test(t)) return 'self';
  }
  if (rawSpell.costType && rawSpell.costType.trim()==='Passive') return 'passive';
  return 'enemy';
}

function extractBaseDamage(cdSpell, maxRank) {
  if (!cdSpell?.effectAmounts) return [];
  for (const key of ['Effect1Amount','Effect2Amount']) {
    const v = cdSpell.effectAmounts[key];
    if (v && v.some(x=>x>0)) return v.slice(0,maxRank);
  }
  return [];
}

function extractEffectValues(cdSpell, maxRank) {
  if (!cdSpell?.effectAmounts) return [];
  for (let i=1;i<=10;i++) {
    const v = cdSpell.effectAmounts['Effect'+i+'Amount'];
    if (v && v.some(x=>x>0)) return v.slice(0,maxRank);
  }
  return [];
}

function extractEffects(rawSpell, tooltip, cdSpell) {
  const effects = [];
  for (const {tag,type} of [{tag:'magicDamage',type:'magical'},{tag:'physicalDamage',type:'physical'},{tag:'trueDamage',type:'true'}]) {
    if (new RegExp('<'+tag+'>','gi').test(tooltip||'')) {
      const e = {type:'damage',damageType:type,adRatio:0,apRatio:0,baseDamage:extractBaseDamage(cdSpell,rawSpell.maxrank)};
      if (cdSpell?.coefficients) { e.adRatio=cdSpell.coefficients.coefficient1||0; e.apRatio=cdSpell.coefficients.coefficient2||0; }
      effects.push(e);
    }
  }
  if (/<heal>/i.test(tooltip||'')||/soign|heal/i.test(rawSpell.description||'')) {
    const e={type:'heal',apRatio:0,baseValue:extractEffectValues(cdSpell,rawSpell.maxrank)};
    if (cdSpell?.coefficients) e.apRatio=cdSpell.coefficients.coefficient1||0;
    effects.push(e);
  }
  if (/<shield>/i.test(tooltip||'')||/bouclier|shield/i.test(rawSpell.description||'')) {
    effects.push({type:'shield',apRatio:0,baseValue:extractEffectValues(cdSpell,rawSpell.maxrank)});
  }
  const ccMap=[{p:/\b(étourdi|stun)\b/i,t:'stun'},{p:/\b(enracin|snare|root|immobilis)\b/i,t:'snare'},{p:/\b(knock[- ]?up|déstabilis)\b/i,t:'knockup'},{p:/\b(ralent|slow)\b/i,t:'slow'},{p:/\b(charm|charme)\b/i,t:'charm'},{p:/\b(silence)\b/i,t:'silence'}];
  for (const {p,t} of ccMap) {
    if (p.test(tooltip||'')||p.test(rawSpell.description||'')) {
      const e={type:'cc',ccType:t};
      if (t==='slow') { const m=(tooltip||'').match(/ralentit.*?(\d+)%/i); if(m) e.slowPercent=parseInt(m[1])/100; }
      effects.push(e);
    }
  }
  if (/<speed>/i.test(tooltip||'')) effects.push({type:'buff',stat:'spd',modifierType:'percent',values:extractEffectValues(cdSpell,rawSpell.maxrank),buffDuration:3});
  if (/ex[eé]cut|execute/i.test(rawSpell.description||'')) effects.push({type:'execute',threshold:0.3});
  return effects;
}

// Post-processing functions to automatically fix problematic values

/**
 * Fix negative scaling ratios by setting them to 0
 */
function fixNegativeScaling(parsed) {
  for (const champ of parsed) {
    for (const spell of champ.spells) {
      if (spell.scaling.adRatio < 0) spell.scaling.adRatio = 0;
      if (spell.scaling.apRatio < 0) spell.scaling.apRatio = 0;
      for (const effect of spell.effects) {
        if (effect.adRatio !== undefined && effect.adRatio < 0) effect.adRatio = 0;
        if (effect.apRatio !== undefined && effect.apRatio < 0) effect.apRatio = 0;
      }
    }
    if (champ.passive) {
      if (champ.passive.scaling.adRatio < 0) champ.passive.scaling.adRatio = 0;
      if (champ.passive.scaling.apRatio < 0) champ.passive.scaling.apRatio = 0;
    }
  }
}

/**
 * Fix passive targeting: if passive has heal effect and description mentions self-heal, set targeting to 'self'
 */
function fixPassiveTargeting(parsed) {
  for (const champ of parsed) {
    if (champ.passive) {
      const desc = (champ.passive.description || '').toLowerCase();
      const hasHealEffect = champ.passive.effects.some(e => e.type === 'heal');
      
      // If passive has heal effect and description mentions self-healing keywords
      if (hasHealEffect && (/\b(se |soi|récupère|gagne)\b/.test(desc) && !/\b(ennemi|adversaire)\b/.test(desc))) {
        champ.passive.targeting = 'self';
      }
    }
  }
}

/**
 * Add missing CC effects based on spell descriptions
 */
function addMissingCCEffects(parsed) {
  const ccPatterns = [
    { pattern: /\b(immobilis|étourdi|stun)\b/i, ccType: 'stun' },
    { pattern: /\b(enracin|snare|root)\b/i, ccType: 'snare' },
    { pattern: /\b(knock[- ]?up|déstabilis)\b/i, ccType: 'knockup' },
    { pattern: /\b(ralent|slow)\b/i, ccType: 'slow' },
    { pattern: /\b(charm|charme)\b/i, ccType: 'charm' },
    { pattern: /\b(silence)\b/i, ccType: 'silence' }
  ];
  
  for (const champ of parsed) {
    for (const spell of champ.spells) {
      const desc = (spell.description || '').toLowerCase();
      const tooltip = (spell.tooltip || '').toLowerCase();
      const text = desc + ' ' + tooltip;
      
      // Check if spell already has a CC effect
      const hasCC = spell.effects.some(e => e.type === 'cc');
      
      if (!hasCC) {
        // Check for CC patterns in description
        for (const { pattern, ccType } of ccPatterns) {
          if (pattern.test(text)) {
            spell.effects.push({ type: 'cc', ccType });
            break; // Only add one CC effect per spell
          }
        }
      }
    }
  }
}

/**
 * Ensure all spells have at least one damage effect if they have scaling
 */
function ensureDamageEffects(parsed) {
  for (const champ of parsed) {
    for (const spell of champ.spells) {
      const hasDamage = spell.effects.some(e => e.type === 'damage');
      const hasScaling = spell.scaling.adRatio > 0 || spell.scaling.apRatio > 0;
      
      if (!hasDamage && hasScaling) {
        const damageType = spell.scaling.apRatio > 0 ? 'magical' : 'physical';
        spell.effects.push({
          type: 'damage',
          damageType,
          adRatio: spell.scaling.adRatio,
          apRatio: spell.scaling.apRatio,
          baseDamage: []
        });
      }
    }
  }
}

function parseSpell(rawSpell, cdSpell, champId) {
  const tooltip = rawSpell.tooltip || '';
  const maxRank = rawSpell.maxrank || 5;
  const cooldown = (rawSpell.cooldown||[]).slice(0,maxRank);
  const cost = (rawSpell.cost||[]).slice(0,maxRank);
  const range = (rawSpell.range||[]).slice(0,maxRank);
  const targeting = detectTargeting(rawSpell, tooltip);
  const scaling = {adRatio:0,apRatio:0};
  
  // Extract scaling from Community Dragon data
  if (cdSpell?.coefficients) {
    scaling.adRatio = cdSpell.coefficients.coefficient1 || 0;
    scaling.apRatio = cdSpell.coefficients.coefficient2 || 0;
  }
  
  const effects = extractEffects(rawSpell, tooltip, cdSpell);
  
  if (effects.length === 0 && (scaling.adRatio > 0 || scaling.apRatio > 0)) {
    effects.push({type:'damage',damageType:scaling.apRatio > 0 ? 'magical' : 'physical',adRatio:scaling.adRatio,apRatio:scaling.apRatio,baseDamage:extractBaseDamage(cdSpell,maxRank)});
  }
  return {id:rawSpell.id,name:rawSpell.name,description:rawSpell.description,maxRank,cooldown,cost,range,image:rawSpell.image?.full||(rawSpell.id+'.png'),targeting,scaling,effects};
}

function parsePassive(rawPassive, cdPassive, champId) {
  const desc = rawPassive.description||'';
  const effects = [];
  if (/dégâts|damage|inflige/i.test(desc)) effects.push({type:'damage',damageType:/magique/i.test(desc)?'magical':'physical',adRatio:0,apRatio:0,baseDamage:[]});
  if (/soign|heal|récupère.*pv/i.test(desc)) effects.push({type:'heal',apRatio:0,baseValue:[]});
  if (/bouclier|shield/i.test(desc)) effects.push({type:'shield',apRatio:0,baseValue:[]});
  if (/ralenti|slow/i.test(desc)) effects.push({type:'cc',ccType:'slow'});
  let targeting='passive';
  if (/autour|proches|zone/i.test(desc)) targeting='area';
  else if (/alli/i.test(desc)) targeting='ally';
  else if (/se |soi/i.test(desc) && !/ennemi/i.test(desc)) targeting='self';
  return {name:rawPassive.name,description:rawPassive.description,image:rawPassive.image?.full||(champId+'_Passive.png'),targeting,scaling:{adRatio:0,apRatio:0},effects};
}

function parseStats(s) {
  return {hp:s.hp,mp:s.mp,moveSpeed:s.movespeed,armor:s.armor,magicResist:s.spellblock,attackDamage:s.attackdamage,attackSpeed:s.attackspeed,attackRange:s.attackrange,hpPerLevel:s.hpperlevel,mpPerLevel:s.mpperlevel,armorPerLevel:s.armorperlevel,magicResistPerLevel:s.spellblockperlevel,attackDamagePerLevel:s.attackdamageperlevel,attackSpeedPerLevel:s.attackspeedperlevel,hpRegen:s.hpregen,hpRegenPerLevel:s.hpregenperlevel,mpRegen:s.mpregen,mpRegenPerLevel:s.mpregenperlevel,crit:s.crit,critPerLevel:s.critperlevel};
}

function parseTags(tags) { return tags.filter(t=>['Fighter','Mage','Assassin','Tank','Marksman','Support'].includes(t)); }

async function fetchCD(key) {
  try { const r=await fetch(CD_BASE+'/champions/'+key+'.json'); return r.ok?await r.json():null; } catch { return null; }
}

async function main() {
  try {
    console.log('Phase 2: Ability Parser');
    const summaryPath=path.join(OUTPUT_DIR,'champions.json');
    const summary=JSON.parse(await fs.readFile(summaryPath,'utf-8'));
    const version=summary.version;
    console.log('Version: '+version);
    const detailDir=path.join(OUTPUT_DIR,'champions-detail');
    const entries=Object.values(summary.data);
    console.log('Found '+entries.length+' champions');
    const parsed=[]; let cdCount=0; let spellCount=0;
    for (const raw of entries) {
      let detail=null;
      try { const d=JSON.parse(await fs.readFile(path.join(detailDir,raw.id+'.json'),'utf-8')); detail=d.data[raw.id]; } catch {}
      const cdData=await fetchCD(raw.key);
      if (cdData) cdCount++;
      const spells=[];
      if (detail) {
        for (let i=0;i<detail.spells.length;i++) {
          const parsedSpell=parseSpell(detail.spells[i],cdData?.spells?.[i]||null,raw.id);
          spells.push(parsedSpell);
          spellCount++;
        }
      }
      let passive={name:'',description:'',image:'',targeting:'passive',scaling:{adRatio:0,apRatio:0},effects:[]};
      if (detail?.passive) passive=parsePassive(detail.passive,null,raw.id);
      parsed.push({id:raw.id,key:raw.key,name:raw.name,title:raw.title,tags:parseTags(raw.tags),resourceType:raw.partype||'None',stats:parseStats(raw.stats),spells,passive,iconUrl:'/data/lol/img/champions/'+raw.image.full});
    }
    // Apply post-processing fixes
    fixNegativeScaling(parsed);
    fixPassiveTargeting(parsed);
    addMissingCCEffects(parsed);
    ensureDamageEffects(parsed);
    
    parsed.sort((a,b)=>a.name.localeCompare(b.name));
    await fs.writeFile(path.join(OUTPUT_DIR,'champions-parsed.json'),JSON.stringify(parsed,null,2),'utf-8');
    console.log('Parsed '+parsed.length+' champions');
    console.log('Community Dragon: '+cdCount+'/'+parsed.length);
    console.log('Total spells: '+spellCount);
    const tCounts={},eCounts={};
    for (const c of parsed) {
      for (const tag of c.tags) tCounts[tag]=(tCounts[tag]||0)+1;
      for (const s of c.spells) { eCounts[s.targeting]=(eCounts[s.targeting]||0)+1; for (const e of s.effects) tCounts[e.type]=(tCounts[e.type]||0)+1; }
    }
    console.log('Targeting:',JSON.stringify(eCounts));
    console.log('Done!');
  } catch(e) { console.error('Error:',e.message); process.exit(1); }
}
main();

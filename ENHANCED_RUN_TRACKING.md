# Enhanced Run Tracking System

## Overview

This document describes the comprehensive run tracking system implemented for game balancing in LolRogue. The system captures detailed data across three phases to enable precise balancing of champions, map generation, and difficulty.

## Database Migration

Run the migration to add all new tracking tables and columns:

```bash
# The schema is included in: supabase/migrations/00000000000000_init.sql
# It will be automatically applied when you run your Supabase migrations
```

## Phase 1: Enhanced Run Summary Data

### New Fields Added to `runs` Table

| Field | Type | Description | Use Case |
|-------|------|-------------|----------|
| `seed` | BIGINT | Random seed used for map generation | Reproduce specific runs for testing |
| `node_types_visited` | TEXT[] | Array of node types encountered | Analyze path diversity |
| `nodes_completed` | INTEGER | Total nodes completed | Measure progression |
| `combats_won` | INTEGER | Number of combats won | Combat success rate |
| `combats_lost` | INTEGER | Number of combats lost | Identify difficulty spikes |
| `champions_recruited` | INTEGER | Champions added during run | Recruitment balance |
| `items_purchased` | INTEGER | Items bought in shops | Economy balance |
| `total_gold_spent` | INTEGER | Total gold spent | Gold flow analysis |
| `total_healing_done` | INTEGER | Total healing done by team | Support/heal balance |
| `total_healing_received` | INTEGER | Total healing received | Sustain balance |
| `total_damage_received` | INTEGER | Total damage taken by team | Tankiness balance |
| `elite_kills` | INTEGER | Elite enemies killed | Elite difficulty check |
| `boss_kills` | INTEGER | Boss enemies killed | Boss difficulty check |

### New Fields Added to `run_team_members` Table

| Field | Type | Description | Use Case |
|-------|------|-------------|----------|
| `damage_received` | INTEGER | Damage taken by this champion | Tankiness assessment |
| `healing_done` | INTEGER | Healing done by champion | Support effectiveness |
| `healing_received` | INTEGER | Healing received by champion | Sustain needs |
| `time_alive_seconds` | INTEGER | Time champion survived | Survival analysis |
| `crowd_control_duration` | INTEGER | CC duration applied/received | CC balance |
| `gold_earned` | INTEGER | Gold earned by champion | Economy per champ |
| `cs_score` | INTEGER | Creep score / farm | Farm balance |

## Phase 2: Node Visit Tracking

### New Table: `run_node_visits`

Tracks every node visited during a run for map generation analysis.

```sql
CREATE TABLE run_node_visits (
  id UUID,
  run_id UUID,
  node_id TEXT,
  node_type TEXT, -- combat, elite, boss, shop, rest, event, treasure, recruit
  biome TEXT, -- top_lane, jungle, mid_lane, bot_lane, river, base
  run_level INTEGER,
  visited_at TIMESTAMPTZ,
  completed BOOLEAN,
  combat_data JSONB, -- Combat-specific data
  shop_data JSONB, -- Shop-specific data
  event_data JSONB, -- Event-specific data
  rest_data JSONB, -- Rest-specific data
  treasure_data JSONB, -- Treasure-specific data
  recruit_data JSONB, -- Recruit-specific data
  created_at TIMESTAMPTZ
);
```

### Example Data Structures

**combat_data:**
```json
{
  "enemies": [
    {"champion_id": "Yasuo", "level": 5, "stat_multiplier": 1.2}
  ],
  "won": true,
  "duration_seconds": 45,
  "team_hp_before": [1000, 800, 1200, 900, 1100],
  "team_hp_after": [600, 200, 1000, 700, 900]
}
```

**shop_data:**
```json
{
  "items_bought": ["item_bf_sword", "item_needlessly_large_rod"],
  "gold_spent": 800,
  "champions_recruited": ["Ahri"]
}
```

## Phase 3: Detailed Combat Tracking

### New Table: `run_combat_log`

Detailed combat logs for precise champion and difficulty balancing.

```sql
CREATE TABLE run_combat_log (
  id UUID,
  run_id UUID,
  node_id TEXT,
  biome TEXT,
  run_level INTEGER,
  is_elite BOOLEAN,
  is_boss BOOLEAN,
  won BOOLEAN,
  duration_seconds INTEGER,
  enemy_team JSONB,
  team_hp_before JSONB,
  team_hp_after JSONB,
  champion_stats JSONB,
  gold_earned INTEGER,
  candies_earned INTEGER,
  created_at TIMESTAMPTZ
);
```

### champion_stats Example

```json
[
  {
    "champion_id": "Ahri",
    "damage_dealt": 5000,
    "damage_received": 2000,
    "healing_done": 500,
    "healing_received": 300,
    "kills": 3,
    "time_alive_seconds": 180,
    "crowd_control_duration": 12
  }
]
```

## Admin Views

The migration creates three helpful views for analysis:

### 1. `admin_champion_stats`

Champion performance statistics:
- Win rates per champion
- Average kills, damage, healing
- Survival rates
- Average run progression

### 2. `admin_biome_stats`

Biome and node difficulty:
- Completion rates per biome
- Combat win rates per biome
- Node type distribution

### 3. `admin_node_type_stats`

Node type distribution across all runs:
- Percentage of each node type
- Completion rates

## CSV Export

The admin panel now exports comprehensive CSV data including all Phase 1 fields:

**Columns exported:**
- Run ID, Seed, Player info
- Result, Level, Waves, Biomes
- Nodes completed, Combats won/lost
- Elite/Boss kills
- Gold earned/spent
- Kills, Damage dealt/received
- Healing done/received
- Candies, Duration
- Champions recruited, Items purchased
- Team composition with detailed stats

## Implementation Guide

### Recording Data During Runs

1. **At run start:** Record seed, start time
2. **On node visit:** Insert into `run_node_visits`
3. **On combat end:** Insert into `run_combat_log`
4. **On shop visit:** Record purchases in node visit
5. **At run end:** Update run with final stats

### Automatic Stat Updates

The migration includes a trigger function `update_run_stats_from_combat_log()` that automatically updates run stats when combat logs are inserted.

### Query Examples

**Find overpowered champions:**
```sql
SELECT * FROM admin_champion_stats 
WHERE win_rate > 65 AND games_played > 10
ORDER BY win_rate DESC;
```

**Find too-difficult biomes:**
```sql
SELECT * FROM admin_biome_stats 
WHERE combat_win_rate < 40
ORDER BY combat_win_rate ASC;
```

**Analyze node type balance:**
```sql
SELECT * FROM admin_node_type_stats;
```

## Next Steps

1. **Implement tracking in game code:**
   - Modify `runService.ts` to record data
   - Add tracking to combat system
   - Update node visit logic

2. **Create analysis dashboard:**
   - Visual charts for champion stats
   - Heatmaps for biome difficulty
   - Trend analysis over time

3. **Set up automated reports:**
   - Weekly balance reports
   - Champion win rate alerts
   - Difficulty spike detection

## Benefits

This comprehensive tracking system enables:

✅ **Champion Balancing** - Identify over/underperforming champions
✅ **Map Generation** - Analyze path choices and node distribution
✅ **Difficulty Tuning** - Pinpoint exact difficulty spikes
✅ **Economy Balance** - Track gold flow and item purchases
✅ **Combat Tuning** - Detailed combat statistics per champion
✅ **Data-Driven Decisions** - Make balancing changes based on real data

The system is designed to be flexible and extensible, allowing for additional tracking as needed.

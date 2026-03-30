import type { Biome, NodeType, RunMap, RunMapColumn, RunMapNode } from '@/types/run';
const BIOMES_MUTABLE: Biome[] = ['forest','desert','tundra','volcano','swamp','ruins','abyss'];

const TOTAL_COLUMNS = 8;
const NODES_PER_COLUMN_MIN = 2;
const NODES_PER_COLUMN_MAX = 4;

const NODE_TYPES: NodeType[] = ['combat', 'combat', 'combat', 'elite', 'shop', 'rest', 'event'];
const BOSS_BIOMES: Biome[] = ['volcano', 'abyss'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nodeId(col: number, row: number): string {
  return `node_${col}_${row}`;
}

function pickBiome(column: number): Biome {
  // Biomes shift as you progress deeper
  if (column <= 1) return 'forest';
  if (column <= 3) return pickRandom(['forest', 'desert', 'tundra'] as Biome[]);
  if (column <= 5) return pickRandom(['desert', 'tundra', 'swamp', 'ruins'] as Biome[]);
  if (column === TOTAL_COLUMNS - 1) return pickRandom(BOSS_BIOMES);
  return pickRandom(BIOMES_MUTABLE);
}

function pickNodeType(column: number): NodeType {
  // Last column is always boss
  if (column === TOTAL_COLUMNS - 1) return 'boss';
  // First column is always combat
  if (column === 0) return 'combat';
  return pickRandom(NODE_TYPES);
}

/**
 * Generate a procedural run map with branching paths.
 *
 * Structure:
 * - 8 columns (stages), left to right
 * - Each column has 2–4 nodes
 * - Each node connects to 1–2 nodes in the next column
 * - First column always has 1 node (start)
 * - Last column always has 1 node (boss)
 */
export function generateRunMap(): RunMap {
  const columns: RunMapColumn[] = [];

  for (let col = 0; col < TOTAL_COLUMNS; col++) {
    const nodeCount =
      col === 0 || col === TOTAL_COLUMNS - 1
        ? 1
        : randInt(NODES_PER_COLUMN_MIN, NODES_PER_COLUMN_MAX);

    const biome = pickBiome(col);
    const nodes: RunMapNode[] = [];

    for (let row = 0; row < nodeCount; row++) {
      nodes.push({
        id: nodeId(col, row),
        type: pickNodeType(col),
        biome,
        column: col,
        row,
        nextNodeIds: [],
        completed: false,
        reachable: col === 0, // only start node is reachable initially
      });
    }

    columns.push({ nodes });
  }

  // Wire connections between columns
  for (let col = 0; col < TOTAL_COLUMNS - 1; col++) {
    const current = columns[col].nodes;
    const next = columns[col + 1].nodes;

    for (const node of current) {
      // Each node connects to 1–2 nodes in the next column
      const connectionCount = Math.min(next.length, randInt(1, Math.min(2, next.length)));
      const indices = new Set<number>();

      while (indices.size < connectionCount) {
        indices.add(randInt(0, next.length - 1));
      }

      node.nextNodeIds = Array.from(indices).map((r) => next[r].id);
    }

    // Ensure every node in the next column has at least one incoming connection
    for (const nextNode of next) {
      const hasIncoming = current.some((n) => n.nextNodeIds.includes(nextNode.id));
      if (!hasIncoming) {
        const source = pickRandom(current);
        source.nextNodeIds.push(nextNode.id);
      }
    }
  }

  return columns;
}

/**
 * Get all node IDs reachable from the current position
 * (i.e., the nextNodeIds of the completed node at position).
 */
export function getReachableNodeIds(map: RunMap, col: number, row: number): string[] {
  if (col < 0 || col >= map.length) return [];
  const node = map[col].nodes[row];
  return node ? node.nextNodeIds : [];
}

/**
 * Update reachability flags on the map based on the current position.
 */
export function updateReachability(
  map: RunMap,
  completedCol: number,
  completedRow: number,
): RunMap {
  const next = structuredClone(map);
  const reachableIds = getReachableNodeIds(next, completedCol, completedRow);

  // Reset all reachability (except completed nodes)
  for (const col of next) {
    for (const node of col.nodes) {
      node.reachable = false;
    }
  }

  // Mark reachable nodes
  for (const col of next) {
    for (const node of col.nodes) {
      if (reachableIds.includes(node.id) && !node.completed) {
        node.reachable = true;
      }
    }
  }

  return next;
}

/**
 * Find a node by ID in the map.
 */
export function findNode(
  map: RunMap,
  nodeId: string,
): { node: RunMapNode; column: number; row: number } | null {
  for (let col = 0; col < map.length; col++) {
    for (let row = 0; row < map[col].nodes.length; row++) {
      if (map[col].nodes[row].id === nodeId) {
        return { node: map[col].nodes[row], column: col, row };
      }
    }
  }
  return null;
}
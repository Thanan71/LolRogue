import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { findNode } from '@/game/map/mapUtils';
import { ROUTES } from '@/stores/routerStore';
import { playUIClick } from '@/audio';
import { useRunStore } from '@/stores/runStore';
import { useGameStore } from '@/stores/gameStore';
import { championDB } from '@/data/championDatabase';
import { NodeType } from '@/game/map/types';
import type { MapNode, NodeMap } from '@/game/map/types';

// Map game/map NodeType enum to CSS colors
const NODE_COLORS: Record<string, string> = {
  [NodeType.Combat]: '#3b82f6',
  [NodeType.Elite]: '#a855f7',
  [NodeType.Boss]: '#ef4444',
  [NodeType.Shop]: '#facc15',
  [NodeType.Rest]: '#22c55e',
  [NodeType.Event]: '#f97316',
  [NodeType.Recruit]: '#06b6d4',
  [NodeType.Treasure]: '#eab308',
  [NodeType.Start]: '#64748b',
  [NodeType.Exit]: '#64748b',
};

const NODE_LABELS: Record<string, string> = {
  [NodeType.Combat]: String.fromCharCode(9876),  // sword
  [NodeType.Elite]: String.fromCharCode(9760),   // skull
  [NodeType.Boss]: 'B',
  [NodeType.Shop]: 'S',
  [NodeType.Rest]: 'R',
  [NodeType.Event]: '?',
  [NodeType.Recruit]: '+',
  [NodeType.Treasure]: '$',
  [NodeType.Start]: '▶',
  [NodeType.Exit]: '■',
};

export function RunMapScreen() {
  const biomeMaps = useRunStore((s) => s.biomeMaps);
  const currentBiomeIndex = useRunStore((s) => s.currentBiomeIndex);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const completedNodeIds = useRunStore((s) => s.completedNodeIds);
  const team = useRunStore((s) => s.team);
  const inventory = useRunStore((s) => s.inventory);
  const gold = useRunStore((s) => s.gold);
  const currentWave = useRunStore((s) => s.currentWave);
  const currentBiome = useRunStore((s) => s.currentBiome);
  const generateRunMap = useRunStore((s) => s.generateRunMap);
  const moveToNode = useRunStore((s) => s.moveToNode);
  const startEncounter = useRunStore((s) => s.startEncounter);

  const setPhase = useGameStore((s) => s.setPhase);
  const navigate = useNavigate();

  const currentMap: NodeMap | null = biomeMaps[currentBiomeIndex] ?? null;

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      playUIClick();
      if (!moveToNode(nodeId)) return;

      // Look up the node to determine encounter type
      if (!currentMap) return;
      const node = findNode(currentMap, nodeId);
      if (!node) return;

      // Start encounter tracking
      startEncounter(nodeId, node.type as string);

      // Navigate to the appropriate encounter page
      switch (node.type) {
        case NodeType.Combat:
        case NodeType.Elite:
        case NodeType.Boss:
          navigate(ROUTES.COMBAT);
          break;
        case NodeType.Shop:
          navigate(ROUTES.SHOP);
          break;
        case NodeType.Rest:
          navigate(ROUTES.REST);
          break;
        case NodeType.Event:
          navigate(ROUTES.EVENT);
          break;
        case NodeType.Recruit:
          navigate(ROUTES.RECRUIT);
          break;
        default:
          // Unknown or non-interactive node type
          break;
      }
    },
    [moveToNode, startEncounter, navigate, currentMap],
  );

  if (!currentMap) {
    return (
      <div style={overlayStyle}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <h2 style={{ color: "#c8aa6e", fontSize: 24, marginBottom: 16 }}>No Active Run</h2>
          <p style={{ color: "#8b949e", marginBottom: 24 }}>Start a run to see your map.</p>
          <button style={btnStyle} onClick={() => generateRunMap()}>Generate Run Map</button>
        </div>
      </div>
    );
  }

  const nodes = currentMap.nodes;
  const columns = currentMap.columns;
  const rows = currentMap.rows;
  const svgW = columns * 110 + 40;
  const svgH = rows * 80 + 40;

  return (
    <div style={overlayStyle}>
      <div style={layoutStyle}>
        <div style={sidebarStyle}>
          <TeamPanel team={team} />
          <InventoryPanel inventory={inventory} />
        </div>
        <div style={mainStyle}>
          <div style={headerStyle}>
            <button
              style={{ ...btnStyle, padding: '4px 12px', fontSize: 12 }}
              onClick={() => setPhase('menu')}
              title="Save & return to menu"
            >
              ← Menu
            </button>
            <span style={{ color: "#ffd700", fontWeight: 700 }}>Gold: {gold}</span>
            <span style={{ color: "#c8aa6e", fontWeight: 700 }}>Wave {currentWave}</span>
            <span style={{ color: "#8b949e" }}>{currentBiome ? currentBiome.charAt(0).toUpperCase() + currentBiome.slice(1) : "???"}</span>
            {currentBiomeIndex >= 0 && <span style={{ color: "#484f58" }}>[{currentBiomeIndex + 1}/{biomeMaps.length}]</span>}
          </div>
          <div style={mapContainerStyle}>
            <svg width={svgW} height={svgH} style={{ display: "block" }}>
              {/* Draw edges */}
              {nodes.map((node) =>
                node.nextNodeIds.map((nid) => {
                  const target = findNode(currentMap, nid);
                  if (!target) return null;
                  const x1 = 20 + node.column * 110 + 55;
                  const y1 = 20 + node.row * 80 + 40;
                  const x2 = 20 + target.column * 110 + 55;
                  const y2 = 20 + target.row * 80 + 40;
                  const hi = currentNodeId === node.id;
                  return (
                    <line key={node.id + nid} x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={hi ? "#c8aa6e" : "#1e2a3a"} strokeWidth={2} strokeDasharray="4 4" />
                  );
                }),
              )}
              {/* Draw nodes */}
              {nodes.map((node) => {
                const cx = 20 + node.column * 110 + 55;
                const cy = 20 + node.row * 80 + 40;
                const isCurrent = currentNodeId === node.id;
                const isAccessible = node.accessible;
                const isDone = node.completed;
                return (
                  <g key={node.id} style={{ cursor: isAccessible ? "pointer" : "default" }}
                    onClick={() => isAccessible && handleNodeClick(node.id)}>
                    {isCurrent && (
                      <circle cx={cx} cy={cy} r={26} fill="none" stroke="#c8aa6e" strokeWidth={2} opacity={0.8}>
                        <animate attributeName="r" values="24;30;24" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {isAccessible && !isCurrent && (
                      <circle cx={cx} cy={cy} r={24} fill="none" stroke="#22c55e" strokeWidth={1.5}
                        strokeDasharray="3 3" opacity={0.7}>
                        <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle cx={cx} cy={cy} r={20}
                      fill={isDone ? "#1a2332" : NODE_COLORS[node.type] ?? '#64748b'}
                      stroke={isDone ? "#2d4a3e" : "#fff"}
                      strokeWidth={isCurrent ? 3 : isAccessible ? 2 : 1}
                      opacity={isDone ? 0.45 : isAccessible ? 1 : 0.5} />
                    <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
                      fontSize={isDone ? 12 : 18} opacity={isDone ? 0.4 : 1}
                      style={{ userSelect: "none" }}>
                      {isDone ? "✓" : NODE_LABELS[node.type] ?? '?'}
                    </text>
                    <text x={cx} y={cy + 30} textAnchor="middle"
                      fill={isAccessible ? "#e6edf3" : "#484f58"}
                      fontSize={10} fontFamily="sans-serif" style={{ userSelect: "none" }}>
                      {node.type}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamPanel({ team }: { team: { championId: string }[] }) {
  return (
    <div style={panelStyle}>
      <div style={panelTitle}>Equipe</div>
      {team.length === 0 && <div style={{ color: "#484f58", fontSize: 12, padding: 8 }}>No champions</div>}
      {team.map((m) => {
        const champ = championDB.getById(m.championId);
        return (
          <div key={m.championId} style={teamMemberStyle}>
            <img src={champ?.iconUrl ?? ""} alt={champ?.name ?? m.championId}
              style={{ width: 40, height: 40, borderRadius: 4 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#e6edf3", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {champ?.name ?? m.championId}
              </div>
              <div style={hpBarBg}><div style={{ ...hpBarFill, width: "100%" }} /></div>
              <div style={{ color: "#8b949e", fontSize: 10 }}>HP: {champ?.stats.hp ?? "???"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InventoryPanel({ inventory }: { inventory: { instanceId: string; item: { name: string; goldValue: number } }[] }) {
  return (
    <div style={{ ...panelStyle, flex: 1, overflow: "auto" }}>
      <div style={panelTitle}>Inventaire ({inventory.length})</div>
      {inventory.length === 0 && <div style={{ color: "#484f58", fontSize: 12, padding: 8 }}>Empty</div>}
      {inventory.map((entry) => (
        <div key={entry.instanceId} style={inventoryItemStyle}>
          <div style={{ color: "#e6edf3", fontSize: 11 }}>{entry.item.name}</div>
          <div style={{ color: "#8b949e", fontSize: 10 }}>{entry.item.goldValue}g</div>
        </div>
      ))}
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "#0d1117", color: "#e6edf3", fontFamily: "sans-serif", overflow: "hidden" };
const layoutStyle: React.CSSProperties = { display: "flex", height: "100%", gap: 16, padding: 16, boxSizing: "border-box" };
const sidebarStyle: React.CSSProperties = { width: 220, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 };
const mainStyle: React.CSSProperties = { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 };
const headerStyle: React.CSSProperties = { display: "flex", gap: 20, alignItems: "center", padding: "8px 16px", background: "#161b22", borderRadius: 8, marginBottom: 8, fontSize: 14, flexShrink: 0 };
const mapContainerStyle: React.CSSProperties = { flex: 1, overflow: "auto", background: "#0d1117", borderRadius: 8, border: "1px solid #1e2a3a" };
const panelStyle: React.CSSProperties = { background: "#161b22", borderRadius: 8, border: "1px solid #1e2a3a", padding: 8, overflow: "auto" };
const panelTitle: React.CSSProperties = { color: "#c8aa6e", fontSize: 13, fontWeight: 700, marginBottom: 8, padding: "0 4px" };
const teamMemberStyle: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: 6, borderRadius: 6, background: "#0d1117", marginBottom: 4 };
const hpBarBg: React.CSSProperties = { width: "100%", height: 6, background: "#21262d", borderRadius: 3, marginTop: 2, marginBottom: 1 };
const hpBarFill: React.CSSProperties = { height: "100%", background: "#22c55e", borderRadius: 3, transition: "width 0.3s" };
const inventoryItemStyle: React.CSSProperties = { padding: "4px 8px", background: "#0d1117", borderRadius: 4, marginBottom: 3, display: "flex", justifyContent: "space-between", alignItems: "center" };
const btnStyle: React.CSSProperties = { padding: "10px 24px", background: "#c8aa6e", color: "#0d1117", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" };

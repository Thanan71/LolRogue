import { findNode } from '@/game/map/mapUtils';
import { NodeType, type NodeMap } from '@/game/map/types';
import { mapContainerStyle } from './runMapStyles';

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

export const NODE_LABELS: Record<string, string> = {
  [NodeType.Combat]: String.fromCharCode(9876),
  [NodeType.Elite]: String.fromCharCode(9760),
  [NodeType.Boss]: 'B',
  [NodeType.Shop]: 'S',
  [NodeType.Rest]: 'R',
  [NodeType.Event]: '?',
  [NodeType.Recruit]: '+',
  [NodeType.Treasure]: '$',
  [NodeType.Start]: '▶',
  [NodeType.Exit]: '■',
};

interface RunMapCanvasProps {
  map: NodeMap;
  currentNodeId: string | null;
  frontierNodeIds: readonly string[];
  hasPendingChoice: boolean;
  reducedMotion: boolean;
  onNodeClick: (nodeId: string) => void;
}

export function RunMapCanvas({
  map: currentMap,
  currentNodeId,
  frontierNodeIds,
  hasPendingChoice,
  reducedMotion,
  onNodeClick: handleNodeClick,
}: RunMapCanvasProps) {
  const nodes = currentMap.nodes;
  const svgW = currentMap.columns * 110 + 40;
  const svgH = currentMap.rows * 80 + 40;
  return (
    <div style={mapContainerStyle}>
      <svg
        width={svgW}
        height={svgH}
        style={{ display: 'block' }}
        role="group"
        aria-labelledby="run-map-title"
      >
        <title id="run-map-title">Carte interactive de la partie</title>
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
              <line
                key={node.id + nid}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={hi ? '#c8aa6e' : '#1e2a3a'}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            );
          }),
        )}
        {/* Draw nodes */}
        {nodes.map((node) => {
          const cx = 20 + node.column * 110 + 55;
          const cy = 20 + node.row * 80 + 40;
          const isCurrent = currentNodeId === node.id;
          const isAccessible = frontierNodeIds.includes(node.id);
          const isDone = node.completed;
          const isSelectable = isAccessible && !hasPendingChoice;
          const isEntry = node.id === currentMap.startNodeId;
          return (
            <g
              key={node.id}
              style={{ cursor: isSelectable ? 'pointer' : 'default' }}
              onClick={() => isSelectable && handleNodeClick(node.id)}
              onKeyDown={(event) => {
                if (isSelectable && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  handleNodeClick(node.id);
                }
              }}
              role="button"
              tabIndex={isSelectable ? 0 : -1}
              aria-disabled={!isSelectable}
              aria-label={`${node.metadata.title}, colonne ${node.column + 1}, ligne ${node.row + 1}, ${node.type}${isEntry ? ', départ du biome' : ''}, ${isDone ? 'terminé' : isCurrent ? 'position actuelle' : isAccessible ? 'accessible' : 'verrouillé'}, ${isSelectable ? 'activer pour choisir ce nœud et verrouiller les autres branches' : hasPendingChoice ? "terminez d'abord le choix en attente" : 'indisponible'}`}
            >
              {isCurrent && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={26}
                  fill="none"
                  stroke="#c8aa6e"
                  strokeWidth={2}
                  opacity={0.8}
                >
                  {!reducedMotion && (
                    <animate
                      attributeName="r"
                      values="24;30;24"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  )}
                </circle>
              )}
              {isAccessible && !isCurrent && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={24}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  opacity={0.7}
                >
                  {!reducedMotion && (
                    <animate
                      attributeName="opacity"
                      values="0.4;0.9;0.4"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  )}
                </circle>
              )}
              <circle
                cx={cx}
                cy={cy}
                r={20}
                fill={isDone ? '#1a2332' : (NODE_COLORS[node.type] ?? '#64748b')}
                stroke={isDone ? '#2d4a3e' : '#fff'}
                strokeWidth={isCurrent ? 3 : isAccessible ? 2 : 1}
                opacity={isDone ? 0.45 : isAccessible ? 1 : 0.5}
              />
              <text
                x={cx}
                y={cy + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={isDone ? 12 : 18}
                opacity={isDone ? 0.4 : 1}
                style={{ userSelect: 'none' }}
              >
                {isDone ? '✓' : (NODE_LABELS[node.type] ?? '?')}
              </text>
              {isEntry && (
                <text
                  x={cx}
                  y={cy - 24}
                  textAnchor="middle"
                  fill="#c8aa6e"
                  fontSize={10}
                  fontWeight={700}
                >
                  DÉPART
                </text>
              )}
              <text
                x={cx}
                y={cy + 30}
                textAnchor="middle"
                fill={isAccessible ? '#e6edf3' : '#484f58'}
                fontSize={10}
                fontFamily="sans-serif"
                style={{ userSelect: 'none' }}
              >
                {node.type}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

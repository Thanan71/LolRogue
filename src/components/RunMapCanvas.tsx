import { useCallback, useEffect, useMemo, useRef } from 'react';
import { findNode } from '@/game/map/mapUtils';
import { type MapNode, type NodeMap, NodeType } from '@/game/map/types';

export const NODE_LABELS: Record<string, string> = {
  [NodeType.Combat]: '⚔',
  [NodeType.Elite]: '♛',
  [NodeType.Boss]: '✹',
  [NodeType.Shop]: '◆',
  [NodeType.Rest]: '✚',
  [NodeType.Event]: '?',
  [NodeType.Recruit]: '+',
  [NodeType.Treasure]: '✦',
  [NodeType.Start]: '▶',
  [NodeType.Exit]: '▲',
};

export const NODE_NAMES: Record<string, string> = {
  [NodeType.Combat]: 'Combat',
  [NodeType.Elite]: 'Élite',
  [NodeType.Boss]: 'Boss',
  [NodeType.Shop]: 'Boutique',
  [NodeType.Rest]: 'Repos',
  [NodeType.Event]: 'Événement',
  [NodeType.Recruit]: 'Recrutement',
  [NodeType.Treasure]: 'Trésor',
  [NodeType.Start]: 'Départ',
  [NodeType.Exit]: 'Sortie',
};

interface RunMapCanvasProps {
  map: NodeMap;
  currentNodeId: string | null;
  frontierNodeIds: readonly string[];
  chosenPathNodeIds?: readonly string[];
  completedNodeIds?: readonly string[];
  hasPendingChoice: boolean;
  reducedMotion: boolean;
  onNodeClick: (nodeId: string) => void;
}

interface NodePosition {
  x: number;
  y: number;
}

const X_GAP = 138;
const NODE_RADIUS = 27;
const MAP_PADDING_X = 72;
const MAP_PADDING_Y = 62;

function buildNodePositions(map: NodeMap, height: number): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  for (let column = 0; column < map.columns; column += 1) {
    const columnNodes = map.nodes
      .filter((node) => node.column === column)
      .sort((left, right) => left.row - right.row);
    const availableHeight = height - MAP_PADDING_Y * 2;
    columnNodes.forEach((node, index) => {
      const y =
        columnNodes.length === 1
          ? height / 2
          : MAP_PADDING_Y + (availableHeight * index) / (columnNodes.length - 1);
      positions.set(node.id, { x: MAP_PADDING_X + column * X_GAP, y });
    });
  }
  return positions;
}

function buildEdgePath(source: NodePosition, target: NodePosition): string {
  const startX = source.x + NODE_RADIUS - 3;
  const endX = target.x - NODE_RADIUS + 3;
  const controlX = startX + (endX - startX) / 2;
  return `M ${startX} ${source.y} C ${controlX} ${source.y}, ${controlX} ${target.y}, ${endX} ${target.y}`;
}

function hexagonPoints({ x, y }: NodePosition): string {
  return [
    [x, y - 25],
    [x + 22, y - 13],
    [x + 22, y + 13],
    [x, y + 25],
    [x - 22, y + 13],
    [x - 22, y - 13],
  ]
    .map((point) => point.join(','))
    .join(' ');
}

function nodeStateLabel({
  isCompleted,
  isCurrent,
  isAccessible,
  isAbandoned,
}: {
  isCompleted: boolean;
  isCurrent: boolean;
  isAccessible: boolean;
  isAbandoned: boolean;
}) {
  if (isCompleted) return 'terminé';
  if (isCurrent) return 'position actuelle';
  if (isAccessible) return 'accessible';
  if (isAbandoned) return 'branche fermée';
  return 'verrouillé';
}

export function RunMapCanvas({
  map: currentMap,
  currentNodeId,
  frontierNodeIds,
  chosenPathNodeIds = [],
  completedNodeIds = [],
  hasPendingChoice,
  reducedMotion,
  onNodeClick: handleNodeClick,
}: RunMapCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const nodes = currentMap.nodes;
  const svgWidth = Math.max(520, (currentMap.columns - 1) * X_GAP + MAP_PADDING_X * 2);
  const svgHeight = Math.max(390, currentMap.rows * 104 + MAP_PADDING_Y);
  const positions = useMemo(
    () => buildNodePositions(currentMap, svgHeight),
    [currentMap, svgHeight],
  );
  const completed = useMemo(
    () =>
      new Set([
        ...completedNodeIds,
        ...nodes.filter((node) => node.completed).map((node) => node.id),
      ]),
    [completedNodeIds, nodes],
  );
  const chosen = useMemo(() => new Set(chosenPathNodeIds), [chosenPathNodeIds]);
  const frontier = useMemo(() => new Set(frontierNodeIds), [frontierNodeIds]);
  const currentNode = currentNodeId ? findNode(currentMap, currentNodeId) : undefined;

  const recenterMap = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof viewport.scrollTo !== 'function') return;
    const focusId = currentNodeId ?? frontierNodeIds[0];
    const focusPosition = focusId ? positions.get(focusId) : undefined;
    if (!focusPosition) return;
    viewport.scrollTo({
      left: Math.max(0, focusPosition.x - viewport.clientWidth / 2),
      top: Math.max(0, focusPosition.y - viewport.clientHeight / 2),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [currentNodeId, frontierNodeIds, positions, reducedMotion]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(recenterMap);
    return () => window.cancelAnimationFrame(frame);
  }, [recenterMap]);

  const isAbandoned = (node: MapNode) =>
    Boolean(
      currentNode &&
        node.column <= currentNode.column &&
        !completed.has(node.id) &&
        !chosen.has(node.id) &&
        !frontier.has(node.id) &&
        node.id !== currentNodeId,
    );

  return (
    <section
      className={`run-map-map run-map-map--${currentMap.biome}${reducedMotion ? ' run-map-map--reduced-motion' : ''}`}
      aria-labelledby="run-map-visual-title"
    >
      <header className="run-map-map__toolbar">
        <div>
          <span className="run-map-map__eyebrow">Itinéraire du biome</span>
          <strong id="run-map-visual-title">
            {frontierNodeIds.length > 0
              ? `${frontierNodeIds.length} chemin${frontierNodeIds.length > 1 ? 's' : ''} disponible${frontierNodeIds.length > 1 ? 's' : ''}`
              : 'Progression en cours'}
          </strong>
        </div>
        <button type="button" className="run-map-map__recenter" onClick={recenterMap}>
          <span aria-hidden="true">⌖</span> Recentrer
        </button>
      </header>
      <p className="sr-only" id="run-map-instructions">
        Parcourez les choix avec Tab, puis utilisez Entrée ou Espace pour sélectionner un nœud
        accessible.
      </p>
      <div className="run-map-map__viewport" ref={viewportRef}>
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="group"
          aria-labelledby="run-map-svg-title run-map-svg-description"
          aria-describedby="run-map-instructions"
        >
          <title id="run-map-svg-title">Carte interactive de la partie</title>
          <desc id="run-map-svg-description">
            Les chemins dorés sont parcourus, les chemins turquoise sont accessibles et les branches
            assombries sont fermées.
          </desc>
          <g className="run-map-edges" aria-hidden="true">
            {nodes.flatMap((node) =>
              node.nextNodeIds.map((nextNodeId) => {
                const target = findNode(currentMap, nextNodeId);
                const sourcePosition = positions.get(node.id);
                const targetPosition = positions.get(nextNodeId);
                if (!target || !sourcePosition || !targetPosition) return null;
                const targetChosen = chosen.has(target.id) || target.id === currentNodeId;
                const traversed =
                  targetChosen &&
                  (chosen.has(node.id) || completed.has(node.id) || node.id === currentNodeId);
                const available =
                  frontier.has(target.id) && (node.id === currentNodeId || completed.has(node.id));
                const abandoned =
                  Boolean(currentNode && target.column <= currentNode.column) &&
                  !traversed &&
                  !available;
                const state = traversed
                  ? 'traversed'
                  : available
                    ? 'available'
                    : abandoned
                      ? 'abandoned'
                      : 'future';
                const path = buildEdgePath(sourcePosition, targetPosition);
                return (
                  <g
                    key={`${node.id}-${nextNodeId}`}
                    className={`run-map-edge run-map-edge--${state}`}
                  >
                    <path className="run-map-edge__bed" d={path} />
                    <path className="run-map-edge__line" d={path} />
                    {(traversed || available) && <path className="run-map-edge__spark" d={path} />}
                  </g>
                );
              }),
            )}
          </g>

          <g className="run-map-nodes">
            {nodes.map((node) => {
              const position = positions.get(node.id);
              if (!position) return null;
              const isCurrent = currentNodeId === node.id;
              const isAccessible = frontier.has(node.id);
              const isCompleted = completed.has(node.id);
              const isSelectable = isAccessible && !hasPendingChoice;
              const isEntry = node.id === currentMap.startNodeId;
              const abandoned = isAbandoned(node);
              const state = isCompleted
                ? 'completed'
                : isCurrent
                  ? 'current'
                  : isAccessible
                    ? 'accessible'
                    : abandoned
                      ? 'abandoned'
                      : 'locked';
              const typeName = NODE_NAMES[node.type] ?? node.metadata.title;
              const stateName = nodeStateLabel({
                isCompleted,
                isCurrent,
                isAccessible,
                isAbandoned: abandoned,
              });
              return (
                <g
                  key={node.id}
                  className={`run-map-node run-map-node--${node.type} run-map-node--${state}${isSelectable ? ' run-map-node--selectable' : ''}`}
                  data-map-node={node.id}
                  onClick={isSelectable ? () => handleNodeClick(node.id) : undefined}
                  onKeyDown={(event) => {
                    if (isSelectable && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      handleNodeClick(node.id);
                    }
                  }}
                  role={isSelectable ? 'button' : 'img'}
                  tabIndex={isSelectable ? 0 : undefined}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`${typeName}, colonne ${node.column + 1}, ligne ${node.row + 1}${isEntry ? ', départ du biome' : ''}, ${stateName}${isSelectable ? ', activer pour choisir ce nœud et verrouiller les autres branches' : hasPendingChoice && isAccessible ? ", terminez d'abord le choix en attente" : ''}`}
                >
                  <circle
                    className="run-map-node__hit-area"
                    cx={position.x}
                    cy={position.y}
                    r="31"
                  />
                  <circle className="run-map-node__halo" cx={position.x} cy={position.y} r="31" />
                  <polygon className="run-map-node__plate" points={hexagonPoints(position)} />
                  <polygon
                    className="run-map-node__inner"
                    points={hexagonPoints({ x: position.x, y: position.y })}
                  />
                  <text
                    x={position.x}
                    y={position.y + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="run-map-node__symbol"
                  >
                    {isCompleted ? '✓' : abandoned ? '×' : (NODE_LABELS[node.type] ?? '?')}
                  </text>
                  {(isCurrent || isAccessible) && (
                    <g className="run-map-node__badge">
                      <rect x={position.x - 23} y={position.y - 43} width="46" height="16" rx="8" />
                      <text x={position.x} y={position.y - 32} textAnchor="middle">
                        {isCurrent ? 'ICI' : 'CHOIX'}
                      </text>
                    </g>
                  )}
                  <text
                    x={position.x}
                    y={position.y + 43}
                    textAnchor="middle"
                    className="run-map-node__name"
                  >
                    {typeName}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="run-map-map__scroll-hint" aria-hidden="true">
        <span>←</span> Faites glisser la carte <span>→</span>
      </div>
    </section>
  );
}

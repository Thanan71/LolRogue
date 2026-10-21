import { implementedChampions } from '../../src/data/champion';
import { championDB } from '../../src/data/championDatabase';
import {
  canUnlockNode,
  ENHANCEMENT_TREES_BY_ROLE,
  getEnhancementTreeForRole,
} from '../../src/data/enhancementTrees';
import { getEnhancementNodeUnavailableReasons } from '../../src/game/rules/catalogSupport';
import {
  enhancementContent,
  getEnhancementBranchContent,
  getEnhancementNodeContent,
} from '../../src/i18n/enhancementContent';
import type { ChampionEnhancementTree, EnhancementNode } from '../../src/types/enhancementTree';
import { MAX_MASTERY_LEVEL } from '../../src/types/mastery';
import { ENHANCEMENT_SHARED_EFFECT_CONTRACTS, getNodeEffectEvidence } from './effectEvidence';
import { auditEnhancementGraphs, type EnhancementAuditCause } from './graphAudit';
import {
  type buildEnhancementServerEvidence,
  compareEnhancementServerNode,
  getEnhancementServerLockReason,
} from './serverEvidence';

type ServerEvidence = ReturnType<typeof buildEnhancementServerEvidence>;
const locales = ['fr-FR', 'en-US'] as const;
const sortText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function findNode(tree: ChampionEnhancementTree, id: string): EnhancementNode {
  const node = [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)].find(
    (entry) => entry.id === id,
  );
  if (!node) throw new Error(`Enhancement audit: missing client node ${id}`);
  return node;
}

const triage: Record<EnhancementAuditCause['code'], { owner: string; followUp: string }> = {
  duplicate_node_id: { owner: 'Catalogue / identifiants sauvegardés', followUp: 'TREE-02' },
  unknown_parent: { owner: 'Catalogue / prérequis', followUp: 'TREE-02' },
  cycle: { owner: 'Catalogue / topologie', followUp: 'TREE-02' },
  invalid_node: { owner: 'Catalogue / validation des valeurs', followUp: 'TREE-02' },
  mastery_cap: { owner: 'Maîtrise / conditions de déblocage', followUp: 'TREE-02' },
  unavailable: { owner: 'Disponibilité des effets / descendants', followUp: 'TREE-02 / TREE-03' },
  candy_budget: { owner: 'Économie Candies', followUp: 'TREE-09' },
  validator_rejected: { owner: 'Parité client / serveur', followUp: 'TREE-02 / TREE-04' },
};

/** Offline observation of the current code/catalogue; never a purchase or a gameplay rule. */
export function createEnhancementAuditReport(server: ServerEvidence) {
  const clientTrees = Object.values(ENHANCEMENT_TREES_BY_ROLE);
  const policy = {
    maxMasteryLevel: MAX_MASTERY_LEVEL,
    candyBudget: null,
    getUnavailableReasons: getEnhancementNodeUnavailableReasons,
    canUnlockNode,
  };
  const graph = auditEnhancementGraphs(clientTrees, policy);
  const serverById = new Map(server.catalog.nodes.map((node) => [node.id, node]));
  const serverTrees: ChampionEnhancementTree[] = clientTrees.map((tree) => ({
    championId: '*',
    primaryRole: tree.primaryRole,
    branches: [],
    coreNodes: server.catalog.nodes
      .filter((node) => node.role === tree.primaryRole.toLowerCase())
      .map((node) => ({ ...node, name: node.id, description: '', type: 'stat' as const })),
  }));
  const serverGraph = auditEnhancementGraphs(serverTrees, {
    ...policy,
    getUnavailableReasons: () => [],
    canUnlockNode: (node, state, mastery, candies) => {
      const record = serverById.get(node.id);
      return !!record && getEnhancementServerLockReason(record, state, mastery, candies) === null;
    },
  });
  const serverPlans = new Map(
    serverGraph.trees.flatMap((tree) => tree.nodes.map((node) => [node.id, node] as const)),
  );
  const trees = graph.trees.map((tree) => {
    const source = clientTrees.find((candidate) => candidate.primaryRole === tree.role);
    if (!source) throw new Error(`Enhancement audit: unknown role ${tree.role}`);
    return {
      ...tree,
      labels: Object.fromEntries(
        locales.map((locale) => [locale, enhancementContent[locale].roles[tree.role].name]),
      ),
      nodes: tree.nodes.map((node) => {
        const definition = findNode(source, node.id);
        const sqlNode = serverById.get(node.id);
        const state = Object.fromEntries(definition.prerequisites.map((id) => [id, 1]));
        const differences = compareEnhancementServerNode(definition, sqlNode);
        if (sqlNode && sqlNode.role !== tree.role.toLowerCase()) differences.push('role');
        return {
          ...node,
          labels: Object.fromEntries(
            locales.map((locale) => [locale, getEnhancementNodeContent(locale, node.id)]),
          ),
          branch:
            node.branchId === null
              ? null
              : {
                  id: node.branchId,
                  labels: Object.fromEntries(
                    locales.map((locale) => [
                      locale,
                      getEnhancementBranchContent(locale, node.branchId!),
                    ]),
                  ),
                },
          type: definition.type,
          definition: {
            statBonuses: definition.statBonuses ?? {},
            percentBonuses: definition.percentBonuses ?? {},
            effects: definition.effects ?? [],
          },
          visibility: {
            renderedIn: node.branchId === null ? 'core' : 'selected-branch',
            hiddenForUnavailableEffect: false,
            directAvailabilityReasons: getEnhancementNodeUnavailableReasons(definition),
            source: 'src/components/EnhancementTree.tsx: EnhancementTree / NodeCard',
          },
          effectEvidence: getNodeEffectEvidence(definition),
          findings: node.firstRank.causes.map((cause) => ({ ...cause, ...triage[cause.code] })),
          server: {
            catalogue: sqlNode ?? null,
            catalogueDifferences: differences,
            storageAttribute: `champion_enhancements.unlocked_nodes.${node.id}`,
            withOwnedParents: {
              clientAllowed: canUnlockNode(
                definition,
                state,
                MAX_MASTERY_LEVEL,
                definition.candyCost,
              ),
              serverAllowed:
                !!sqlNode &&
                getEnhancementServerLockReason(
                  sqlNode,
                  state,
                  MAX_MASTERY_LEVEL,
                  definition.candyCost,
                ) === null,
            },
            fromEmpty: {
              clientAllowed: node.firstRank.reachable,
              serverAllowed: serverPlans.get(node.id)?.firstRank.reachable ?? false,
              serverPlan: serverPlans.get(node.id)?.firstRank ?? null,
            },
          },
        };
      }),
    };
  });
  const nodes = trees.flatMap((tree) => tree.nodes);
  const clientIds = new Set(nodes.map((node) => node.id));
  return {
    schemaVersion: 1,
    evidence: 'offline-repository' as const,
    scope: 'TREE-01 — audit, sans modification des règles ni des achats',
    policy: graph.policy,
    summary: {
      treeCount: graph.treeCount,
      nodeCount: graph.nodeCount,
      structurallyAffectedNodes: graph.structuralIssueCount,
      reachableNodes: graph.reachableNodeCount,
      blockedNodes: nodes.filter((node) => !node.firstRank.reachable).length,
      directlyUnavailableNodes: nodes.filter(
        (node) => node.visibility.directAvailabilityReasons.length,
      ).length,
      transitivelyBlockedNodes: nodes.filter(
        (node) =>
          node.visibility.directAvailabilityReasons.length === 0 &&
          node.findings.some((cause) => cause.path.length > 1),
      ).length,
      masteryBlockedNodes: nodes.filter((node) =>
        node.findings.some((cause) => cause.code === 'mastery_cap'),
      ).length,
      serverCatalogueMismatchNodes: nodes.filter((node) => node.server.catalogueDifferences.length)
        .length,
      serverExtraNodeIds: server.catalog.nodes
        .filter((node) => !clientIds.has(node.id))
        .map((node) => node.id)
        .sort(sortText),
      clientServerEligibilityDifferences: nodes.filter(
        (node) => node.server.fromEmpty.clientAllowed !== node.server.fromEmpty.serverAllowed,
      ).length,
      effects: Object.fromEntries(
        ['implemented', 'partial', 'descriptive'].map((status) => [
          status,
          nodes.filter((node) => node.effectEvidence.status === status).length,
        ]),
      ),
    },
    champions: championDB
      .getAll()
      .map((champion) => {
        const selected = getEnhancementTreeForRole(champion.tags[0]);
        const record = server.catalog.champions.find(
          (candidate) => candidate.championId === champion.id,
        );
        return {
          id: champion.id,
          maintainedKit: implementedChampions.some((maintained) => maintained.id === champion.id),
          tags: champion.tags,
          selectedClientRole: selected.primaryRole,
          server: record ?? null,
          primaryRoleMatches: !!record && record.primaryRole === selected.primaryRole.toLowerCase(),
        };
      })
      .sort((a, b) => sortText(a.id, b.id)),
    roleSelection: {
      client: 'EnhancementTreeProvider.getTreeForChampion: premier tag ; rôle inconnu → Fighter',
      server:
        'progression_champion_catalog.primary_role ; pas de choix de rôle arbitraire par le client',
      secondaryRoles: 'Les tags secondaires ne choisissent pas un autre arbre.',
    },
    sharedEffectContracts: ENHANCEMENT_SHARED_EFFECT_CONTRACTS,
    serverEvidence: server,
    trees,
  };
}

export type EnhancementAuditReport = ReturnType<typeof createEnhancementAuditReport>;
const cell = (value: unknown) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const label = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const vertex = (id: string) =>
  `n_${Array.from(id)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')}`;

export function renderEnhancementAuditMarkdown(report: EnhancementAuditReport): string {
  const lines = [
    '# Audit reproductible des arbres — TREE-01',
    '',
    '> Généré par `npm run testing -- enhancements audit`. Ne pas modifier ce rapport à la main.',
    '',
    'Le JSON voisin conserve les 72 définitions, libellés FR/EN, chemins, coûts, causes et preuves physiques. Ce rapport est une observation des sources, pas une interrogation distante ni une réparation.',
    '',
    `**${report.summary.treeCount} arbres / ${report.summary.nodeCount} nœuds ; ${report.summary.reachableNodes} atteignables, ${report.summary.blockedNodes} bloqués ; ${report.summary.structurallyAffectedNodes} nœud affecté par un défaut topologique.**`,
    '',
    `Maîtrise maximale : **${report.policy.maxMasteryLevel}**. Budget Candies global : **${report.policy.candyBudget ?? 'non plafonné'}** ; un solde suffisant reste requis pour chaque achat.`,
    '',
    `${report.summary.directlyUnavailableNodes} indisponibilités directes, ${report.summary.transitivelyBlockedNodes} blocages hérités, ${report.summary.masteryBlockedNodes} blocage de maîtrise. ${report.summary.serverCatalogueMismatchNodes} divergence d’attributs du catalogue ; ${report.summary.clientServerEligibilityDifferences} divergences d’éligibilité depuis un état vide entre client et modèle SQL.`,
    '',
    'Les coûts incluent une fois chaque ancêtre requis au rang 1 ; le rang maximal paie ensuite chaque rang du nœud cible au coût constant. Un coût théorique ne prouve pas un chemin achetable : le champ `reachable` du JSON fait foi.',
    '',
    '## Rôle du champion',
    '',
    '| Champion | Tags dans l’ordre | Arbre client | Rôle SQL | Concordance |',
    '| --- | --- | --- | --- | --- |',
    ...report.champions.map(
      (champion) =>
        `| ${cell(champion.id)} | ${cell(champion.tags.join(', '))} | ${cell(champion.selectedClientRole)} | ${cell(champion.server?.primaryRole ?? 'absent')} | ${champion.primaryRoleMatches ? 'oui' : 'non'} |`,
    ),
    '',
    'Le premier tag choisit l’arbre côté client ; les tags secondaires ne le remplacent pas. Le fallback client est Fighter. Le serveur utilise son propre catalogue de rôles ; un champion absent n’est pas autorisé par ce fallback.',
  ];
  for (const tree of report.trees) {
    lines.push(
      '',
      `## ${tree.role}`,
      '',
      `Racines : ${tree.roots.map((id) => `\`${id}\``).join(', ')}. Total théorique du catalogue : ${tree.catalogueMaximumCandies ?? 'indéterminé'} Candies.`,
      '',
      '```mermaid',
      'flowchart TD',
    );
    for (const node of tree.nodes) {
      const state = !node.structurallyReachable
        ? 'structural'
        : node.findings.some((cause) => cause.code === 'mastery_cap')
          ? 'mastery'
          : node.firstRank.reachable
            ? 'reachable'
            : 'blocked';
      lines.push(
        `  ${vertex(node.id)}["${label(node.id)}<br/>${label(node.labels['fr-FR'].name)}"]:::${state}`,
      );
    }
    for (const edge of tree.edges) lines.push(`  ${vertex(edge.from)} --> ${vertex(edge.to)}`);
    lines.push(
      '  classDef reachable fill:#e2f2e8,color:#12281c,stroke:#26714a',
      '  classDef blocked fill:#fff0da,color:#482b08,stroke:#a25b06',
      '  classDef mastery fill:#eee4ff,color:#30194d,stroke:#68428f',
      '  classDef structural fill:#ffe2e2,color:#4b1414,stroke:#a52b2b',
      '```',
      '',
      'Vert : chemin légal ; orange : indisponibilité ou héritage ; violet : maîtrise ; rouge : topologie invalide. Les IDs restent dans les étiquettes du graphe.',
      '',
      '| ID | FR / EN | Branche | Rang max | Candies/rang ; chemin 1er/max | Maîtrise | Parents | Déblocage client / SQL | Effet |',
      '| --- | --- | --- | ---: | --- | ---: | --- | --- | --- |',
    );
    for (const node of tree.nodes) {
      lines.push(
        `| \`${node.id}\` | ${cell(node.labels['fr-FR'].name)} / ${cell(node.labels['en-US'].name)} | ${cell(node.branchId ?? 'socle')} | ${node.maxRanks} | ${node.candyCost} ; ${node.firstRank.requiredCandies ?? '?'} / ${node.maximumRank.requiredCandies ?? '?'} | ${node.requiredMasteryLevel} | ${cell(node.prerequisites.join(', ') || '—')} | ${node.firstRank.reachable ? 'oui' : 'non'} / ${node.server.fromEmpty.serverAllowed ? 'oui' : 'non'} | ${node.effectEvidence.status} |`,
      );
    }
    for (const node of tree.nodes) {
      lines.push(
        '',
        `### ${node.id} — ${node.labels['fr-FR'].name}`,
        '',
        `FR : ${node.labels['fr-FR'].description}`,
        '',
        `EN : ${node.labels['en-US'].description}`,
        '',
        `Visibilité : ${node.visibility.renderedIn === 'core' ? 'socle toujours rendu' : 'branche sélectionnée'} ; les effets indisponibles ne masquent pas la carte. Attribut serveur : \`${node.server.storageAttribute}\`.`,
        '',
        `Effet : **${node.effectEvidence.status}**. Types : ${node.effectEvidence.effectTypes.map((type) => `\`${type}\``).join(', ') || 'statistiques'}. ${node.effectEvidence.appliedBehavior.join(' ')}`,
        '',
        `Valeurs déclarées : plats \`${JSON.stringify(node.definition.statBonuses)}\` ; pourcentages \`${JSON.stringify(node.definition.percentBonuses)}\`.`,
      );
      if (node.findings.length)
        lines.push(
          '',
          ...node.findings.map(
            (cause) =>
              `- Blocage \`${cause.code}\` via ${cause.path.map((id) => `\`${id}\``).join(' → ')} : ${cause.details.join(', ') || 'voir graphe'}. Responsable : ${cause.owner} ; suite : ${cause.followUp}.`,
          ),
        );
      if (node.effectEvidence.discrepancies.length)
        lines.push(
          '',
          ...node.effectEvidence.discrepancies.map((issue) => `- Écart d’effet : ${issue}`),
        );
      lines.push(
        '',
        `Responsables des effets : ${node.effectEvidence.owner.join(' ; ')}. Suite : ${node.effectEvidence.followUp.join(', ') || 'aucune réparation signalée'}.`,
        '',
        ...node.effectEvidence.runtimeConsumers.map(
          (source) => `- Source : \`${source.path}\` — \`${source.symbol}\`.`,
        ),
      );
    }
  }
  lines.push('', '## Contrats transverses', '');
  for (const contract of report.sharedEffectContracts)
    lines.push(
      `### ${contract.id}`,
      '',
      contract.behavior,
      '',
      `Limite : ${contract.limit}`,
      '',
      ...contract.evidence.map((source) => `- \`${source.path}\` — \`${source.symbol}\``),
      '',
    );
  lines.push(
    '## Preuve serveur',
    '',
    'Le JSON contient les attributs et SHA-256 des migrations, la chaîne de copies du catalogue, le contrat RPC, ses rôles et ses limites. Les tests de base locale comparent séparément cette projection aux lignes actives et exécutent les achats sous rollback ; la génération de ce document reste hors ligne.',
    '',
  );
  return lines.join('\n');
}

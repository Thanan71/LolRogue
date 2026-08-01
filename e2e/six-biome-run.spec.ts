import { expect, test } from '@playwright/test';

const BIOME_LABELS = ['Top_lane', 'Jungle', 'Mid_lane', 'Bot_lane', 'River', 'Base'];

test('a guest run progresses deterministically through all six biomes', async ({ page }) => {
  await page.goto('/auth');

  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/authStore.ts');
    const { useRunStore } = await import('/src/stores/runStore.ts');

    useAuthStore.getState().enterGuestMode();
    await useRunStore.getState().startRun(['Garen'], { seed: 20260723 });
  });

  await page.goto('/run');
  await expect(page.getByRole('button', { name: /tutoriel carte/i })).toBeVisible();

  for (const [index, biomeLabel] of BIOME_LABELS.entries()) {
    await expect(page.getByText(biomeLabel, { exact: true })).toBeVisible();

    const transition = await page.evaluate(async () => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      let state = useRunStore.getState();
      const pendingAugmentId = state.pendingAugmentIds[0];
      if (pendingAugmentId) {
        if (!state.chooseAugment(pendingAugmentId)) {
          throw new Error('Unable to resolve the pending augment choice.');
        }
        state = useRunStore.getState();
      }
      const map = state.biomeMaps[state.currentBiomeIndex];
      const terminalNode = map.nodes.find((node) => node.id === map.exitNodeId);
      if (!terminalNode) throw new Error('Generated map has no terminal node.');
      const completedMap = {
        ...map,
        nodes: map.nodes.map((node) => ({
          ...node,
          completed: node.id === terminalNode.id ? true : node.completed,
          accessible: false,
        })),
      };
      const biomeMaps = [...state.biomeMaps];
      biomeMaps[state.currentBiomeIndex] = completedMap;
      useRunStore.setState({
        biomeMaps,
        currentNodeId: terminalNode.id,
        frontierNodeIds: [],
        chosenPathNodeIds: [...new Set([...state.chosenPathNodeIds, terminalNode.id])],
        completedNodeIds: [...new Set([...state.completedNodeIds, terminalNode.id])],
        pendingEncounter: null,
        currentEncounter: null,
      });

      if (state.currentBiomeIndex === state.biomeMaps.length - 1) {
        return {
          advanced: false,
          index: state.currentBiomeIndex,
          total: state.biomeMaps.length,
        };
      }

      const advanced = useRunStore.getState().advanceToNextBiome();
      return {
        advanced,
        index: useRunStore.getState().currentBiomeIndex,
        total: useRunStore.getState().biomeMaps.length,
      };
    });

    expect(transition.total).toBe(6);
    if (index < BIOME_LABELS.length - 1) {
      expect(transition).toMatchObject({ advanced: true, index: index + 1 });
    } else {
      expect(transition).toMatchObject({ advanced: false, index: 5 });
    }
  }

  const completed = await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    const runId = useRunStore.getState().runId;
    const result = await useRunStore.getState().endRun(true, runId);
    return {
      saved: result.success,
      outcome: result.success ? result.outcome : result.code,
      isActive: useRunStore.getState().isActive,
    };
  });

  expect(completed).toEqual({ saved: true, outcome: 'saved', isActive: false });
});

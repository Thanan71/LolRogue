import { parseEnhancementResetPreview } from '@/services/repositories/enhancementResetParser';

const fixture = () => ({
  champion_id: 'Garen',
  revision: 1,
  catalog_version: 4,
  contract_schema_version: 1,
  unlocked_nodes: { fighter_core_1: 1 },
  removed_node_ids: ['fighter_core_1'],
  actual_spend: 20,
  refund_amount: 20,
  fee_amount: 0,
  fee_exempt: false,
  reset_count: 0,
  remaining_candies: 100,
  policy_version: 1,
  eligible: true,
  history_unavailable: false,
  reason: null,
  active_run_preserved: true,
});

describe('strict reset preview boundary', () => {
  it('parses a full attested, free quote and retains revision and policy identity', () => {
    expect(parseEnhancementResetPreview(fixture(), 'Garen')).toMatchObject({
      championId: 'Garen',
      actualSpend: 20,
      refundAmount: 20,
      feeAmount: 0,
      revision: 1,
      policyVersion: 1,
      eligible: true,
    });
  });
  it.each([
    null,
    {},
    { ...fixture(), refund_amount: 21 },
    { ...fixture(), remaining_candies: -1 },
    { ...fixture(), revision: 1.5 },
    { ...fixture(), policy_version: 0 },
    { ...fixture(), champion_id: 'Annie' },
    { ...fixture(), active_run_preserved: false },
  ])('rejects incomplete, mismatched or arithmetically impossible quotes', (value) => {
    expect(() => parseEnhancementResetPreview(value, 'Garen')).toThrow(
      'ENHANCEMENT_RESET_INVALID_RESPONSE',
    );
  });
  it('keeps an explicit support state for malformed legacy history without inventing a refund', () => {
    const row = {
      ...fixture(),
      unlocked_nodes: { forged: 'bad' },
      eligible: false,
      history_unavailable: true,
      reason: 'history_unavailable',
      actual_spend: 0,
      refund_amount: 0,
    };
    expect(parseEnhancementResetPreview(row, 'Garen')).toMatchObject({
      eligible: false,
      historyUnavailable: true,
      refundAmount: 0,
      unlockedNodes: {},
      reason: 'history_unavailable',
    });
  });
});

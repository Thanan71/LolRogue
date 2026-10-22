// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminBalanceTrees } from '@/features/administration/ui/balance/AdminBalanceTrees';
import { balanceTreeFixture } from './fixtures/adminTreeUi';

afterEach(cleanup);

describe('tree analytics presentation', () => {
  it('keeps counts visible while suppressing rates on small samples', () => {
    render(<AdminBalanceTrees report={balanceTreeFixture()} />);
    expect(screen.getByText(/pas un taux de conversion/)).toBeInTheDocument();
    expect(screen.getByText(/ne mesurent pas l’effet causal/)).toBeInTheDocument();
    expect(screen.queryByText('50 %')).not.toBeInTheDocument();
    expect(screen.getByText(/au moins 30 runs et 30 joueurs/)).toBeInTheDocument();
    expect(screen.getAllByText(/au moins 30 acheteurs/)).toHaveLength(2);
    expect(screen.getByText(/réconciliés avec le registre/)).toBeInTheDocument();
  });
  it('flags coverage and truncation, and preserves unknown historical identifiers', () => {
    const report = balanceTreeFixture();
    report.purchases.ledgerComplete = false;
    report.cardinality.buildsTruncated = true;
    report.cardinality.totalBuilds = 201;
    report.builds[0].ranks = { retired_node: 1 };
    report.builds[0].nodeIds = ['retired_node'];
    report.catalogue.push({ ...report.catalogue[0], nodeId: 'future_node', availability: 'gated' });
    render(<AdminBalanceTrees report={report} />);
    expect(screen.getByText(/Couverture du registre incomplète/)).toBeInTheDocument();
    expect(screen.getByText(/Liste limitée à 200 arbres/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Arbres au départ des runs' });
    expect(within(table).getByText('retired_node', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText(/En attente de validation humaine/)).toBeInTheDocument();
  });
});

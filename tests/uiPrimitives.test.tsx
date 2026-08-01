// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import {
  Button,
  Dialog,
  Field,
  PageFooter,
  PageHeader,
  PageShell,
  Panel,
  StateView,
  Tab,
  Tabs,
  TextInput,
} from '@/components/ui';

describe('shared responsive UI primitives', () => {
  it('composes a semantic page without inline layout ownership', () => {
    render(
      <PageShell width="narrow">
        <PageHeader title="Settings" subtitle="Configuration" />
        <Panel aria-label="Preferences">
          <Field label={<label htmlFor="name">Name</label>} hint="Public name">
            <TextInput id="name" />
          </Field>
        </Panel>
        <PageFooter>
          <Button>Save</Button>
        </PageFooter>
      </PageShell>,
    );
    expect(screen.getByRole('main')).toHaveClass('ui-page-shell--narrow');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveClass('ui-input');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('ui-button--primary');
  });

  it('exposes loading and error states with the right live semantics', () => {
    const { rerender } = render(<StateView kind="loading" title="Loading" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<StateView kind="error" title="Failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });

  it('provides accessible tabs and a dismissible modal surface', () => {
    const close = vi.fn();
    render(
      <>
        <Tabs label="Profile sections">
          <Tab selected>History</Tab>
          <Tab selected={false}>Stats</Tab>
        </Tabs>
        <Dialog open title="Confirm" onClose={close} actions={<Button>Continue</Button>}>
          Body
        </Dialog>
      </>,
    );
    expect(screen.getByRole('tablist', { name: 'Profile sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(close).toHaveBeenCalledTimes(1);
  });
});

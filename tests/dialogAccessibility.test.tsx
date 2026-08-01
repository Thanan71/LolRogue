// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '@/components/ui/Feedback';

function DialogHarness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      <Dialog
        open={open}
        title="Confirmation"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        actions={
          <>
            <button type="button">Annuler</button>
            <button type="button">Confirmer</button>
          </>
        }
      >
        Vérifie ton choix.
      </Dialog>
    </>
  );
}

describe('dialogue accessible', () => {
  it('place et piège le focus, ferme avec Échap puis restitue le focus', () => {
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: 'Ouvrir' });
    trigger.focus();
    fireEvent.click(trigger);

    const cancel = screen.getByRole('button', { name: 'Annuler' });
    const confirm = screen.getByRole('button', { name: 'Confirmer' });
    expect(cancel).toHaveFocus();

    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
  });
});

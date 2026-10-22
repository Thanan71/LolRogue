import { type ReactNode, useEffect, useId, useRef } from 'react';

/** Native modality, keyboard containment, Escape and opener restoration share one implementation. */
export function EnhancementDialog({
  title,
  children,
  busy,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  canConfirm = true,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  canConfirm?: boolean;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!opener.current && document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement;
    const element = dialog.current;
    if (element?.showModal) element.showModal();
    else element?.setAttribute('open', '');
    // A destructive operation always starts with the reversible action focused.
    cancel.current?.focus();
    return () =>
      queueMicrotask(() => {
        if (!element?.isConnected && opener.current?.isConnected) opener.current.focus();
      });
  }, []);
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="enhancement-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const elements = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        ];
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <h3 id={`${id}-title`}>{title}</h3>
      <div id={`${id}-body`}>{children}</div>
      <div className="enhancement-dialog__actions">
        <button ref={cancel} type="button" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button ref={confirm} type="button" onClick={onConfirm} disabled={busy || !canConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

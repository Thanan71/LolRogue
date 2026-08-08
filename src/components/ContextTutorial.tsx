import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface TutorialStep {
  title: string;
  body: string;
}

interface ContextTutorialProps {
  storageKey: string;
  title: string;
  steps: TutorialStep[];
  buttonLabel?: string;
}

export function ContextTutorial({
  storageKey,
  title,
  steps,
  buttonLabel = 'Aide',
}: ContextTutorialProps) {
  const titleId = useId();
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) !== 'done') {
        returnFocusRef.current = triggerRef.current;
        setOpen(true);
      }
    } catch {
      // Le tutoriel reste réouvrable lorsque le stockage privé est indisponible.
    }
  }, [storageKey]);

  const close = useCallback(() => {
    setOpen(false);
    setStep(0);
    try {
      localStorage.setItem(storageKey, 'done');
    } catch {
      // Aucun suivi distant et aucune dépendance au stockage pour continuer à jouer.
    }
  }, [storageKey]);

  const openTutorial = useCallback(() => {
    returnFocusRef.current = triggerRef.current;
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!backdrop || !dialog) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (closeRef.current ?? dialog).focus({ preventScroll: true });

    const getFocusableControls = () => [
      ...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const controls = getFocusableControls();
      if (controls.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];
      const activeElement = document.activeElement;
      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) {
        (getFocusableControls()[0] ?? dialog).focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.body.style.overflow = previousBodyOverflow;
      const returnTarget = returnFocusRef.current ?? triggerRef.current;
      returnFocusRef.current = null;
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    };
  }, [close, open]);

  const tutorialDialog = open ? (
    <div ref={backdropRef} className="tutorial-backdrop" role="presentation">
      <section
        ref={dialogRef}
        id={dialogId}
        className="tutorial-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="tutorial-dialog__header">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeRef} type="button" onClick={close} aria-label="Fermer le tutoriel">
            ×
          </button>
        </div>
        <p className="tutorial-dialog__progress">
          Étape {step + 1} sur {steps.length}
        </p>
        <h3>{steps[step].title}</h3>
        <p>{steps[step].body}</p>
        <div className="tutorial-dialog__actions">
          <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Précédent
          </button>
          {step < steps.length - 1 ? (
            <button type="button" onClick={() => setStep(step + 1)}>
              Suivant
            </button>
          ) : (
            <button type="button" onClick={close}>
              J’ai compris
            </button>
          )}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openTutorial}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
      >
        ? {buttonLabel}
      </button>
      {tutorialDialog && typeof document !== 'undefined'
        ? createPortal(tutorialDialog, document.body)
        : tutorialDialog}
    </>
  );
}

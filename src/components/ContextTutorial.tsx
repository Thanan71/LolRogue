import { useEffect, useId, useRef, useState } from 'react';

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
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) !== 'done') setOpen(true);
    } catch {
      // Le tutoriel reste réouvrable lorsque le stockage privé est indisponible.
    }
  }, [storageKey]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setStep(0);
    try {
      localStorage.setItem(storageKey, 'done');
    } catch {
      // Aucun suivi distant et aucune dépendance au stockage pour continuer à jouer.
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
        ? {buttonLabel}
      </button>
      {open && (
        <div className="tutorial-backdrop" role="presentation">
          <section
            className="tutorial-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
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
      )}
    </>
  );
}

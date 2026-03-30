import { useEffect, useCallback, useRef } from 'react';

interface UseKeyboardShortcutsOptions {
  onCastQ?: () => void;
  onCastW?: () => void;
  onCastE?: () => void;
  onCastR?: () => void;
  onNextTurn?: () => void;
  onConfirm?: () => void;
  onBack?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onCastQ,
  onCastW,
  onCastE,
  onCastR,
  onNextTurn,
  onConfirm,
  onBack,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const handlersRef = useRef({
    onCastQ,
    onCastW,
    onCastE,
    onCastR,
    onNextTurn,
    onConfirm,
    onBack,
  });

  // Always keep handlers fresh without re-attaching listener
  handlersRef.current = {
    onCastQ,
    onCastW,
    onCastE,
    onCastR,
    onNextTurn,
    onConfirm,
    onBack,
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Don't capture keys when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return;
    }

    const key = e.key.toLowerCase();
    const h = handlersRef.current;

    switch (key) {
      case 'q':
        e.preventDefault();
        h.onCastQ?.();
        break;
      case 'w':
        e.preventDefault();
        h.onCastW?.();
        break;
      case 'e':
        e.preventDefault();
        h.onCastE?.();
        break;
      case 'r':
        e.preventDefault();
        h.onCastR?.();
        break;
      case ' ':
      case 'enter':
        e.preventDefault();
        h.onNextTurn?.();
        h.onConfirm?.();
        break;
      case 'escape':
        e.preventDefault();
        h.onBack?.();
        break;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

import { useCallback, useEffect, useRef } from 'react';

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

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'summary',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="listbox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
  '[role="treeitem"]',
].join(',');

export function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    (target.matches(INTERACTIVE_SELECTOR) || !!target.closest(INTERACTIVE_SELECTOR))
  );
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        !enabled ||
        e.defaultPrevented ||
        e.repeat ||
        e.isComposing ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        isInteractiveShortcutTarget(e.target)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const h = handlersRef.current;
      let handler: (() => void) | undefined;

      switch (key) {
        case 'q':
          handler = h.onCastQ;
          break;
        case 'w':
          handler = h.onCastW;
          break;
        case 'e':
          handler = h.onCastE;
          break;
        case 'r':
          handler = h.onCastR;
          break;
        case ' ':
          handler = h.onNextTurn ?? h.onConfirm;
          break;
        case 'enter':
          handler = h.onConfirm;
          break;
        case 'escape':
          handler = h.onBack;
          break;
      }

      if (!handler) return;
      e.preventDefault();
      e.stopPropagation();
      handler();
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

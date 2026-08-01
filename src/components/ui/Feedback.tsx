import type { ReactNode } from 'react';
import { Button } from './Controls';

export function StateView({
  kind,
  title,
  children,
  actionLabel,
  onAction,
}: {
  kind: 'loading' | 'empty' | 'error';
  title: ReactNode;
  children?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      className={`ui-state ui-state--${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'loading' ? 'polite' : undefined}
    >
      {kind === 'loading' && <span className="ui-spinner" aria-hidden="true" />}
      <strong>{title}</strong>
      {children && <div className="ui-state__detail">{children}</div>}
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

export function Dialog({
  open,
  title,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="ui-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="ui-dialog-title">{title}</h2>
        <div className="ui-dialog__body">{children}</div>
        {actions && <div className="ui-dialog__actions">{actions}</div>}
      </div>
    </div>
  );
}

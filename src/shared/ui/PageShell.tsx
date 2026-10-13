import type { HTMLAttributes, ReactNode } from 'react';

type ShellWidth = 'narrow' | 'content' | 'wide' | 'full';

export interface PageShellProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  width?: ShellWidth;
  centered?: boolean;
}

export function PageShell({
  children,
  width = 'content',
  centered = false,
  className = '',
  ...props
}: PageShellProps) {
  return (
    <main
      className={`ui-page-shell ui-page-shell--${width}${centered ? ' ui-page-shell--centered' : ''} ${className}`.trim()}
      {...props}
    >
      <div className="ui-page-shell__content">{children}</div>
    </main>
  );
}

export function PageHeader({
  title,
  subtitle,
  leading,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      {leading && <div className="ui-page-header__leading">{leading}</div>}
      <div className="ui-page-header__copy">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}

export function PageFooter({ children }: { children: ReactNode }) {
  return <footer className="ui-page-footer">{children}</footer>;
}

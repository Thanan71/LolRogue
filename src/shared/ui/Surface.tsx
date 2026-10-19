import type { HTMLAttributes, ReactNode } from 'react';

export function Panel({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={`ui-panel ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function Stack({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`ui-stack ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';

export function EncounterLayout({
  title,
  gold,
  tone = 'gold',
  children,
  contentClassName = '',
}: {
  title: ReactNode;
  gold: number;
  tone?: 'gold' | 'green' | 'orange' | 'cyan';
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <main className={`encounter-layout encounter-layout--${tone}`}>
      <header className="encounter-layout__header">
        <h1>{title}</h1>
        <span className="encounter-layout__gold">
          {fr.common.goldLabel} : {gold}
        </span>
      </header>
      <div className={`encounter-layout__content ${contentClassName}`.trim()}>{children}</div>
    </main>
  );
}

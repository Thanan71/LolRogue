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
        <div className="encounter-layout__title-group">
          <span className="encounter-layout__eyebrow">Rencontre en cours</span>
          <h1>{title}</h1>
        </div>
        <span className="encounter-layout__gold">
          <span aria-hidden="true">●</span> {fr.common.goldLabel} : {gold}
        </span>
      </header>
      <div className={`encounter-layout__content ${contentClassName}`.trim()}>{children}</div>
    </main>
  );
}

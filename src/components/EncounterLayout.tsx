import { type ReactNode, useId } from 'react';
import { formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import '@/styles/encounter.css';

export function EncounterLayout({
  title,
  gold,
  tone = 'gold',
  eyebrow = fr.encounter.inProgress,
  subtitle,
  children,
  contentClassName = '',
}: {
  title: ReactNode;
  gold: number;
  tone?: 'gold' | 'green' | 'orange' | 'cyan';
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const titleId = useId();
  const formattedGold = formatNumber(gold);

  return (
    <main className={`encounter-layout encounter-layout--${tone}`}>
      <div className="encounter-layout__atmosphere" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <header className="encounter-layout__header">
        <span className="encounter-layout__sigil" aria-hidden="true">
          <span />
        </span>
        <div className="encounter-layout__title-group">
          <span className="encounter-layout__eyebrow">{eyebrow}</span>
          <h1 id={titleId}>{title}</h1>
          {subtitle ? <p className="encounter-layout__subtitle">{subtitle}</p> : null}
        </div>
        <div
          className="encounter-layout__gold"
          aria-label={`${fr.common.goldLabel} : ${formattedGold}`}
        >
          <span className="encounter-layout__coin" aria-hidden="true" />
          <span>{fr.common.goldLabel}</span>
          <strong>{formattedGold}</strong>
        </div>
      </header>
      <section
        className={`encounter-layout__content ${contentClassName}`.trim()}
        aria-labelledby={titleId}
      >
        {children}
      </section>
    </main>
  );
}

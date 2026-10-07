import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, PageShell } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { PATCH_NOTES, type PatchNoteCategory } from '@/data/patchNotes';
import { usePatchNotes } from '@/hooks/usePatchNotes';
import { getPatchNotesContent } from '@/i18n/patchNotesContent';
import { useSettingsStore } from '@/stores/settingsStore';
import '@/styles/patch-notes.css';

export function PatchNotesPage() {
  const language = useSettingsStore((state) => state.language);
  const content = getPatchNotesContent(language);
  const { unread, markRead, localFallback } = usePatchNotes();
  const [hasMarkedRead, setHasMarkedRead] = useState(false);
  const [category, setCategory] = useState<PatchNoteCategory | 'all'>('all');
  const publications = [...PATCH_NOTES]
    .sort((a, b) => b.sequence - a.sequence)
    .filter(
      (note) => category === 'all' || note.entries.some((entry) => entry.category === category),
    );

  return (
    <PageShell width="content" className="patch-notes-page" aria-label={content.title}>
      <PageHeader
        title={content.title}
        subtitle={content.history}
        actions={
          unread.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                markRead();
                setHasMarkedRead(true);
              }}
            >
              {content.markRead}
            </button>
          ) : undefined
        }
        leading={<Link to={ROUTES.MENU}>{content.back}</Link>}
      />
      {hasMarkedRead && <p role="status">{content.read}</p>}
      {localFallback && <p role="status">{content.localFallback}</p>}
      <label className="patch-notes-filter">
        <span>{content.filter}</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as typeof category)}
        >
          <option value="all">{content.all}</option>
          {Object.entries(content.categories).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {publications.length === 0 && <p role="status">{content.empty}</p>}
      {publications.map((note) => (
        <article
          className="patch-note"
          key={note.version}
          aria-labelledby={`patch-note-${note.sequence}`}
        >
          <header>
            <h2 id={`patch-note-${note.sequence}`}>{note.title[language]}</h2>
            <p>
              {note.version} ·{' '}
              <time dateTime={note.publishedOn}>
                {new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(
                  new Date(`${note.publishedOn}T12:00:00Z`),
                )}
              </time>
            </p>
          </header>
          {Object.entries(content.categories).map(([key, name]) => {
            const entries = note.entries.filter(
              (entry) => entry.category === key && (category === 'all' || category === key),
            );
            return entries.length > 0 ? (
              <section key={key} aria-label={name}>
                <h3>{name}</h3>
                <ul>
                  {entries.map((entry) => (
                    <li key={entry.text['fr-FR']}>{entry.text[language]}</li>
                  ))}
                </ul>
              </section>
            ) : null;
          })}
        </article>
      ))}
    </PageShell>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { usePatchNotes } from '@/hooks/usePatchNotes';
import { getPatchNotesContent } from '@/i18n/patchNotesContent';
import { useRunStore } from '@/stores/runStore';
import { useSettingsStore } from '@/stores/settingsStore';
import '@/styles/patch-notes.css';

/** Inline menu summary: initial focus stays on the route, with no modal or focus trap. */
export function PatchNotesSummary() {
  const { unread, markRead, identity } = usePatchNotes();
  const isActive = useRunStore((state) => state.isActive);
  const language = useSettingsStore((state) => state.language);
  const content = getPatchNotesContent(language);
  const [dismissedIdentity, setDismissedIdentity] = useState<string | null>(null);
  const [readIdentity, setReadIdentity] = useState<string | null>(null);
  function dismiss(read: boolean) {
    if (read) {
      markRead();
      setReadIdentity(identity);
    }
    setDismissedIdentity(identity);
    requestAnimationFrame(() => document.getElementById('patch-notes-menu-link')?.focus());
  }
  if (isActive || unread.length === 0 || dismissedIdentity === identity) {
    return readIdentity === identity ? (
      <p className="sr-only" role="status">
        {content.read}
      </p>
    ) : null;
  }
  return (
    <section
      className="patch-note-summary"
      aria-labelledby="patch-note-summary-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          dismiss(false);
        }
      }}
    >
      <h2 id="patch-note-summary-title">
        {content.summary} <span className="patch-note-badge">{content.categories.new}</span>
      </h2>
      <p role="status">{content.unread(unread.length)}</p>
      <ul>
        {unread.map((note) => (
          <li key={note.version}>
            {note.title[language]} · {note.version}
          </li>
        ))}
      </ul>
      <div className="patch-note-actions">
        <Link to={ROUTES.PATCH_NOTES}>{content.view}</Link>
        <button type="button" onClick={() => dismiss(true)}>
          {content.understood}
        </button>
        <button type="button" onClick={() => dismiss(false)}>
          {content.later}
        </button>
      </div>
    </section>
  );
}

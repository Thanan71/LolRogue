import { Link } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { usePatchNotes } from '@/hooks/usePatchNotes';
import { getPatchNotesContent } from '@/i18n/patchNotesContent';
import { useRunStore } from '@/stores/runStore';
import { useSettingsStore } from '@/stores/settingsStore';
import '@/styles/patch-notes.css';

/** Inline menu summary: never captures focus or mounts in a run route. */
export function PatchNotesSummary() {
  const { unread, markRead } = usePatchNotes();
  const isActive = useRunStore((state) => state.isActive);
  const language = useSettingsStore((state) => state.language);
  const content = getPatchNotesContent(language);
  if (isActive || unread.length === 0) return null;
  return (
    <section className="patch-note-summary" aria-labelledby="patch-note-summary-title">
      <h2 id="patch-note-summary-title">
        {content.summary} <span className="patch-note-badge">{content.categories.new}</span>
      </h2>
      <p>{content.unread(unread.length)}</p>
      <ul>
        {unread.map((note) => (
          <li key={note.version}>
            {note.title[language]} · {note.version}
          </li>
        ))}
      </ul>
      <div className="patch-note-actions">
        <Link to={ROUTES.PATCH_NOTES}>{content.view}</Link>
        <button type="button" onClick={markRead}>
          {content.understood}
        </button>
      </div>
    </section>
  );
}

import { fr } from '@/i18n/fr';

interface AdminErrorNoticeProps {
  message: string | null;
  onRetry: () => void;
  retrying: boolean;
}

export function AdminErrorNotice({ message, onRetry, retrying }: AdminErrorNoticeProps) {
  if (!message) return null;
  return (
    <div className="admin-request-error" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onRetry} disabled={retrying}>
        {retrying ? fr.admin.retrying : fr.admin.retry}
      </button>
    </div>
  );
}

import { playUIClick } from '@/audio';
import { Button, PageShell, StateView } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useAuthStore } from '@/stores/authStore';

export function NotFoundPage() {
  const navigate = useAppNavigate();
  const canEnterGame = useAuthStore((state) => state.isAuthenticated || state.isGuest);
  return (
    <PageShell width="narrow" centered>
      <div className="ui-not-found-code">404</div>
      <StateView kind="empty" title="Route not found">
        <p>This path does not lead to any known corner of the Rift.</p>
        <Button
          onClick={() => {
            playUIClick();
            navigate(canEnterGame ? ROUTES.MENU : ROUTES.AUTH);
          }}
        >
          {canEnterGame ? 'Return to menu' : 'Go to login'}
        </Button>
      </StateView>
    </PageShell>
  );
}

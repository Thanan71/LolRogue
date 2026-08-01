import { playUIClick } from '@/audio';
import { Button, PageShell, StateView } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useAuthStore } from '@/stores/authStore';
import { fr } from '@/i18n/fr';

export function NotFoundPage() {
  const navigate = useAppNavigate();
  const canEnterGame = useAuthStore((state) => state.isAuthenticated || state.isGuest);
  return (
    <PageShell width="narrow" centered>
      <div className="ui-not-found-code">404</div>
      <StateView kind="empty" title={fr.notFound.title}>
        <p>{fr.notFound.detail}</p>
        <Button
          onClick={() => {
            playUIClick();
            navigate(canEnterGame ? ROUTES.MENU : ROUTES.AUTH);
          }}
        >
          {canEnterGame ? fr.common.backToMenu : fr.notFound.login}
        </Button>
      </StateView>
    </PageShell>
  );
}

import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';

export function MenuPage() {
  const navigate = useAppNavigate();

  return (
    <div className="menu-page">
      <div className="menu-page__content">
        <h1 className="menu-page__title">LoL Rogue</h1>
        <p className="menu-page__subtitle">A League of Legends Roguelike</p>

        <div className="menu-page__actions">
          <button
            className="menu-page__btn menu-page__btn--primary"
            onClick={() => navigate(ROUTES.STARTER_SELECT)}
          >
            New Run
          </button>
          <button
            className="menu-page__btn menu-page__btn--secondary"
            onClick={() => navigate(ROUTES.DATABASE)}
          >
            Champion Database
          </button>
        </div>
      </div>
    </div>
  );
}

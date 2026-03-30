import { useNavigate } from 'react-router-dom';
import { useRouterStore, RoutePath } from '@/stores/routerStore';

/**
 * Custom hook that combines React Router's navigate with Zustand state.
 * Use this in components for programmatic navigation.
 */
export function useAppNavigate() {
  const navigate = useNavigate();
  const { navigateTo, setNavigating } = useRouterStore();

  return (route: RoutePath) => {
    setNavigating(true);
    navigateTo(route);
    navigate(route);
  };
}

import { type NavigateOptions, useNavigate } from 'react-router-dom';
import { type RoutePath, useRouterStore } from '@/stores/routerStore';

/**
 * Custom hook that combines React Router's navigate with Zustand state.
 * Use this in components for programmatic navigation.
 */
export function useAppNavigate() {
  const navigate = useNavigate();
  const { navigateTo, setNavigating } = useRouterStore();

  return (route: RoutePath, options?: NavigateOptions) => {
    setNavigating(true);
    navigateTo(route);
    navigate(route, options);
  };
}

import { type NavigateOptions, useNavigate } from 'react-router-dom';
import type { RoutePath } from '@/config/routes';

/**
 * Typed application navigation backed exclusively by React Router.
 */
export function useAppNavigate() {
  const navigate = useNavigate();

  return (route: RoutePath, options?: NavigateOptions) => {
    navigate(route, options);
  };
}

import { useState, useEffect } from 'react';

export type AppRoute = '/' | '/help';

export function useHashRoute(): AppRoute {
  const getRouteFromHash = (): AppRoute => {
    if (typeof window === 'undefined') return '/';
    const hash = window.location.hash.replace(/^#/, '');
    if (hash === '/help') return '/help';
    return '/';
  };

  const [route, setRoute] = useState<AppRoute>(getRouteFromHash);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getRouteFromHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return route;
}

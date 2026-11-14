export function useRouter() {
  return {
    replace: (route: { pathname: string }) => {
      (window as typeof window & { __paperNavigation?: string }).__paperNavigation = route.pathname;
    },
  };
}

export function usePathname() {
  return '/paper';
}

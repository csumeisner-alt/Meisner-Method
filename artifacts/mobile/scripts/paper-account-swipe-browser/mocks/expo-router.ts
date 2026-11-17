export function useRouter() {
  const navigate = (route: { pathname: string }) => {
    (window as typeof window & { __paperNavigation?: string }).__paperNavigation = route.pathname;
  };
  return {
    replace: navigate,
    push: navigate,
    navigate,
  };
}

export function usePathname() {
  return '/paper';
}

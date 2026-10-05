export function useRouter() {
  return {
    canGoBack: () => false,
    back: () => undefined,
    replace: () => undefined,
  };
}
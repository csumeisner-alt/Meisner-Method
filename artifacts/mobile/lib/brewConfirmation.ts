export type BrewConfirmationPlatform = 'web' | 'native';

export function requestBrewConfirmation(
  platform: BrewConfirmationPlatform,
  title: string,
  message: string,
  onConfirm: () => void,
  browserConfirm: (message: string) => boolean,
  nativeConfirm: (title: string, message: string, onConfirm: () => void) => void,
): void {
  if (platform === 'web') {
    if (browserConfirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  nativeConfirm(title, message, onConfirm);
}

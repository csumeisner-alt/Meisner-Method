import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  appendDiagnosticEvent,
  findUnfinishedInteraction,
  getMainTabSwipePathOutcome,
  makeDiagnosticEvent,
  readDiagnosticEvents,
  routeTemplateFromSegments,
  type DiagnosticContext,
  type DiagnosticEvent,
  type DiagnosticInteractionStage,
  type DiagnosticInteractionType,
} from '@/lib/crashDiagnostics';
import type { MainTabRoute } from '@/lib/mainTabNavigation';

let currentContext: DiagnosticContext = {
  appVersion: Constants.expoConfig?.version ?? 'unknown',
  platform: Platform.OS,
  route: '/unknown',
};

let pendingMainTabNavigation: {
  sourcePath: string;
  destinationPath: MainTabRoute;
} | null = null;

const storage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
};

let writeChain: Promise<void> = Promise.resolve();

function queueEvent(event: DiagnosticEvent): Promise<void> {
  writeChain = writeChain
    .catch(() => {})
    .then(() => appendDiagnosticEvent(storage, event));
  return writeChain;
}

export function setDiagnosticRoute(segments: readonly string[], pathname: string): void {
  const route = routeTemplateFromSegments(segments);
  currentContext = { ...currentContext, route };

  const pending = pendingMainTabNavigation;
  if (!pending) return;
  const outcome = getMainTabSwipePathOutcome(
    pathname,
    pending.sourcePath,
    pending.destinationPath,
  );
  if (!outcome) return;
  pendingMainTabNavigation = null;
  recordDiagnosticInteraction('main_tab_swipe', outcome);
}

export function recordMainTabNavigationResult(
  sourcePath: string,
  destinationPath: MainTabRoute,
  accepted: boolean,
): void {
  if (!accepted) {
    recordDiagnosticInteraction('main_tab_swipe', 'navigation_rejected');
    return;
  }
  pendingMainTabNavigation = { sourcePath, destinationPath };
  recordDiagnosticInteraction('main_tab_swipe', 'navigation_accepted');
}

export function recordDiagnosticError(
  kind: 'render_error' | 'fatal_js_error',
  error: Error,
  componentStack?: string,
): void {
  void queueEvent(
    makeDiagnosticEvent(currentContext, kind, {
      errorType: error?.name,
      componentStack,
    }),
  );
}

export function recordDiagnosticInteraction(
  type: DiagnosticInteractionType,
  stage: DiagnosticInteractionStage,
): void {
  void queueEvent(
    makeDiagnosticEvent(currentContext, 'interaction_lifecycle', {
      interaction: { type, stage },
    }),
  );
}

export async function markInterruptedInteractionIfNeeded(): Promise<void> {
  await writeChain.catch(() => {});
  const events = await readDiagnosticEvents(storage);
  const unfinished = findUnfinishedInteraction(events);
  if (!unfinished?.interaction) return;
  await queueEvent(
    makeDiagnosticEvent(currentContext, 'interaction_lifecycle', {
      interaction: {
        type: unfinished.interaction.type,
        stage: 'interrupted',
      },
    }),
  );
}

export async function getDiagnosticExport(): Promise<string> {
  await writeChain.catch(() => {});
  const events: DiagnosticEvent[] = await readDiagnosticEvents(storage);
  return JSON.stringify(
    {
      appVersion: currentContext.appVersion,
      platform: currentContext.platform,
      currentRoute: currentContext.route,
      events,
    },
    null,
    2,
  );
}

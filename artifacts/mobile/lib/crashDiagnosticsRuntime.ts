import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  appendDiagnosticEvent,
  findUnfinishedInteraction,
  makeDiagnosticEvent,
  readDiagnosticEvents,
  routeTemplateFromSegments,
  type DiagnosticContext,
  type DiagnosticEvent,
  type DiagnosticInteractionStage,
  type DiagnosticInteractionType,
} from '@/lib/crashDiagnostics';

let currentContext: DiagnosticContext = {
  appVersion: Constants.expoConfig?.version ?? 'unknown',
  platform: Platform.OS,
  route: '/unknown',
};

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

export function setDiagnosticRoute(segments: readonly string[]): void {
  const route = routeTemplateFromSegments(segments);
  currentContext = { ...currentContext, route };
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

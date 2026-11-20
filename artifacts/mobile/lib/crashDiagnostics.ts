export const CRASH_DIAGNOSTICS_STORAGE_KEY = '@meisnermethod/crash_diagnostics_v1';
export const CRASH_DIAGNOSTICS_LIMIT = 40;

export type DiagnosticInteractionType = 'main_tab_swipe' | 'navigation_transition';
export type DiagnosticInteractionStage =
  | 'started'
  | 'cancelled'
  | 'navigation_requested'
  | 'navigation_accepted'
  | 'navigation_rejected'
  | 'completed'
  | 'interrupted';

export type DiagnosticEvent = {
  timestamp: string;
  appVersion: string;
  platform: string;
  route: string;
  kind: 'render_error' | 'fatal_js_error' | 'interaction_lifecycle';
  errorType?: string;
  components?: string[];
  interaction?: {
    type: DiagnosticInteractionType;
    stage: DiagnosticInteractionStage;
  };
};

export type DiagnosticContext = {
  appVersion: string;
  platform: string;
  route: string;
};

export type DiagnosticStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const COMPONENT_NAME = /^[A-Z][A-Za-z0-9_$]{0,59}$/;
const APP_VERSION = /^(unknown|\d{1,12}(?:\.\d{1,12}){0,3}(?:-[0-9A-Za-z.-]{1,24})?)$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SAFE_ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'URIError',
  'EvalError',
  'AggregateError',
  'NetworkError',
  'AbortError',
]);
const SAFE_ROUTE_SEGMENTS = new Set([
  'achievement-preview',
  'analysis',
  'event-arena',
  'heat-map',
  'heat-map-chart',
  'index',
  'lightning-round',
  'paper',
  'picks',
  'portfolio',
  '+not-found',
]);
const INTERACTION_TYPES = new Set<DiagnosticInteractionType>([
  'main_tab_swipe',
  'navigation_transition',
]);
const INTERACTION_STAGES = new Set<DiagnosticInteractionStage>([
  'started',
  'cancelled',
  'navigation_requested',
  'navigation_accepted',
  'navigation_rejected',
  'completed',
  'interrupted',
]);

export function routeTemplateFromSegments(segments: readonly string[]): string {
  const safeSegments = segments
    .filter((segment) => !/^\([^)]*\)$/.test(segment))
    .map((segment) => {
      if (/^\[[^[\]]+\]$/.test(segment)) return '[param]';
      return SAFE_ROUTE_SEGMENTS.has(segment) ? segment : '[route]';
    });
  return `/${safeSegments.join('/')}` || '/';
}

export function componentNamesFromStack(componentStack: string): string[] {
  const names: string[] = [];
  for (const line of componentStack.split('\n')) {
    const match = line.match(/^\s*in\s+([A-Z][A-Za-z0-9_$]*)/);
    if (match && COMPONENT_NAME.test(match[1]) && !names.includes(match[1])) {
      names.push(match[1]);
    }
    if (names.length >= 8) break;
  }
  return names;
}

function normalizeEvent(value: unknown): DiagnosticEvent | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.timestamp !== 'string'
    || typeof candidate.appVersion !== 'string'
    || typeof candidate.platform !== 'string'
    || typeof candidate.route !== 'string'
    || !ISO_TIMESTAMP.test(candidate.timestamp)
    || !['render_error', 'fatal_js_error', 'interaction_lifecycle'].includes(String(candidate.kind))
  ) {
    return null;
  }

  const routeParts = candidate.route === '/' ? [] : candidate.route.replace(/^\//, '').split('/');
  const safeRoute = routeParts.every((part) =>
    SAFE_ROUTE_SEGMENTS.has(part) || part === '[param]' || part === '[route]',
  );
  const event: DiagnosticEvent = {
    timestamp: candidate.timestamp,
    appVersion: APP_VERSION.test(candidate.appVersion) ? candidate.appVersion : 'unknown',
    platform: ['android', 'ios', 'web'].includes(candidate.platform)
      ? candidate.platform
      : 'other',
    route: safeRoute && candidate.route.length <= 120 ? candidate.route : '/unknown',
    kind: candidate.kind as DiagnosticEvent['kind'],
  };

  if (typeof candidate.errorType === 'string') {
    event.errorType = SAFE_ERROR_NAMES.has(candidate.errorType) ? candidate.errorType : 'Error';
  }
  if (Array.isArray(candidate.components)) {
    event.components = candidate.components
      .filter((name): name is string => typeof name === 'string' && COMPONENT_NAME.test(name))
      .slice(0, 8);
  }
  if (candidate.interaction && typeof candidate.interaction === 'object') {
    const interaction = candidate.interaction as Record<string, unknown>;
    if (
      INTERACTION_TYPES.has(interaction.type as DiagnosticInteractionType)
      && INTERACTION_STAGES.has(interaction.stage as DiagnosticInteractionStage)
    ) {
      event.interaction = {
        type: interaction.type as DiagnosticInteractionType,
        stage: interaction.stage as DiagnosticInteractionStage,
      };
    }
  }
  if (event.kind === 'interaction_lifecycle' && !event.interaction) return null;
  return event;
}

export function parseDiagnosticEvents(raw: string | null): DiagnosticEvent[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEvent)
      .filter((event): event is DiagnosticEvent => event !== null)
      .slice(-CRASH_DIAGNOSTICS_LIMIT);
  } catch {
    return [];
  }
}

export async function appendDiagnosticEvent(
  storage: DiagnosticStorage,
  event: DiagnosticEvent,
): Promise<void> {
  try {
    const existing = parseDiagnosticEvents(
      await storage.getItem(CRASH_DIAGNOSTICS_STORAGE_KEY),
    );
    const normalized = normalizeEvent(event);
    if (!normalized) return;
    existing.push(normalized);
    await storage.setItem(
      CRASH_DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify(existing.slice(-CRASH_DIAGNOSTICS_LIMIT)),
    );
  } catch {
    // Diagnostics must never prevent the app from opening or recovering.
  }
}

export async function readDiagnosticEvents(
  storage: DiagnosticStorage,
): Promise<DiagnosticEvent[]> {
  try {
    return parseDiagnosticEvents(
      await storage.getItem(CRASH_DIAGNOSTICS_STORAGE_KEY),
    );
  } catch {
    return [];
  }
}

export function findUnfinishedInteraction(
  events: readonly DiagnosticEvent[],
): DiagnosticEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event.kind !== 'interaction_lifecycle'
      || event.interaction?.type !== 'main_tab_swipe'
    ) continue;
    if (
      event.interaction.stage === 'started'
      || event.interaction.stage === 'navigation_accepted'
    ) {
      return event;
    }
    // Legacy navigation_requested events are ambiguous: they were recorded
    // before the navigation guard ran and before tab-path changes were observed.
    // Treat every other swipe stage as a closed lifecycle.
    return null;
  }
  return null;
}

export function getMainTabSwipePathOutcome(
  currentPath: string,
  sourcePath: string,
  destinationPath: string,
): 'completed' | 'cancelled' | null {
  if (currentPath === sourcePath) return null;
  return currentPath === destinationPath ? 'completed' : 'cancelled';
}

export function makeDiagnosticEvent(
  context: DiagnosticContext,
  kind: DiagnosticEvent['kind'],
  options: {
    errorType?: string;
    componentStack?: string;
    interaction?: DiagnosticEvent['interaction'];
    timestamp?: string;
  } = {},
): DiagnosticEvent {
  const event: DiagnosticEvent = {
    timestamp: options.timestamp ?? new Date().toISOString(),
    appVersion: context.appVersion,
    platform: context.platform,
    route: context.route,
    kind,
  };
  if (kind !== 'interaction_lifecycle' && options.errorType) {
    event.errorType = SAFE_ERROR_NAMES.has(options.errorType) ? options.errorType : 'Error';
  }
  if (kind === 'render_error' && options.componentStack) {
    event.components = componentNamesFromStack(options.componentStack);
  }
  if (kind === 'interaction_lifecycle' && options.interaction) {
    event.interaction = options.interaction;
  }
  return event;
}

import { NEON_GUCCI_LOADING_PHRASES } from './neonGucciPhrases.ts';

export const ANALYSIS_LOADING_STAGES = [
  'Reading the tape',
  'Checking momentum',
  'Comparing the sector',
  'Building the lesson',
] as const;

export const ANALYSIS_LOADING_STAGE_INTERVAL_MS = 2_200;
export const NEON_GUCCI_LOADING_STAGE_INTERVAL_MS = 5_000;

export function getAnalysisLoadingStages(phrasesActive: boolean): readonly string[] {
  return phrasesActive ? NEON_GUCCI_LOADING_PHRASES : ANALYSIS_LOADING_STAGES;
}

export function getAnalysisLoadingStageInterval(phrasesActive: boolean): number {
  return phrasesActive
    ? NEON_GUCCI_LOADING_STAGE_INTERVAL_MS
    : ANALYSIS_LOADING_STAGE_INTERVAL_MS;
}

export function formatAnalysisLoadingStage(
  stage: string,
  symbol: string | undefined,
  phrasesActive: boolean,
): string {
  if (phrasesActive || !symbol) return stage;
  return `${stage} · ${symbol}`;
}
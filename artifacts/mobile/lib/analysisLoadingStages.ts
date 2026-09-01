import { NEON_GUCCI_LOADING_PHRASES } from './neonGucciPhrases.ts';

export const ANALYSIS_LOADING_STAGES = [
  'Reading the tape',
  'Checking momentum',
  'Comparing the sector',
  'Building the lesson',
] as const;

export function getAnalysisLoadingStages(phrasesActive: boolean): readonly string[] {
  return phrasesActive ? NEON_GUCCI_LOADING_PHRASES : ANALYSIS_LOADING_STAGES;
}
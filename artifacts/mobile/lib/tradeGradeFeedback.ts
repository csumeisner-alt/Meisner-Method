export interface TradeGradeFeedback {
  headline: string;
  guidance: string;
}

const GUIDANCE_BY_GRADE: Record<string, string> = {
  'A+': 'A near-perfect exit — keep trusting that discipline.',
  A: 'Excellent execution — keep repeating what worked.',
  'A-': 'A strong, well-timed exit — keep building on it.',
  'B+': 'A strong result — look for the same setup again.',
  B: 'A good result — keep refining your timing.',
  'B-': 'A decent result — a little more patience could help.',
  'C+': 'A small gain — watch for a cleaner exit next time.',
  C: 'Nearly even — wait for a clearer edge before exiting.',
  'C-': 'A manageable loss — review what changed before the exit.',
  'D+': 'A weak result — consider a tighter exit plan next time.',
  D: 'A poor result — revisit the entry and risk controls.',
  'D-': 'A tough result — protect the downside earlier next time.',
  'F+': 'A large loss — pause and review the trade setup.',
  F: 'A heavy loss — tighten risk limits before the next trade.',
  'F-': 'A wipeout — step back, review the plan, and reset.',
};

const HEADLINE_BY_GRADE: Record<string, string> = {
  'A+': 'MARKET GENIUS',
  A: 'EXCELLENT TRADE',
  'A-': 'GREAT TRADE',
  'B+': 'SOLID PROFIT',
  B: 'GOOD TRADE',
  'B-': 'DECENT TRADE',
  'C+': 'SMALL GAIN',
  C: 'BREAK EVEN',
  'C-': 'MINOR LOSS',
  'D+': 'WEAK TRADE',
  D: 'POOR TRADE',
  'D-': 'BAD TRADE',
  'F+': 'BIG LOSS',
  F: 'HEAVY LOSS',
  'F-': 'WIPEOUT',
};

/** Return the short, grade-specific coaching copy used by trade feedback. */
export function getTradeGradeFeedback(grade: string, context: string): TradeGradeFeedback {
  return {
    headline: HEADLINE_BY_GRADE[grade] ?? 'TRADE REVIEW',
    guidance: `${context}. ${GUIDANCE_BY_GRADE[grade] ?? 'Review the setup and risk before your next trade.'}`,
  };
}
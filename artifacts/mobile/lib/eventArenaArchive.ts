export type CompletedEventArchiveYear<T> = {
  year: number;
  weeks: T[];
};

export function groupCompletedEventWeeksByYear<T extends { startAtMs: number }>(
  weeks: readonly T[],
): CompletedEventArchiveYear<T>[] {
  const grouped = new Map<number, T[]>();
  for (const week of weeks) {
    const year = new Date(week.startAtMs).getUTCFullYear();
    const yearWeeks = grouped.get(year) ?? [];
    yearWeeks.push(week);
    grouped.set(year, yearWeeks);
  }

  return [...grouped.entries()]
    .sort(([yearA], [yearB]) => yearB - yearA)
    .map(([year, yearWeeks]) => ({
      year,
      weeks: yearWeeks.sort((weekA, weekB) => weekB.startAtMs - weekA.startAtMs),
    }));
}

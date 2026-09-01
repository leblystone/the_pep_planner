/** Washout period progress (matches Day X/Y). */
export function getWashoutPeriodProgress(w) {
  if (!w || typeof w !== 'object' || !w.totalDays) {
    return { pct: 0, daysLeft: 0 };
  }
  const pct = Math.min(100, Math.round(((w.dayIndex + 1) / w.totalDays) * 100));
  const daysLeft = Math.max(0, w.totalDays - (w.dayIndex + 1));
  return { pct, daysLeft };
}

/** Estimated % of compound still present based on half-life since washout start. */
export function getHalfLifeRemainingPct(dayIndex, halfLife) {
  if (!halfLife?.value) return null;
  const hlHours = halfLife.unit === 'days' ? halfLife.value * 24 : halfLife.value;
  if (hlHours <= 0) return null;
  const elapsedHours = (dayIndex ?? 0) * 24;
  return Math.round(Math.pow(0.5, elapsedHours / hlHours) * 100);
}

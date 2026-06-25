import { differenceInDays, parseISO } from 'date-fns';

// Cycle logic in one place. The schedule is driven by:
//   schedulePattern: { cycleStart, cycleLength, labels: [...] }
//   cycleTemplate:   { "1": dayObj, "2": dayObj, ... }  keyed by 1-based cycle position
// A dayObj has the same shape as an explicit schedule entry:
//   { lunch: { type, notes }, evening: { type, notes }, calories, protein, notes }

const toDate = (date) => (typeof date === 'string' ? parseISO(date) : date);

// 1-based position within the cycle for a date, or null if the pattern isn't set up.
export function getCyclePosition(schedulePattern, date) {
  const sp = schedulePattern;
  if (!sp?.cycleStart || !sp?.cycleLength) return null;
  const daysDiff = differenceInDays(toDate(date), parseISO(sp.cycleStart));
  const pos = ((daysDiff % sp.cycleLength) + sp.cycleLength) % sp.cycleLength;
  return pos + 1;
}

// Phase label (A/B, On/Off, etc.) for a 1-based cycle position. Splits the cycle
// evenly across labels.length phases — works for 14-day A/B AND 8-day rotors.
export function getPhaseLabelByPosition(schedulePattern, position) {
  const sp = schedulePattern;
  if (!sp?.labels?.length || !sp?.cycleLength || position == null) {
    return sp?.labels?.[0] ?? 'A';
  }
  const daysPerPhase = sp.cycleLength / sp.labels.length;
  const phaseIndex = Math.floor((position - 1) / daysPerPhase);
  return sp.labels[phaseIndex] ?? sp.labels[0];
}

// Phase label for a date.
export function getPhaseLabel(schedulePattern, date) {
  return getPhaseLabelByPosition(schedulePattern, getCyclePosition(schedulePattern, date));
}

// The cycleTemplate day generated for a date (or null if no cycle configured).
export function getCycleDay(profile, date) {
  const ct = profile?.cycleTemplate;
  if (!ct || Object.keys(ct).length === 0) return null;
  const pos = getCyclePosition(profile.schedulePattern, date);
  if (pos == null) return null;
  return ct[String(pos)] || null;
}

// Resolve a day's schedule: an explicit per-date entry always wins; otherwise the
// day is generated from the cycle template. This is what makes the schedule
// "foolproof" — the app fills the calendar, Coach only sets the pattern or overrides.
export function resolveDaySchedule(profile, schedule, dateStr) {
  if (schedule && schedule[dateStr] != null) return schedule[dateStr];
  return getCycleDay(profile, dateStr);
}

export function hasCycleTemplate(profile) {
  return !!profile?.cycleTemplate && Object.keys(profile.cycleTemplate).length > 0;
}

// Pure helpers for the two-axis goal model. No React, no localStorage — fully testable.

export const INTENTS = ['cut', 'recomp', 'bulk', 'maintain'];
export const PRIMARY_METRICS = ['weight', 'bodyfat', 'waist', 'strength'];

export const INTENT_LABELS = {
  cut: 'Cut',
  recomp: 'Recomp',
  bulk: 'Bulk',
  maintain: 'Maintain',
};

export const INTENT_DESCRIPTIONS = {
  cut: 'Lose fat in a calorie deficit while keeping protein high to hold muscle.',
  recomp: 'Build muscle and lose fat at the same time — hit protein, eat near maintenance, ignore the scale.',
  bulk: 'Add muscle in a calorie surplus with high protein.',
  maintain: 'Hold steady — hit your targets consistently, no deficit or surplus.',
};

// Default primary metric per intent.
export const DEFAULT_METRIC_FOR_INTENT = {
  cut: 'weight',
  bulk: 'weight',
  recomp: 'bodyfat',
  maintain: 'weight',
};

export function inferIntent(currentWeight, targetWeight) {
  if (!targetWeight || !currentWeight) return 'maintain';
  if (targetWeight < currentWeight) return 'cut';
  if (targetWeight > currentWeight) return 'bulk';
  return 'maintain';
}

function emptyTargets() {
  return {
    weight: { value: null, date: null },
    bodyfat: { value: null, date: null },
    waist: { value: null, date: null },
  };
}

// Build a goal object from a profile that predates the goal model.
// Returns the existing goal untouched if already present.
export function migrateGoal(profile) {
  if (profile?.goal) return profile.goal;

  const targets = emptyTargets();
  let intent = 'maintain';
  let primaryMetric = 'weight';

  if (profile?.targetWeight) {
    intent = inferIntent(profile.currentWeight, profile.targetWeight);
    primaryMetric = 'weight';
    targets.weight = { value: profile.targetWeight, date: profile.targetDate || null };
  }

  return { intent, primaryMetric, targets };
}

// Progress toward a target. `start` is the baseline (e.g. starting weight),
// `current` the latest value, `target` the goal value. Direction is inferred
// from start vs target. Returns { percent: 0..100 | null, remaining, total }.
export function getGoalProgress({ start, current, target }) {
  if (target == null || current == null) {
    return { percent: null, remaining: null, total: null };
  }
  const base = start ?? current;
  const total = base - target;            // signed distance start→target
  const done = base - current;            // signed distance start→current
  if (total === 0) return { percent: 100, remaining: 0, total: 0 };
  const raw = (done / total) * 100;
  const percent = Math.round(Math.min(Math.max(raw, 0), 100));
  return { percent, remaining: current - target, total };
}

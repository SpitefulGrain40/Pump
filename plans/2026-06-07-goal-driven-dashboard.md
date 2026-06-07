# Goal-Driven Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rigid "Target Weight" field with a two-axis goal model (training intent + primary metric) that drives both an adaptive dashboard and the AI Coach's behaviour.

**Architecture:** A `goal` object on the user profile holds `intent` (cut/recomp/bulk/maintain) and `primaryMetric` (weight/bodyfat/waist/strength) plus per-metric targets. A metric descriptor registry (`src/utils/metrics.js`) describes how to read each metric's current value and time-series, so one set of dashboard components renders any metric. Body-fat % and waist gain real trends via a new `pump-measurement-history` log. Coach behaviour switches on intent.

**Tech Stack:** React 19, Vite 8, Tailwind 4, Chart.js, date-fns, localStorage. Tests via Vitest (added in Task 0).

**Spec:** `specs/2026-06-07-goal-driven-dashboard-design.md`

---

## Testing Approach

The project has no test runner today. This plan adds **Vitest** (Task 0) and uses TDD for the pure logic that carries the real risk: goal migration, intent inference, goal-progress math, and the metric descriptors. React components (modals, cards, Settings, Onboarding, Dashboard wiring) are verified by `npm run build`, `npm run lint`, and a manual smoke-test checklist (final task) — consistent with the existing build → test-deploy → approval workflow.

## File Structure

**New files:**
- `vitest.config.js` — Vitest config (jsdom env).
- `src/utils/goal.js` — intent inference, migration, goal-progress math (pure, tested).
- `src/utils/goal.test.js` — tests for the above.
- `src/utils/metrics.js` — metric descriptor registry (pure data-readers, tested).
- `src/utils/metrics.test.js` — tests for descriptors.
- `src/hooks/useMeasurementHistory.js` — measurement snapshot log (mirrors `useWeightHistory`).
- `src/components/MeasurementModal.jsx` — quick "Log measurements" modal (mirrors `WeightModal`).
- `src/components/GoalCard.jsx` — descriptor-driven hero card.
- `src/components/SecondaryMetricStrip.jsx` — secondary metric chips + inline expand.

**Modified files:**
- `src/utils/dataSchemas.js` — `goal` default, `createMeasurementEntry`.
- `src/hooks/useUserProfile.js` — run goal migration; generalise `getProgress`/`getWeightToLose`.
- `src/services/ai/context.js` — GOAL block + intent rules + `LOG_MEASUREMENT` parsing.
- `src/components/Coach.jsx` — `goalDir` from intent; execute `LOG_MEASUREMENT`.
- `src/components/Dashboard.jsx` — replace Goal Countdown with GoalCard + strip.
- `src/components/Settings.jsx` — Goals section rebuilt; remove Target Weight field.
- `src/components/OnboardingWizard.jsx` — target-weight step → goal step.

---

## Task 0: Add Vitest test infrastructure

**Files:**
- Create: `vitest.config.js`
- Modify: `package.json` (devDependencies + scripts)
- Test: `src/utils/smoke.test.js` (temporary sanity test, deleted at end of task)

- [ ] **Step 1: Install Vitest + jsdom**

Run:
```bash
npm install -D vitest jsdom
```
Expected: packages added to `devDependencies`, no errors.

- [ ] **Step 2: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a temporary smoke test**

Create `src/utils/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm src/utils/smoke.test.js
git add package.json package-lock.json vitest.config.js
git commit -m "test: add Vitest + jsdom test infrastructure"
```

---

## Task 1: Profile `goal` default + measurement entry helper

**Files:**
- Modify: `src/utils/dataSchemas.js:1-36` (DEFAULT_USER_PROFILE), and add `createMeasurementEntry`

- [ ] **Step 1: Add `goal` to `DEFAULT_USER_PROFILE`**

In `src/utils/dataSchemas.js`, inside `DEFAULT_USER_PROFILE`, immediately after the `targetDate: null,` line, add:
```js
  // Goal model (two-axis): training intent + primary dashboard metric.
  // Supersedes targetWeight/targetDate (kept above for back-compat + migration).
  goal: {
    intent: 'maintain',       // 'cut' | 'recomp' | 'bulk' | 'maintain'
    primaryMetric: 'weight',  // 'weight' | 'bodyfat' | 'waist' | 'strength'
    targets: {
      weight: { value: null, date: null },
      bodyfat: { value: null, date: null },
      waist: { value: null, date: null },
      // strength is trend-only — no numeric target
    },
  },
```

- [ ] **Step 2: Add `createMeasurementEntry` helper**

In `src/utils/dataSchemas.js`, after `createWeightEntry` (around line 77), add:
```js
export const createMeasurementEntry = ({ waist = null, neck = null, hip = null, bodyFatManual = null }, date = null) => ({
  id: `meas-${Date.now()}`,
  date: date || new Date().toISOString().split('T')[0],
  waist,
  neck,
  hip,
  bodyFatManual,
  timestamp: new Date().toISOString(),
});
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/utils/dataSchemas.js
git commit -m "feat: add goal model default + measurement entry helper"
```

---

## Task 2: Goal logic — intent inference, migration, progress (TDD)

**Files:**
- Create: `src/utils/goal.js`
- Test: `src/utils/goal.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/goal.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { inferIntent, migrateGoal, getGoalProgress } from './goal';

describe('inferIntent', () => {
  it('returns cut when target below current', () => {
    expect(inferIntent(100, 90)).toBe('cut');
  });
  it('returns bulk when target above current', () => {
    expect(inferIntent(80, 90)).toBe('bulk');
  });
  it('returns maintain when equal or missing', () => {
    expect(inferIntent(90, 90)).toBe('maintain');
    expect(inferIntent(90, null)).toBe('maintain');
  });
});

describe('migrateGoal', () => {
  it('leaves an existing goal untouched', () => {
    const goal = { intent: 'bulk', primaryMetric: 'weight', targets: {} };
    const p = { goal };
    expect(migrateGoal(p)).toBe(goal);
  });
  it('builds a weight goal from legacy targetWeight (cut)', () => {
    const p = { currentWeight: 100, targetWeight: 90, targetDate: '2026-09-01' };
    const g = migrateGoal(p);
    expect(g.intent).toBe('cut');
    expect(g.primaryMetric).toBe('weight');
    expect(g.targets.weight).toEqual({ value: 90, date: '2026-09-01' });
  });
  it('defaults to maintain/weight when no legacy target', () => {
    const g = migrateGoal({ currentWeight: 100 });
    expect(g.intent).toBe('maintain');
    expect(g.primaryMetric).toBe('weight');
    expect(g.targets.weight).toEqual({ value: null, date: null });
  });
});

describe('getGoalProgress', () => {
  it('computes percent toward a downward target', () => {
    // start 100, target 90, current 95 => 50%
    const r = getGoalProgress({ start: 100, current: 95, target: 90 });
    expect(r.percent).toBe(50);
  });
  it('computes percent toward an upward target', () => {
    // start 80, target 90, current 85 => 50%
    const r = getGoalProgress({ start: 80, current: 85, target: 90 });
    expect(r.percent).toBe(50);
  });
  it('clamps to 0..100', () => {
    expect(getGoalProgress({ start: 100, current: 105, target: 90 }).percent).toBe(0);
    expect(getGoalProgress({ start: 100, current: 85, target: 90 }).percent).toBe(100);
  });
  it('returns null percent when target missing', () => {
    expect(getGoalProgress({ start: 100, current: 95, target: null }).percent).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot import from `./goal` (module missing).

- [ ] **Step 3: Implement `src/utils/goal.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all `goal.test.js` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/goal.js src/utils/goal.test.js
git commit -m "feat: goal intent inference, migration, and progress math (tested)"
```

---

## Task 3: Run goal migration in `useUserProfile`

**Files:**
- Modify: `src/hooks/useUserProfile.js`

- [ ] **Step 1: Import the migration helper**

At the top of `src/hooks/useUserProfile.js`, after the existing imports, add:
```js
import { migrateGoal } from '../utils/goal';
```

- [ ] **Step 2: Add a migration effect**

After the existing `weekAStart` migration `useEffect` (ends ~line 31), add:
```js
  // Build the goal model for profiles created before it existed (runs once).
  useEffect(() => {
    if (!profile.goal) {
      setProfile(prev => ({ ...prev, goal: migrateGoal(prev) }));
    }
  }, [profile.goal, setProfile]);
```

- [ ] **Step 3: Verify build + existing tests**

Run: `npm run build && npm test`
Expected: build succeeds, tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useUserProfile.js
git commit -m "feat: migrate legacy profiles to the goal model on load"
```

---

## Task 4: `useMeasurementHistory` hook

**Files:**
- Create: `src/hooks/useMeasurementHistory.js`

- [ ] **Step 1: Implement the hook (mirrors `useWeightHistory`)**

```js
import { useLocalStorageArray } from './useLocalStorage';
import { createMeasurementEntry } from '../utils/dataSchemas';

export function useMeasurementHistory() {
  const { items: entries, add, clear } = useLocalStorageArray('pump-measurement-history', []);

  // Log a snapshot. If one already exists for the same date, replace it.
  const logMeasurement = (fields, date = null) => {
    const entry = createMeasurementEntry(fields, date);
    const existingIndex = entries.findIndex((e) => e.date === entry.date);
    if (existingIndex >= 0) {
      const updated = [...entries];
      updated[existingIndex] = { ...updated[existingIndex], ...entry };
      localStorage.setItem('pump-measurement-history', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('local-storage-update', { detail: { key: 'pump-measurement-history' } }));
      return entry;
    }
    add(entry);
    return entry;
  };

  const getLatest = () => {
    if (entries.length === 0) return null;
    return [...entries].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  };

  return { entries, logMeasurement, getLatest, clear };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMeasurementHistory.js
git commit -m "feat: useMeasurementHistory hook for measurement snapshots"
```

---

## Task 5: Metric descriptor registry (TDD)

**Files:**
- Create: `src/utils/metrics.js`
- Test: `src/utils/metrics.test.js`

The registry exposes pure functions that take the data they need as arguments
(profile, weight history, measurement history, PRs). No hooks inside — the UI
passes data in, which keeps it testable.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/metrics.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { METRICS, getMetric } from './metrics';

const profile = { gender: 'male', height: 180, waistCircumference: 88, neckCircumference: 40 };

const weightHistory = [
  { date: '2026-01-01', weight: 100 },
  { date: '2026-01-08', weight: 98 },
];

const measurementHistory = [
  { date: '2026-01-01', waist: 90, neck: 40, hip: null, bodyFatManual: null },
  { date: '2026-01-08', waist: 88, neck: 40, hip: null, bodyFatManual: null },
];

describe('weight descriptor', () => {
  it('current = latest weight', () => {
    expect(getMetric('weight').getCurrent(profile, { weightHistory })).toBe(98);
  });
  it('series sorted ascending by date', () => {
    const s = getMetric('weight').getSeries(profile, { weightHistory });
    expect(s.map(p => p.value)).toEqual([100, 98]);
  });
});

describe('waist descriptor', () => {
  it('current = latest waist snapshot', () => {
    expect(getMetric('waist').getCurrent(profile, { measurementHistory })).toBe(88);
  });
});

describe('bodyfat descriptor', () => {
  it('computes a series via Navy from measurement snapshots', () => {
    const s = getMetric('bodyfat').getSeries(profile, { measurementHistory });
    expect(s.length).toBe(2);
    // body fat should fall as waist falls
    expect(s[1].value).toBeLessThan(s[0].value);
  });
});

describe('registry', () => {
  it('weight/bodyfat/waist support targets, strength does not', () => {
    expect(getMetric('weight').supportsTarget).toBe(true);
    expect(getMetric('bodyfat').supportsTarget).toBe(true);
    expect(getMetric('waist').supportsTarget).toBe(true);
    expect(getMetric('strength').supportsTarget).toBe(false);
  });
  it('exposes all four metrics', () => {
    expect(Object.keys(METRICS).sort()).toEqual(['bodyfat', 'strength', 'waist', 'weight']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot import from `./metrics`.

- [ ] **Step 3: Implement `src/utils/metrics.js`**

```js
import { calculateBodyFatNavy } from './calculations';

const byDateAsc = (a, b) => new Date(a.date) - new Date(b.date);

// --- weight ---
const weight = {
  key: 'weight',
  label: 'Weight',
  unit: 'kg',
  supportsTarget: true,
  getCurrent(_profile, { weightHistory = [] } = {}) {
    if (weightHistory.length === 0) return null;
    return [...weightHistory].sort((a, b) => new Date(b.date) - new Date(a.date))[0].weight;
  },
  getSeries(_profile, { weightHistory = [] } = {}) {
    return [...weightHistory].sort(byDateAsc).map(e => ({ date: e.date, value: e.weight }));
  },
  goodDirection(intent) {
    return intent === 'bulk' ? 'up' : 'down';
  },
};

// --- waist ---
const waist = {
  key: 'waist',
  label: 'Waist',
  unit: 'cm',
  supportsTarget: true,
  getCurrent(profile, { measurementHistory = [] } = {}) {
    const latest = [...measurementHistory].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return latest?.waist ?? profile?.waistCircumference ?? null;
  },
  getSeries(_profile, { measurementHistory = [] } = {}) {
    return [...measurementHistory]
      .filter(e => e.waist != null)
      .sort(byDateAsc)
      .map(e => ({ date: e.date, value: e.waist }));
  },
  goodDirection() {
    return 'down';
  },
};

// --- bodyfat (Navy per snapshot, manual overrides when present) ---
const bodyfat = {
  key: 'bodyfat',
  label: 'Body Fat',
  unit: '%',
  supportsTarget: true,
  _valueFor(profile, snap) {
    if (snap.bodyFatManual != null) return snap.bodyFatManual;
    return calculateBodyFatNavy(profile.gender, profile.height, snap.waist, snap.neck, snap.hip);
  },
  getCurrent(profile, { measurementHistory = [] } = {}) {
    const sorted = [...measurementHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    for (const snap of sorted) {
      const v = this._valueFor(profile, snap);
      if (v != null) return v;
    }
    return null;
  },
  getSeries(profile, { measurementHistory = [] } = {}) {
    return [...measurementHistory]
      .sort(byDateAsc)
      .map(snap => ({ date: snap.date, value: this._valueFor(profile, snap) }))
      .filter(p => p.value != null);
  },
  goodDirection() {
    return 'down';
  },
};

// --- strength (trend-only; top lifts progression) ---
const strength = {
  key: 'strength',
  label: 'Strength',
  unit: 'kg',
  supportsTarget: false,
  // Current = sum of the heaviest 3 PRs (a simple aggregate "strength score").
  getCurrent(_profile, { prs = {} } = {}) {
    const tops = Object.values(prs)
      .map(p => Number(p?.weight))
      .filter(w => Number.isFinite(w) && w > 0)
      .sort((a, b) => b - a)
      .slice(0, 3);
    if (tops.length === 0) return null;
    return tops.reduce((a, b) => a + b, 0);
  },
  // Series = the heaviest single PR by date (proxy for "are lifts going up").
  getSeries(_profile, { prs = {} } = {}) {
    return Object.values(prs)
      .filter(p => p?.date && Number.isFinite(Number(p.weight)))
      .map(p => ({ date: String(p.date).split('T')[0], value: Number(p.weight) }))
      .sort(byDateAsc);
  },
  goodDirection() {
    return 'up';
  },
};

export const METRICS = { weight, bodyfat, waist, strength };

export function getMetric(key) {
  return METRICS[key] || METRICS.weight;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all `metrics.test.js` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/metrics.js src/utils/metrics.test.js
git commit -m "feat: metric descriptor registry (weight/bodyfat/waist/strength)"
```

---

## Task 6: `MeasurementModal` component

**Files:**
- Create: `src/components/MeasurementModal.jsx`

- [ ] **Step 1: Implement the modal (mirrors `WeightModal`)**

```jsx
import { useState } from 'react';
import { X, Ruler } from 'lucide-react';
import { useMeasurementHistory } from '../hooks/useMeasurementHistory';
import { useUserProfile } from '../hooks/useUserProfile';

export default function MeasurementModal({ onClose }) {
  const { logMeasurement } = useMeasurementHistory();
  const { profile, updateProfile } = useUserProfile();

  const [waist, setWaist] = useState(profile.waistCircumference?.toString() || '');
  const [neck, setNeck] = useState(profile.neckCircumference?.toString() || '');
  const [hip, setHip] = useState(profile.hipCircumference?.toString() || '');
  const [bodyFat, setBodyFat] = useState((profile.bodyFatManual ?? '').toString());

  const handleSubmit = (e) => {
    e.preventDefault();
    const fields = {
      waist: waist ? parseFloat(waist) : null,
      neck: neck ? parseFloat(neck) : null,
      hip: hip ? parseFloat(hip) : null,
      bodyFatManual: bodyFat ? parseFloat(bodyFat) : null,
    };
    logMeasurement(fields);
    // Keep the profile "current" values in sync with the latest snapshot.
    const profileUpdates = {};
    if (fields.waist != null) profileUpdates.waistCircumference = fields.waist;
    if (fields.neck != null) profileUpdates.neckCircumference = fields.neck;
    if (fields.hip != null) profileUpdates.hipCircumference = fields.hip;
    if (fields.bodyFatManual != null) profileUpdates.bodyFatManual = fields.bodyFatManual;
    if (Object.keys(profileUpdates).length) updateProfile(profileUpdates);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2">
            <Ruler size={20} className="text-accent" />
            Log Measurements
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-text-muted">
              Waist (cm)
              <input type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)}
                className="mt-1 w-full bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent" autoFocus />
            </label>
            <label className="text-sm text-text-muted">
              Neck (cm)
              <input type="number" step="0.1" value={neck} onChange={(e) => setNeck(e.target.value)}
                className="mt-1 w-full bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
            </label>
            {profile.gender === 'female' && (
              <label className="text-sm text-text-muted">
                Hips (cm)
                <input type="number" step="0.1" value={hip} onChange={(e) => setHip(e.target.value)}
                  className="mt-1 w-full bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
              </label>
            )}
            <label className="text-sm text-text-muted">
              Body Fat % (optional)
              <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)}
                className="mt-1 w-full bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
            </label>
          </div>
          <p className="text-xs text-text-muted">
            Body fat is computed from waist/neck{profile.gender === 'female' ? '/hips' : ''} (Navy method) if you leave the field blank.
          </p>
          <button type="submit" className="w-full bg-accent text-bg py-3 rounded-lg font-semibold">
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/MeasurementModal.jsx
git commit -m "feat: MeasurementModal for logging measurement snapshots"
```

---

## Task 7: `LOG_MEASUREMENT` Coach command

**Files:**
- Modify: `src/services/ai/context.js` (parser ~line 763-771, command docs ~line 462)
- Modify: `src/components/Coach.jsx` (executor ~line 159, imports)

- [ ] **Step 1: Parse the command in `context.js`**

In `src/services/ai/context.js`, after the `setTemplateDataList` block (~line 767), add:
```js
  const measurementDataList = extractAllJSON(content, '[LOG_MEASUREMENT:');
  measurementDataList.forEach(data => commands.push({ type: 'LOG_MEASUREMENT', data }));
```

- [ ] **Step 2: Add it to the clean-up pattern list**

In the `commandPatterns` array (~line 771), add `'LOG_MEASUREMENT'`:
```js
  const commandPatterns = ['LOG_MEAL', 'LOG_WEIGHT', 'LOG_WORKOUT', 'UPDATE_SCHEDULE', 'SET_SCHEDULE', 'UPDATE_PROFILE', 'SAVE_MEMORY', 'FORGET_MEMORY', 'UPDATE_TEMPLATE', 'SET_TEMPLATE', 'LOG_MEASUREMENT'];
```

- [ ] **Step 3: Document the command in the system prompt**

In `src/services/ai/context.js`, after the `[LOG_WEIGHT: ...]` documentation line (~line 462), add:
```js
- Log measurements: [LOG_MEASUREMENT: {"waist": 88, "neck": 40, "hip": 100, "bodyFatManual": 18}] (all fields optional; body fat auto-computed from waist/neck/hip if omitted)
```

- [ ] **Step 4: Import the hook in `Coach.jsx`**

In `src/components/Coach.jsx`, with the other hook imports, add:
```js
import { useMeasurementHistory } from '../hooks/useMeasurementHistory';
```
And inside the component, near the other hook calls, add:
```js
  const { logMeasurement } = useMeasurementHistory();
```

- [ ] **Step 5: Execute the command in `executeCommands`**

In `src/components/Coach.jsx`, inside `executeCommands`, after the `LOG_WEIGHT` branch (~line 161), add:
```js
        } else if (cmd.type === 'LOG_MEASUREMENT' && cmd.data && (cmd.data.waist != null || cmd.data.neck != null || cmd.data.hip != null || cmd.data.bodyFatManual != null)) {
          logMeasurement({
            waist: cmd.data.waist ?? null,
            neck: cmd.data.neck ?? null,
            hip: cmd.data.hip ?? null,
            bodyFatManual: cmd.data.bodyFatManual ?? null,
          });
          const parts = [];
          if (cmd.data.waist != null) parts.push(`waist ${cmd.data.waist}cm`);
          if (cmd.data.neck != null) parts.push(`neck ${cmd.data.neck}cm`);
          if (cmd.data.hip != null) parts.push(`hip ${cmd.data.hip}cm`);
          if (cmd.data.bodyFatManual != null) parts.push(`body fat ${cmd.data.bodyFatManual}%`);
          executed.push(`✓ Logged measurements: ${parts.join(', ')}`);
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/services/ai/context.js src/components/Coach.jsx
git commit -m "feat: LOG_MEASUREMENT Coach command"
```

---

## Task 8: `GoalCard` hero component

**Files:**
- Create: `src/components/GoalCard.jsx`

This renders the primary metric: badge, current value, delta, trend chart, and
(if the metric supports a target and one is set) a progress bar + countdown.

- [ ] **Step 1: Implement `GoalCard.jsx`**

```jsx
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { differenceInDays, parseISO, format } from 'date-fns';
import { Target } from 'lucide-react';
import { getMetric } from '../utils/metrics';
import { getGoalProgress } from '../utils/goal';
import { INTENT_LABELS } from '../utils/goal';

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: '#1f1f1f' }, ticks: { color: '#a1a1aa', font: { size: 10 } } },
    y: { grid: { color: '#1f1f1f' }, ticks: { color: '#a1a1aa', font: { size: 10 } } },
  },
};

export default function GoalCard({ profile, data }) {
  const goal = profile.goal || { intent: 'maintain', primaryMetric: 'weight', targets: {} };
  const metric = getMetric(goal.primaryMetric);
  const current = metric.getCurrent(profile, data);
  const series = metric.getSeries(profile, data);
  const target = metric.supportsTarget ? goal.targets?.[goal.primaryMetric] : null;
  const targetValue = target?.value ?? null;
  const targetDate = target?.date ?? null;

  const last = series.slice(-14);
  const delta = last.length >= 2 ? last[last.length - 1].value - last[0].value : null;

  const progress = useMemo(() => {
    if (!metric.supportsTarget || targetValue == null) return { percent: null };
    const start = series.length ? series[0].value : current;
    return getGoalProgress({ start, current, target: targetValue });
  }, [metric.supportsTarget, targetValue, series, current]);

  const daysLeft = targetDate ? differenceInDays(parseISO(targetDate), new Date()) : null;

  const chartData = {
    labels: last.map(p => format(parseISO(p.date), 'MMM d')),
    datasets: [
      {
        label: metric.label,
        data: last.map(p => p.value),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#22c55e',
      },
      ...(targetValue != null
        ? [{ label: 'Target', data: last.map(() => targetValue), borderColor: '#3b82f6', borderDash: [5, 5], pointRadius: 0 }]
        : []),
    ],
  };

  const fmt = (v) => (v == null ? '—' : `${v}${metric.unit === '%' ? '' : ' '}${metric.unit}`);

  return (
    <div className="bg-surface rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-accent">
          {INTENT_LABELS[goal.intent]} · {metric.label}
        </span>
        {metric.supportsTarget && targetValue != null && (
          <span className="text-xs text-text-muted flex items-center gap-1">
            <Target size={12} /> {fmt(targetValue)}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-accent">{fmt(current)}</span>
        {delta != null && (
          <span className={`text-sm ${delta <= 0 ? 'text-accent' : 'text-warning'}`}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 10) / 10)}{metric.unit === '%' ? '' : metric.unit} / 14d
          </span>
        )}
      </div>

      <div className="h-40 mt-3">
        {series.length > 0 ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <div className="h-full flex items-center justify-center text-text-muted text-sm text-center px-4">
            No {metric.label.toLowerCase()} history yet — log some to see your trend.
          </div>
        )}
      </div>

      {metric.supportsTarget && targetValue != null && progress.percent != null && (
        <div className="mt-3">
          <div className="w-full bg-border rounded-full h-2">
            <div className="bg-accent h-2 rounded-full transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="flex justify-between text-xs text-text-muted mt-2">
            <span>{progress.percent}% to goal</span>
            {daysLeft != null && <span>{daysLeft > 0 ? `${daysLeft} days left` : 'target date passed'}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/GoalCard.jsx
git commit -m "feat: GoalCard hero (descriptor-driven primary metric)"
```

---

## Task 9: `SecondaryMetricStrip` component

**Files:**
- Create: `src/components/SecondaryMetricStrip.jsx`

- [ ] **Step 1: Implement `SecondaryMetricStrip.jsx`**

```jsx
import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import { METRICS, getMetric } from '../utils/metrics';

const miniOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: '#1f1f1f' }, ticks: { color: '#a1a1aa', font: { size: 9 } } },
    y: { grid: { color: '#1f1f1f' }, ticks: { color: '#a1a1aa', font: { size: 9 } } },
  },
};

export default function SecondaryMetricStrip({ profile, data }) {
  const goal = profile.goal || { primaryMetric: 'weight' };
  const [expanded, setExpanded] = useState(null);

  const secondaryKeys = Object.keys(METRICS).filter(k => k !== goal.primaryMetric);

  const fmt = (metric, v) => (v == null ? '—' : `${v}${metric.unit === '%' ? '' : ' '}${metric.unit}`);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {secondaryKeys.map(key => {
          const metric = getMetric(key);
          const current = metric.getCurrent(profile, data);
          const isOpen = expanded === key;
          return (
            <button
              key={key}
              onClick={() => setExpanded(isOpen ? null : key)}
              className={`bg-surface rounded-lg p-3 text-center border ${isOpen ? 'border-accent' : 'border-transparent'}`}
            >
              <div className="text-sm font-semibold">{fmt(metric, current)}</div>
              <div className="text-[10px] uppercase tracking-wide text-text-muted">{metric.label}</div>
            </button>
          );
        })}
      </div>

      {expanded && (() => {
        const metric = getMetric(expanded);
        const series = metric.getSeries(profile, data).slice(-14);
        const chartData = {
          labels: series.map(p => format(parseISO(p.date), 'MMM d')),
          datasets: [{
            label: metric.label,
            data: series.map(p => p.value),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          }],
        };
        return (
          <div className="bg-surface rounded-lg p-3">
            <div className="text-xs text-text-muted mb-2">{metric.label} trend</div>
            <div className="h-32">
              {series.length > 0
                ? <Line data={chartData} options={miniOptions} />
                : <div className="h-full flex items-center justify-center text-text-muted text-xs text-center px-2">No {metric.label.toLowerCase()} history yet.</div>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/SecondaryMetricStrip.jsx
git commit -m "feat: SecondaryMetricStrip with inline expand"
```

---

## Task 10: Wire GoalCard + strip into Dashboard

**Files:**
- Modify: `src/components/Dashboard.jsx` (imports; replace Goal Countdown block ~line 230-253; build `data` bundle)

- [ ] **Step 1: Add imports**

In `src/components/Dashboard.jsx`, with the other imports, add:
```js
import GoalCard from './GoalCard';
import SecondaryMetricStrip from './SecondaryMetricStrip';
import { useMeasurementHistory } from '../hooks/useMeasurementHistory';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
```

- [ ] **Step 2: Gather the data bundle the descriptors need**

Inside the `Dashboard` component, near the other hook calls, add:
```js
  const { entries: weightHistory } = useWeightHistory();
  const { entries: measurementHistory } = useMeasurementHistory();
  const { getAllPRs } = useWorkoutLogs();
  const metricData = {
    weightHistory,
    measurementHistory,
    prs: getAllPRs(),
  };
```
> Note: if `useWeightHistory` is already imported/used in Dashboard, reuse the existing `entries` rather than re-declaring. Confirm before adding.

- [ ] **Step 3: Replace the Goal Countdown block**

Replace the entire `{/* Goal Countdown */}` block (the `{profile.targetWeight && profile.targetDate && ( ... )}` JSX, ~lines 230-253) with:
```jsx
      {/* Goal-driven dashboard */}
      <GoalCard profile={profile} data={metricData} />
      <SecondaryMetricStrip profile={profile} data={metricData} />
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: build succeeds; lint clean (fix any unused-import warnings introduced).

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.jsx
git commit -m "feat: dashboard goal hero + secondary metric strip (Layout A)"
```

---

## Task 11: Settings — Goals section rebuilt

**Files:**
- Modify: `src/components/Settings.jsx` (replace Goals section ~line 161-176; add intent/metric selectors)

- [ ] **Step 1: Add imports for goal constants**

In `src/components/Settings.jsx`, with the other imports, add:
```js
import { INTENTS, PRIMARY_METRICS, INTENT_LABELS, INTENT_DESCRIPTIONS, DEFAULT_METRIC_FOR_INTENT } from '../utils/goal';
import { getMetric } from '../utils/metrics';
```

- [ ] **Step 2: Add helpers to read/update the goal**

Inside the Settings component (where `updateProfile` is available), add:
```js
  const goal = profile.goal || { intent: 'maintain', primaryMetric: 'weight', targets: { weight: {}, bodyfat: {}, waist: {} } };
  const setIntent = (intent) => updateProfile({ goal: { ...goal, intent, primaryMetric: DEFAULT_METRIC_FOR_INTENT[intent] || goal.primaryMetric } });
  const setPrimaryMetric = (primaryMetric) => updateProfile({ goal: { ...goal, primaryMetric } });
  const setTarget = (field, value) => updateProfile({
    goal: { ...goal, targets: { ...goal.targets, [goal.primaryMetric]: { ...goal.targets?.[goal.primaryMetric], [field]: value } } },
  });
  const primaryMetricObj = getMetric(goal.primaryMetric);
  const primaryTarget = goal.targets?.[goal.primaryMetric] || { value: null, date: null };
```

- [ ] **Step 3: Replace the Goals JSX block**

Replace the existing Goals block (the `{/* Goals */}` heading plus the Target Weight / Target Date grid, ~lines 161-176) with:
```jsx
          {/* Goals */}
          <div className="text-xs text-text-muted font-medium uppercase tracking-wide pt-2">Goal</div>

          <div className="space-y-2">
            {INTENTS.map((intent) => (
              <button
                key={intent}
                type="button"
                onClick={() => setIntent(intent)}
                className={`w-full text-left p-3 rounded-lg border ${goal.intent === intent ? 'border-accent bg-accent/10' : 'border-border bg-bg'}`}
              >
                <div className="text-sm font-medium">{INTENT_LABELS[intent]}</div>
                <div className="text-xs text-text-muted mt-0.5">{INTENT_DESCRIPTIONS[intent]}</div>
              </button>
            ))}
          </div>

          <div className="text-xs text-text-muted font-medium uppercase tracking-wide pt-2">Primary metric</div>
          <div className="grid grid-cols-4 gap-2">
            {PRIMARY_METRICS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPrimaryMetric(key)}
                className={`p-2 rounded-lg border text-xs ${goal.primaryMetric === key ? 'border-accent bg-accent/10' : 'border-border bg-bg'}`}
              >
                {getMetric(key).label}
              </button>
            ))}
          </div>

          {primaryMetricObj.supportsTarget && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={`Target ${primaryMetricObj.label} (${primaryMetricObj.unit})`}
                type="number"
                value={primaryTarget.value}
                onChange={(v) => setTarget('value', v === '' ? null : parseFloat(v))}
              />
              <Field
                label="Target Date"
                type="date"
                value={primaryTarget.date}
                onChange={(v) => setTarget('date', v || null)}
              />
            </div>
          )}
          {!primaryMetricObj.supportsTarget && (
            <p className="text-xs text-text-muted">Strength is tracked as a trend (your top lifts) — no numeric target.</p>
          )}
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: build succeeds; lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/Settings.jsx
git commit -m "feat: Settings goal section (intent + primary metric + target); remove Target Weight field"
```

---

## Task 12: Onboarding — goal step

**Files:**
- Modify: `src/components/OnboardingWizard.jsx` (target-weight step → goal step; seed first measurement snapshot on completion)

- [ ] **Step 1: Import goal + measurement helpers**

In `src/components/OnboardingWizard.jsx`, with the other imports, add:
```js
import { INTENTS, INTENT_LABELS, INTENT_DESCRIPTIONS, DEFAULT_METRIC_FOR_INTENT, migrateGoal } from '../utils/goal';
import { useMeasurementHistory } from '../hooks/useMeasurementHistory';
```

- [ ] **Step 2: Track intent in form state**

In the `formData` initial state (~line 46), replace the `targetWeight` line with:
```js
    intent: profile.goal?.intent || 'maintain',
    targetWeight: profile.targetWeight || '',  // still collected for weight goals
```
(Keep `targetWeight` — it seeds the weight target for the common case.)

- [ ] **Step 3: Replace the target-weight step UI with an intent picker**

Find the step that renders the target weight input (~line 344) and replace that input group with:
```jsx
              <div className="space-y-2">
                {INTENTS.map((intent) => (
                  <button
                    key={intent}
                    type="button"
                    onClick={() => update('intent', intent)}
                    className={`w-full text-left p-3 rounded-lg border ${formData.intent === intent ? 'border-accent bg-accent/10' : 'border-border bg-bg'}`}
                  >
                    <div className="text-sm font-medium">{INTENT_LABELS[intent]}</div>
                    <div className="text-xs text-text-muted mt-0.5">{INTENT_DESCRIPTIONS[intent]}</div>
                  </button>
                ))}
              </div>
              <label className="block mt-3 text-sm text-text-muted">
                Target weight (kg, optional)
                <input type="number" step="0.1" value={formData.targetWeight}
                  onChange={(e) => update('targetWeight', e.target.value)}
                  className="mt-1 w-full bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
              </label>
```

- [ ] **Step 4: Build the goal object on completion**

In the completion handler that assembles the saved profile (~line 166, where `targetWeight: parseFloat(...)` is set), add a `goal` field. After computing `target`, build:
```js
      const targetWeightNum = formData.targetWeight ? parseFloat(formData.targetWeight) : null;
      const goal = {
        intent: formData.intent,
        primaryMetric: DEFAULT_METRIC_FOR_INTENT[formData.intent] || 'weight',
        targets: {
          weight: { value: targetWeightNum, date: formData.targetDate || null },
          bodyfat: { value: null, date: null },
          waist: { value: null, date: null },
        },
      };
```
Then include `goal` in the profile object passed to `setProfile`/`updateProfile`.

- [ ] **Step 5: Seed the first measurement snapshot**

Add the hook near the top of the component:
```js
  const { logMeasurement } = useMeasurementHistory();
```
In the completion handler, after saving the profile, if any measurement fields were entered:
```js
      if (formData.waistCircumference || formData.neckCircumference || formData.hipCircumference) {
        logMeasurement({
          waist: formData.waistCircumference ? parseFloat(formData.waistCircumference) : null,
          neck: formData.neckCircumference ? parseFloat(formData.neckCircumference) : null,
          hip: formData.hipCircumference ? parseFloat(formData.hipCircumference) : null,
          bodyFatManual: null,
        });
      }
```
> Note: use the actual field names present in `OnboardingWizard`'s `formData` for the measurements; confirm them when implementing (they mirror the profile fields).

- [ ] **Step 6: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: build succeeds; lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/OnboardingWizard.jsx
git commit -m "feat: onboarding goal step + seed first measurement snapshot"
```

---

## Task 13: Coach system prompt — GOAL block + intent rules

**Files:**
- Modify: `src/services/ai/context.js` (`buildCoachSystemPrompt`, ~line 382-393 USER PROFILE block; add GOAL section)

- [ ] **Step 1: Compute goal fields at the top of `buildCoachSystemPrompt`**

In `src/services/ai/context.js`, inside `buildCoachSystemPrompt` after `const weekType = ...` (~line 336), add:
```js
  const goal = profile.goal || { intent: 'maintain', primaryMetric: 'weight', targets: {} };
  const intentRules = {
    cut: 'GOAL = CUT. Prioritise a calorie deficit and steady weight loss. Keep protein high to preserve muscle. Frame advice around the deficit.',
    recomp: 'GOAL = RECOMP. Prioritise hitting the protein target with a moderate (small) deficit. Deprioritise the scale — focus on body composition (body fat %, waist) and strength retention.',
    bulk: 'GOAL = BULK. Prioritise a calorie surplus with high protein to maximise muscle gain. Expect the scale to rise; that is intended.',
    maintain: 'GOAL = MAINTAIN. Focus on hitting calorie and protein targets consistently with no deficit or surplus. Keep weight and composition stable.',
  };
  const primaryTarget = goal.targets?.[goal.primaryMetric];
```

- [ ] **Step 2: Add a GOAL section to the returned prompt**

In the template string returned by `buildCoachSystemPrompt`, immediately after the `## USER PROFILE` block (after the body-fat IIFE, before the next section), insert:
```js
## GOAL
- Training intent: ${goal.intent}
- Primary metric: ${goal.primaryMetric}${primaryTarget?.value != null ? ` (target ${primaryTarget.value}${primaryTarget.date ? ` by ${primaryTarget.date}` : ''})` : ''}
- ${intentRules[goal.intent] || intentRules.maintain}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/services/ai/context.js
git commit -m "feat: Coach GOAL block + intent-driven behaviour rules"
```

---

## Task 14: Coach auto-target calc from intent

**Files:**
- Modify: `src/components/Coach.jsx` (the two `goalDir` derivations ~lines 343, 352)

- [ ] **Step 1: Derive `goalDir` from intent, not targetWeight**

In `src/components/Coach.jsx`, replace **both** occurrences of:
```js
      const goalDir = p.targetWeight > p.currentWeight ? 'gain' : p.targetWeight < p.currentWeight ? 'loss' : 'maintain';
```
with:
```js
      const intent = p.goal?.intent || 'maintain';
      const goalDir = intent === 'bulk' ? 'gain' : intent === 'maintain' ? 'maintain' : 'loss';
```
(Cut and recomp both map to `loss`; recomp uses a smaller deficit but the existing `calculateCalorieTargets` deficit default is acceptable. Bulk → gain. Maintain → maintain.)

- [ ] **Step 2: For the protein calc, prefer muscle protein on bulk/recomp**

In the protein branch (~line 352-353), after deriving `goalDir`, change the `proteinGoal` line to:
```js
      const proteinGoal = (intent === 'bulk' || intent === 'recomp') ? 'muscle' : goalDir === 'loss' ? 'weightLoss' : 'maintenance';
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: build succeeds; lint clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/Coach.jsx
git commit -m "feat: Coach auto calorie/protein targets derived from intent"
```

---

## Task 15: Generalise `useUserProfile` progress + clean up Progress page

**Files:**
- Modify: `src/hooks/useUserProfile.js` (`getProgress`, `getWeightToLose`)
- Modify: `src/components/Progress.jsx` (% to goal card + weight chart target line)

- [ ] **Step 1: Make `getWeightToLose`/`getProgress` goal-aware**

In `src/hooks/useUserProfile.js`, replace `getWeightToLose` and `getProgress` with:
```js
  const getWeightTarget = () => profile.goal?.targets?.weight?.value ?? profile.targetWeight ?? null;

  const getWeightToLose = () => {
    const t = getWeightTarget();
    return t != null ? profile.currentWeight - t : 0;
  };

  const getProgress = () => {
    const t = getWeightTarget();
    if (t == null || !profile.startingWeight) return 0;
    const total = profile.startingWeight - t;
    const lost = profile.startingWeight - profile.currentWeight;
    return total !== 0 ? Math.min(Math.max((lost / total) * 100, 0), 100) : 0;
  };
```
And add `getWeightTarget` to the hook's returned object.

- [ ] **Step 2: Drive Progress page target line from the weight target**

In `src/components/Progress.jsx`, the weight chart's Target dataset uses `profile.targetWeight` (~line 86). Replace `profile.targetWeight` references in the chart data with a resolved value:
```js
  const weightTarget = profile.goal?.targets?.weight?.value ?? profile.targetWeight ?? null;
```
Then in `weightChartData`, use `weightTarget` for the Target dataset, and only include the Target dataset when `weightTarget != null`:
```js
      datasets: [
        {
          label: 'Weight',
          data: last14.map((e) => e.weight),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#22c55e',
        },
        ...(weightTarget != null
          ? [{ label: 'Target', data: last14.map(() => weightTarget), borderColor: '#3b82f6', borderDash: [5, 5], pointRadius: 0 }]
          : []),
      ],
```
Update the `useMemo` dependency array from `[weightEntries, profile.targetWeight]` to `[weightEntries, weightTarget]`.

- [ ] **Step 3: Verify build + lint + tests**

Run: `npm run build && npm run lint && npm test`
Expected: build succeeds; lint clean; tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useUserProfile.js src/components/Progress.jsx
git commit -m "feat: goal-aware weight progress; Progress chart target via goal"
```

---

## Task 16: Final integration — lint, build, test deploy, manual smoke test

**Files:** none (verification + deploy)

- [ ] **Step 1: Full check**

Run: `npm run lint && npm test && npm run build`
Expected: all clean/passing.

- [ ] **Step 2: Manual smoke test in dev**

Run: `npm run dev`, then in the browser verify each item:
  - Existing profile (with old `targetWeight`) loads and shows a weight GoalCard with the carried-over target (migration works).
  - Settings → Goal: switching intent updates the default primary metric; switching primary metric shows/hides the target inputs (hidden for Strength); target value+date persist per metric (switch away and back).
  - Dashboard: GoalCard shows the primary metric trend; secondary strip shows the other three; tapping a chip expands its chart.
  - Log a measurement via the modal → body-fat % and waist trends populate; choose body-fat as primary → its chart renders.
  - Coach: ask a question and confirm the reply reflects the intent (e.g. Cut talks deficit, Bulk talks surplus). Try `[LOG_MEASUREMENT]` by telling Coach "my waist is 87cm" and confirm a snapshot is logged.
  - Onboarding (Settings → reset onboarding, or fresh profile): goal step appears; completing it sets `goal` and seeds a measurement snapshot.

- [ ] **Step 3: Deploy to test (staging)**

Run: `npm run deploy:test`
Then commit the test build artifacts if the script produces any tracked output (per existing `deploy-test.cjs` behaviour), and push so the staging URL updates:
```bash
git add -A
git -c user.email="SpitefulGrain40@users.noreply.github.com" -c user.name="SpitefulGrain40" commit -m "chore: deploy goal-driven dashboard to test"
git push origin master
```
Staging: https://spitefulgrain40.github.io/Pump/test/

- [ ] **Step 4: Hand off to user for approval**

Stop here. Per project workflow: **do not deploy to production until the user approves the test build.** After approval: merge/build to `docs/`, push, and update `CLAUDE.md`.

---

## Self-Review Notes (completed)

- **Spec coverage:** two-axis model (Tasks 1,2,11,12), measurement history (Tasks 1,4,6,7), descriptor registry (Task 5), Layout A dashboard (Tasks 8,9,10), Settings + onboarding (Tasks 11,12), Coach intent behaviour + LOG_MEASUREMENT (Tasks 7,13,14), targetWeight cleanup + migration (Tasks 3,15). All spec sections map to tasks.
- **Type/name consistency:** `goal.targets[metric] = {value, date}`, `getMetric(key)`, descriptor shape `{key,label,unit,getCurrent,getSeries,supportsTarget,goodDirection}`, `data` bundle `{weightHistory, measurementHistory, prs}` used consistently across GoalCard, SecondaryMetricStrip, Dashboard, and tests.
- **Confirm-on-implement flags:** Dashboard may already import `useWeightHistory` (Task 10 Step 2) and OnboardingWizard's measurement field names (Task 12 Step 5) — both noted to verify against the actual file rather than assumed.
```

# Goal-Driven Dashboard — Design Spec

**Date:** 2026-06-07
**Status:** Approved (design), pending implementation plan
**Author:** Mike + Claude

## Problem

The Profile currently has a single rigid "Target Weight" field, and the whole
app is built around "lose weight to a number by a date." This doesn't fit users
who want to recomp, bulk, maintain, or who care more about body fat or waist
than the scale.

We want to replace Target Weight with a richer, goal-driven model: the user
picks a **training intent** and a **primary metric**, and the dashboard and AI
Coach both adapt to it.

## Goals

- Replace the Target Weight field with a two-axis goal model.
- Coach behaviour switches based on the training intent.
- Dashboard features the chosen primary metric; other metrics stay tracked but
  secondary.
- All four metrics (weight, body fat %, waist, strength) are first-class.

## Non-Goals

- Cross-device sync (unchanged — still localStorage only).
- Per-lift custom strength targets (strength is trend-only for now).
- Reworking nutrition logging or scheduling.

---

## The Two-Axis Model

1. **Training intent** — `cut | recomp | bulk | maintain`. Drives Coach
   nutrition behaviour (deficit/surplus/protein emphasis) and the auto
   calorie/protein target calculation.
2. **Primary metric** — `weight | bodyfat | waist | strength`. Drives which
   chart/value is featured (hero) on the dashboard. The other three become
   secondary.

The two are independent (e.g. you can Cut while tracking body-fat % as primary),
but Settings/onboarding offer sensible defaults per intent:

| Intent | Default primary metric |
|--------|------------------------|
| Cut | weight |
| Bulk | weight |
| Recomp | bodyfat |
| Maintain | weight |

---

## Data Model

Add a `goal` object to `DEFAULT_USER_PROFILE` (`src/utils/dataSchemas.js`):

```js
goal: {
  intent: 'maintain',          // 'cut' | 'recomp' | 'bulk' | 'maintain'
  primaryMetric: 'weight',     // 'weight' | 'bodyfat' | 'waist' | 'strength'
  targets: {                   // per-metric, so switching primary keeps each target
    weight:  { value: null, date: null },
    bodyfat: { value: null, date: null },
    waist:   { value: null, date: null },
    // strength: trend-only — no numeric target
  },
}
```

**Why per-metric targets:** switching the primary metric must not wipe a target
the user set for another metric.

### Measurement history (new)

Body fat % and waist currently have **no history** (body fat is computed from
*current* measurements; waist is a single profile field). To draw trend lines we
add:

- New localStorage key `pump-measurement-history`: an array of snapshots
  `{ id, date, waist, neck, hip, bodyFatManual }`.
- Body fat % per snapshot is **computed** via the Navy formula using the
  snapshot's neck/waist/hip plus the profile's height/gender (height/gender are
  effectively constant).
- A new hook `useMeasurementHistory` (mirrors `useWeightHistory`).
- A "Log measurements" modal (mirrors `WeightModal`) to add a snapshot.
- Coach command `[LOG_MEASUREMENT: {...}]` to log a snapshot from chat.

Existing profile measurement fields (`waistCircumference`, `neckCircumference`,
`hipCircumference`, `bodyFatManual`) remain the "current" values; logging a
measurement snapshot also updates these current values for consistency.

### Migration (runs once, like the existing `weekAStart` migration in `useUserProfile`)

- If `profile.goal` is absent, build it:
  - If `targetWeight` is set:
    - `intent`: `targetWeight < currentWeight` → `cut`; `> currentWeight` →
      `bulk`; else `maintain`.
    - `primaryMetric: 'weight'`.
    - `targets.weight = { value: targetWeight, date: targetDate }`.
  - Else: defaults (`maintain` / `weight` / empty targets).
- Legacy `targetWeight` / `targetDate` stay in the schema for back-compat, but
  `goal` is the source of truth going forward.

---

## Metric Descriptor Registry

New file `src/utils/metrics.js`. Each metric is described once so the dashboard
renders uniformly:

```js
{
  key,                          // 'weight' | 'bodyfat' | 'waist' | 'strength'
  label,                        // 'Weight'
  unit,                         // 'kg' | '%' | 'cm'
  getCurrent(profile, hist),    // latest value (number | null)
  getSeries(profile, hist),     // [{ date, value }] for the chart
  supportsTarget,               // true for weight/bodyfat/waist; false for strength
  goodDirection(intent),        // 'down' | 'up' — colouring + "% to goal" math
}
```

Sources:
- **weight** → `pump-weight-history`
- **bodyfat** → `pump-measurement-history` (Navy computed per snapshot) + manual points
- **waist** → `pump-measurement-history`
- **strength** → `supportsTarget: false`; series = progression of the top 3 lifts
  (heaviest by recent PRs) from `pump-prs` / workout logs

`goodDirection` examples: weight → `down` for cut, `up` for bulk, `down`/flat
otherwise; bodyfat/waist → `down`; strength → `up`.

---

## Dashboard (Layout A — Hero + Secondary Strip)

Replace the current "Goal Countdown" card (and fold in the standalone weight
chart) with:

- **GoalCard (hero):**
  - Intent + primary-metric badge (e.g. "RECOMP · BODY FAT %").
  - Big current value + delta over the visible window.
  - Trend chart for the primary metric.
  - If a target is set (and metric `supportsTarget`): progress bar +
    "X% to goal · N days left". Strength shows trend only (no target/countdown).
- **Secondary strip:** compact chips for the other three metrics (current value +
  small delta). Tapping a chip expands its chart inline (accordion).

Rendering is driven entirely by the metric descriptor, so the hero and chips are
the same components regardless of which metric is primary.

---

## Settings + Onboarding

### Settings → Goals section (rebuilt)

1. **Intent selector** — four options as cards, each with a one-line
   plain-English description.
2. **Primary metric selector** — four options.
3. **Target value + date** inputs for the *selected* primary metric (hidden when
   primary is strength).
4. The old **Target Weight field is removed.** (Target Date input becomes the
   primary metric's target date.)

### Onboarding wizard

- The target-weight step becomes a **goal step**: intent + primary metric +
  optional target/date.
- Existing measurement fields in onboarding seed the first
  `pump-measurement-history` snapshot.

---

## Coach System Prompt (`src/services/ai/context.js`)

- New **GOAL** block in the system prompt: intent, primary metric, target +
  date, and current progress vs the primary metric.
- **Intent-driven behaviour rules:**
  - **Cut** — prioritise calorie deficit + weight loss; keep protein high to
    preserve muscle.
  - **Recomp** — hit protein target, moderate deficit, deprioritise the scale;
    focus on body composition (body fat / waist).
  - **Bulk** — calorie surplus + high protein for muscle gain.
  - **Maintain** — hit targets consistently, no deficit or surplus.
- Auto calorie/protein target calc (currently in `Coach.jsx`, derived from
  `targetWeight` vs `currentWeight`) switches to derive from **intent**:
  - cut → loss/deficit; bulk → gain/surplus; recomp → slight deficit, muscle
    protein; maintain → maintenance.
- New `[LOG_MEASUREMENT: {...}]` command parsed in `context.js` and executed by
  the Coach command handler (waist/neck/hip/bodyFatManual snapshot).

---

## Cleanup of Existing `targetWeight` Usages

Every current consumer is redirected to `goal` + the active metric descriptor:

| File | Change |
|------|--------|
| `src/hooks/useUserProfile.js` | Add `goal` migration. `getProgress`/`getWeightToLose` recomputed against the **primary metric's** current value + target (not raw `targetWeight`); return 0/null gracefully when no target set |
| `src/components/Progress.jsx` | "% to goal" + target line driven by the primary metric descriptor |
| `src/components/Dashboard.jsx` | Goal countdown → GoalCard; target line via descriptor |
| `src/components/Coach.jsx` | `goalDir` derived from `intent`, not `targetWeight` |
| `src/components/OnboardingWizard.jsx` | Target-weight step → goal step |
| `src/services/ai/context.js` | GOAL block, intent rules, `LOG_MEASUREMENT` |
| `src/utils/dataSchemas.js` | `goal` default; keep legacy `targetWeight` for back-compat |

---

## New Files

- `src/utils/metrics.js` — metric descriptor registry.
- `src/hooks/useMeasurementHistory.js` — measurement snapshot log.
- `src/components/MeasurementModal.jsx` — quick "Log measurements" entry.
- `src/components/GoalCard.jsx` — hero card (descriptor-driven).
- (Possibly) `src/components/SecondaryMetricStrip.jsx` — secondary chips.

## New localStorage Keys

- `pump-measurement-history` — array of measurement snapshots.

---

## Testing / Verification

- Migration: existing profile with `targetWeight` produces correct `goal`
  (cut/bulk/maintain inference + weight target carried over).
- Each primary metric renders the hero correctly (value, trend, target/countdown
  where applicable); strength shows trend only.
- Switching primary metric preserves per-metric targets.
- Secondary chips expand/collapse and show correct values.
- Coach prompt reflects intent + primary metric; behaviour differs per intent.
- `LOG_MEASUREMENT` and the modal both append snapshots and update current
  values; body-fat trend derives correctly via Navy.
- Manual smoke test of: Settings goal config, onboarding goal step, dashboard
  for each intent/metric combination.

## Rollout

Per project workflow: build → deploy to test (`docs/test/`) → user approval →
production (`docs/`) → update `CLAUDE.md`.

## Implementation Phasing (suggested for the plan)

This is a large but cohesive feature. The implementation plan should phase it:

1. Data model + migration + measurement history hook/modal + `LOG_MEASUREMENT`.
2. Metric descriptor registry.
3. Dashboard GoalCard + secondary strip (Layout A).
4. Settings goal section + onboarding goal step.
5. Coach prompt intent rules + auto-target calc.
6. Cleanup of remaining `targetWeight` consumers (Progress, etc.).

## Open Questions / Judgment Calls (confirmed)

- Secondary chips **expand inline** (not link to Progress page). ✅
- Strength = **top 3 lifts** progression (not a user-picked focus lift). ✅
- Measurement history **included in this build**. ✅
- **Per-metric** targets. ✅

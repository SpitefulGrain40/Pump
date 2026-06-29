# Progress tab redesign

**Date:** 2026-06-30  
**Status:** Approved — ready for implementation planning

---

## Overview

Redesign the Progress tab from a flat list of charts into a three-section, goal-adaptive layout: **Outcomes**, **Drivers**, and **Records**. Each section answers a distinct question, and its content adapts to the user's active goal intent (recomp / cut / bulk / maintain).

A new **insights layer** surfaces trajectory projections and computed insight cards inline. All weights in **kg** throughout.

---

## Section 1 — Outcomes

*Question: is it working?*

### 1a. Composition ring (hero)

An SVG donut ring showing the current body fat / lean mass split at a glance.

- **Outer arc (green):** lean mass proportion
- **Inner arc (blue):** body fat proportion  
- **Centre label:** current body fat % + "body fat" sub-label
- **Beside ring:** two stat rows — lean mass (kg + change since start) and body fat % (+ change since start). Changes in green when moving in the right direction.
- Goal-adaptive centre label: for **cut** show weight; for **bulk** show lean mass kg; for **maintain** show weight.

### 1b. Forecast chart

Below the ring, separated by a divider, a dual-line chart projecting outcomes to the user's goal.

- **X axis:** 8 weeks past → today (solid lines) → ~9 weeks future (dashed lines). Labels: "8 wks ago", "now", and the intercept label.
- **Y axis:** implicit — no labels, three horizontal grid lines for visual rhythm.
- **Body fat line (blue):** solid historical, dashed projected.
- **Lean mass line (green):** solid historical, dashed projected.
- **Goal line (green dashed, low opacity):** horizontal at the user's target body fat %. Labelled "18% goal" (or whatever the target is) at the left edge.
- **Today marker:** vertical dashed line labelled "today".
- **Goal intercept:** green filled circle where the projected body fat line crosses the goal line. A short tick drops below it to a right-aligned label: "~9 wks / (31 Aug)" — the date is always the actual computed calendar date.
- **Projection fill:** light blue fill between today and the projected body fat line, low opacity.
- **Forecast label row:** "Forecast to goal (18% body fat)" + info `i` button.
- **Goal badge beneath chart:** green tinted card — "At this rate you'll hit 18% body fat in ~9 weeks — around 31 Aug".

**Calculation:** Linear regression on body fat readings from the last 4 weeks. Rate of change extrapolated forward to find the goal intercept date.

**Info tooltip content:** Explains linear regression, dashed = projection, goal intercept dot.

### 1c. Sub-metric expandables

A card below the forecast with a "Sub-metrics" label + info `i`. Each row is tappable to expand an inline sparkline chart. Fixed order for all goal types:

| # | Metric | Colour | Unit |
|---|--------|--------|------|
| 1 | Body fat % | Blue | % |
| 2 | Lean mass | Green | kg |
| 3 | Waist | Pink | cm |
| 4 | Weight | Grey | kg |

Each expanded sparkline: last 8 weeks of data, colour-matched. Body fat sparkline includes a dashed goal line. Weight sparkline carries a note "flat as expected on recomp" when intent = recomp.

**Info tooltip content:** All weights in kg. Explains Navy formula for body fat %, lean mass calculation, measurement sources.

---

## Section 2 — Drivers

*Question: what's making it happen?*

### 2a. Score rings

A card with four SVG rings showing this week's adherence scores (days hitting target / 7). Fixed order and colours:

| Ring | Colour | Score |
|------|--------|-------|
| Workouts | Green | Days with ≥1 completed logged session |
| Protein | Blue | Days hitting minimum protein target (g) |
| Calories | Amber | Days within calorie min–max target range |
| Volume | Purple | Weekly volume load % change vs prior week |

Volume ring displays "+X%" or "−X%" rather than a fraction. Volume load = sum of (sets × reps × weight in kg) across all logged exercises for the week.

**Section heading** has info `i` button. Tooltip explains all four metrics and calculation methods.

### 2b. Driver detail expandables

A second card with "Detail — last 14 days" label. Four expandable rows in the same order as the rings:

| # | Row | Colour | Chart type |
|---|-----|--------|------------|
| 1 | Workouts | Green | 30-day dot grid (completed / missed / rest) |
| 2 | Protein | Blue | 14-day bar chart (hit = blue, missed = amber) |
| 3 | Calories | Amber | 14-day bar chart (in-range = green, over/under = red) |
| 4 | Volume | Purple | 8-week area line chart (kg per week, rising = progressive overload) |

Volume row value displays as "11,200 kg" (not tonnes), with "+12%" change badge.

---

## Section 3 — Records

*Question: how strong am I?*

A card with PRs grouped by muscle group, same category order as the current implementation (push / pull / legs / core / cardio / other). Empty categories hidden.

Each PR row:
- **Left:** exercise name
- **Right:** PR weight in kg (green) + estimated 1RM in grey ("est. 1RM 98 kg")

**Estimated 1RM** uses the Epley formula: `weight × (1 + reps / 30)`, computed from the best logged set for each exercise.

**Section heading** has info `i` button. Tooltip explains PR weight (heaviest logged set) vs estimated 1RM (Epley formula).

---

## Info tooltips

All sections and key sub-cards have a circled `i` button beside their label. Tapping toggles an inline explanation panel (dark background, left-border accent, 11px text). Tapping again collapses it. No modals or overlays — purely inline toggle.

---

## Goal adaptivity

The section content adapts to `profile.goal.intent`. Every change from the recomp baseline is noted.

### Recomp (baseline)

| Element | Value |
|---------|-------|
| Hero ring | Body fat % (blue arc) + Lean mass (green arc) |
| Ring centre label | Body fat % |
| Forecast lines | Body fat % (blue, falling) + Lean mass (green, stable/rising) |
| Forecast target(s) | Body fat % goal intercept |
| Goal badge | "At this rate you'll hit X% body fat in ~N weeks — around DD Mon" |
| Sub-metric order | Body fat % → Lean mass → Waist → Weight |
| Weight row note | "flat as expected on recomp" |
| Calories ring colour | Amber — days within min–max range (slight deficit) |
| Calories ring label | "Calories" |

### Cut

| Element | Value |
|---------|-------|
| Hero ring | Weight (grey arc) + Body fat % (blue arc) |
| Ring centre label | Current weight (kg) |
| Forecast lines | Weight (grey, falling) + Body fat % (blue, falling) — both on same chart with their own goal intercept dots and labels |
| Forecast target(s) | Both target weight and target body fat % shown simultaneously if both are set |
| Goal badge | "At this rate you'll hit X kg in ~N weeks — around DD Mon" (weight takes priority in badge copy) |
| Sub-metric order | Weight → Body fat % → Waist → Lean mass |
| Weight row note | none (weight trend is the point) |
| Calories ring colour | Red — days under max calorie target (in deficit) |
| Calories ring label | "Deficit" |

### Bulk

| Element | Value |
|---------|-------|
| Hero ring | Lean mass (green arc, primary) + Weight (grey arc) |
| Ring centre label | Lean mass (kg) |
| Forecast lines | Lean mass (green, rising) + Weight (grey, rising) |
| Forecast target(s) | Lean mass goal intercept (primary); target weight intercept if set |
| Goal badge | "At this rate you'll hit X kg lean mass in ~N weeks — around DD Mon" |
| Sub-metric order | Lean mass → Weight → Body fat % → Waist |
| Weight row note | "rising as expected on a bulk" |
| Calories ring colour | Green — days hitting calorie minimum (surplus) |
| Calories ring label | "Surplus" |

### Maintain

| Element | Value |
|---------|-------|
| Hero ring | Weight (grey arc) + Body fat % (blue arc) |
| Ring centre label | Current weight (kg) |
| Forecast lines | Weight trend (grey) + Body fat % trend (blue) — no projection or goal intercept, trend only |
| Forecast target(s) | None — flat chart is the success signal |
| Goal badge | Replaced by stability badge: "Weight stable — you're on track" (green) or "Weight drifting — check your calories" (amber) |
| Sub-metric order | Weight → Body fat % → Lean mass → Waist |
| Weight row note | none |
| Calories ring colour | Amber — days within min–max range |
| Calories ring label | "Calories" |

### Fallback (no target set)

When `goal.targets[primaryMetric]` is not set, the forecast chart renders as a plain trend chart (no dashed projection, no goal intercept dot). A muted prompt replaces the goal badge: "Set a target in Settings to see your forecast."

---

## Data sources

All data computed client-side from localStorage — no AI calls required.

| Data | Source | Hook |
|------|--------|------|
| Body fat % | Navy formula from measurements | `useMeasurementHistory` |
| Lean mass | weight × (1 − bf%) | `useWeightHistory` + `useMeasurementHistory` |
| Waist | measurement history | `useMeasurementHistory` |
| Weight | weight history | `useWeightHistory` |
| Workout adherence | completed workouts vs schedule | `useWorkoutLogs` + `useWorkoutSchedule` |
| Protein / calorie adherence | daily totals vs targets | `useNutritionLogs` + `useUserProfile` |
| Volume load | sum(sets × reps × weight) per week | `useWorkoutLogs` |
| PRs + estimated 1RM | PR records + Epley on logged sets | `useWorkoutLogs` |
| Forecast | linear regression on last 4 weeks of primary metric | computed in `Progress.jsx` |

---

## Satis design system

This redesign is built directly in Pump (JSX/Tailwind). Pump does not yet consume `satis-ui` as a package. The following new components would be good candidates for future extraction into `satis-ui` once the integration path is established:

- **Score ring** — SVG ring with centre label, colour, and fraction/percent value
- **Expandable metric row** — tap-to-expand row with dot, label, value, change badge, and chevron
- **Forecast chart** — dual-line SVG chart with projection, goal intercept, and date label
- **Composition ring** — donut SVG with two arcs and centre stat

No action required on satis-ui for this implementation.

---

## Out of scope

- AI-generated insight cards (deferred — no API call budget agreed)
- Correlation cards ("PRs on high-protein days") — deferred
- Protein chart overlaid on calorie chart (deferred — separate bars per nutrient is clearer)
- Cross-device sync — not applicable (localStorage only)

---

## Key implementation notes

- **Forecast regression:** only run when ≥4 data points exist in the last 4 weeks; fall back to plain trend if insufficient data.
- **Volume load:** computed from `pump-workout-logs`; each log entry has `exercises[].sets[].weight` and `exercises[].sets[].reps`. Skip sets where weight = 0 (bodyweight exercises).
- **Estimated 1RM:** Epley — skip when reps = 1 (that weight IS the 1RM). Guard against division edge cases.
- **Expandable rows:** controlled by local `useState` object keyed by metric id. No persistence needed.
- **Chart library:** existing Chart.js registration can be reused for sub-metric sparklines. Forecast and composition ring are pure SVG (no Chart.js dependency).
- **Unit consistency:** all weight values displayed as kg throughout. Volume load as `X,XXX kg` with `toLocaleString()`.

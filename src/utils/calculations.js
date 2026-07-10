/**
 * Body Fat Percentage Calculator using US Navy Method
 * This is one of the most accurate methods without calipers or DEXA scans.
 *
 * For men: BF% = 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(height)) - 450
 * For women: BF% = 495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.22100 * log10(height)) - 450
 *
 * All measurements in centimeters.
 */

export function calculateBodyFatNavy(gender, height, waist, neck, hip = null) {
  if (!height || !waist || !neck) return null;
  if (gender === 'female' && !hip) return null;

  let bodyFat;

  if (gender === 'male') {
    const logWaistNeck = Math.log10(waist - neck);
    const logHeight = Math.log10(height);
    bodyFat = 495 / (1.0324 - 0.19077 * logWaistNeck + 0.15456 * logHeight) - 450;
  } else {
    const logWaistHipNeck = Math.log10(waist + hip - neck);
    const logHeight = Math.log10(height);
    bodyFat = 495 / (1.29579 - 0.35004 * logWaistHipNeck + 0.22100 * logHeight) - 450;
  }

  return Math.round(bodyFat * 10) / 10;
}

/**
 * BMI Calculator
 */
export function calculateBMI(weight, height) {
  if (!weight || !height) return null;
  const heightM = height / 100;
  return Math.round((weight / (heightM * heightM)) * 10) / 10;
}

/**
 * TDEE Calculator using Mifflin-St Jeor equation (most accurate for most people)
 *
 * BMR for men: 10 * weight(kg) + 6.25 * height(cm) - 5 * age + 5
 * BMR for women: 10 * weight(kg) + 6.25 * height(cm) - 5 * age - 161
 *
 * Activity multipliers:
 * - Sedentary (little/no exercise): 1.2
 * - Light (1-3 days/week): 1.375
 * - Moderate (3-5 days/week): 1.55
 * - Active (6-7 days/week): 1.725
 * - Very Active (2x/day): 1.9
 */
export function calculateTDEE(gender, weight, height, age, activityLevel = 'moderate') {
  if (!weight || !height || !age) return null;

  let bmr;
  if (gender === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }

  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9,
  };

  return Math.round(bmr * (multipliers[activityLevel] || 1.55));
}

/**
 * Calculate calorie targets based on goal direction.
 * weeklyChangeTarget is in kg/week; positive = gain, negative = loss.
 * When goalDirection is 'gain', applies a surplus; 'loss' applies a deficit; 'maintain' targets TDEE.
 */
export function calculateCalorieTargets(tdee, weeklyChangeTarget = 0.75, goalDirection = 'loss') {
  if (!tdee) return { min: null, max: null };

  // 1kg ≈ 7700 kcal, so weekly target * 7700 / 7 = daily adjustment
  const dailyAdjustment = (Math.abs(weeklyChangeTarget) * 7700) / 7;

  let targetCalories;
  if (goalDirection === 'gain') {
    targetCalories = tdee + dailyAdjustment;
  } else if (goalDirection === 'loss') {
    targetCalories = tdee - dailyAdjustment;
  } else {
    targetCalories = tdee;
  }

  return {
    min: Math.round(targetCalories - 100),
    max: Math.round(targetCalories + 100),
  };
}

/**
 * Calculate protein targets based on body weight and goals
 * For muscle preservation during weight loss: 1.6-2.2g per kg body weight
 */
export function calculateProteinTargets(weight, goal = 'weightLoss') {
  if (!weight) return { min: null, max: null };

  const ranges = {
    weightLoss: { min: 1.8, max: 2.2 }, // Higher protein preserves muscle
    maintenance: { min: 1.4, max: 1.8 },
    muscle: { min: 2.0, max: 2.4 },
  };

  const range = ranges[goal] || ranges.weightLoss;
  return {
    min: Math.round(weight * range.min),
    max: Math.round(weight * range.max),
  };
}

/**
 * Compute Navy body fat. Prefers a measurement-history snapshot's
 * waist/neck/hip (the actual source of truth — what you logged most
 * recently) over the profile's own waistCircumference/etc. fields, which are
 * a redundant "current" snapshot that's only reliably kept in sync at
 * onboarding and via Settings' direct edits. Falls back to the profile
 * fields when no snapshot (or field within one) is available, so this stays
 * correct for brand-new profiles with no measurement history yet.
 *
 * @param {object} profile
 * @param {object|null} [latestMeasurement] - most recent entry from
 *   useMeasurementHistory(), e.g. { waist, neck, hip, bodyFatManual }
 */
export function getNavyBodyFat(profile, latestMeasurement = null) {
  if (!profile) return null;
  return calculateBodyFatNavy(
    profile.gender,
    profile.height,
    latestMeasurement?.waist ?? profile.waistCircumference,
    latestMeasurement?.neck ?? profile.neckCircumference,
    latestMeasurement?.hip ?? profile.hipCircumference,
  );
}

/**
 * Resolve which body fat value to display. Order of preference:
 * 1. Navy method (computed from measurements) — default per user preference
 * 2. Manual entry (DEXA / scan / calipers / smart scale)
 * 3. Legacy bodyFatPercentage field (for back-compat)
 *
 * Returns { value, source } where source ∈ 'navy' | 'manual' | 'legacy' | null.
 * See getNavyBodyFat for the latestMeasurement fallback behaviour.
 */
export function resolveBodyFat(profile, latestMeasurement = null) {
  if (!profile) return { value: null, source: null };
  const navy = getNavyBodyFat(profile, latestMeasurement);
  if (navy && navy > 0 && navy < 60) return { value: navy, source: 'navy' };
  const manualBF = latestMeasurement?.bodyFatManual ?? profile.bodyFatManual;
  if (manualBF) return { value: manualBF, source: 'manual' };
  if (profile.bodyFatPercentage) return { value: profile.bodyFatPercentage, source: 'legacy' };
  return { value: null, source: null };
}

/**
 * Get body fat category
 */
export function getBodyFatCategory(gender, bodyFat) {
  if (!bodyFat) return null;

  if (gender === 'male') {
    if (bodyFat < 6) return 'Essential';
    if (bodyFat < 14) return 'Athletic';
    if (bodyFat < 18) return 'Fitness';
    if (bodyFat < 25) return 'Average';
    return 'Obese';
  } else {
    if (bodyFat < 14) return 'Essential';
    if (bodyFat < 21) return 'Athletic';
    if (bodyFat < 25) return 'Fitness';
    if (bodyFat < 32) return 'Average';
    return 'Obese';
  }
}

/**
 * Calculate lean body mass
 */
export function calculateLeanMass(weight, bodyFatPercentage) {
  if (!weight || !bodyFatPercentage) return null;
  return Math.round(weight * (1 - bodyFatPercentage / 100) * 10) / 10;
}

/**
 * Calculate fat mass
 */
export function calculateFatMass(weight, bodyFatPercentage) {
  if (!weight || !bodyFatPercentage) return null;
  return Math.round(weight * (bodyFatPercentage / 100) * 10) / 10;
}

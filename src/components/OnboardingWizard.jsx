import { useState } from 'react';
import { ChevronRight, ChevronLeft, User, Ruler, Scale, Target, Activity, Calendar, Key, Eye, EyeOff } from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import { useSettings } from '../hooks/useSettings';
import {
  calculateBodyFatNavy,
  calculateTDEE,
  calculateCalorieTargets,
  calculateProteinTargets,
  getBodyFatCategory,
} from '../utils/calculations';
import { format, addDays, startOfWeek } from 'date-fns';
import { INTENTS, INTENT_LABELS, INTENT_DESCRIPTIONS, DEFAULT_METRIC_FOR_INTENT } from '../utils/goal';
import { useMeasurementHistory } from '../hooks/useMeasurementHistory';
import { useWeightHistory } from '../hooks/useWeightHistory';

const STEPS = [
  { id: 'apikey', title: 'API Key', icon: Key },
  { id: 'basics', title: 'Basics', icon: User },
  { id: 'body', title: 'Body', icon: Ruler },
  { id: 'measurements', title: 'Measurements', icon: Scale },
  { id: 'goals', title: 'Goals', icon: Target },
  { id: 'schedule', title: 'Schedule', icon: Calendar },
  { id: 'complete', title: 'Complete', icon: Activity },
];

const SCHEDULE_TYPES = [
  { value: 'fixed', label: 'Fixed weekly', desc: 'Same plan every week' },
  { value: 'alternating', label: 'Alternating fortnightly', desc: 'Two repeating weeks (e.g. A/B)' },
  { value: 'rotating', label: 'Rotating shift', desc: 'e.g. 4 days on, 4 days off' },
  { value: 'custom', label: 'Custom', desc: 'Set your own cycle length' },
];

export default function OnboardingWizard({ onComplete, onSkip }) {
  const { profile, updateProfile } = useUserProfile();
  const { aiSettings, updateAISettings } = useSettings();
  const { logMeasurement } = useMeasurementHistory();
  const { logWeight } = useWeightHistory();
  const [step, setStep] = useState(0);
  const [showApiKey, setShowApiKey] = useState(false);
  const [formData, setFormData] = useState({
    apiKey: aiSettings.anthropicKey || '',
    name: profile.name || '',
    gender: profile.gender || 'male',
    age: profile.age || '',
    height: profile.height || '',
    currentWeight: profile.currentWeight || '',
    neckCircumference: profile.neckCircumference || '',
    waistCircumference: profile.waistCircumference || '',
    hipCircumference: profile.hipCircumference || '',
    targetWeight: profile.targetWeight || '',
    targetDate: profile.targetDate || '',
    intent: profile.goal?.intent || 'maintain',
    physicalNotes: profile.physicalNotes || '',
    scheduleType: profile.schedulePattern?.type || 'alternating',
    cycleStart: profile.schedulePattern?.cycleStart || profile.schedulePattern?.weekAStart || '',
    label0: profile.schedulePattern?.labels?.[0] || 'A',
    label1: profile.schedulePattern?.labels?.[1] || 'B',
    shiftOn: 4,
    shiftOff: 4,
    customCycleWeeks: 2,
  });
  const [calculations, setCalculations] = useState(null);

  const update = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getNextMonday = () => {
    const today = new Date();
    const monday = startOfWeek(addDays(today, 7), { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  };

  const getSchedulePattern = () => {
    const { scheduleType, cycleStart, label0, label1, shiftOn, shiftOff, customCycleWeeks } = formData;
    const start = cycleStart || getNextMonday();
    switch (scheduleType) {
      case 'fixed':
        return { type: 'fixed', cycleLength: 7, cycleStart: start, labels: [label0 || 'Week'], description: '' };
      case 'alternating':
        return { type: 'alternating', cycleLength: 14, cycleStart: start, labels: [label0 || 'A', label1 || 'B'], description: '' };
      case 'rotating': {
        const on = parseInt(shiftOn) || 4;
        const off = parseInt(shiftOff) || 4;
        return { type: 'rotating', cycleLength: on + off, cycleStart: start, labels: [label0 || 'On', label1 || 'Off'], description: `${on} days on, ${off} days off` };
      }
      case 'custom': {
        const weeks = parseInt(customCycleWeeks) || 2;
        const labels = Array.from({ length: weeks }, (_, i) => String.fromCharCode(65 + i));
        return { type: 'custom', cycleLength: weeks * 7, cycleStart: start, labels, description: `${weeks}-week rotation` };
      }
      default:
        return { type: 'alternating', cycleLength: 14, cycleStart: start, labels: ['A', 'B'], description: '' };
    }
  };

  const canProceed = () => {
    switch (STEPS[step].id) {
      case 'apikey':
        return formData.apiKey.trim().length > 10;
      case 'basics':
        return formData.name.trim() && formData.age > 0;
      case 'body':
        return formData.height > 0 && formData.currentWeight > 0;
      case 'measurements':
        return formData.neckCircumference > 0 && formData.waistCircumference > 0 &&
          (formData.gender === 'male' || formData.hipCircumference > 0);
      case 'goals':
        // Intent always has a default; target weight and date are both optional.
        return !!formData.intent;
      case 'schedule':
        // fixed schedule doesn't need a date (uses current week)
        return formData.scheduleType === 'fixed' ? true : !!formData.cycleStart;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (STEPS[step].id === 'apikey') {
      updateAISettings({ provider: 'anthropic', anthropicKey: formData.apiKey.trim() });
    }
    if (step === STEPS.length - 2) {
      const bodyFat = calculateBodyFatNavy(
        formData.gender,
        parseFloat(formData.height),
        parseFloat(formData.waistCircumference),
        parseFloat(formData.neckCircumference),
        formData.gender === 'female' ? parseFloat(formData.hipCircumference) : null
      );
      const tdee = calculateTDEE(
        formData.gender,
        parseFloat(formData.currentWeight),
        parseFloat(formData.height),
        parseInt(formData.age),
        'moderate'
      );
      const current = parseFloat(formData.currentWeight);
      const target = formData.targetWeight ? parseFloat(formData.targetWeight) : null;
      const goalDirection = target != null && target > current ? 'gain' : target != null && target < current ? 'loss' : 'maintain';
      const proteinGoal = goalDirection === 'gain' ? 'muscle' : goalDirection === 'loss' ? 'weightLoss' : 'maintenance';
      const calorieTarget = calculateCalorieTargets(tdee, 0.75, goalDirection);
      const proteinTarget = calculateProteinTargets(current, proteinGoal);
      setCalculations({
        bodyFat,
        bodyFatCategory: getBodyFatCategory(formData.gender, bodyFat),
        tdee,
        calorieTarget,
        proteinTarget,
      });
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleComplete = () => {
    const weight = parseFloat(formData.currentWeight);
    const schedulePattern = getSchedulePattern();
    const targetWeightNum = formData.targetWeight ? parseFloat(formData.targetWeight) : null;
    const goal = {
      intent: formData.intent,
      primaryMetric: DEFAULT_METRIC_FOR_INTENT[formData.intent] || 'weight',
      targets: {
        weight: { value: targetWeightNum, date: formData.targetDate || null },
        leanmass: { value: null, date: null },
        bodyfat: { value: null, date: null },
        waist: { value: null, date: null },
      },
    };
    updateProfile({
      name: formData.name.trim(),
      gender: formData.gender,
      age: parseInt(formData.age),
      height: parseFloat(formData.height),
      currentWeight: weight,
      startingWeight: weight,
      neckCircumference: parseFloat(formData.neckCircumference),
      waistCircumference: parseFloat(formData.waistCircumference),
      hipCircumference: formData.gender === 'female' ? parseFloat(formData.hipCircumference) : null,
      targetWeight: targetWeightNum,
      targetDate: formData.targetDate,
      physicalNotes: formData.physicalNotes,
      bodyFatPercentage: calculations?.bodyFat,
      tdee: calculations?.tdee,
      calorieTarget: calculations?.calorieTarget,
      proteinTarget: calculations?.proteinTarget,
      schedulePattern,
      goal,
      onboardingComplete: true,
    });

    if (formData.neckCircumference || formData.waistCircumference || formData.hipCircumference) {
      logMeasurement({
        waist: formData.waistCircumference ? parseFloat(formData.waistCircumference) : null,
        neck: formData.neckCircumference ? parseFloat(formData.neckCircumference) : null,
        hip: formData.hipCircumference ? parseFloat(formData.hipCircumference) : null,
        bodyFatManual: null,
      });
    }

    // Seed a starting weight entry so the weight trend has a first data point.
    if (weight) logWeight(weight);

    // Build a rich post-onboarding prompt so Coach can immediately set up the schedule
    const today = new Date();
    const nextMonday = startOfWeek(addDays(today, 7), { weekStartsOn: 1 });
    const cycleStart = schedulePattern.cycleStart;
    const label0 = schedulePattern.labels?.[0] || 'A';
    const isAlternating = schedulePattern.type === 'alternating' || schedulePattern.type === 'custom';

    const cycleInfo = isAlternating
      ? `My schedule runs in a ${schedulePattern.cycleLength}-day cycle starting ${cycleStart} (that's the start of "${label0}"). The labels are: ${schedulePattern.labels.join(', ')}.`
      : schedulePattern.type === 'rotating'
      ? `I work a rotating shift: ${schedulePattern.description}. Cycle starts ${cycleStart}.`
      : `I have a fixed weekly schedule starting ${cycleStart}.`;

    const goalDir = targetWeightNum != null
      ? (targetWeightNum > parseFloat(formData.currentWeight) ? 'gain weight' : targetWeightNum < parseFloat(formData.currentWeight) ? 'lose weight' : 'maintain weight')
      : formData.intent;
    const weightLine = targetWeightNum != null
      ? `${formData.currentWeight}kg → ${targetWeightNum}kg by ${formData.targetDate}`
      : `${formData.currentWeight}kg, intent: ${formData.intent}, by ${formData.targetDate}`;

    const prompt = `I just finished setting up my profile. Let's build my schedule and workout plan together.

My setup:
- Goal: ${goalDir} — ${weightLine}
- Calorie target: ${calculations?.calorieTarget?.min}–${calculations?.calorieTarget?.max} kcal/day
- Protein target: ${calculations?.proteinTarget?.min}–${calculations?.proteinTarget?.max}g/day
- ${cycleInfo}
${formData.physicalNotes ? `- Physical notes: ${formData.physicalNotes}` : ''}

Please do two things:
1. Ask me what types of workouts and activities I do on each day (so you can set up my week templates and recurring schedule)
2. Once I've described my routine, use [SET_SCHEDULE: ...] to populate the next two weeks starting from ${format(nextMonday, 'yyyy-MM-dd')}, and [UPDATE_PROFILE: ...] to save my week templates`;

    localStorage.setItem('pump-pending-coach-prompt', prompt);
    setTimeout(() => { onComplete?.(); }, 100);
  };

  const renderStep = () => {
    switch (STEPS[step].id) {
      case 'apikey':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Connect your Coach</h2>
            <p className="text-text-muted text-sm">
              Pump uses Anthropic's Claude AI as your coach. Add your API key to get started — it's stored only on your device.
            </p>
            <div>
              <label className="text-sm text-text-muted block mb-1">Anthropic API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.apiKey}
                  onChange={(e) => update('apiKey', e.target.value)}
                  placeholder="sk-ant-..."
                  autoFocus
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 pr-12 focus:outline-none focus:border-accent font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent underline"
            >
              Get your API key from console.anthropic.com
            </a>
            <p className="text-xs text-text-muted">
              Your key is never sent to any server other than Anthropic directly.
            </p>
          </div>
        );

      case 'basics':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Let's get started</h2>
            <p className="text-text-muted text-sm">First, tell me a bit about yourself.</p>
            <div>
              <label className="text-sm text-text-muted block mb-1">Your name</label>
              <input type="text" value={formData.name} onChange={(e) => update('name', e.target.value)}
                placeholder="Enter your name" autoFocus
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-sm text-text-muted block mb-2">Gender</label>
              <div className="flex gap-2">
                <button onClick={() => update('gender', 'male')}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${formData.gender === 'male' ? 'bg-accent text-bg' : 'bg-surface'}`}>
                  Male
                </button>
                <button onClick={() => update('gender', 'female')}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${formData.gender === 'female' ? 'bg-accent text-bg' : 'bg-surface'}`}>
                  Female
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm text-text-muted block mb-1">Age</label>
              <input type="number" value={formData.age} onChange={(e) => update('age', e.target.value)}
                placeholder="Years"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent" />
            </div>
          </div>
        );

      case 'body':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Body stats</h2>
            <p className="text-text-muted text-sm">Your current height and weight.</p>
            <div>
              <label className="text-sm text-text-muted block mb-1">Height (cm)</label>
              <input type="number" value={formData.height} onChange={(e) => update('height', e.target.value)}
                placeholder="e.g. 180" autoFocus
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-sm text-text-muted block mb-1">Current weight (kg)</label>
              <input type="number" step="0.1" value={formData.currentWeight} onChange={(e) => update('currentWeight', e.target.value)}
                placeholder="e.g. 85.5"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent" />
            </div>
          </div>
        );

      case 'measurements':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Body measurements</h2>
            <p className="text-text-muted text-sm">For accurate body fat calculation (Navy Method).</p>
            <div>
              <label className="text-sm text-text-muted block mb-1">Neck circumference (cm)</label>
              <p className="text-xs text-text-muted mb-2">Measure at the narrowest point, below Adam's apple</p>
              <input type="number" step="0.1" value={formData.neckCircumference} onChange={(e) => update('neckCircumference', e.target.value)}
                placeholder="e.g. 38" autoFocus
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-sm text-text-muted block mb-1">Waist circumference (cm)</label>
              <p className="text-xs text-text-muted mb-2">Measure at navel level, relaxed (don't suck in)</p>
              <input type="number" step="0.1" value={formData.waistCircumference} onChange={(e) => update('waistCircumference', e.target.value)}
                placeholder="e.g. 90"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent" />
            </div>
            {formData.gender === 'female' && (
              <div>
                <label className="text-sm text-text-muted block mb-1">Hip circumference (cm)</label>
                <p className="text-xs text-text-muted mb-2">Measure at the widest point</p>
                <input type="number" step="0.1" value={formData.hipCircumference} onChange={(e) => update('hipCircumference', e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent" />
              </div>
            )}
          </div>
        );

      case 'goals':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Your goals</h2>
            <p className="text-text-muted text-sm">What are you working towards?</p>
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
            <div>
              <label className="text-sm text-text-muted block mb-1">Target date</label>
              <input type="date" value={formData.targetDate} onChange={(e) => update('targetDate', e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-sm text-text-muted block mb-1">Physical limitations or injuries (optional)</label>
              <textarea value={formData.physicalNotes} onChange={(e) => update('physicalNotes', e.target.value)}
                placeholder="e.g. Lower back pain, bad knees..." rows={2}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent resize-none" />
            </div>
          </div>
        );

      case 'schedule':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Schedule pattern</h2>
            <p className="text-text-muted text-sm">How does your weekly availability repeat?</p>

            <div className="space-y-2">
              {SCHEDULE_TYPES.map(({ value, label, desc }) => (
                <button key={value} onClick={() => update('scheduleType', value)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    formData.scheduleType === value ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface text-text'
                  }`}>
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-text-muted mt-0.5">{desc}</div>
                </button>
              ))}
            </div>

            {formData.scheduleType === 'rotating' && (
              <div className="space-y-3 pt-1">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-sm text-text-muted block mb-1">Days on</label>
                    <input type="number" min="1" max="14" value={formData.shiftOn}
                      onChange={(e) => update('shiftOn', e.target.value)}
                      className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm text-text-muted block mb-1">Days off</label>
                    <input type="number" min="1" max="14" value={formData.shiftOff}
                      onChange={(e) => update('shiftOff', e.target.value)}
                      className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-sm text-text-muted block mb-1">On-shift label</label>
                    <input type="text" value={formData.label0} onChange={(e) => update('label0', e.target.value)}
                      placeholder="On" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm text-text-muted block mb-1">Off-shift label</label>
                    <input type="text" value={formData.label1} onChange={(e) => update('label1', e.target.value)}
                      placeholder="Off" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>
            )}

            {formData.scheduleType === 'alternating' && (
              <div className="flex gap-3 pt-1">
                <div className="flex-1">
                  <label className="text-sm text-text-muted block mb-1">Week 1 name</label>
                  <input type="text" value={formData.label0} onChange={(e) => update('label0', e.target.value)}
                    placeholder="A" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-sm text-text-muted block mb-1">Week 2 name</label>
                  <input type="text" value={formData.label1} onChange={(e) => update('label1', e.target.value)}
                    placeholder="B" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            )}

            {formData.scheduleType === 'custom' && (
              <div className="pt-1">
                <label className="text-sm text-text-muted block mb-1">Number of weeks in cycle</label>
                <input type="number" min="1" max="8" value={formData.customCycleWeeks}
                  onChange={(e) => update('customCycleWeeks', e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
            )}

            {formData.scheduleType !== 'fixed' && (
              <div>
                <label className="text-sm text-text-muted block mb-1">
                  {formData.scheduleType === 'rotating'
                    ? 'First day of current "on" shift'
                    : `Monday when "${formData.label0 || 'A'}" starts`}
                </label>
                <input type="date" value={formData.cycleStart} onChange={(e) => update('cycleStart', e.target.value)}
                  autoFocus
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent" />
                <button onClick={() => update('cycleStart', getNextMonday())} className="mt-2 text-sm text-accent">
                  Use next Monday ({format(new Date(getNextMonday()), 'MMM d')})
                </button>
              </div>
            )}

            {formData.scheduleType === 'fixed' && (
              <div>
                {!formData.cycleStart ? (
                  <button onClick={() => update('cycleStart', getNextMonday())}
                    className="w-full py-2 bg-accent/10 text-accent rounded-lg text-sm">
                    Confirm — use this Monday as start ({format(new Date(getNextMonday()), 'MMM d')})
                  </button>
                ) : (
                  <p className="text-sm text-accent">✓ Starting {format(new Date(formData.cycleStart), 'MMM d, yyyy')}</p>
                )}
              </div>
            )}
          </div>
        );

      case 'complete':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">You're all set, {formData.name.split(' ')[0]}!</h2>
            <div className="bg-surface rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-bold text-accent">{calculations?.bodyFat}%</div>
                  <div className="text-xs text-text-muted">Body Fat ({calculations?.bodyFatCategory})</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-info">{calculations?.tdee}</div>
                  <div className="text-xs text-text-muted">Daily TDEE (kcal)</div>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-sm font-medium mb-2">Daily Targets</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-text-muted">Calories:</span>{' '}
                    <span className="font-medium">{calculations?.calorieTarget?.min}-{calculations?.calorieTarget?.max}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Protein:</span>{' '}
                    <span className="font-medium">{calculations?.proteinTarget?.min}-{calculations?.proteinTarget?.max}g</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-sm font-medium mb-2">Goal</div>
                <p className="text-sm text-text-muted">
                  {INTENT_LABELS[formData.intent]}{formData.targetWeight ? ` — ${formData.currentWeight} kg → ${formData.targetWeight} kg` : ` — ${formData.currentWeight} kg`}{formData.targetDate ? ` by ${format(new Date(formData.targetDate), 'MMM d, yyyy')}` : ''}
                </p>
              </div>
              {formData.physicalNotes && (
                <div className="border-t border-border pt-3">
                  <div className="text-sm font-medium mb-1">Notes</div>
                  <p className="text-sm text-text-muted">{formData.physicalNotes}</p>
                </div>
              )}
            </div>
            <p className="text-sm text-text-muted">Now let's head to the Coach to create your personalized workout plan!</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-text-muted">Setup</span>
          <button
            onClick={() => onSkip?.()}
            className="text-xs text-text-muted underline underline-offset-2"
          >
            Restore backup instead
          </button>
        </div>
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isComplete = i < step;
            return (
              <div key={s.id}
                className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                  isActive ? 'bg-accent text-bg' : isComplete ? 'bg-accent/20 text-accent' : 'bg-surface text-text-muted'
                }`}>
                <Icon size={18} />
              </div>
            );
          })}
        </div>
        <div className="h-1 bg-surface rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {renderStep()}
      </div>

      <div className="p-4 border-t border-border flex gap-3">
        {step > 0 && step < STEPS.length - 1 && (
          <button onClick={handleBack}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-surface rounded-xl">
            <ChevronLeft size={20} />
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button onClick={handleNext} disabled={!canProceed()}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-accent text-bg rounded-xl font-medium disabled:opacity-50">
            Continue
            <ChevronRight size={20} />
          </button>
        ) : (
          <button onClick={handleComplete}
            className="flex-1 py-3 bg-accent text-bg rounded-xl font-medium">
            Let's Go!
          </button>
        )}
      </div>
    </div>
  );
}

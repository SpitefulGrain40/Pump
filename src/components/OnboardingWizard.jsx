import { useState } from 'react';
import { ChevronRight, ChevronLeft, User, Ruler, Scale, Target, Activity, Calendar } from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import {
  calculateBodyFatNavy,
  calculateTDEE,
  calculateCalorieTargets,
  calculateProteinTargets,
  getBodyFatCategory,
} from '../utils/calculations';
import { format, addDays, startOfWeek } from 'date-fns';

const STEPS = [
  { id: 'basics', title: 'Basics', icon: User },
  { id: 'body', title: 'Body', icon: Ruler },
  { id: 'measurements', title: 'Measurements', icon: Scale },
  { id: 'goals', title: 'Goals', icon: Target },
  { id: 'schedule', title: 'Schedule', icon: Calendar },
  { id: 'complete', title: 'Complete', icon: Activity },
];

export default function OnboardingWizard({ onComplete }) {
  const { profile, updateProfile } = useUserProfile();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
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
    physicalNotes: profile.physicalNotes || '',
    weekAStart: profile.schedulePattern?.weekAStart || '',
  });
  const [calculations, setCalculations] = useState(null);

  const update = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    switch (STEPS[step].id) {
      case 'basics':
        return formData.name.trim() && formData.age > 0;
      case 'body':
        return formData.height > 0 && formData.currentWeight > 0;
      case 'measurements':
        return formData.neckCircumference > 0 && formData.waistCircumference > 0 &&
          (formData.gender === 'male' || formData.hipCircumference > 0);
      case 'goals':
        return formData.targetWeight > 0 && formData.targetDate;
      case 'schedule':
        return formData.weekAStart;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (step === STEPS.length - 2) {
      // Calculate everything before showing complete screen
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

      const calorieTarget = calculateCalorieTargets(tdee, 0.75);
      const proteinTarget = calculateProteinTargets(parseFloat(formData.currentWeight), 'weightLoss');

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
      targetWeight: parseFloat(formData.targetWeight),
      targetDate: formData.targetDate,
      physicalNotes: formData.physicalNotes,
      bodyFatPercentage: calculations?.bodyFat,
      tdee: calculations?.tdee,
      calorieTarget: calculations?.calorieTarget,
      proteinTarget: calculations?.proteinTarget,
      schedulePattern: {
        ...profile.schedulePattern,
        weekAStart: formData.weekAStart,
      },
      onboardingComplete: true,
    });

    // Small delay to let state update before navigating
    setTimeout(() => {
      onComplete?.();
    }, 100);
  };

  const getNextMonday = () => {
    const today = new Date();
    const monday = startOfWeek(addDays(today, 7), { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  };

  const renderStep = () => {
    switch (STEPS[step].id) {
      case 'basics':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Let's get started</h2>
            <p className="text-text-muted text-sm">First, tell me a bit about yourself.</p>

            <div>
              <label className="text-sm text-text-muted block mb-1">Your name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Enter your name"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm text-text-muted block mb-2">Gender</label>
              <div className="flex gap-2">
                <button
                  onClick={() => update('gender', 'male')}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    formData.gender === 'male' ? 'bg-accent text-bg' : 'bg-surface'
                  }`}
                >
                  Male
                </button>
                <button
                  onClick={() => update('gender', 'female')}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    formData.gender === 'female' ? 'bg-accent text-bg' : 'bg-surface'
                  }`}
                >
                  Female
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-text-muted block mb-1">Age</label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => update('age', e.target.value)}
                placeholder="Years"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent"
              />
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
              <input
                type="number"
                value={formData.height}
                onChange={(e) => update('height', e.target.value)}
                placeholder="e.g. 180"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm text-text-muted block mb-1">Current weight (kg)</label>
              <input
                type="number"
                step="0.1"
                value={formData.currentWeight}
                onChange={(e) => update('currentWeight', e.target.value)}
                placeholder="e.g. 85.5"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent"
              />
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
              <input
                type="number"
                step="0.1"
                value={formData.neckCircumference}
                onChange={(e) => update('neckCircumference', e.target.value)}
                placeholder="e.g. 38"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm text-text-muted block mb-1">Waist circumference (cm)</label>
              <p className="text-xs text-text-muted mb-2">Measure at navel level, relaxed (don't suck in)</p>
              <input
                type="number"
                step="0.1"
                value={formData.waistCircumference}
                onChange={(e) => update('waistCircumference', e.target.value)}
                placeholder="e.g. 90"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent"
              />
            </div>

            {formData.gender === 'female' && (
              <div>
                <label className="text-sm text-text-muted block mb-1">Hip circumference (cm)</label>
                <p className="text-xs text-text-muted mb-2">Measure at the widest point</p>
                <input
                  type="number"
                  step="0.1"
                  value={formData.hipCircumference}
                  onChange={(e) => update('hipCircumference', e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent"
                />
              </div>
            )}
          </div>
        );

      case 'goals':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Your goals</h2>
            <p className="text-text-muted text-sm">What are you working towards?</p>

            <div>
              <label className="text-sm text-text-muted block mb-1">Target weight (kg)</label>
              <input
                type="number"
                step="0.1"
                value={formData.targetWeight}
                onChange={(e) => update('targetWeight', e.target.value)}
                placeholder="e.g. 75"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm text-text-muted block mb-1">Target date</label>
              <input
                type="date"
                value={formData.targetDate}
                onChange={(e) => update('targetDate', e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="text-sm text-text-muted block mb-1">Physical limitations or injuries (optional)</label>
              <textarea
                value={formData.physicalNotes}
                onChange={(e) => update('physicalNotes', e.target.value)}
                placeholder="e.g. Lower back pain, bad knees..."
                rows={2}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent resize-none"
              />
            </div>
          </div>
        );

      case 'schedule':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Co-parenting schedule</h2>
            <p className="text-text-muted text-sm">
              Your workout schedule alternates between Week A and Week B. Pick the Monday that starts a "Week A" (when you have more availability).
            </p>

            <div>
              <label className="text-sm text-text-muted block mb-1">Week A starts on</label>
              <input
                type="date"
                value={formData.weekAStart}
                onChange={(e) => update('weekAStart', e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent"
                autoFocus
              />
              <button
                onClick={() => update('weekAStart', getNextMonday())}
                className="mt-2 text-sm text-accent"
              >
                Use next Monday ({format(new Date(getNextMonday()), 'MMM d')})
              </button>
            </div>
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
                  {formData.currentWeight} kg → {formData.targetWeight} kg by {format(new Date(formData.targetDate), 'MMM d, yyyy')}
                </p>
              </div>

              {formData.physicalNotes && (
                <div className="border-t border-border pt-3">
                  <div className="text-sm font-medium mb-1">Notes</div>
                  <p className="text-sm text-text-muted">{formData.physicalNotes}</p>
                </div>
              )}
            </div>

            <p className="text-sm text-text-muted">
              Now let's head to the Coach to create your personalized workout plan!
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isComplete = i < step;
            return (
              <div
                key={s.id}
                className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                  isActive ? 'bg-accent text-bg' : isComplete ? 'bg-accent/20 text-accent' : 'bg-surface text-text-muted'
                }`}
              >
                <Icon size={18} />
              </div>
            );
          })}
        </div>
        <div className="h-1 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderStep()}
      </div>

      {/* Navigation */}
      <div className="p-4 border-t border-border flex gap-3">
        {step > 0 && step < STEPS.length - 1 && (
          <button
            onClick={handleBack}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-surface rounded-xl"
          >
            <ChevronLeft size={20} />
            Back
          </button>
        )}

        {step < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-accent text-bg rounded-xl font-medium disabled:opacity-50"
          >
            Continue
            <ChevronRight size={20} />
          </button>
        ) : (
          <button
            onClick={handleComplete}
            className="flex-1 py-3 bg-accent text-bg rounded-xl font-medium"
          >
            Let's Go!
          </button>
        )}
      </div>
    </div>
  );
}

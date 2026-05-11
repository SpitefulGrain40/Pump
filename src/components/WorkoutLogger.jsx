import { useState, useEffect } from 'react';
import { X, Check, Trophy, Play, Pause, RotateCcw, MessageCircle } from 'lucide-react';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { format } from 'date-fns';

function parseWeight(weightStr) {
  if (typeof weightStr === 'number') return weightStr;
  if (!weightStr || weightStr === '-') return 0;
  const match = String(weightStr).match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

export default function WorkoutLogger({ workout, onClose, onComplete }) {
  const { logWorkout, completeWorkout, getWorkoutForDate, getExerciseHistory } = useWorkoutLogs();
  const [exercises, setExercises] = useState([]);
  const [currentExercise, setCurrentExercise] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [restTime, setRestTime] = useState(90);
  const [newPRs, setNewPRs] = useState([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (workout?.exercises) {
      const exerciseData = workout.exercises.map((ex) => {
        const history = getExerciseHistory(ex.name, 1);
        const prev = history[0] || null;
        const plannedWeight = typeof ex.weight === 'number' ? ex.weight : parseWeight(ex.weight);
        const prevWeight = prev?.weight?.[0];
        const initialWeight = prevWeight > 0 ? prevWeight : plannedWeight;

        return {
          name: ex.name,
          notes: ex.notes || '',
          planned: { sets: ex.sets, reps: ex.reps, weight: plannedWeight },
          prev: prev ? {
            reps: prev.reps?.[0] || ex.reps,
            weight: prevWeight || 0
          } : null,
          actual: {
            sets: Array(ex.sets).fill(false),
            reps: Array(ex.sets).fill(ex.reps),
            weight: Array(ex.sets).fill(initialWeight),
          },
        };
      });
      setExercises(exerciseData);
    }
  }, [workout]);

  useEffect(() => {
    let interval;
    if (isTimerRunning && timer > 0) {
      interval = setInterval(() => {
        setTimer((t) => {
          if (t <= 1) {
            setIsTimerRunning(false);
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timer]);

  const handleSetComplete = (exerciseIndex, setIndex) => {
    const updated = [...exercises];
    updated[exerciseIndex].actual.sets[setIndex] = !updated[exerciseIndex].actual.sets[setIndex];
    setExercises(updated);

    if (updated[exerciseIndex].actual.sets[setIndex]) {
      setTimer(restTime);
      setIsTimerRunning(true);
    }
  };

  const handleValueChange = (exerciseIndex, setIndex, field, value) => {
    const updated = [...exercises];
    updated[exerciseIndex].actual[field][setIndex] = parseFloat(value) || 0;
    setExercises(updated);
  };

  const handleFinishWorkout = () => {
    const workoutDate = workout.date || format(new Date(), 'yyyy-MM-dd');
    let existingWorkout = getWorkoutForDate(workoutDate);

    if (!existingWorkout) {
      existingWorkout = logWorkout(workoutDate, exercises);
    }

    const prs = completeWorkout(existingWorkout.id, exercises);
    setNewPRs(prs);
    setIsComplete(true);
  };

  const handleDone = () => {
    if (onComplete) {
      onComplete(exercises, newPRs);
    }
    onClose();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isComplete) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-[60] p-4">
        <div className="bg-surface rounded-2xl w-full max-w-sm p-6 text-center">
          <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-accent" />
          </div>
          <h2 className="text-xl font-bold mb-2">Workout Complete!</h2>
          <p className="text-text-muted mb-4">{workout.name}</p>

          {newPRs.length > 0 && (
            <div className="bg-warning/20 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-center gap-2 text-warning mb-2">
                <Trophy size={20} />
                <span className="font-semibold">New PRs!</span>
              </div>
              {newPRs.map((pr, i) => (
                <p key={i} className="text-sm">
                  {pr.name}: {pr.weight} kg
                </p>
              ))}
            </div>
          )}

          <button
            onClick={handleDone}
            className="w-full bg-accent text-bg py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            <MessageCircle size={18} />
            Ask Coach for Analysis
          </button>
        </div>
      </div>
    );
  }

  const currentEx = exercises[currentExercise];
  const completedSets = currentEx?.actual.sets.filter(Boolean).length || 0;
  const totalSets = currentEx?.planned.sets || 0;

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-[60]">
      <div className="bg-black p-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{workout.name}</h2>
          <p className="text-sm text-text-muted">
            Exercise {currentExercise + 1} of {exercises.length}
          </p>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text">
          <X size={24} />
        </button>
      </div>

      {/* Rest Timer */}
      {timer > 0 && (
        <div className="bg-info/20 p-4 flex items-center justify-between">
          <span className="text-info font-medium">Rest</span>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-info">{formatTime(timer)}</span>
            <button
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className="p-2 bg-info/30 rounded-full"
            >
              {isTimerRunning ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              onClick={() => { setTimer(restTime); setIsTimerRunning(true); }}
              className="p-2 bg-info/30 rounded-full"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {currentEx && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold">{currentEx.name}</h3>
              <p className="text-text-muted text-sm">
                Coach: {currentEx.planned.sets}×{currentEx.planned.reps}
                {currentEx.planned.weight > 0 && ` @ ${currentEx.planned.weight}kg`}
              </p>
              {currentEx.notes && (
                <p className="text-text-muted text-xs mt-1">{currentEx.notes}</p>
              )}
            </div>

            {/* Column Headers */}
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-1 text-xs text-text-muted">
              <div className="w-8"></div>
              <div className="text-center">Prev</div>
              <div className="text-center">Reps</div>
              <div className="text-center">Weight</div>
              <div className="w-10"></div>
            </div>

            {/* Sets */}
            <div className="space-y-2">
              {currentEx.actual.sets.map((completed, setIndex) => (
                <div
                  key={setIndex}
                  className={`grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center p-2 rounded-lg ${
                    completed ? 'bg-accent/20' : 'bg-surface-light'
                  }`}
                >
                  {/* Set Number */}
                  <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-sm font-medium">
                    {setIndex + 1}
                  </div>

                  {/* Previous */}
                  <div className="text-center text-sm text-text-muted">
                    {currentEx.prev ? (
                      <span>{currentEx.prev.reps}×{currentEx.prev.weight}kg</span>
                    ) : (
                      <span className="opacity-50">—</span>
                    )}
                  </div>

                  {/* Actual Reps */}
                  <input
                    type="number"
                    value={currentEx.actual.reps[setIndex]}
                    onChange={(e) => handleValueChange(currentExercise, setIndex, 'reps', e.target.value)}
                    className="w-full bg-bg border border-border rounded px-2 py-1.5 text-center text-sm"
                  />

                  {/* Actual Weight */}
                  <input
                    type="number"
                    step="0.5"
                    value={currentEx.actual.weight[setIndex]}
                    onChange={(e) => handleValueChange(currentExercise, setIndex, 'weight', e.target.value)}
                    className="w-full bg-bg border border-border rounded px-2 py-1.5 text-center text-sm"
                  />

                  {/* Complete Checkbox */}
                  <button
                    onClick={() => handleSetComplete(currentExercise, setIndex)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      completed ? 'bg-accent text-bg' : 'bg-border'
                    }`}
                  >
                    {completed ? <Check size={20} /> : null}
                  </button>
                </div>
              ))}
            </div>

            {/* Progress indicator */}
            <div className="text-center text-sm text-text-muted">
              {completedSets} / {totalSets} sets completed
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="bg-black p-4 border-t border-border flex gap-3">
        <button
          onClick={() => setCurrentExercise(Math.max(0, currentExercise - 1))}
          disabled={currentExercise === 0}
          className="flex-1 py-3 bg-surface-light rounded-lg font-medium disabled:opacity-50"
        >
          Previous
        </button>

        {currentExercise === exercises.length - 1 ? (
          <button
            onClick={handleFinishWorkout}
            className="flex-1 py-3 bg-accent text-bg rounded-lg font-semibold"
          >
            Finish
          </button>
        ) : (
          <button
            onClick={() => setCurrentExercise(Math.min(exercises.length - 1, currentExercise + 1))}
            className="flex-1 py-3 bg-info text-white rounded-lg font-medium"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

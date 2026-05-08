import { useState, useEffect } from 'react';
import { X, Check, Trophy, Play, Pause, RotateCcw } from 'lucide-react';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { format } from 'date-fns';

export default function WorkoutLogger({ workout, onClose }) {
  const { logWorkout, completeWorkout, getTodaysWorkout } = useWorkoutLogs();
  const [exercises, setExercises] = useState([]);
  const [currentExercise, setCurrentExercise] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [restTime, setRestTime] = useState(90);
  const [newPRs, setNewPRs] = useState([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (workout?.exercises) {
      const exerciseData = workout.exercises.map((ex) => ({
        name: ex.name,
        planned: { sets: ex.sets, reps: ex.reps, weight: ex.weight || 0 },
        actual: {
          sets: Array(ex.sets).fill(false),
          reps: Array(ex.sets).fill(ex.reps),
          weight: Array(ex.sets).fill(ex.weight || 0),
        },
      }));
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
    const today = format(new Date(), 'yyyy-MM-dd');
    let existingWorkout = getTodaysWorkout();

    if (!existingWorkout) {
      existingWorkout = logWorkout(today, exercises);
    }

    const prs = completeWorkout(existingWorkout.id, exercises);
    setNewPRs(prs);
    setIsComplete(true);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isComplete) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
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
            onClick={onClose}
            className="w-full bg-accent text-bg py-3 rounded-lg font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const currentEx = exercises[currentExercise];
  const completedSets = currentEx?.actual.sets.filter(Boolean).length || 0;
  const totalSets = currentEx?.planned.sets || 0;

  return (
    <div className="fixed inset-0 bg-black/80 flex flex-col z-50">
      <div className="bg-surface p-4 flex items-center justify-between">
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
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold">{currentEx.name}</h3>
              <p className="text-text-muted">
                Target: {currentEx.planned.sets}×{currentEx.planned.reps}
                {currentEx.planned.weight > 0 && ` @ ${currentEx.planned.weight}kg`}
              </p>
            </div>

            {/* Sets */}
            <div className="space-y-3">
              {currentEx.actual.sets.map((completed, setIndex) => (
                <div
                  key={setIndex}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    completed ? 'bg-accent/20' : 'bg-surface-light'
                  }`}
                >
                  <button
                    onClick={() => handleSetComplete(currentExercise, setIndex)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      completed ? 'bg-accent text-bg' : 'bg-border'
                    }`}
                  >
                    {completed ? <Check size={18} /> : setIndex + 1}
                  </button>

                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-text-muted">Reps</label>
                      <input
                        type="number"
                        value={currentEx.actual.reps[setIndex]}
                        onChange={(e) =>
                          handleValueChange(currentExercise, setIndex, 'reps', e.target.value)
                        }
                        className="w-full bg-bg border border-border rounded px-2 py-1 text-center"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted">Weight (kg)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={currentEx.actual.weight[setIndex]}
                        onChange={(e) =>
                          handleValueChange(currentExercise, setIndex, 'weight', e.target.value)
                        }
                        className="w-full bg-bg border border-border rounded px-2 py-1 text-center"
                      />
                    </div>
                  </div>
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
      <div className="bg-surface p-4 border-t border-border flex gap-3">
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

import { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Dumbbell, Coffee, Bike, Flame,
  Footprints, X, Edit3, Trash2, Clock, Target, Moon, CheckCircle2, Circle, Sparkles, Bell, Play
} from 'lucide-react';
import { useWorkoutSchedule, useWorkoutTemplates } from '../hooks/useWorkoutLogs';
import { useUserProfile } from '../hooks/useUserProfile';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { format, addDays, startOfWeek, isToday, parseISO, isBefore, getDay } from 'date-fns';
import WorkoutLogger from './WorkoutLogger';

const ACTIVITY_CONFIG = {
  push: { label: 'Push', icon: Dumbbell, color: 'bg-info/20 text-info', emoji: '💪' },
  pull: { label: 'Pull', icon: Dumbbell, color: 'bg-accent/20 text-accent', emoji: '💪' },
  legs: { label: 'Legs', icon: Dumbbell, color: 'bg-warning/20 text-warning', emoji: '🦵' },
  power: { label: 'Power', icon: Dumbbell, color: 'bg-danger/20 text-danger', emoji: '⚡' },
  strength: { label: 'Strength', icon: Dumbbell, color: 'bg-purple-500/20 text-purple-400', emoji: '💪' },
  bike: { label: 'Bike', icon: Bike, color: 'bg-cyan-500/20 text-cyan-400', emoji: '🚴' },
  bikesprints: { label: 'Sprints', icon: Bike, color: 'bg-cyan-500/20 text-cyan-400', emoji: '🚴' },
  hiit: { label: 'HIIT', icon: Flame, color: 'bg-orange-500/20 text-orange-400', emoji: '🔥' },
  skate: { label: 'Skate', icon: Footprints, color: 'bg-pink-500/20 text-pink-400', emoji: '🛹' },
  ride: { label: 'Big Ride', icon: Bike, color: 'bg-emerald-500/20 text-emerald-400', emoji: '🚴' },
  rest: { label: 'Rest', icon: Coffee, color: 'bg-surface-light text-text-muted', emoji: '☕' },
  active: { label: 'Active', icon: Footprints, color: 'bg-surface-light text-text-muted', emoji: '🚶' },
  yoga: { label: 'Yoga', icon: Footprints, color: 'bg-teal-500/20 text-teal-400', emoji: '🧘' },
  core: { label: 'Core', icon: Dumbbell, color: 'bg-orange-500/20 text-orange-400', emoji: '🔥' },
  family: { label: 'Family', icon: Coffee, color: 'bg-rose-500/20 text-rose-400', emoji: '👨‍👧' },
};

export default function Schedule({ onNavigate }) {
  const { schedule, setSchedule, getFortnightSchedule } = useWorkoutSchedule();
  const { getTemplate } = useWorkoutTemplates();
  const { profile, getWeekTypeForDate } = useUserProfile();
  const [completedDays, setCompletedDays] = useLocalStorage('pump-completed-workouts', {});

  const [startDate, setStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDay, setSelectedDay] = useState(null);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(null);
  const [showPlanningBanner, setShowPlanningBanner] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState(null);

  const days = getFortnightSchedule(startDate);
  const firstWeekType = getWeekTypeForDate(startDate);
  const secondWeekType = firstWeekType === 'A' ? 'B' : 'A';

  // Check if today falls within the displayed fortnight
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const firstWeekDates = days.slice(0, 7).map(d => d.date);
  const secondWeekDates = days.slice(7, 14).map(d => d.date);
  const isFirstWeekCurrent = firstWeekDates.includes(todayStr);
  const isSecondWeekCurrent = secondWeekDates.includes(todayStr);

  // Check if planning banner should show
  useEffect(() => {
    const shouldShow = checkShouldShowBanner();
    setShowPlanningBanner(shouldShow);
  }, [schedule]);

  const getNextMonday = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const checkWeekHasData = (monday) => {
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      if (schedule[dateStr]) return true;
    }
    return false;
  };

  const checkShouldShowBanner = () => {
    const today = new Date();
    const dayOfWeek = getDay(today); // 0=Sun, 5=Fri, 6=Sat

    // Only show Fri (5), Sat (6), Sun (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 5 && dayOfWeek !== 6) return false;

    // Check if snoozed
    const snoozedUntil = localStorage.getItem('pump-planning-snoozed');
    if (snoozedUntil && new Date(snoozedUntil) > today) return false;

    // Check if next week is empty
    const nextMonday = getNextMonday(today);
    return !checkWeekHasData(nextMonday);
  };

  const handleAskCoach = () => {
    const nextMonday = getNextMonday(new Date());
    const twoWeeksOut = addDays(nextMonday, 13);
    const nextWeekType = getWeekTypeForDate(nextMonday);
    const prompt = `Plan my schedule for the next two weeks (${format(nextMonday, 'MMM d')} - ${format(twoWeeksOut, 'MMM d')}). Next week is Week ${nextWeekType}.`;

    localStorage.setItem('pump-pending-coach-prompt', prompt);
    setShowPlanningBanner(false);

    if (onNavigate) {
      onNavigate('coach');
    }
  };

  const handleSnooze = () => {
    const snoozeUntil = new Date();
    snoozeUntil.setHours(snoozeUntil.getHours() + 24);
    localStorage.setItem('pump-planning-snoozed', snoozeUntil.toISOString());
    setShowPlanningBanner(false);
  };

  const handleDismissBanner = () => {
    const nextMonday = getNextMonday(new Date());
    localStorage.setItem('pump-planning-snoozed', nextMonday.toISOString());
    setShowPlanningBanner(false);
  };

  const toggleComplete = (dateStr, session = 'lunch') => {
    setCompletedDays(prev => {
      const dayStatus = prev[dateStr] || {};
      return {
        ...prev,
        [dateStr]: {
          ...dayStatus,
          [session]: !dayStatus[session]
        }
      };
    });
  };

  const isCompleted = (dateStr, session = 'lunch') => {
    return completedDays[dateStr]?.[session] || false;
  };

  // Initialize default schedule if empty
  useEffect(() => {
    if (Object.keys(schedule).length === 0) {
      initializeDefaultSchedule();
    }
  }, []);

  const initializeDefaultSchedule = () => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const newSchedule = {};

    // Week pattern: Mon=Push, Tue=Bike+Skate, Wed=Pull, Thu=Sprints+Core, Fri=Rest, Sat=Ride, Sun=Family
    const weekPattern = [
      { lunch: { type: 'push', notes: 'Push + SB Strength (60m)' }, calories: 2300, notes: 'Solo | Bed by 11:30pm' },
      { lunch: { type: 'bike', notes: 'HIIT 20m (30s/90s x8)' }, evening: { type: 'skate', notes: 'Garage session 30-45m' }, calories: 2300, notes: 'Nyxie Day | Kitchen closed 9pm' },
      { lunch: { type: 'pull', notes: 'Pull + SB Strength (60m)' }, evening: { type: 'yoga', notes: 'Neck mobility 20m' }, calories: 2300, notes: 'Solo | Bed by 11:30pm' },
      { lunch: { type: 'bikesprints', notes: 'Hill sprints 4x max' }, evening: { type: 'core', notes: 'Core circuit 15m' }, calories: 2200, notes: 'Nyxie Day | High protein bridge meals' },
      { lunch: { type: 'rest', notes: 'Recovery day' }, calories: 2200, notes: 'Active recovery only' },
      { lunch: { type: 'ride', notes: 'Big ride 3-4hrs' }, calories: 2600, notes: 'Long cardio day' },
      { lunch: { type: 'family', notes: 'Family time' }, evening: { type: 'active', notes: 'Light activity' }, calories: 2300, notes: 'Rest & recovery' },
    ];

    // Set 2 weeks
    for (let week = 0; week < 2; week++) {
      for (let day = 0; day < 7; day++) {
        const date = addDays(start, week * 7 + day);
        const dateStr = format(date, 'yyyy-MM-dd');
        newSchedule[dateStr] = { ...weekPattern[day] };
      }
    }

    setSchedule(newSchedule);
  };

  const handlePrevWeek = () => setStartDate((d) => addDays(d, -7));
  const handleNextWeek = () => setStartDate((d) => addDays(d, 7));

  const handleDayClick = (day) => {
    setSelectedDay(day);
    const dayData = schedule[day.date];
    setEditData(typeof dayData === 'object' ? { ...dayData } : { type: dayData || null });
    setShowDayDetail(true);
    setEditMode(false);
  };

  const handleSaveDay = () => {
    if (selectedDay && editData) {
      setSchedule(prev => ({
        ...prev,
        [selectedDay.date]: editData
      }));
    }
    setShowDayDetail(false);
    setSelectedDay(null);
    setEditMode(false);
  };

  const handleClearDay = () => {
    if (selectedDay) {
      setSchedule(prev => {
        const newSchedule = { ...prev };
        delete newSchedule[selectedDay.date];
        return newSchedule;
      });
    }
    setShowDayDetail(false);
    setSelectedDay(null);
  };

  const getDayDisplay = (dayData) => {
    if (!dayData) return { icon: null, color: 'bg-surface', label: '', emoji: '' };
    if (typeof dayData === 'string') {
      return ACTIVITY_CONFIG[dayData] || { icon: null, color: 'bg-surface', label: dayData, emoji: '' };
    }
    const mainType = dayData.lunch?.type || dayData.evening?.type || dayData.type;
    return ACTIVITY_CONFIG[mainType] || { icon: null, color: 'bg-surface', label: '', emoji: '' };
  };

  const hasExercises = (type) => {
    const template = getTemplate(type);
    return template?.exercises && template.exercises.length > 0;
  };

  const handleStartWorkout = (session, sessionType) => {
    const template = getTemplate(session.type);
    if (!template?.exercises) return;

    setActiveWorkout({
      name: `${ACTIVITY_CONFIG[session.type]?.label || session.type} - ${format(parseISO(selectedDay.date), 'MMM d')}`,
      date: selectedDay.date,
      sessionType,
      exercises: template.exercises
    });
    setShowDayDetail(false);
  };

  const handleWorkoutClose = () => {
    setActiveWorkout(null);
  };

  const handleWorkoutComplete = (exercises, newPRs) => {
    if (!activeWorkout) return;

    // Mark the session as complete
    setCompletedDays(prev => ({
      ...prev,
      [activeWorkout.date]: {
        ...prev[activeWorkout.date],
        [activeWorkout.sessionType]: true
      }
    }));

    // Build workout summary for Coach
    const summary = exercises.map(ex => {
      const completedSets = ex.actual.sets.filter(Boolean).length;
      const avgWeight = ex.actual.weight.reduce((a, b) => a + b, 0) / ex.actual.weight.length;
      const avgReps = ex.actual.reps.reduce((a, b) => a + b, 0) / ex.actual.reps.length;
      return `${ex.name}: ${completedSets} sets, ~${Math.round(avgReps)} reps @ ${Math.round(avgWeight)}kg`;
    }).join('\n');

    const prText = newPRs.length > 0
      ? `\n\nNew PRs: ${newPRs.map(pr => `${pr.name} ${pr.weight}kg`).join(', ')}`
      : '';

    const coachPrompt = `Just finished my ${activeWorkout.name} workout:\n\n${summary}${prText}\n\nHow did I do? Any feedback on my performance?`;

    // Store prompt for Coach to pick up
    localStorage.setItem('pump-pending-coach-prompt', coachPrompt);

    setActiveWorkout(null);

    // Navigate to Coach
    if (onNavigate) {
      onNavigate('coach');
    }
  };

  const renderDayCard = (day) => {
    const dayData = schedule[day.date];
    const display = getDayDisplay(dayData);
    const dayIsToday = isToday(parseISO(day.date));
    const hasEvening = dayData && typeof dayData === 'object' && dayData.evening;
    const hasLunch = dayData && typeof dayData === 'object' && dayData.lunch;
    const lunchDone = isCompleted(day.date, 'lunch');
    const eveningDone = isCompleted(day.date, 'evening');
    const allDone = hasLunch && hasEvening ? (lunchDone && eveningDone) : (hasLunch ? lunchDone : (hasEvening ? eveningDone : false));
    const isPast = isBefore(parseISO(day.date), new Date()) && !dayIsToday;

    return (
      <button
        key={day.date}
        onClick={() => handleDayClick(day)}
        className={`p-2 rounded-lg text-center transition-all relative ${display.color} ${
          dayIsToday ? 'ring-2 ring-accent' : ''
        } ${allDone ? 'opacity-60' : ''}`}
      >
        {allDone && (
          <div className="absolute top-1 right-1">
            <CheckCircle2 size={10} className="text-accent" />
          </div>
        )}
        <div className="text-xs text-text-muted mb-1">{day.dayOfWeek}</div>
        <div className={`text-sm font-medium ${dayIsToday ? 'text-accent' : ''}`}>
          {format(parseISO(day.date), 'd')}
        </div>
        {display.emoji && (
          <div className={`text-sm mt-1 ${allDone ? 'line-through' : ''}`}>{display.emoji}</div>
        )}
        {hasEvening && (
          <div className="flex justify-center mt-0.5">
            <div className={`w-1 h-1 rounded-full mx-0.5 ${lunchDone ? 'bg-accent' : 'bg-current'}`} />
            <div className={`w-1 h-1 rounded-full mx-0.5 ${eveningDone ? 'bg-accent' : 'bg-current'}`} />
          </div>
        )}
      </button>
    );
  };

  const renderWorkoutDetails = (type) => {
    const template = getTemplate(type);
    if (!template) return null;

    return (
      <div className="mt-3 space-y-2">
        {template.warmup && template.warmup.length > 0 && (
          <div className="text-xs text-text-muted">
            <span className="font-medium">Warm-up:</span> {template.warmup.join(', ')}
          </div>
        )}

        {template.exercises && template.exercises.length > 0 && (
          <div className="bg-surface-light rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left p-2">Exercise</th>
                  <th className="text-center p-2">Sets</th>
                  <th className="text-center p-2">Reps</th>
                  <th className="text-right p-2">Weight</th>
                </tr>
              </thead>
              <tbody>
                {template.exercises.map((ex, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="p-2 font-medium">{ex.name}</td>
                    <td className="p-2 text-center">{ex.sets}</td>
                    <td className="p-2 text-center">{ex.reps}</td>
                    <td className="p-2 text-right text-text-muted">{ex.weight || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {template.intervals && (
          <div className="bg-surface-light rounded-lg p-3 text-xs">
            <div className="font-medium mb-1">Intervals</div>
            <div className="text-text-muted">
              {template.intervals.rounds}x: {template.intervals.work} / {template.intervals.rest}
            </div>
            {template.burnTarget && (
              <div className="text-accent mt-1">Target: {template.burnTarget}</div>
            )}
          </div>
        )}

        {template.finisher && (
          <div className="text-xs text-accent">+ {template.finisher}</div>
        )}

        {template.evening && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-xs text-text-muted mb-2 flex items-center gap-1">
              <Moon size={12} /> Evening: {template.evening.name} ({template.evening.duration}m)
            </div>
            {Array.isArray(template.evening.exercises) && template.evening.exercises[0]?.name ? (
              <div className="bg-surface-light rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <tbody>
                    {template.evening.exercises.map((ex, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="p-2">{ex.name}</td>
                        <td className="p-2 text-center">{ex.sets}x{ex.reps}</td>
                        <td className="p-2 text-right text-text-muted">{ex.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-text-muted">
                {template.evening.exercises?.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4">
      {/* Planning Banner */}
      {showPlanningBanner && (
        <div className="mb-4 p-4 bg-accent/10 border border-accent/30 rounded-xl">
          <div className="flex items-start gap-3">
            <Sparkles className="text-accent mt-0.5 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className="font-medium">Next week isn't planned yet</p>
              <p className="text-sm text-text-muted mt-1">
                Let Coach set up your Week {getWeekTypeForDate(getNextMonday(new Date()))} schedule?
              </p>
            </div>
            <button onClick={handleDismissBanner} className="text-text-muted p-1">
              <X size={18} />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAskCoach}
              className="flex-1 py-2 bg-accent text-bg rounded-lg font-medium flex items-center justify-center gap-2"
            >
              <Sparkles size={16} />
              Ask Coach
            </button>
            <button
              onClick={handleSnooze}
              className="px-4 py-2 bg-surface rounded-lg text-text-muted flex items-center gap-2"
            >
              <Bell size={16} />
              24h
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Schedule</h1>
          <p className="text-sm text-text-muted">
            Week {getWeekTypeForDate(new Date())} · {profile.name ? `${profile.name.split(' ')[0]}'s` : 'Your'} plan
          </p>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={handlePrevWeek} className="p-2 bg-surface rounded-lg">
          <ChevronLeft size={20} />
        </button>
        <span className="font-medium">
          {format(startDate, 'MMM d')} - {format(addDays(startDate, 13), 'MMM d, yyyy')}
        </span>
        <button onClick={handleNextWeek} className="p-2 bg-surface rounded-lg">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Week 1 */}
      <div className="mb-4">
        <h3 className="text-sm text-text-muted mb-2 font-medium">
          Week {firstWeekType} {isFirstWeekCurrent ? '(Current)' : ''}
        </h3>
        <div className="grid grid-cols-7 gap-1">
          {days.slice(0, 7).map(renderDayCard)}
        </div>
      </div>

      {/* Week 2 */}
      <div className="mb-6">
        <h3 className="text-sm text-text-muted mb-2 font-medium">
          Week {secondWeekType} {isSecondWeekCurrent ? '(Current)' : ''}
        </h3>
        <div className="grid grid-cols-7 gap-1">
          {days.slice(7, 14).map(renderDayCard)}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-surface rounded-xl p-4">
        <h3 className="text-sm font-medium mb-3">Activity Types</h3>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {Object.entries(ACTIVITY_CONFIG).slice(0, 8).map(([key, config]) => (
            <div key={key} className="flex items-center gap-1">
              <span>{config.emoji}</span>
              <span className="text-text-muted">{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day Detail Modal */}
      {showDayDetail && selectedDay && (
        <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50">
          <div className="bg-surface rounded-t-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-surface p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold">
                  {format(parseISO(selectedDay.date), 'EEEE, MMM d')}
                </h3>
                <p className="text-xs text-text-muted">
                  Week {getWeekTypeForDate(parseISO(selectedDay.date))} {isToday(parseISO(selectedDay.date)) ? '· Today' : ''}
                </p>
              </div>
              <button onClick={() => setShowDayDetail(false)} className="p-2">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {!editMode ? (
                <>
                  {/* Lunch Session */}
                  {editData?.lunch && (
                    <div className={`bg-bg rounded-lg p-3 ${isCompleted(selectedDay.date, 'lunch') ? 'border-2 border-accent' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-text-muted" />
                          <span className="text-xs text-text-muted">Lunch Session</span>
                        </div>
                        <button
                          onClick={() => toggleComplete(selectedDay.date, 'lunch')}
                          className={`p-1 rounded ${isCompleted(selectedDay.date, 'lunch') ? 'text-accent' : 'text-text-muted'}`}
                        >
                          {isCompleted(selectedDay.date, 'lunch') ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        </button>
                      </div>
                      <div className={`font-medium flex items-center gap-2 ${isCompleted(selectedDay.date, 'lunch') ? 'line-through opacity-60' : ''}`}>
                        <span>{ACTIVITY_CONFIG[editData.lunch.type]?.emoji}</span>
                        <span>{ACTIVITY_CONFIG[editData.lunch.type]?.label || editData.lunch.type}</span>
                      </div>
                      {editData.lunch.notes && (
                        <p className="text-sm text-text-muted mt-1">{editData.lunch.notes}</p>
                      )}
                      {renderWorkoutDetails(editData.lunch.type)}
                      {hasExercises(editData.lunch.type) && !isCompleted(selectedDay.date, 'lunch') && (
                        <button
                          onClick={() => handleStartWorkout(editData.lunch, 'lunch')}
                          className="mt-3 w-full py-2 bg-info text-white rounded-lg font-medium flex items-center justify-center gap-2"
                        >
                          <Play size={16} />
                          Start Workout
                        </button>
                      )}
                    </div>
                  )}

                  {/* Evening Session */}
                  {editData?.evening && (
                    <div className={`bg-bg rounded-lg p-3 ${isCompleted(selectedDay.date, 'evening') ? 'border-2 border-accent' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Moon size={14} className="text-text-muted" />
                          <span className="text-xs text-text-muted">Evening Session</span>
                        </div>
                        <button
                          onClick={() => toggleComplete(selectedDay.date, 'evening')}
                          className={`p-1 rounded ${isCompleted(selectedDay.date, 'evening') ? 'text-accent' : 'text-text-muted'}`}
                        >
                          {isCompleted(selectedDay.date, 'evening') ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        </button>
                      </div>
                      <div className={`font-medium flex items-center gap-2 ${isCompleted(selectedDay.date, 'evening') ? 'line-through opacity-60' : ''}`}>
                        <span>{ACTIVITY_CONFIG[editData.evening.type]?.emoji}</span>
                        <span>{ACTIVITY_CONFIG[editData.evening.type]?.label || editData.evening.type}</span>
                      </div>
                      {editData.evening.notes && (
                        <p className="text-sm text-text-muted mt-1">{editData.evening.notes}</p>
                      )}
                    </div>
                  )}

                  {/* Calories & Notes */}
                  <div className="flex gap-3">
                    {editData?.calories && (
                      <div className="flex-1 bg-bg rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Target size={14} className="text-accent" />
                          <span className="text-xs text-text-muted">Calories</span>
                        </div>
                        <div className="font-bold text-lg">{editData.calories}</div>
                      </div>
                    )}
                    {editData?.notes && (
                      <div className="flex-1 bg-bg rounded-lg p-3">
                        <div className="text-xs text-text-muted mb-1">Notes</div>
                        <p className="text-sm">{editData.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Legacy type display */}
                  {editData?.type && !editData?.lunch && !editData?.evening && (
                    <div className="bg-bg rounded-lg p-3">
                      <div className="font-medium">{ACTIVITY_CONFIG[editData.type]?.label || editData.type}</div>
                      {renderWorkoutDetails(editData.type)}
                    </div>
                  )}

                  {!editData?.type && !editData?.lunch && !editData?.evening && (
                    <div className="text-center py-8 text-text-muted">
                      <p>No activities planned</p>
                      <p className="text-sm">Tap Edit to add a workout</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setEditMode(true)}
                      className="flex-1 py-3 bg-accent text-bg rounded-lg font-medium flex items-center justify-center gap-2"
                    >
                      <Edit3 size={18} />
                      Edit
                    </button>
                    {(editData?.type || editData?.lunch || editData?.evening) && (
                      <button
                        onClick={handleClearDay}
                        className="py-3 px-4 bg-danger/20 text-danger rounded-lg"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Edit: Lunch */}
                  <div>
                    <label className="text-sm text-text-muted block mb-2">Lunch Session</label>
                    <select
                      value={editData?.lunch?.type || ''}
                      onChange={(e) => setEditData(prev => ({
                        ...prev,
                        lunch: e.target.value ? { ...prev?.lunch, type: e.target.value } : undefined
                      }))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">No session</option>
                      <optgroup label="Gym">
                        <option value="push">💪 Push + Strength</option>
                        <option value="pull">💪 Pull + Strength</option>
                        <option value="legs">🦵 Legs</option>
                      </optgroup>
                      <optgroup label="Cardio">
                        <option value="bike">🚴 Bike HIIT</option>
                        <option value="bikesprints">🚴 Bike Sprints</option>
                        <option value="ride">🚴 Big Ride (3-4hrs)</option>
                        <option value="skate">🛹 Skate</option>
                      </optgroup>
                      <optgroup label="Other">
                        <option value="rest">☕ Rest</option>
                        <option value="family">👨‍👧 Family</option>
                      </optgroup>
                    </select>
                    {editData?.lunch?.type && (
                      <input
                        type="text"
                        placeholder="Notes (optional)"
                        value={editData?.lunch?.notes || ''}
                        onChange={(e) => setEditData(prev => ({
                          ...prev,
                          lunch: { ...prev.lunch, notes: e.target.value }
                        }))}
                        className="w-full mt-2 bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    )}
                  </div>

                  {/* Edit: Evening */}
                  <div>
                    <label className="text-sm text-text-muted block mb-2">Evening Session</label>
                    <select
                      value={editData?.evening?.type || ''}
                      onChange={(e) => setEditData(prev => ({
                        ...prev,
                        evening: e.target.value ? { ...prev?.evening, type: e.target.value } : undefined
                      }))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">No session</option>
                      <option value="skate">🛹 Skate</option>
                      <option value="yoga">🧘 Yoga/Mobility</option>
                      <option value="core">🔥 Core</option>
                      <option value="active">🚶 Active Recovery</option>
                      <option value="rest">☕ Rest</option>
                      <option value="family">👨‍👧 Family</option>
                    </select>
                    {editData?.evening?.type && (
                      <input
                        type="text"
                        placeholder="Notes (optional)"
                        value={editData?.evening?.notes || ''}
                        onChange={(e) => setEditData(prev => ({
                          ...prev,
                          evening: { ...prev.evening, notes: e.target.value }
                        }))}
                        className="w-full mt-2 bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    )}
                  </div>

                  {/* Edit: Calories */}
                  <div>
                    <label className="text-sm text-text-muted block mb-2">Calorie Target</label>
                    <input
                      type="number"
                      placeholder={`Default: ${profile.calorieTarget?.max || 2300}`}
                      value={editData?.calories || ''}
                      onChange={(e) => setEditData(prev => ({
                        ...prev,
                        calories: e.target.value ? parseInt(e.target.value) : undefined
                      }))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Edit: Notes */}
                  <div>
                    <label className="text-sm text-text-muted block mb-2">Day Notes</label>
                    <textarea
                      placeholder="e.g., Bed by 11:30pm, Kitchen closed 9pm..."
                      value={editData?.notes || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                      rows={2}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setEditMode(false)}
                      className="flex-1 py-3 bg-surface-light rounded-lg text-text-muted"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveDay}
                      className="flex-1 py-3 bg-accent text-bg rounded-lg font-medium"
                    >
                      Save
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeWorkout && (
        <WorkoutLogger
          workout={activeWorkout}
          onClose={handleWorkoutClose}
          onComplete={handleWorkoutComplete}
        />
      )}
    </div>
  );
}

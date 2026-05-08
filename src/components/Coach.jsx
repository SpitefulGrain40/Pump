import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useSettings } from '../hooks/useSettings';
import { useUserProfile } from '../hooks/useUserProfile';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useWorkoutLogs, useWorkoutSchedule } from '../hooks/useWorkoutLogs';
import { useWeightHistory } from '../hooks/useWeightHistory';
import {
  sendMessage,
  buildCoachSystemPrompt,
  buildContextFromState,
  parseAICommands,
} from '../services/ai';
import {
  calculateBodyFatNavy,
  calculateTDEE,
  calculateCalorieTargets,
  calculateProteinTargets,
  getBodyFatCategory,
} from '../utils/calculations';

const QUICK_PROMPTS = [
  { label: 'Plan next 2 weeks', prompt: "Plan my schedule for the next two weeks based on my Week A/B templates." },
  { label: 'Log meal', prompt: "I just ate. Let me describe it and you help me log the calories and protein." },
  { label: 'Today\'s workout', prompt: "What's my workout for today? Walk me through it." },
  { label: 'Am I on track?', prompt: "How am I doing with my weight loss goal? Am I on track?" },
];

export default function Coach() {
  const [messages, setMessages] = useLocalStorage('pump-chat-history', []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const { aiSettings, isConfigured } = useSettings();
  const { profile, updateProfile } = useUserProfile();
  const { meals, logMeal } = useNutritionLogs();
  const { logs: workoutLogs, logWorkout, prs, setPRs } = useWorkoutLogs();
  const { schedule, setWorkoutForDate, setSchedule } = useWorkoutSchedule();
  const { logWeight, entries: weightHistory } = useWeightHistory();
  const [completedDays, setCompletedDays] = useLocalStorage('pump-completed-workouts', {});

  // Check for pending prompt from Schedule banner
  useEffect(() => {
    const pendingPrompt = localStorage.getItem('pump-pending-coach-prompt');
    if (pendingPrompt) {
      setInput(pendingPrompt);
      localStorage.removeItem('pump-pending-coach-prompt');
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const executeCommands = (commands) => {
    const executed = [];

    commands.forEach((cmd) => {
      try {
        if (cmd.type === 'LOG_MEAL' && cmd.data.items && cmd.data.totals) {
          // Filter out any "Total" items that Coach might have included
          const filteredItems = cmd.data.items.filter(item =>
            !item.name.toLowerCase().includes('total')
          );
          logMeal(filteredItems, cmd.data.totals, false);
          executed.push(`✓ Logged meal: ${cmd.data.totals.calories} kcal, ${cmd.data.totals.protein}g protein`);
        } else if (cmd.type === 'LOG_WEIGHT' && cmd.data.weight) {
          logWeight(cmd.data.weight);
          executed.push(`✓ Logged weight: ${cmd.data.weight} kg`);
        } else if (cmd.type === 'LOG_WORKOUT' && cmd.data.date && cmd.data.exercises) {
          // Log the workout with exercise details
          const workoutDate = cmd.data.date;
          const exercises = cmd.data.exercises.map(ex => ({
            name: ex.name,
            actual: {
              sets: ex.reps.map(() => true),
              reps: ex.reps,
              weight: ex.weight
            }
          }));

          // Create workout log entry
          const workoutLog = {
            id: `workout-${workoutDate}-${Date.now()}`,
            date: workoutDate,
            exercises,
            completedAt: new Date().toISOString(),
            notes: cmd.data.notes || ''
          };

          // Add to workout logs
          const existingLogs = JSON.parse(localStorage.getItem('pump-workout-logs') || '[]');
          existingLogs.push(workoutLog);
          localStorage.setItem('pump-workout-logs', JSON.stringify(existingLogs));

          // Check for PRs
          const newPRs = [];
          exercises.forEach(ex => {
            if (ex.actual.weight && ex.actual.weight.length > 0) {
              const maxWeight = Math.max(...ex.actual.weight.filter(w => w > 0));
              const currentPR = prs[ex.name];
              if (!currentPR || maxWeight > currentPR.weight) {
                newPRs.push({ name: ex.name, weight: maxWeight });
                setPRs(prev => ({
                  ...prev,
                  [ex.name]: { weight: maxWeight, date: new Date().toISOString() }
                }));
              }
            }
          });

          // Mark the day as complete (lunch session by default)
          setCompletedDays(prev => ({
            ...prev,
            [workoutDate]: { ...prev[workoutDate], lunch: true }
          }));

          let msg = `✓ Logged workout: ${exercises.length} exercises on ${workoutDate}`;
          if (newPRs.length > 0) {
            msg += `\n🏆 New PRs: ${newPRs.map(p => `${p.name} @ ${p.weight}kg`).join(', ')}`;
          }
          executed.push(msg);
        } else if (cmd.type === 'UPDATE_SCHEDULE' && cmd.data.date && cmd.data.workoutType) {
          setWorkoutForDate(cmd.data.date, cmd.data.workoutType);
          executed.push(`✓ Updated schedule: ${cmd.data.date} → ${cmd.data.workoutType}`);
        } else if (cmd.type === 'SET_SCHEDULE' && cmd.data) {
          // Bulk schedule update - merge with existing
          const dates = Object.keys(cmd.data);
          setSchedule(prev => ({ ...prev, ...cmd.data }));
          executed.push(`✓ Schedule updated: ${dates.length} days set`);
        } else if (cmd.type === 'UPDATE_PROFILE' && cmd.data) {
          const updates = { ...cmd.data };

          // If startingWeight not set but currentWeight is being set, set both
          if (updates.currentWeight && !profile.startingWeight) {
            updates.startingWeight = updates.currentWeight;
          }

          updateProfile(updates);

          // After profile update, calculate derived values (but respect user-provided values)
          const updatedProfile = { ...profile, ...updates };
          const calculations = calculateDerivedValues(updatedProfile, cmd.data);

          if (Object.keys(calculations).length > 0) {
            updateProfile(calculations);
            Object.entries(calculations).forEach(([key, value]) => {
              if (key === 'bodyFatPercentage' && value) {
                const category = getBodyFatCategory(updatedProfile.gender, value);
                executed.push(`✓ Body fat calculated: ${value}% (${category})`);
              } else if (key === 'tdee' && value) {
                executed.push(`✓ TDEE calculated: ${value} kcal/day`);
              } else if (key === 'calorieTarget' && value.min) {
                executed.push(`✓ Calorie target set: ${value.min}-${value.max} kcal/day`);
              } else if (key === 'proteinTarget' && value.min) {
                executed.push(`✓ Protein target set: ${value.min}-${value.max}g/day`);
              }
            });
          }

          // Show what was updated
          const updatedFields = Object.keys(cmd.data).filter(k => k !== 'onboardingComplete');
          if (updatedFields.length > 0) {
            executed.push(`✓ Profile updated: ${updatedFields.join(', ')}`);
          }
          if (cmd.data.onboardingComplete) {
            executed.push(`✓ Onboarding complete! Welcome to Pump! 🎉`);
          }
        }
      } catch (e) {
        console.error('Command execution failed:', e);
      }
    });

    return executed;
  };

  const calculateDerivedValues = (p, userProvidedFields = {}) => {
    const calculations = {};

    // Calculate body fat if we have all measurements (unless user provided it)
    if (!userProvidedFields.bodyFatPercentage && p.gender && p.height && p.waistCircumference && p.neckCircumference) {
      const needsHip = p.gender === 'female';
      if (!needsHip || p.hipCircumference) {
        const bodyFat = calculateBodyFatNavy(
          p.gender,
          p.height,
          p.waistCircumference,
          p.neckCircumference,
          p.hipCircumference
        );
        if (bodyFat && bodyFat > 0 && bodyFat < 60) {
          calculations.bodyFatPercentage = bodyFat;
        }
      }
    }

    // Determine TDEE to use for calorie calculations
    // Priority: 1) user just provided it, 2) already in profile, 3) calculate
    let tdeeToUse = userProvidedFields.tdee || p.tdee;

    // Only calculate TDEE if user didn't provide it AND profile doesn't have it
    if (!tdeeToUse && p.gender && p.currentWeight && p.height && p.age) {
      const calculatedTdee = calculateTDEE(p.gender, p.currentWeight, p.height, p.age, p.activityLevel || 'moderate');
      if (calculatedTdee) {
        calculations.tdee = calculatedTdee;
        tdeeToUse = calculatedTdee;
      }
    }

    // Only auto-calculate calorie targets if user didn't provide them AND no targets exist yet
    // If user wants to change targets, they should tell Coach the new values directly
    if (!userProvidedFields.calorieTarget && !p.calorieTarget?.min && tdeeToUse) {
      const calorieTarget = calculateCalorieTargets(tdeeToUse, 0.75);
      if (calorieTarget.min) {
        calculations.calorieTarget = calorieTarget;
      }
    }

    // Only auto-calculate protein targets if user didn't provide them AND no targets exist yet
    if (!userProvidedFields.proteinTarget && !p.proteinTarget?.min && p.currentWeight) {
      const proteinTarget = calculateProteinTargets(p.currentWeight, 'weightLoss');
      if (proteinTarget.min) {
        calculations.proteinTarget = proteinTarget;
      }
    }

    return calculations;
  };

  const handleSend = async (messageText = input) => {
    if (!messageText.trim() || isLoading) return;

    if (!isConfigured()) {
      setError('Please configure your AI provider in Settings first.');
      return;
    }

    const userMessage = { role: 'user', content: messageText.trim(), timestamp: Date.now() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const context = buildContextFromState(profile, meals, workoutLogs, schedule, weightHistory, completedDays);
      const systemPrompt = buildCoachSystemPrompt(profile, context, context.performance);

      const chatMessages = updatedMessages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await sendMessage(aiSettings, chatMessages, systemPrompt);
      const { commands, cleanContent } = parseAICommands(response.content);
      console.log('Parsed commands:', commands);
      const executedActions = executeCommands(commands);
      console.log('Executed actions:', executedActions);

      let assistantContent = cleanContent;
      if (executedActions.length > 0) {
        assistantContent += '\n\n' + executedActions.join('\n');
      }

      const assistantMessage = {
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
      };

      setMessages([...updatedMessages, assistantMessage]);
    } catch (err) {
      setError(err.message || 'Failed to get response from Coach');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (prompt) => {
    handleSend(prompt);
  };

  const formatMessage = (content) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('|') && line.includes('|')) {
        return (
          <div key={i} className="font-mono text-xs overflow-x-auto">
            {line}
          </div>
        );
      }
      if (line.startsWith('✓')) {
        return (
          <div key={i} className="text-accent text-sm mt-2">
            {line}
          </div>
        );
      }
      if (line.startsWith('- ')) {
        return (
          <div key={i} className="ml-2">
            • {line.substring(2)}
          </div>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <div key={i} className="font-semibold mt-3 mb-1">
            {line.substring(3)}
          </div>
        );
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return (
          <div key={i} className="font-semibold">
            {line.slice(2, -2)}
          </div>
        );
      }
      return <div key={i}>{line || <br />}</div>;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-accent" />
          <h1 className="text-lg font-semibold">Coach</h1>
        </div>
        <p className="text-xs text-text-muted mt-1">
          Your AI fitness coach • {aiSettings.provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="text-center text-text-muted py-8">
            <Sparkles size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium text-text">Hey {profile.name?.split(' ')[0] || 'there'}!</p>
            <p className="text-sm mt-1">I'm your fitness coach. Ready to create your workout plan?</p>
            <p className="text-sm">Tap a suggestion below or ask me anything.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-accent text-bg rounded-br-sm'
                  : 'bg-surface rounded-bl-sm'
              }`}
            >
              <div className="text-sm whitespace-pre-wrap">
                {msg.role === 'assistant' ? formatMessage(msg.content) : msg.content}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-surface rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 size={20} className="animate-spin text-accent" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-danger/20 text-danger p-3 rounded-lg text-sm">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts */}
      {messages.length === 0 && !isLoading && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2 pb-2">
            {QUICK_PROMPTS.map((qp, i) => (
              <button
                key={i}
                onClick={() => handleQuickPrompt(qp.prompt)}
                className="px-4 py-2 rounded-full text-sm font-medium bg-surface-light text-text-muted hover:text-text"
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask Coach anything..."
            className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-accent"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="bg-accent text-bg p-3 rounded-xl disabled:opacity-50"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

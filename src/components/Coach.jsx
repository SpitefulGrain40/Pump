import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, AlertCircle, Search, X, Image, Link, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useSettings } from '../hooks/useSettings';
import { useUserProfile } from '../hooks/useUserProfile';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useWorkoutLogs, useWorkoutSchedule, useWorkoutTemplates } from '../hooks/useWorkoutLogs';
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

// Fetch URL content via Jina AI Reader
async function fetchUrlContent(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const response = await fetch(jinaUrl, {
    headers: { 'Accept': 'text/markdown' }
  });
  if (!response.ok) throw new Error('Failed to fetch URL');
  const text = await response.text();
  // Limit content to avoid token explosion
  return text.slice(0, 8000);
}

// Extract URLs from text
function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s<>\"']+/g;
  return text.match(urlRegex) || [];
}

// Collapsible URL content component
function CollapsibleUrlContent({ url, content }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="mt-2 rounded-lg overflow-hidden bg-black/20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Link size={12} />
        <span className="truncate flex-1 opacity-90">{url}</span>
      </button>
      {isOpen && (
        <div className="px-3 py-2 text-xs opacity-80 max-h-48 overflow-y-auto whitespace-pre-wrap bg-black/10">
          {content}
        </div>
      )}
    </div>
  );
}

// Parse message content to separate text from URL content blocks
function parseMessageWithUrls(content) {
  const urlBlockRegex = /\n\n---\n\*\*Content from (https?:\/\/[^\*]+):\*\*\n([\s\S]*?)\n---/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = urlBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'url', url: match[1], content: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content }];
}

const QUICK_PROMPTS = [
  { label: 'Plan next 2 weeks', prompt: "Plan my schedule for the next two weeks. Use [SET_SCHEDULE: ...] to populate each day with the right workout type, calorie target, and any relevant notes based on my templates and goals." },
  { label: 'Log meal', prompt: "I just ate. Let me describe it and you help me log the calories and protein." },
  { label: 'Today\'s workout', prompt: "What's my workout for today? Walk me through it." },
  { label: 'Am I on track?', prompt: "How am I doing with my weight loss goal? Am I on track?" },
];

export default function Coach({ onClose }) {
  const [messages, setMessages] = useLocalStorage('pump-chat-history', []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [fetchingUrls, setFetchingUrls] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useLocalStorage('pump-coach-system-prompt', '');
  const [promptDraft, setPromptDraft] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const { aiSettings, isConfigured } = useSettings();
  const { profile, updateProfile } = useUserProfile();
  const { meals, logMeal } = useNutritionLogs();
  const { logs: workoutLogs, logWorkout, prs, setPRs } = useWorkoutLogs();
  const { schedule, setWorkoutForDate, setSchedule } = useWorkoutSchedule();
  const { addExercise, removeExercise, updateExercise, setTemplate } = useWorkoutTemplates();
  const { logWeight, entries: weightHistory } = useWeightHistory();
  const [completedDays, setCompletedDays] = useLocalStorage('pump-completed-workouts', {});
  const [memories, setMemories] = useLocalStorage('pump-coach-memories', []);

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
        } else if (cmd.type === 'SAVE_MEMORY' && cmd.data.content) {
          const memory = {
            id: `memory-${Date.now()}`,
            type: cmd.data.type || 'other',
            content: cmd.data.content,
            date: cmd.data.date || null,
            createdAt: new Date().toISOString()
          };
          setMemories(prev => [...prev, memory]);
          executed.push(`✓ Remembered: ${cmd.data.content.substring(0, 50)}${cmd.data.content.length > 50 ? '...' : ''}`);
        } else if (cmd.type === 'FORGET_MEMORY' && cmd.data.content) {
          const searchTerm = cmd.data.content.toLowerCase();
          setMemories(prev => {
            const filtered = prev.filter(m => !m.content.toLowerCase().includes(searchTerm));
            if (filtered.length < prev.length) {
              executed.push(`✓ Forgot memory about: ${cmd.data.content}`);
            }
            return filtered;
          });
        } else if (cmd.type === 'UPDATE_TEMPLATE' && cmd.data) {
          const { action, template, exercise, updates } = cmd.data;
          if (action === 'add' && template && exercise) {
            addExercise(template, exercise);
            executed.push(`✓ Added "${exercise.name}" to ${template} template`);
          } else if (action === 'remove' && template && cmd.data.exerciseName) {
            removeExercise(template, cmd.data.exerciseName);
            executed.push(`✓ Removed "${cmd.data.exerciseName}" from ${template} template`);
          } else if (action === 'update' && template && cmd.data.exerciseName && updates) {
            updateExercise(template, cmd.data.exerciseName, updates);
            executed.push(`✓ Updated "${cmd.data.exerciseName}" in ${template} template`);
          }
          } else if (cmd.type === 'SET_TEMPLATE' && cmd.data) {
            const { template, exercises } = cmd.data;
            if (template && Array.isArray(exercises)) {
              setTemplate(template, exercises);
              executed.push(`✓ Set ${template} template: ${exercises.length} exercises`);
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
      const goalDir = p.targetWeight > p.currentWeight ? 'gain' : p.targetWeight < p.currentWeight ? 'loss' : 'maintain';
      const calorieTarget = calculateCalorieTargets(tdeeToUse, 0.75, goalDir);
      if (calorieTarget.min) {
        calculations.calorieTarget = calorieTarget;
      }
    }

    // Only auto-calculate protein targets if user didn't provide them AND no targets exist yet
    if (!userProvidedFields.proteinTarget && !p.proteinTarget?.min && p.currentWeight) {
      const goalDir = p.targetWeight > p.currentWeight ? 'gain' : p.targetWeight < p.currentWeight ? 'loss' : 'maintain';
      const proteinGoal = goalDir === 'gain' ? 'muscle' : goalDir === 'loss' ? 'weightLoss' : 'maintenance';
      const proteinTarget = calculateProteinTargets(p.currentWeight, proteinGoal);
      if (proteinTarget.min) {
        calculations.proteinTarget = proteinTarget;
      }
    }

    return calculations;
  };

  const handleSend = async (messageText = input) => {
    if ((!messageText.trim() && !pendingImage) || isLoading) return;

    if (!isConfigured()) {
      setError('Please configure your AI provider in Settings first.');
      return;
    }

    let finalMessageText = messageText.trim() || 'Analyze this image';

    // Check for URLs and fetch their content
    const urls = extractUrls(finalMessageText);
    let urlContents = [];

    if (urls.length > 0) {
      setFetchingUrls(true);
      for (const url of urls.slice(0, 3)) { // Limit to 3 URLs
        try {
          const content = await fetchUrlContent(url);
          urlContents.push(`\n\n---\n**Content from ${url}:**\n${content}\n---`);
        } catch (e) {
          urlContents.push(`\n\n(Failed to fetch ${url})`);
        }
      }
      setFetchingUrls(false);
      if (urlContents.length > 0) {
        finalMessageText += urlContents.join('');
      }
    }

    const userMessage = {
      role: 'user',
      content: finalMessageText,
      timestamp: Date.now(),
      image: pendingImage || undefined
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setPendingImage(null);
    setError(null);
    setIsLoading(true);
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const context = buildContextFromState(profile, meals, workoutLogs, schedule, weightHistory, completedDays);
      const systemPrompt = customSystemPrompt
        ? customSystemPrompt
        : buildCoachSystemPrompt(profile, context, context.performance, memories);

      const chatMessages = updatedMessages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
        image: m.image,
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

      const finalMessages = [...updatedMessages, assistantMessage];
      // Always persist to localStorage even if modal was closed mid-request
      localStorage.setItem('pump-chat-history', JSON.stringify(finalMessages));
      if (isMountedRef.current) {
        setMessages(finalMessages);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || 'Failed to get response from Coach');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleQuickPrompt = (prompt) => {
    handleSend(prompt);
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result);
    reader.readAsDataURL(file);
  };

  const filteredMessages = searchQuery
    ? messages.filter(m =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-accent" />
            <h1 className="text-lg font-semibold">Coach</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (messages.length === 0) {
                  alert('No chat history to clear.');
                  return;
                }
                if (confirm('Clear chat history? Your other data (meals, workouts, etc.) will be kept.')) {
                  setMessages([]);
                }
              }}
              className="px-2 py-1 rounded bg-red-600 text-white text-xs"
            >
              Clear
            </button>
            <button
              onClick={() => { setPromptDraft(customSystemPrompt); setShowPromptEditor(true); }}
              className="p-2 rounded-lg text-text-muted hover:text-text"
              title="Edit Coach persona"
            >
              <Settings size={18} />
            </button>
            <button
              onClick={() => setIsSearching(!isSearching)}
              className={`p-2 rounded-lg ${isSearching ? 'bg-accent text-bg' : 'text-text-muted hover:text-text'}`}
            >
              <Search size={20} />
            </button>
          </div>
        </div>
        {isSearching && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chat history..."
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-2 text-text-muted hover:text-text"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        {!isSearching && (
          <p className="text-xs text-text-muted mt-1">
            Your AI fitness coach • {aiSettings.provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'}
          </p>
        )}
        {isSearching && searchQuery && (
          <p className="text-xs text-text-muted mt-2">
            {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''} found
          </p>
        )}
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

        {filteredMessages.map((msg, i) => (
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
              {msg.image && (
                <img
                  src={msg.image}
                  alt="Attached"
                  className="max-w-full rounded-lg mb-2 max-h-48 object-cover"
                />
              )}
              {msg.role === 'user' ? (
                <div className="text-sm">
                  {parseMessageWithUrls(msg.content).map((part, j) =>
                    part.type === 'url' ? (
                      <CollapsibleUrlContent key={j} url={part.url} content={part.content} />
                    ) : (
                      <span key={j} className="whitespace-pre-wrap">{part.content}</span>
                    )
                  )}
                </div>
              ) : (
                <div className="text-sm whitespace-pre-wrap">
                  {formatMessage(msg.content)}
                </div>
              )}
            </div>
          </div>
        ))}

        {fetchingUrls && (
          <div className="flex justify-start">
            <div className="bg-surface rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Link size={16} className="text-accent" />
              <span className="text-sm text-text-muted">Fetching link content...</span>
              <Loader2 size={16} className="animate-spin text-accent" />
            </div>
          </div>
        )}

        {isLoading && !fetchingUrls && (
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
        {/* Image preview */}
        {pendingImage && (
          <div className="mb-3 relative inline-block">
            <img
              src={pendingImage}
              alt="To send"
              className="max-h-32 rounded-lg"
            />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -top-2 -right-2 bg-danger text-white rounded-full p-1"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="bg-surface border border-border p-3 rounded-xl text-text-muted hover:text-text disabled:opacity-50 shrink-0"
          >
            <Image size={20} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={pendingImage ? "Add a message..." : "Ask Coach anything..."}
            className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-accent resize-none overflow-hidden"
            disabled={isLoading}
            rows={1}
            style={{ minHeight: '48px', maxHeight: '150px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={(!input.trim() && !pendingImage) || isLoading}
            className="bg-accent text-bg p-3 rounded-xl disabled:opacity-50 shrink-0"
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* System prompt editor */}
      {showPromptEditor && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-end">
          <div className="bg-surface w-full rounded-t-2xl p-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Coach Persona</h2>
              <button onClick={() => setShowPromptEditor(false)} className="p-1 text-text-muted">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-text-muted mb-3">
              Override the default Coach system prompt. Leave empty to use the default (profile-aware) prompt. Changes take effect from the next message.
            </p>
            <textarea
              value={promptDraft}
              onChange={e => setPromptDraft(e.target.value)}
              className="flex-1 bg-bg border border-border rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-accent font-mono"
              rows={12}
              placeholder="Leave empty to use the default context-aware system prompt..."
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setPromptDraft(''); }}
                className="flex-1 py-2 rounded-xl bg-bg text-text-muted text-sm border border-border"
              >
                Reset to default
              </button>
              <button
                onClick={() => { setCustomSystemPrompt(promptDraft); setShowPromptEditor(false); }}
                className="flex-1 py-2 rounded-xl bg-accent text-bg text-sm font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

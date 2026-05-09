import { useLocalStorage } from './useLocalStorage';
import { DEFAULT_AI_SETTINGS } from '../utils/dataSchemas';
import { useEffect } from 'react';

// Map old model IDs to new ones
const MODEL_MIGRATIONS = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-opus-4-20250514': 'claude-opus-4-6',
  'claude-3-5-haiku-20241022': 'claude-haiku-4-5-20251001',
  'anthropic/claude-3-5-haiku-20241022': 'anthropic/claude-haiku-4-5-20251001',
  'anthropic/claude-sonnet-4-20250514': 'anthropic/claude-sonnet-4-6',
};

export function useSettings() {
  const [aiSettings, setAISettings] = useLocalStorage('pump-ai-settings', DEFAULT_AI_SETTINGS);

  // Migrate old model IDs on load
  useEffect(() => {
    let needsUpdate = false;
    const updates = {};

    if (MODEL_MIGRATIONS[aiSettings.model]) {
      updates.model = MODEL_MIGRATIONS[aiSettings.model];
      needsUpdate = true;
    }
    if (MODEL_MIGRATIONS[aiSettings.anthropicModel]) {
      updates.anthropicModel = MODEL_MIGRATIONS[aiSettings.anthropicModel];
      needsUpdate = true;
    }

    if (needsUpdate) {
      setAISettings((prev) => ({ ...prev, ...updates }));
    }
  }, []);

  const updateAISettings = (updates) => {
    setAISettings((prev) => ({ ...prev, ...updates }));
  };

  const getActiveApiKey = () => {
    return aiSettings.provider === 'openrouter' ? aiSettings.openrouterKey : aiSettings.anthropicKey;
  };

  const getActiveModel = () => {
    return aiSettings.provider === 'openrouter' ? aiSettings.model : aiSettings.anthropicModel;
  };

  const isConfigured = () => {
    return getActiveApiKey()?.length > 0;
  };

  return {
    aiSettings,
    setAISettings,
    updateAISettings,
    getActiveApiKey,
    getActiveModel,
    isConfigured,
  };
}

export function useBackup() {
  const [lastBackup, setLastBackup] = useLocalStorage('pump-last-backup', null);

  const exportData = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: localStorage.getItem('pump-user-profile'),
      aiSettings: localStorage.getItem('pump-ai-settings'),
      weightHistory: localStorage.getItem('pump-weight-history'),
      nutritionLogs: localStorage.getItem('pump-nutrition-logs'),
      workoutLogs: localStorage.getItem('pump-workout-logs'),
      workoutSchedule: localStorage.getItem('pump-workout-schedule'),
      completedWorkouts: localStorage.getItem('pump-completed-workouts'),
      prs: localStorage.getItem('pump-prs'),
      chatHistory: localStorage.getItem('pump-chat-history'),
      coachMemories: localStorage.getItem('pump-coach-memories'),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pump-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setLastBackup(new Date().toISOString());
  };

  const importData = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);

          if (data.profile) localStorage.setItem('pump-user-profile', data.profile);
          if (data.aiSettings) localStorage.setItem('pump-ai-settings', data.aiSettings);
          if (data.weightHistory) localStorage.setItem('pump-weight-history', data.weightHistory);
          if (data.nutritionLogs) localStorage.setItem('pump-nutrition-logs', data.nutritionLogs);
          if (data.workoutLogs) localStorage.setItem('pump-workout-logs', data.workoutLogs);
          if (data.workoutSchedule) localStorage.setItem('pump-workout-schedule', data.workoutSchedule);
          if (data.completedWorkouts) localStorage.setItem('pump-completed-workouts', data.completedWorkouts);
          if (data.prs) localStorage.setItem('pump-prs', data.prs);
          if (data.chatHistory) localStorage.setItem('pump-chat-history', data.chatHistory);
          if (data.coachMemories) localStorage.setItem('pump-coach-memories', data.coachMemories);

          resolve({ success: true, exportedAt: data.exportedAt });
        } catch (err) {
          reject(new Error('Invalid backup file'));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const clearAllData = () => {
    const keys = [
      'pump-user-profile',
      'pump-ai-settings',
      'pump-weight-history',
      'pump-nutrition-logs',
      'pump-workout-logs',
      'pump-workout-schedule',
      'pump-completed-workouts',
      'pump-prs',
      'pump-chat-history',
      'pump-coach-memories',
      'pump-last-backup',
    ];
    keys.forEach((key) => localStorage.removeItem(key));
  };

  const needsBackupReminder = () => {
    if (!lastBackup) return true;
    const daysSinceBackup = Math.floor(
      (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceBackup >= 7;
  };

  return { exportData, importData, clearAllData, lastBackup, needsBackupReminder };
}

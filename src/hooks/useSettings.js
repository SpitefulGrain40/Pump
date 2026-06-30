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
    if (aiSettings.provider === 'cli') return true;
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

// Strip base64 image data from a serialised chat-history string so backups
// stay small. A single un-stripped image can be several MB and push the whole
// backup past the localStorage quota on restore. Mirrors Coach.jsx's persist
// strip: drop `image`, mark `hadImage: true`.
function stripChatImages(chatHistoryStr) {
  if (!chatHistoryStr) return chatHistoryStr;
  try {
    const messages = JSON.parse(chatHistoryStr);
    if (!Array.isArray(messages)) return chatHistoryStr;
    const stripped = messages.map((m) => {
      if (!m || !m.image) return m;
      const { image, ...rest } = m;
      return { ...rest, hadImage: true };
    });
    return JSON.stringify(stripped);
  } catch {
    return chatHistoryStr;
  }
}

export function useBackup() {
  const [lastBackup, setLastBackup] = useLocalStorage('pump-last-backup', null);

  const exportData = () => {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      profile: localStorage.getItem('pump-user-profile'),
      aiSettings: localStorage.getItem('pump-ai-settings'),
      weightHistory: localStorage.getItem('pump-weight-history'),
      measurementHistory: localStorage.getItem('pump-measurement-history'),
      nutritionLogs: localStorage.getItem('pump-nutrition-logs'),
      workoutLogs: localStorage.getItem('pump-workout-logs'),
      workoutSchedule: localStorage.getItem('pump-workout-schedule'),
      workoutTemplates: localStorage.getItem('pump-workout-templates'),
      completedWorkouts: localStorage.getItem('pump-completed-workouts'),
      prs: localStorage.getItem('pump-prs'),
      chatHistory: stripChatImages(localStorage.getItem('pump-chat-history')),
      coachMemories: localStorage.getItem('pump-coach-memories'),
      docChat: localStorage.getItem('pump-doc-chat'),
      docLongterm: localStorage.getItem('pump-doc-longterm'),
      docSessions: localStorage.getItem('pump-doc-sessions'),
      docSystemPrompt: localStorage.getItem('pump-doc-system-prompt'),
      coachSystemPrompt: localStorage.getItem('pump-coach-system-prompt'),
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
        let data;
        try {
          data = JSON.parse(e.target.result);
        } catch {
          reject(new Error('Invalid backup file'));
          return;
        }

        // Map backup field → localStorage key. Ordered so the critical,
        // small keys (profile, schedule, measurements) are written FIRST —
        // a quota failure on a large key (chatHistory) must never block them.
        const KEY_MAP = [
          ['profile', 'pump-user-profile'],
          ['aiSettings', 'pump-ai-settings'],
          ['weightHistory', 'pump-weight-history'],
          ['measurementHistory', 'pump-measurement-history'],
          ['workoutSchedule', 'pump-workout-schedule'],
          ['workoutTemplates', 'pump-workout-templates'],
          ['completedWorkouts', 'pump-completed-workouts'],
          ['prs', 'pump-prs'],
          ['workoutLogs', 'pump-workout-logs'],
          ['nutritionLogs', 'pump-nutrition-logs'],
          ['coachMemories', 'pump-coach-memories'],
          ['docChat', 'pump-doc-chat'],
          ['docLongterm', 'pump-doc-longterm'],
          ['docSessions', 'pump-doc-sessions'],
          ['docSystemPrompt', 'pump-doc-system-prompt'],
          ['coachSystemPrompt', 'pump-coach-system-prompt'],
          // chatHistory LAST: it's the largest and least critical. Strip any
          // base64 images so an old (pre-v2) backup can't blow the quota.
          ['chatHistory', 'pump-chat-history'],
        ];

        const skipped = [];
        for (const [field, lsKey] of KEY_MAP) {
          if (data[field] == null) continue;
          const valueToStore = field === 'chatHistory' ? stripChatImages(data[field]) : data[field];
          try {
            localStorage.setItem(lsKey, valueToStore);
          } catch (err) {
            // Quota or other write error on this key — record and keep going
            // so the rest of the restore (and the reload) still happens.
            console.error(`Restore: failed to write ${lsKey}:`, err);
            skipped.push(field);
          }
        }

        resolve({ success: true, exportedAt: data.exportedAt, skipped });
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
      'pump-measurement-history',
      'pump-nutrition-logs',
      'pump-workout-logs',
      'pump-workout-schedule',
      'pump-workout-templates',
      'pump-completed-workouts',
      'pump-prs',
      'pump-chat-history',
      'pump-coach-memories',
      'pump-doc-chat',
      'pump-doc-longterm',
      'pump-doc-sessions',
      'pump-doc-system-prompt',
      'pump-coach-system-prompt',
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

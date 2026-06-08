import { useState, useRef } from 'react';
import {
  User, Bot, Database, Info, ChevronRight, Check, Loader2,
  Download, Upload, Trash2, ExternalLink, Eye, EyeOff
} from 'lucide-react';
import { useSettings, useBackup } from '../hooks/useSettings';
import { useUserProfile } from '../hooks/useUserProfile';
import { testConnection } from '../services/ai';

export default function Settings() {
  const { aiSettings, updateAISettings, isConfigured } = useSettings();
  const { profile, updateProfile } = useUserProfile();
  const { exportData, importData, clearAllData } = useBackup();

  const [activeSection, setActiveSection] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fileInputRef = useRef(null);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const result = await testConnection(aiSettings);
    setTestResult(result);
    setIsTesting(false);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await importData(file);
      alert(`Backup restored from ${result.exportedAt}. Please refresh the app.`);
      window.location.reload();
    } catch (err) {
      alert('Failed to import backup: ' + err.message);
    }
  };

  const handleClearData = () => {
    clearAllData();
    window.location.reload();
  };

  const getActiveApiKey = () => {
    return aiSettings.provider === 'openrouter' ? aiSettings.openrouterKey : aiSettings.anthropicKey;
  };

  const setActiveApiKey = (key) => {
    if (aiSettings.provider === 'openrouter') {
      updateAISettings({ openrouterKey: key });
    } else {
      updateAISettings({ anthropicKey: key });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold mb-6">Settings</h1>

      {/* Profile Section */}
      <Section
        icon={User}
        title="Profile"
        description="Your goals and targets"
        isOpen={activeSection === 'profile'}
        onToggle={() => setActiveSection(activeSection === 'profile' ? null : 'profile')}
      >
        <div className="space-y-4 p-4 bg-bg rounded-lg">
          {/* Basic Info */}
          <div className="text-xs text-text-muted font-medium uppercase tracking-wide">Basic Info</div>
          <Field
            label="Name"
            type="text"
            value={profile.name}
            onChange={(v) => updateProfile({ name: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-text-muted block mb-1">Gender</label>
              <select
                value={profile.gender}
                onChange={(e) => updateProfile({ gender: e.target.value })}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <Field
              label="Age"
              type="number"
              value={profile.age}
              onChange={(v) => updateProfile({ age: parseInt(v) })}
            />
          </div>

          {/* Body Stats */}
          <div className="text-xs text-text-muted font-medium uppercase tracking-wide pt-2">Body Stats</div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Height (cm)"
              type="number"
              value={profile.height}
              onChange={(v) => updateProfile({ height: parseFloat(v) })}
            />
            <Field
              label="Current Weight (kg)"
              type="number"
              value={profile.currentWeight}
              onChange={(v) => updateProfile({ currentWeight: parseFloat(v) })}
            />
          </div>

          {/* Body Measurements */}
          <div className="text-xs text-text-muted font-medium uppercase tracking-wide pt-2">Body Measurements</div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Neck (cm)"
              type="number"
              value={profile.neckCircumference}
              onChange={(v) => updateProfile({ neckCircumference: parseFloat(v) })}
            />
            <Field
              label="Waist (cm)"
              type="number"
              value={profile.waistCircumference}
              onChange={(v) => updateProfile({ waistCircumference: parseFloat(v) })}
            />
          </div>
          {profile.gender === 'female' && (
            <Field
              label="Hips (cm)"
              type="number"
              value={profile.hipCircumference}
              onChange={(v) => updateProfile({ hipCircumference: parseFloat(v) })}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Body Fat % (manual)"
              type="number"
              value={profile.bodyFatManual ?? profile.bodyFatPercentage}
              onChange={(v) => updateProfile({ bodyFatManual: parseFloat(v) })}
            />
            <Field
              label="TDEE"
              type="number"
              value={profile.tdee}
              onChange={(v) => updateProfile({ tdee: parseInt(v) })}
            />
          </div>
          <p className="text-xs text-text-muted -mt-2">
            Manual field is for DEXA / smart-scale / calipers. Coach also computes Navy method from neck/waist{profile.gender === 'female' ? '/hips' : ''} measurements automatically.
          </p>

          {/* Goals */}
          <div className="text-xs text-text-muted font-medium uppercase tracking-wide pt-2">Goals</div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Target Weight (kg)"
              type="number"
              value={profile.targetWeight}
              onChange={(v) => updateProfile({ targetWeight: parseFloat(v) })}
            />
            <Field
              label="Target Date"
              type="date"
              value={profile.targetDate}
              onChange={(v) => updateProfile({ targetDate: v })}
            />
          </div>

          {/* Nutrition Targets */}
          <div className="text-xs text-text-muted font-medium uppercase tracking-wide pt-2">Nutrition Targets</div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Min Calories"
              type="number"
              value={profile.calorieTarget?.min}
              onChange={(v) => updateProfile({
                calorieTarget: { ...profile.calorieTarget, min: parseInt(v) }
              })}
            />
            <Field
              label="Max Calories"
              type="number"
              value={profile.calorieTarget?.max}
              onChange={(v) => updateProfile({
                calorieTarget: { ...profile.calorieTarget, max: parseInt(v) }
              })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Min Protein (g)"
              type="number"
              value={profile.proteinTarget?.min}
              onChange={(v) => updateProfile({
                proteinTarget: { ...profile.proteinTarget, min: parseInt(v) }
              })}
            />
            <Field
              label="Max Protein (g)"
              type="number"
              value={profile.proteinTarget?.max}
              onChange={(v) => updateProfile({
                proteinTarget: { ...profile.proteinTarget, max: parseInt(v) }
              })}
            />
          </div>

          {/* Schedule */}
          <div className="text-xs text-text-muted font-medium uppercase tracking-wide pt-2">Schedule</div>
          <Field
            label="Week A Start Date"
            type="date"
            value={profile.schedulePattern?.weekAStart}
            onChange={(v) => updateProfile({
              schedulePattern: { ...profile.schedulePattern, weekAStart: v }
            })}
          />

          {/* Notes */}
          <div className="text-xs text-text-muted font-medium uppercase tracking-wide pt-2">Notes</div>
          <div>
            <label className="text-sm text-text-muted block mb-1">Physical Limitations / Injuries</label>
            <textarea
              value={profile.physicalNotes}
              onChange={(e) => updateProfile({ physicalNotes: e.target.value })}
              placeholder="e.g. Bad knees, lower back pain..."
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
              rows={2}
            />
          </div>
        </div>
      </Section>

      {/* AI Provider Section */}
      <Section
        icon={Bot}
        title="AI Provider"
        description={aiSettings.provider === 'cli' ? 'CLI (local dev)' : aiSettings.provider === 'openrouter' ? 'OpenRouter' : 'Anthropic Direct'}
        isOpen={activeSection === 'ai'}
        onToggle={() => setActiveSection(activeSection === 'ai' ? null : 'ai')}
      >
        <div className="space-y-4 p-4 bg-bg rounded-lg">
          {/* Provider Selection */}
          <div className="flex gap-2">
            <button
              onClick={() => updateAISettings({ provider: 'openrouter' })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                aiSettings.provider === 'openrouter'
                  ? 'bg-accent text-bg'
                  : 'bg-surface text-text-muted'
              }`}
            >
              OpenRouter
            </button>
            <button
              onClick={() => updateAISettings({ provider: 'anthropic' })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                aiSettings.provider === 'anthropic'
                  ? 'bg-accent text-bg'
                  : 'bg-surface text-text-muted'
              }`}
            >
              Anthropic
            </button>
            <button
              onClick={() => updateAISettings({ provider: 'cli' })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                aiSettings.provider === 'cli'
                  ? 'bg-warning/80 text-bg'
                  : 'bg-surface text-text-muted'
              }`}
            >
              CLI
            </button>
          </div>

          {/* CLI info banner */}
          {aiSettings.provider === 'cli' && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-xs text-text-muted space-y-1">
              <p className="font-medium text-warning">Local dev mode — no API tokens used</p>
              <p>Run the proxy before using Coach:</p>
              <code className="block bg-bg rounded px-2 py-1 text-text font-mono">node scripts/pump-cli-proxy.js</code>
            </div>
          )}

          {/* API Key — hidden for CLI */}
          {aiSettings.provider !== 'cli' && (
          <div>
            <label className="text-sm text-text-muted block mb-1">API Key</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={getActiveApiKey()}
                  onChange={(e) => setActiveApiKey(e.target.value)}
                  placeholder={`Enter ${aiSettings.provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'} API key`}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted"
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Model Selection */}
          <div>
            <label className="text-sm text-text-muted block mb-1">Model</label>
            <select
              value={aiSettings.provider === 'openrouter' ? aiSettings.model : aiSettings.anthropicModel}
              onChange={(e) => {
                if (aiSettings.provider === 'openrouter') {
                  updateAISettings({ model: e.target.value });
                } else {
                  updateAISettings({ anthropicModel: e.target.value });
                }
              }}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              {aiSettings.provider === 'openrouter' ? (
                <>
                  <option value="anthropic/claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fast, ~$0.001/msg)</option>
                  <option value="anthropic/claude-sonnet-4-6">Claude Sonnet 4.6 (Best, ~$0.01/msg)</option>
                  <option value="openai/gpt-4o-mini">GPT-4o Mini (~$0.001/msg)</option>
                  <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash (~$0.001/msg)</option>
                  <option value="minimax/minimax-m2.5:free">Minimax M2.5 (Free - slow)</option>
                  <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (Free - rate limited)</option>
                </>
              ) : (
                <>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Recommended)</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6 (Most capable)</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fastest)</option>
                </>
              )}
            </select>
          </div>

          {/* Test Connection */}
          <button
            onClick={handleTestConnection}
            disabled={isTesting || !isConfigured()}
            className="w-full py-2 bg-surface rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Check size={18} />
            )}
            Test Connection
          </button>

          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${
              testResult.success ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'
            }`}>
              {testResult.success
                ? `✓ Connected (${testResult.latency}ms)`
                : `✗ ${testResult.error}`}
            </div>
          )}

          {/* Help Links */}
          <div className="pt-2 border-t border-border">
            <a
              href={aiSettings.provider === 'openrouter'
                ? 'https://openrouter.ai/keys'
                : 'https://console.anthropic.com/settings/keys'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-accent"
            >
              <ExternalLink size={14} />
              Get {aiSettings.provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'} API Key
            </a>
          </div>
        </div>
      </Section>

      {/* Data Section */}
      <Section
        icon={Database}
        title="Data"
        description="Backup and restore"
        isOpen={activeSection === 'data'}
        onToggle={() => setActiveSection(activeSection === 'data' ? null : 'data')}
      >
        <div className="space-y-3 p-4 bg-bg rounded-lg">
          <button
            onClick={exportData}
            className="w-full py-3 bg-surface rounded-lg text-sm font-medium flex items-center justify-center gap-2"
          >
            <Download size={18} />
            Export Backup
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 bg-surface rounded-lg text-sm font-medium flex items-center justify-center gap-2"
          >
            <Upload size={18} />
            Import Backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />

          <div className="pt-3 border-t border-border">
            {!showClearConfirm ? (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full py-3 bg-danger/20 text-danger rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Trash2 size={18} />
                Clear All Data
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-danger text-center">Are you sure? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-2 bg-surface rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearData}
                    className="flex-1 py-2 bg-danger text-white rounded-lg text-sm font-medium"
                  >
                    Delete Everything
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* About Section */}
      <Section
        icon={Info}
        title="About"
        description="Pump v1.0"
        isOpen={activeSection === 'about'}
        onToggle={() => setActiveSection(activeSection === 'about' ? null : 'about')}
      >
        <div className="p-4 bg-bg rounded-lg text-sm text-text-muted space-y-2">
          <p><strong className="text-text">Pump</strong> - AI-Powered Fitness Coach</p>
          <p>Version 1.0.0</p>
          <p>Built with React, Tailwind CSS, and Claude AI.</p>
          <p className="pt-2 border-t border-border">
            Tip: Export your backup before transferring to a new device via Google Drive.
          </p>
        </div>
      </Section>
    </div>
  );
}

function Section({ icon: Icon, title, description, isOpen, onToggle, children }) {
  return (
    <div className="bg-surface rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-3"
      >
        <div className="w-10 h-10 bg-surface-light rounded-full flex items-center justify-center">
          <Icon size={20} className="text-accent" />
        </div>
        <div className="flex-1 text-left">
          <div className="font-medium">{title}</div>
          <div className="text-sm text-text-muted">{description}</div>
        </div>
        <ChevronRight
          size={20}
          className={`text-text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Field({ label, type, value, onChange }) {
  return (
    <div>
      <label className="text-sm text-text-muted block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
      />
    </div>
  );
}

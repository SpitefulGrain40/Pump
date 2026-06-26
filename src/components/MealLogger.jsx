import { useState, useRef } from 'react';
import { X, Camera, Image, Loader2, Check, Trash2 } from 'lucide-react';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useSettings } from '../hooks/useSettings';

export default function MealLogger({ onClose }) {
  const { logMeal } = useNutritionLogs();
  const { isConfigured } = useSettings();
  const fileInputRef = useRef(null);
  const draftInputRef = useRef(null);

  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [editField, setEditField] = useState(null); // { index, field }
  const [editValue, setEditValue] = useState('');

  const totals = items.reduce(
    (acc, item) => ({ calories: acc.calories + item.calories, protein: acc.protein + item.protein }),
    { calories: 0, protein: 0 }
  );

  const handleEstimate = async () => {
    if (!draft.trim() || estimating) return;
    if (!isConfigured()) { setError('Configure AI provider in Settings first'); return; }
    setEstimating(true);
    setError(null);
    try {
      const item = await estimateItem(draft.trim());
      setItems(prev => [...prev, item]);
      setDraft('');
      draftInputRef.current?.focus();
    } catch (err) {
      setError(err.message || 'Could not estimate — try rephrasing');
    } finally {
      setEstimating(false);
    }
  };

  const handleDraftKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleEstimate(); }
  };

  const handleRemove = (index) => setItems(items.filter((_, i) => i !== index));

  const startEdit = (index, field) => {
    setEditField({ index, field });
    setEditValue(String(items[index][field]));
  };

  const commitEdit = () => {
    if (!editField) return;
    const val = parseInt(editValue) || 0;
    setItems(prev => prev.map((item, i) =>
      i === editField.index ? { ...item, [editField.field]: val } : item
    ));
    setEditField(null);
  };

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isConfigured()) { setError('Configure AI provider in Settings first'); return; }
    setIsAnalyzing(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const response = await analyzePhoto(base64);
      if (response.items?.length > 0) {
        setItems(prev => [...prev, ...response.items.map(item => ({
          name: item.name || '',
          calories: item.calories || 0,
          protein: item.protein || 0,
        }))]);
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze photo');
    } finally {
      setIsAnalyzing(false);
      e.target.value = '';
    }
  };

  const handleSubmit = () => {
    if (items.length === 0) return;
    logMeal(items, totals, false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] sm:max-h-[90vh] mb-16 sm:mb-0 flex flex-col">

        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="font-semibold">Log Meal</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Description input row */}
          <div className="flex gap-2">
            <input
              ref={draftInputRef}
              type="text"
              placeholder="Describe a food item..."
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleDraftKey}
              disabled={estimating || isAnalyzing}
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              onClick={() => { fileInputRef.current.setAttribute('capture', 'environment'); fileInputRef.current?.click(); }}
              disabled={isAnalyzing || estimating}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-light text-text-muted hover:text-text disabled:opacity-40 shrink-0"
              title="Take photo"
            >
              {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            </button>
            <button
              onClick={() => { fileInputRef.current.removeAttribute('capture'); fileInputRef.current?.click(); }}
              disabled={isAnalyzing || estimating}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-light text-text-muted hover:text-text disabled:opacity-40 shrink-0"
              title="Choose from gallery"
            >
              <Image size={16} />
            </button>
            <button
              onClick={handleEstimate}
              disabled={!draft.trim() || estimating}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-accent text-bg disabled:opacity-40 shrink-0"
            >
              {estimating
                ? <Loader2 size={16} className="animate-spin" />
                : <Check size={16} />}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoCapture}
            className="hidden"
          />

          {error && (
            <div className="bg-danger/20 text-danger text-sm p-3 rounded-lg">{error}</div>
          )}

          {/* Confirmed items */}
          {items.length > 0 && (
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-1 text-xs text-text-muted px-2 pb-1">
                <div className="col-span-6">Item</div>
                <div className="col-span-2 text-right">kcal</div>
                <div className="col-span-3 text-right">protein</div>
                <div className="col-span-1" />
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-1 items-center bg-bg rounded-lg px-2 py-2">
                  <span className="col-span-6 text-sm truncate" title={item.name}>{item.name}</span>

                  {editField?.index === index && editField?.field === 'calories' ? (
                    <input
                      autoFocus
                      type="number"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => e.key === 'Enter' && commitEdit()}
                      className="col-span-2 bg-surface border border-accent rounded px-1 py-0.5 text-sm text-right w-full focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => startEdit(index, 'calories')}
                      className="col-span-2 text-sm text-right hover:text-accent tabular-nums"
                    >
                      {item.calories}
                    </button>
                  )}

                  {editField?.index === index && editField?.field === 'protein' ? (
                    <input
                      autoFocus
                      type="number"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => e.key === 'Enter' && commitEdit()}
                      className="col-span-3 bg-surface border border-accent rounded px-1 py-0.5 text-sm text-right w-full focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => startEdit(index, 'protein')}
                      className="col-span-3 text-sm text-right hover:text-accent tabular-nums"
                    >
                      {item.protein}g
                    </button>
                  )}

                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => handleRemove(index)} className="text-text-muted hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-surface border-t border-border p-4">
          <div className="flex justify-between text-sm mb-3">
            <span className="text-text-muted">Total</span>
            <span>
              <span className="font-medium">{totals.calories}</span> kcal ·{' '}
              <span className="font-medium">{totals.protein}</span>g protein
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={items.length === 0}
            className="w-full py-3 rounded-lg font-semibold bg-accent text-bg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Log Meal
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

// Haiku 4.5 for both calls — fast, cheap, sufficient for nutrition estimation.
const HAIKU_ANTHROPIC   = 'claude-haiku-4-5-20251001';
const HAIKU_OPENROUTER  = 'anthropic/claude-haiku-4-5-20251001';

const CLI_PROXY_URL = 'http://localhost:3141/chat';

function getApiConfig() {
  const settings = JSON.parse(localStorage.getItem('pump-ai-settings') || '{}');
  const provider = settings.provider || 'openrouter';
  if (provider === 'cli') return { provider, apiKey: null };
  const apiKey = provider === 'openrouter' ? settings.openrouterKey : settings.anthropicKey;
  if (!apiKey) throw new Error('API key not configured');
  return { provider, apiKey };
}

async function estimateItem(description) {
  const { provider, apiKey } = getApiConfig();
  const prompt = `Estimate calories and protein for: "${description}". Return ONLY valid JSON — no other text: {"name": "clean item name", "calories": 123, "protein": 12}`;

  if (provider === 'cli') {
    const res = await fetch(CLI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], systemPrompt: '', model: 'claude-haiku-4-5-20251001' }),
    });
    if (!res.ok) throw new Error('CLI proxy error — is it running? (node scripts/pump-cli-proxy.cjs)');
    const data = await res.json();
    return parseSingleItem(data.content || '');
  } else if (provider === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'pump-fitness-app' },
      body: JSON.stringify({ model: HAIKU_OPENROUTER, messages: [{ role: 'user', content: prompt }], max_tokens: 80 }),
    });
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    return parseSingleItem(data.choices?.[0]?.message?.content || '');
  } else {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: HAIKU_ANTHROPIC, max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `API error ${res.status}`);
    }
    const data = await res.json();
    return parseSingleItem(data.content?.[0]?.text || '');
  }
}

async function analyzePhoto(base64) {
  const { provider, apiKey } = getApiConfig();
  if (provider === 'cli') throw new Error('Photo analysis not supported with CLI proxy — switch to Anthropic or OpenRouter in Settings');
  const prompt = `Analyze this food photo and estimate calories and protein for each item. Return ONLY valid JSON:
{"items": [{"name": "item name", "calories": 123, "protein": 12}], "totals": {"calories": 123, "protein": 12}}`;

  if (provider === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'pump-fitness-app' },
      body: JSON.stringify({
        model: HAIKU_OPENROUTER,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: base64 } }] }],
        max_tokens: 500,
      }),
    });
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    return parsePhotoResponse(data.choices?.[0]?.message?.content || '');
  } else {
    const base64Data = base64.split(',')[1];
    const mediaType = base64.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: HAIKU_ANTHROPIC, max_tokens: 500,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } }] }],
      }),
    });
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    return parsePhotoResponse(data.content?.[0]?.text || '');
  }
}

function parseSingleItem(content) {
  const match = content.match(/\{[^}]+\}/);
  if (!match) throw new Error('Could not parse response');
  const parsed = JSON.parse(match[0]);
  if (!parsed.name || parsed.calories === undefined) throw new Error('Invalid response');
  return { name: parsed.name, calories: parseInt(parsed.calories) || 0, protein: parseInt(parsed.protein) || 0 };
}

function parsePhotoResponse(content) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse response');
  return JSON.parse(match[0]);
}

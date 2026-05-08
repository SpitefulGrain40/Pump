import { useState, useRef } from 'react';
import { X, Camera, Image, Loader2, Plus, Trash2 } from 'lucide-react';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useSettings } from '../hooks/useSettings';

export default function MealLogger({ onClose }) {
  const { logMeal } = useNutritionLogs();
  const { isConfigured } = useSettings();
  const fileInputRef = useRef(null);

  const [items, setItems] = useState([{ name: '', calories: '', protein: '' }]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [photoAnalyzed, setPhotoAnalyzed] = useState(false);

  const handleAddItem = () => {
    setItems([...items, { name: '', calories: '', protein: '' }]);
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isConfigured()) {
      setError('Configure AI provider in Settings first');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const base64 = await fileToBase64(file);
      const response = await analyzePhoto(base64);

      if (response.items && response.items.length > 0) {
        setItems(response.items.map((item) => ({
          name: item.name || '',
          calories: item.calories?.toString() || '',
          protein: item.protein?.toString() || '',
        })));
        setPhotoAnalyzed(true);
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze photo');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const validItems = items.filter((item) => item.name && item.calories);
    if (validItems.length === 0) return;

    const formattedItems = validItems.map((item) => ({
      name: item.name,
      calories: parseInt(item.calories) || 0,
      protein: parseInt(item.protein) || 0,
    }));

    const totals = formattedItems.reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        protein: acc.protein + item.protein,
      }),
      { calories: 0, protein: 0 }
    );

    logMeal(formattedItems, totals, false);
    onClose();
  };

  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + (parseInt(item.calories) || 0),
      protein: acc.protein + (parseInt(item.protein) || 0),
    }),
    { calories: 0, protein: 0 }
  );

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] sm:max-h-[90vh] mb-16 sm:mb-0 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="font-semibold">Log Meal</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Photo buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing}
              className="flex-1 flex items-center justify-center gap-2 bg-surface-light py-3 rounded-lg text-sm disabled:opacity-50"
            >
              {isAnalyzing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Camera size={18} />
              )}
              {isAnalyzing ? 'Analyzing...' : 'Photo'}
            </button>
            <button
              onClick={() => {
                fileInputRef.current.removeAttribute('capture');
                fileInputRef.current?.click();
              }}
              disabled={isAnalyzing}
              className="flex-1 flex items-center justify-center gap-2 bg-surface-light py-3 rounded-lg text-sm disabled:opacity-50"
            >
              <Image size={18} />
              Gallery
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              className="hidden"
            />
          </div>

          {error && (
            <div className="bg-danger/20 text-danger text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {/* Photo analyzed success message */}
          {photoAnalyzed && (
            <div className="bg-accent/20 text-accent text-sm p-3 rounded-lg mb-4 flex items-center justify-between">
              <span>Photo analyzed! Review items below.</span>
            </div>
          )}

          {/* Manual entry */}
          <form id="meal-form" onSubmit={handleSubmit} className="space-y-3">
            {/* Header row */}
            <div className="grid grid-cols-12 gap-2 text-xs text-text-muted px-1">
              <div className="col-span-5">Item</div>
              <div className="col-span-3">Calories</div>
              <div className="col-span-3">Protein</div>
              <div className="col-span-1"></div>
            </div>

            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  placeholder="Food item"
                  value={item.name}
                  onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                  className="col-span-5 bg-bg border border-border rounded px-2 py-2 text-sm focus:outline-none focus:border-accent"
                />
                <input
                  type="number"
                  placeholder="kcal"
                  value={item.calories}
                  onChange={(e) => handleItemChange(index, 'calories', e.target.value)}
                  className="col-span-3 bg-bg border border-border rounded px-2 py-2 text-sm focus:outline-none focus:border-accent"
                />
                <input
                  type="number"
                  placeholder="g"
                  value={item.protein}
                  onChange={(e) => handleItemChange(index, 'protein', e.target.value)}
                  className="col-span-3 bg-bg border border-border rounded px-2 py-2 text-sm focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className="col-span-1 text-text-muted hover:text-danger"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddItem}
              className="flex items-center gap-1 text-sm text-accent"
            >
              <Plus size={16} />
              Add item
            </button>
          </form>
        </div>

        {/* Fixed footer with totals and submit */}
        <div className="shrink-0 bg-surface border-t border-border p-4">
          <div className="flex justify-between text-sm mb-3">
            <span className="text-text-muted">Total</span>
            <span>
              <span className="font-medium">{totals.calories}</span> kcal ·{' '}
              <span className="font-medium">{totals.protein}</span>g protein
            </span>
          </div>
          <button
            type="submit"
            form="meal-form"
            disabled={items.every((i) => !i.name || !i.calories)}
            className={`w-full py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
              photoAnalyzed && !items.every((i) => !i.name || !i.calories)
                ? 'bg-accent text-bg'
                : 'bg-accent text-bg'
            }`}
          >
            {photoAnalyzed ? 'Save Meal' : 'Log Meal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

async function analyzePhoto(base64) {
  const settings = JSON.parse(localStorage.getItem('pump-ai-settings') || '{}');
  const provider = settings.provider || 'openrouter';
  const apiKey = provider === 'openrouter' ? settings.openrouterKey : settings.anthropicKey;
  const model = provider === 'openrouter' ? settings.model : settings.anthropicModel;

  if (!apiKey) throw new Error('API key not configured');

  const prompt = `Analyze this food photo and estimate calories and protein for each item. Return ONLY valid JSON in this exact format:
{"items": [{"name": "item name", "calories": 123, "protein": 12}], "totals": {"calories": 123, "protein": 12}}`;

  if (provider === 'openrouter') {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'pump-fitness-app',
      },
      body: JSON.stringify({
        model: model || 'anthropic/claude-sonnet-4-6',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: base64 } },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) throw new Error('API request failed');
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return parseJSON(content);
  } else {
    const base64Data = base64.split(',')[1];
    const mediaType = base64.match(/data:([^;]+);/)?.[1] || 'image/jpeg';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) throw new Error('API request failed');
    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    return parseJSON(content);
  }
}

function parseJSON(content) {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse response');
  return JSON.parse(jsonMatch[0]);
}

import { useState, useRef } from 'react';
import { X, Camera, Image, Loader2, Check, Trash2, Bookmark, ScanBarcode } from 'lucide-react';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useSettings } from '../hooks/useSettings';
import { useFoodLibrary } from '../hooks/useFoodLibrary';
import { parseFoodInput, normalizeUnit, scaleFood, round1 } from '../utils/foodLibrary';
import { resolveNutrition, resolveFromPhoto } from '../utils/nutritionResolver';
import { createLibraryFood } from '../utils/dataSchemas';
import { detectBarcodeFromImage } from '../utils/barcodeScan';
import { lookupBarcode } from '../utils/openFoodFacts';
import FoodSuggestions from './food/FoodSuggestions';
import QuantitySheet from './food/QuantitySheet';

export default function MealLogger({ onClose }) {
  const { logMeal } = useNutritionLogs();
  const { isConfigured } = useSettings();
  const { foods, saveFood, saveMeal, touch, search } = useFoodLibrary();
  const fileInputRef = useRef(null);
  const barcodeInputRef = useRef(null);
  const draftInputRef = useRef(null);

  const [items, setItems] = useState([]);
  const [pendingItems, setPendingItems] = useState([]); // photo items awaiting note + AI call
  const [confirmingIndex, setConfirmingIndex] = useState(null);
  const [draft, setDraft] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState(null);
  const [editField, setEditField] = useState(null); // { index, field }
  const [editValue, setEditValue] = useState('');
  const [quantityFood, setQuantityFood] = useState(null); // { food, initialQuantity } | null
  const [namingMeal, setNamingMeal] = useState(false);
  const [mealName, setMealName] = useState('');
  const [savedFlash, setSavedFlash] = useState(null); // item index that just got saved

  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + (Number(item.calories) || 0),
      protein: acc.protein + (Number(item.protein) || 0),
      carbs: acc.carbs + (Number(item.carbs) || 0),
      fat: acc.fat + (Number(item.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const suggestions = draft.trim().length >= 2
    ? search(parseFoodInput(draft).name)
    : { foods: [], meals: [] };

  const addScaledItem = (item) => {
    setItems((prev) => [...prev, item]);
    setDraft('');
    setQuantityFood(null);
    draftInputRef.current?.focus();
  };

  // Pick a resolved food: honour an inline-parsed quantity when its unit matches
  // the food's base unit, else open the quantity sheet (pre-filled from a
  // word-quantity multiplier — "half a portion of..." — when one was given).
  const pickFood = (food) => {
    const parsed = parseFoodInput(draft);
    if (parsed.quantity && (!parsed.unit || normalizeUnit(parsed.unit) === normalizeUnit(food.base.unit))) {
      touch(food.id);
      addScaledItem({ name: food.name, quantity: parsed.quantity, unit: food.base.unit, ...scaleFood(food, parsed.quantity), source: food.source });
    } else if (parsed.quantityMultiplier != null) {
      setQuantityFood({ food, initialQuantity: round1(parsed.quantityMultiplier * food.base.amount) });
    } else {
      setQuantityFood({ food, initialQuantity: parsed.quantity ?? food.base.amount });
    }
  };

  const pickMeal = (meal) => {
    touch(meal.id);
    setItems((prev) => [...prev, ...meal.components.map((c) => ({ ...c, source: 'manual' }))]);
    setDraft('');
    draftInputRef.current?.focus();
  };

  const handleEstimate = async () => {
    if (!draft.trim() || estimating) return;
    setError(null);
    const parsed = parseFoodInput(draft.trim());
    // Tier 1–3: resolve against library → CoFID → OFF before spending AI tokens.
    setEstimating(true);
    try {
      const resolved = await resolveNutrition({ query: parsed.name, library: foods });
      if (resolved) { pickFood(resolved.food); return; }
      // Tier 4: AI estimate on the whole phrase.
      if (!isConfigured()) { setError('Configure AI provider in Settings first'); return; }
      const item = await estimateItem(draft.trim());
      setItems((prev) => [...prev, item]);
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
    setItems((prev) => prev.map((item, i) =>
      i === editField.index ? { ...item, [editField.field]: val } : item
    ));
    setEditField(null);
  };

  const saveItemToLibrary = (item, index) => {
    // The item's macros are for its logged quantity → store as a per-that-amount base food.
    const base = { amount: item.quantity || 1, unit: item.unit || 'serving' };
    saveFood(createLibraryFood({
      name: item.name, base,
      source: item.source === 'ai' ? 'manual' : (item.source || 'manual'),
      calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
    }));
    setSavedFlash(index);
    setTimeout(() => setSavedFlash((cur) => (cur === index ? null : cur)), 1500);
  };

  const doSaveMeal = () => {
    if (!mealName.trim() || items.length === 0) return;
    saveMeal(mealName.trim(), items);
    setMealName('');
    setNamingMeal(false);
  };

  const updatePendingNote = (index, value) => {
    setPendingItems((prev) => prev.map((item, i) => i === index ? { ...item, note: value } : item));
  };

  // Photo → identify → cross-reference DB → quantity sheet (or estimate for meals).
  const confirmPortion = async (index) => {
    const pending = pendingItems[index];
    if (!pending.note.trim() || confirmingIndex === index) return;
    setConfirmingIndex(index);
    setError(null);
    try {
      const ident = await identifyPhoto(pending.base64, pending.note.trim());
      if (ident.type === 'meal') {
        const m = ident.mealEstimate || {};
        setItems((prev) => [...prev, {
          name: ident.name || 'Meal', quantity: 1, unit: 'serving',
          calories: m.calories || 0, protein: m.protein || 0, carbs: m.carbs || 0, fat: m.fat || 0, source: 'ai',
        }]);
        setPendingItems((prev) => prev.filter((_, i) => i !== index));
        return;
      }
      const resolved = await resolveFromPhoto(ident, { library: foods });
      if (!resolved) { setError('Could not read that — type the food instead'); return; }
      setPendingItems((prev) => prev.filter((_, i) => i !== index));
      setQuantityFood({ food: resolved.food, initialQuantity: resolved.food.base.amount });
    } catch (err) {
      setError(err.message || 'Failed to analyze photo');
    } finally {
      setConfirmingIndex(null);
    }
  };

  const dismissPending = (index) => {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isConfigured()) { setError('Configure AI provider in Settings first'); return; }
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      setPendingItems((prev) => [...prev, { base64, note: '' }]);
    } catch {
      setError('Failed to read photo');
    } finally {
      e.target.value = '';
    }
  };

  const handleBarcodePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const img = await createImageBitmap(file);
      const code = await detectBarcodeFromImage(img);
      if (!code) { setError('No barcode detected — try again or type the food'); return; }
      const food = await lookupBarcode(code);
      if (!food) { setError('Product not in Open Food Facts — type it or snap the label'); return; }
      setQuantityFood({ food, initialQuantity: food.base.amount });
    } catch {
      setError('Barcode scan failed');
    } finally {
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
              placeholder="e.g. 320g roast beef, 2 eggs..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleDraftKey}
              enterKeyHint="send"
              disabled={estimating}
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              onClick={() => barcodeInputRef.current?.click()}
              disabled={estimating}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-light text-text-muted hover:text-text disabled:opacity-40 shrink-0"
              title="Scan barcode"
            >
              <ScanBarcode size={16} />
            </button>
            <button
              onClick={() => { fileInputRef.current.setAttribute('capture', 'environment'); fileInputRef.current?.click(); }}
              disabled={estimating}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-light text-text-muted hover:text-text disabled:opacity-40 shrink-0"
              title="Take photo"
            >
              <Camera size={16} />
            </button>
            <button
              onClick={() => { fileInputRef.current.removeAttribute('capture'); fileInputRef.current?.click(); }}
              disabled={estimating}
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
          <input
            ref={barcodeInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleBarcodePhoto}
            className="hidden"
          />

          {/* Quantity sheet (base-unit entry) OR live suggestions */}
          {quantityFood ? (
            <QuantitySheet
              food={quantityFood.food}
              initialQuantity={quantityFood.initialQuantity}
              onConfirm={(item) => { if (quantityFood.food.id) touch(quantityFood.food.id); addScaledItem(item); }}
              onCancel={() => setQuantityFood(null)}
              onEstimateQuantity={isConfigured() ? (description) => estimatePortionQuantity(quantityFood.food, description) : undefined}
            />
          ) : (
            <FoodSuggestions results={suggestions} onPickFood={pickFood} onPickMeal={pickMeal} />
          )}

          {/* Pending photo items — awaiting portion note + AI call */}
          {pendingItems.length > 0 && (
            <div className="space-y-2">
              {pendingItems.map((item, i) => (
                <div key={i} className="bg-bg rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Camera size={13} className="text-text-muted shrink-0" />
                    <span className="text-xs text-text-muted flex-1">Photo — how much did you have?</span>
                    <button onClick={() => dismissPending(i)} className="text-text-muted hover:text-danger">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. half a pack, a big bowl, 2 scoops"
                      value={item.note}
                      onChange={(e) => updatePendingNote(i, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && item.note.trim()) confirmPortion(i); }}
                      enterKeyHint="send"
                      autoFocus={i === 0}
                      disabled={confirmingIndex === i}
                      className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
                    />
                    <button
                      onClick={() => confirmPortion(i)}
                      disabled={!item.note.trim() || confirmingIndex === i}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-bg disabled:opacity-40 shrink-0"
                    >
                      {confirmingIndex === i
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Check size={14} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="bg-danger/20 text-danger text-sm p-3 rounded-lg">{error}</div>
          )}

          {/* Confirmed items */}
          {items.length > 0 && (
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-1 text-xs text-text-muted px-2 pb-1">
                <div className="col-span-5">Item</div>
                <div className="col-span-2 text-right">kcal</div>
                <div className="col-span-3 text-right">protein</div>
                <div className="col-span-2" />
              </div>
              {items.map((item, index) => (
                <div key={index} className="bg-bg rounded-lg px-2 py-2 space-y-1">
                  <div className="grid grid-cols-12 gap-1 items-center">
                    <span className="col-span-5 text-sm truncate" title={item.name}>{item.name}</span>

                    {editField?.index === index && editField?.field === 'calories' ? (
                      <input
                        autoFocus
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
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
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
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

                    <div className="col-span-2 flex justify-end gap-1">
                      <button
                        onClick={() => saveItemToLibrary(item, index)}
                        className={savedFlash === index ? 'text-accent' : 'text-text-muted hover:text-accent'}
                        title="Save to my foods"
                      >
                        {savedFlash === index ? <Check size={14} /> : <Bookmark size={14} />}
                      </button>
                      <button onClick={() => handleRemove(index)} className="text-text-muted hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-text-muted flex gap-3 pl-1">
                    <span>C {item.carbs ?? '–'}g</span>
                    <span>F {item.fat ?? '–'}g</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-surface border-t border-border p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Total</span>
            <span>
              <span className="font-medium">{Math.round(totals.calories)}</span> kcal ·{' '}
              <span className="font-medium">{Math.round(totals.protein)}</span>g P ·{' '}
              {Math.round(totals.carbs)}g C · {Math.round(totals.fat)}g F
            </span>
          </div>

          {namingMeal && (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name this meal (e.g. My usual breakfast)"
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSaveMeal()}
                enterKeyHint="done"
                autoFocus
                className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <button onClick={doSaveMeal} disabled={!mealName.trim()}
                className="px-3 rounded-lg bg-accent text-bg text-sm disabled:opacity-40">Save</button>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setNamingMeal((v) => !v)}
              disabled={items.length === 0}
              className="px-3 py-3 rounded-lg text-sm bg-surface-light text-text-muted hover:text-text disabled:opacity-40"
              title="Save these items as a reusable meal"
            >
              Save meal
            </button>
            <button
              onClick={handleSubmit}
              disabled={items.length === 0}
              className="flex-1 py-3 rounded-lg font-semibold bg-accent text-bg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Log Meal
            </button>
          </div>
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
const HAIKU_ANTHROPIC = 'claude-haiku-4-5-20251001';
const HAIKU_OPENROUTER = 'anthropic/claude-haiku-4-5-20251001';

const CLI_PROXY_URL = 'http://localhost:3141/chat';

function getApiConfig() {
  const settings = JSON.parse(localStorage.getItem('pump-ai-settings') || '{}');
  const provider = settings.provider || 'openrouter';
  if (provider === 'cli') return { provider, apiKey: null };
  const apiKey = provider === 'openrouter' ? settings.openrouterKey : settings.anthropicKey;
  if (!apiKey) throw new Error('API key not configured');
  return { provider, apiKey };
}

// Shared text-only call across providers — returns the raw response text.
async function callTextModel(prompt, { maxTokens = 150 } = {}) {
  const { provider, apiKey } = getApiConfig();

  if (provider === 'cli') {
    const res = await fetch(CLI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], systemPrompt: '', model: 'claude-haiku-4-5-20251001' }),
    });
    if (!res.ok) throw new Error('CLI proxy error — is it running? (node scripts/pump-cli-proxy.cjs)');
    const data = await res.json();
    return data.content || '';
  } else if (provider === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'pump-fitness-app' },
      body: JSON.stringify({ model: HAIKU_OPENROUTER, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
    });
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } else {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: HAIKU_ANTHROPIC, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `API error ${res.status}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }
}

async function estimateItem(description) {
  const prompt = `Estimate calories and macros for: "${description}". Return ONLY valid JSON — no other text: {"name": "clean item name", "calories": 123, "protein": 12, "carbs": 30, "fat": 5}`;
  const raw = await callTextModel(prompt, { maxTokens: 120 });
  return parseSingleItem(raw);
}

// Estimates ONLY the portion quantity (in the food's base unit) from a free-text
// description — macros stay whatever the DB already resolved, never re-guessed.
async function estimatePortionQuantity(food, description) {
  const unitLabel = food.base.unit === 'g' || food.base.unit === 'ml' ? food.base.unit : food.base.unit;
  const prompt = `For the food "${food.name}", measured in ${unitLabel}, the user describes their portion as: "${description}". Estimate the quantity in ${unitLabel} that best matches (a whole food is roughly ${food.base.amount} ${unitLabel}, use that as a reference scale). Return ONLY valid JSON — no other text: {"quantity": 123}`;
  const raw = await callTextModel(prompt, { maxTokens: 40 });
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not read that portion');
  const parsed = JSON.parse(match[0]);
  const quantity = Number(parsed.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Could not estimate that portion');
  return quantity;
}

// Identify (don't compute) the food in a photo, so the DB can supply the numbers.
async function identifyPhoto(base64, note) {
  const { provider, apiKey } = getApiConfig();
  if (provider === 'cli') throw new Error('Photo not supported with CLI proxy — switch to Anthropic or OpenRouter in Settings');
  const prompt = `Identify the food in this image. The user adds: "${note}".
Return ONLY JSON, no prose:
{"type":"label|packaged|meal",
 "barcode":"digits if a barcode is clearly legible else null",
 "brand":"brand if visible else null",
 "productName":"product or food name",
 "name":"clean food name",
 "servingSize":{"amount":number,"unit":"g|ml|serving"} or null,
 "per100g":{"calories":n,"protein":n,"carbs":n,"fat":n} or null,
 "perServing":{"calories":n,"protein":n,"carbs":n,"fat":n} or null,
 "mealEstimate":{"calories":n,"protein":n,"carbs":n,"fat":n} or null}
Rules: only fill per100g/perServing if a nutrition label is visible — transcribe, do not calculate. Only fill mealEstimate for type:meal, estimating for the stated portion.`;
  const raw = await callVisionModel(prompt, base64, provider, apiKey);
  return parseIdentification(raw);
}

async function callVisionModel(prompt, base64, provider, apiKey) {
  if (provider === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'pump-fitness-app' },
      body: JSON.stringify({
        model: HAIKU_OPENROUTER,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: base64 } }] }],
        max_tokens: 300,
      }),
    });
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
  const base64Data = base64.split(',')[1];
  const mediaType = base64.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({
      model: HAIKU_ANTHROPIC, max_tokens: 300,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } }] }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseIdentification(content) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not read the photo');
  return JSON.parse(match[0]);
}

function parseSingleItem(content) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse response');
  const parsed = JSON.parse(match[0]);
  if (!parsed.name || parsed.calories === undefined) throw new Error('Invalid response');
  return {
    name: parsed.name,
    calories: parseInt(parsed.calories) || 0,
    protein: parseInt(parsed.protein) || 0,
    carbs: parseInt(parsed.carbs) || 0,
    fat: parseInt(parsed.fat) || 0,
    source: 'ai',
  };
}

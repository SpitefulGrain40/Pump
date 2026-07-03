import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { scaleFood, parseQuantityWord, round1 } from '../../utils/foodLibrary';

// onEstimateQuantity(description) => Promise<number> — optional AI fallback for
// when the user can't state an amount or a recognised word ("half", "3/4"...).
export default function QuantitySheet({ food, initialQuantity, onConfirm, onCancel, onEstimateQuantity }) {
  const [qty, setQty] = useState(String(initialQuantity ?? food.base.amount));
  const [describing, setDescribing] = useState(false);
  const [description, setDescription] = useState('');
  const [guessing, setGuessing] = useState(false);
  const [guessError, setGuessError] = useState(null);

  const wordMultiplier = parseQuantityWord(qty);
  const quantity = wordMultiplier != null ? round1(wordMultiplier * food.base.amount) : (parseFloat(qty) || 0);
  const scaled = scaleFood(food, quantity);
  const unitLabel = food.base.unit === 'g' || food.base.unit === 'ml' ? food.base.unit : `× ${food.base.unit}`;

  const confirm = () => {
    if (quantity <= 0) return;
    onConfirm({ name: food.name, quantity, unit: food.base.unit, ...scaled, source: food.source });
  };

  const runGuess = async () => {
    if (!description.trim() || guessing) return;
    setGuessing(true);
    setGuessError(null);
    try {
      const estimated = await onEstimateQuantity(description.trim());
      if (!estimated || estimated <= 0) throw new Error('Could not estimate that portion');
      setQty(String(estimated));
      setDescribing(false);
      setDescription('');
    } catch (err) {
      setGuessError(err.message || 'Could not estimate that portion');
    } finally {
      setGuessing(false);
    }
  };

  return (
    <div className="bg-bg rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium flex-1 truncate" title={food.name}>{food.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-text-muted">{food.source}</span>
        <button onClick={onCancel} className="text-text-muted hover:text-danger"><X size={14} /></button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text" inputMode="decimal" value={qty} autoFocus
          placeholder="e.g. 100, half, 3/4"
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirm()}
          enterKeyHint="done"
          className="w-28 bg-surface border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
        />
        <span className="text-sm text-text-muted flex-1">{unitLabel}</span>
        <button onClick={confirm} disabled={quantity <= 0}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-bg disabled:opacity-40 shrink-0">
          <Check size={14} />
        </button>
      </div>

      {onEstimateQuantity && !describing && (
        <button onClick={() => setDescribing(true)} className="text-xs text-text-muted hover:text-accent underline">
          Not sure? Describe the portion instead
        </button>
      )}

      {describing && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. a big handful, about a third of the packet"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && description.trim()) runGuess(); }}
              enterKeyHint="send"
              autoFocus
              disabled={guessing}
              className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <button onClick={runGuess} disabled={!description.trim() || guessing}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-bg disabled:opacity-40 shrink-0">
              {guessing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
          </div>
          {guessError && <div className="text-xs text-danger">{guessError}</div>}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {[['kcal', scaled.calories], ['P', `${scaled.protein}g`], ['C', `${scaled.carbs}g`], ['F', `${scaled.fat}g`]].map(([k, v]) => (
          <div key={k} className="bg-surface rounded py-1.5">
            <div className="text-text-muted">{k}</div>
            <div className="font-medium tabular-nums">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

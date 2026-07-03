import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { scaleFood } from '../../utils/foodLibrary';

export default function QuantitySheet({ food, initialQuantity, onConfirm, onCancel }) {
  const [qty, setQty] = useState(String(initialQuantity ?? food.base.amount));
  const quantity = parseFloat(qty) || 0;
  const scaled = scaleFood(food, quantity);
  const unitLabel = food.base.unit === 'g' || food.base.unit === 'ml' ? food.base.unit : `× ${food.base.unit}`;

  const confirm = () => {
    if (quantity <= 0) return;
    onConfirm({ name: food.name, quantity, unit: food.base.unit, ...scaled, source: food.source });
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
          type="number" inputMode="decimal" value={qty} autoFocus
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirm()}
          className="w-24 bg-surface border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
        />
        <span className="text-sm text-text-muted flex-1">{unitLabel}</span>
        <button onClick={confirm} disabled={quantity <= 0}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-bg disabled:opacity-40 shrink-0">
          <Check size={14} />
        </button>
      </div>
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

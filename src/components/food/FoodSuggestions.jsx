import { Star, Utensils } from 'lucide-react';

// results: { foods: food[], meals: meal[] }. onPickFood(food), onPickMeal(meal).
export default function FoodSuggestions({ results, onPickFood, onPickMeal }) {
  const { foods = [], meals = [] } = results || {};
  if (foods.length === 0 && meals.length === 0) return null;
  return (
    <div className="bg-bg border border-border rounded-lg divide-y divide-border overflow-hidden">
      {meals.map((m) => (
        <button key={m.id} onClick={() => onPickMeal(m)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-light">
          <Utensils size={13} className="text-accent shrink-0" />
          <span className="text-sm flex-1 truncate">{m.name}</span>
          <span className="text-[10px] uppercase text-text-muted">meal</span>
        </button>
      ))}
      {foods.map((f) => (
        <button key={f.id} onClick={() => onPickFood(f)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-light">
          {f.source === 'manual' && <Star size={13} className="text-accent shrink-0" />}
          <span className="text-sm flex-1 truncate">{f.name}</span>
          <span className="text-xs text-text-muted tabular-nums">{f.calories} / {f.protein}g</span>
          <span className="text-[10px] uppercase text-text-muted">{f.source}</span>
        </button>
      ))}
    </div>
  );
}

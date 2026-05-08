import { useState } from 'react';
import { X, Scale } from 'lucide-react';
import { useWeightHistory } from '../hooks/useWeightHistory';
import { useUserProfile } from '../hooks/useUserProfile';

export default function WeightModal({ onClose }) {
  const { logWeight, getLatestWeight } = useWeightHistory();
  const { profile, updateProfile } = useUserProfile();
  const latest = getLatestWeight();

  const [weight, setWeight] = useState(latest?.weight?.toString() || profile.currentWeight.toString());

  const handleSubmit = (e) => {
    e.preventDefault();
    const weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum < 30 || weightNum > 300) return;

    logWeight(weightNum);
    updateProfile({ currentWeight: weightNum });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2">
            <Scale size={20} className="text-accent" />
            Log Weight
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-sm text-text-muted block mb-2">Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-2xl font-bold text-center focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>

          {latest && (
            <p className="text-sm text-text-muted text-center">
              Last: {latest.weight} kg on {latest.date}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-accent text-bg py-3 rounded-lg font-semibold"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}

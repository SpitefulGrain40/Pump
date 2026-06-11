import { useState } from 'react';
import { X, Ruler } from 'lucide-react';
import { useMeasurementHistory } from '../hooks/useMeasurementHistory';
import { useUserProfile } from '../hooks/useUserProfile';

export default function MeasurementModal({ onClose }) {
  const { logMeasurement } = useMeasurementHistory();
  const { profile, updateProfile } = useUserProfile();

  const [waist, setWaist] = useState(profile.waistCircumference?.toString() || '');
  const [neck, setNeck] = useState(profile.neckCircumference?.toString() || '');
  const [hip, setHip] = useState(profile.hipCircumference?.toString() || '');
  const [bodyFat, setBodyFat] = useState((profile.bodyFatManual ?? '').toString());

  const handleSubmit = (e) => {
    e.preventDefault();
    const fields = {
      waist: waist ? parseFloat(waist) : null,
      neck: neck ? parseFloat(neck) : null,
      hip: hip ? parseFloat(hip) : null,
      bodyFatManual: bodyFat ? parseFloat(bodyFat) : null,
    };
    logMeasurement(fields);
    // Keep the profile "current" values in sync with the latest snapshot.
    const profileUpdates = {};
    if (fields.waist != null) profileUpdates.waistCircumference = fields.waist;
    if (fields.neck != null) profileUpdates.neckCircumference = fields.neck;
    if (fields.hip != null) profileUpdates.hipCircumference = fields.hip;
    if (fields.bodyFatManual != null) profileUpdates.bodyFatManual = fields.bodyFatManual;
    if (Object.keys(profileUpdates).length) updateProfile(profileUpdates);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2">
            <Ruler size={20} className="text-accent" />
            Log Measurements
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-text-muted">
              Waist (cm)
              <input type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)}
                className="mt-1 w-full bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent" autoFocus />
            </label>
            <label className="text-sm text-text-muted">
              Neck (cm)
              <input type="number" step="0.1" value={neck} onChange={(e) => setNeck(e.target.value)}
                className="mt-1 w-full bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
            </label>
            {profile.gender === 'female' && (
              <label className="text-sm text-text-muted">
                Hips (cm)
                <input type="number" step="0.1" value={hip} onChange={(e) => setHip(e.target.value)}
                  className="mt-1 w-full bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
              </label>
            )}
            <label className="text-sm text-text-muted">
              Body Fat % (optional)
              <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)}
                className="mt-1 w-full bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
            </label>
          </div>
          <p className="text-xs text-text-muted">
            Body fat is computed from waist/neck{profile.gender === 'female' ? '/hips' : ''} (Navy method) if you leave the field blank.
          </p>
          <button type="submit" className="w-full bg-accent text-bg py-3 rounded-lg font-semibold">
            Save
          </button>
        </form>
      </div>
    </div>
  );
}

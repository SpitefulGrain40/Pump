import { useState } from 'react';
import { Info } from 'lucide-react';

// Inline info toggle — renders a circled "i" button that expands/collapses a panel.
// id: unique string for this toggle. color: left-border accent (default zinc-600).
export default function InfoToggle({ id, color = '#52525b', children }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: '#2a2a2a' }}
        aria-expanded={open}
        aria-label="More information"
      >
        <Info size={11} className="text-zinc-400" />
      </button>
      {open && (
        <div
          className="mt-2 px-3 py-2 rounded-lg text-[11px] leading-relaxed text-zinc-400"
          style={{ background: '#141414', borderLeft: `3px solid ${color}` }}
        >
          {children}
        </div>
      )}
    </>
  );
}

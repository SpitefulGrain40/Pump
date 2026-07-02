import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// Tappable row that expands to reveal children (sparkline chart, detail, etc.)
export default function ExpandableRow({
  dotColor,
  label,
  value,
  change,
  changePositive,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        className="w-full flex items-center gap-3 py-2.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: dotColor }}
        />
        <span className="flex-1 text-sm text-white">{label}</span>
        {change && (
          <span className={`text-xs font-medium mr-1 ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
            {change}
          </span>
        )}
        <span className="text-sm font-semibold text-white mr-1">{value}</span>
        {open ? (
          <ChevronDown size={14} className="text-zinc-600 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-zinc-600 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="pb-3 pl-5">
          {children}
        </div>
      )}
    </div>
  );
}

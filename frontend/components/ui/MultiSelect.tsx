import React, { useState, useRef, useEffect, useMemo } from 'react';
import { XMarkIcon } from '../icons';
import { getUserAvatarUrl } from '../../utils/userAvatar';

interface MultiSelectOption {
  id: string;
  name: string;
  avatarUrl?: string | null;
  description?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  size?: 'md' | 'lg';
  optionStatusMap?: Record<string, 'active' | 'inactive'>;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select options...',
  className = '',
  size = 'md',
  optionStatusMap = {},
}) => {
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  const handleSelect = (optionId: string) => {
    if (value.includes(optionId)) {
      onChange(value.filter(id => id !== optionId));
    } else {
      onChange([...value, optionId]);
    }
  };

  const handleRemove = (optionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(id => id !== optionId));
  };

  const selectedOptions = options.filter(option => value.includes(option.id));
  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => option.name.toLowerCase().includes(term));
  }, [options, search]);

  return (
    <div className={`relative ${className}`}>
      <div className="w-full overflow-hidden rounded-2xl border bg-[var(--modal-surface-bg)] shadow-xl" style={{ borderColor: 'var(--modal-border)' }}>
        <div className="border-b px-3 py-2" style={{ borderColor: 'var(--modal-border)', background: 'rgba(0,0,0,0.02)' }}>
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search assignees..."
            className="w-full bg-transparent px-2 py-1 text-sm focus:outline-none"
            style={{ color: 'var(--modal-text)', '--placeholder-color': 'var(--modal-placeholder)' } as React.CSSProperties}
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {filteredOptions.length > 0 ? filteredOptions.map(option => {
            const isSelected = value.includes(option.id);
            const status = optionStatusMap[option.id];
            const isActive = status === 'active';
            const isInactive = status === 'inactive';
            const avatarUrl = getUserAvatarUrl(option);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option.id)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-black/5 ${isSelected ? 'font-bold' : ''
                  } ${isActive ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : ''} ${isInactive ? 'opacity-60' : ''}`}
                style={{ color: isSelected ? 'var(--modal-accent)' : 'var(--modal-text)' }}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border ${isSelected
                      ? 'border-primary'
                      : isActive
                        ? 'border-emerald-400/70'
                        : ''
                      } bg-slate-100 text-xs font-semibold uppercase text-black`}
                    style={{ borderColor: isSelected ? 'var(--modal-accent)' : 'var(--modal-border)' }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={option.name} className="h-full w-full object-cover" />
                    ) : (
                      option.name.slice(0, 2)
                    ) || '??'}
                  </span>
                  <span className="flex flex-col">
                    <span className="flex items-center gap-2">
                      {option.name}
                      {status && (
                        <span
                          className={`rounded-full border px-2 text-[10px] uppercase tracking-[0.2em] ${status === 'active'
                            ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-700'
                            : 'border-black/10 bg-black/5 text-black/60'
                            }`}
                        >
                          {status === 'active' ? 'Assigned' : 'Available'}
                        </span>
                      )}
                    </span>
                    {option.description && (
                      <span className="text-xs font-normal" style={{ color: 'var(--modal-muted)' }}>{option.description}</span>
                    )}
                  </span>
                </span>
              </button>
            );
          }) : (
            <div className="px-4 py-3 text-sm" style={{ color: 'var(--modal-muted)' }}>No assignees match your search.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiSelect;

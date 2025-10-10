'use client';

import { useState, useEffect } from 'react';

interface ColumnTextFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function ColumnTextFilter({
  value,
  onChange,
  placeholder = 'Filter...',
}: ColumnTextFilterProps) {
  const [localValue, setLocalValue] = useState(value);

  // Sync with external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounce the onChange to avoid too many updates
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [localValue, value, onChange]);

  return (
    <input
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: '100%',
        padding: '4px 8px',
        fontSize: '12px',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        color: 'white',
        outline: 'none',
        marginTop: '4px',
      }}
      onFocus={(e) => {
        e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)';
      }}
      onBlur={(e) => {
        e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
      }}
    />
  );
}

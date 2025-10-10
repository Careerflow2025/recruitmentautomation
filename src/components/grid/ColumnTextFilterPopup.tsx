'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ColumnTextFilterPopupProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  triggerRef: React.RefObject<HTMLElement>;
  onClose: () => void;
}

export default function ColumnTextFilterPopup({
  value,
  onChange,
  placeholder = 'Filter...',
  triggerRef,
  onClose,
}: ColumnTextFilterPopupProps) {
  const [localValue, setLocalValue] = useState(value);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position based on trigger element
  useEffect(() => {
    if (triggerRef.current && mounted) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [triggerRef, mounted]);

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

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, triggerRef]);

  if (!mounted) return null;

  const popupElement = (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 100000,
        backgroundColor: 'white',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
        padding: '8px',
        minWidth: '200px',
      }}
    >
      <input
        autoFocus
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: '14px',
          border: '1px solid #e2e8f0',
          borderRadius: '4px',
          outline: 'none',
          fontFamily: 'inherit',
          color: '#000000',
          backgroundColor: '#ffffff',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = '#3b82f6';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = '#e2e8f0';
        }}
      />
      {localValue && (
        <button
          onClick={() => {
            setLocalValue('');
            onChange('');
          }}
          style={{
            marginTop: '8px',
            width: '100%',
            padding: '6px 12px',
            fontSize: '12px',
            color: '#64748b',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f1f5f9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#f8fafc';
          }}
        >
          Clear Filter
        </button>
      )}
    </div>
  );

  return createPortal(popupElement, document.body);
}

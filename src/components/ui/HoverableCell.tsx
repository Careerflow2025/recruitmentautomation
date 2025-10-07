'use client';

import React, { useState } from 'react';

interface HoverableCellProps {
  value: string | null | undefined;
  label: string; // e.g., "First Name", "Phone", etc.
  onCopy?: () => void;
}

export const HoverableCell: React.FC<HoverableCellProps> = ({ value, label, onCopy }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayValue = value || '-';
  const hasValue = value && value.length > 0;

  const handleCopy = () => {
    if (hasValue && value) {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (onCopy) onCopy();
    }
  };

  return (
    <>
      <div
        className="relative group cursor-pointer"
        title={hasValue ? value : undefined}
        onClick={() => hasValue && setShowPopup(true)}
      >
        <span className="truncate block hover:text-blue-600">
          {displayValue}
        </span>
      </div>

      {showPopup && hasValue && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50"
          onClick={() => setShowPopup(false)}
        >
          <div
            className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">{label}</h3>
              <button
                onClick={() => setShowPopup(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="bg-gray-100 p-4 rounded border border-gray-300 mb-4 break-words">
              <p className="text-sm text-gray-900">{value}</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold"
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => setShowPopup(false)}
                className="px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

'use client';

import { useState, useRef, useEffect } from 'react';

interface ColumnFilterProps {
  columnKey: string;
  columnName: string;
  options: string[];
  selectedValues: string[];
  onFilterChange: (values: string[]) => void;
}

export default function ColumnFilter({
  columnKey,
  columnName,
  options,
  selectedValues,
  onFilterChange,
}: ColumnFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Filter options by search text
  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(searchText.toLowerCase())
  );

  // Toggle single option
  const toggleOption = (option: string) => {
    if (selectedValues.includes(option)) {
      onFilterChange(selectedValues.filter((v) => v !== option));
    } else {
      onFilterChange([...selectedValues, option]);
    }
  };

  // Select all
  const selectAll = () => {
    onFilterChange(options);
  };

  // Clear all
  const clearAll = () => {
    onFilterChange([]);
  };

  const hasActiveFilter = selectedValues.length > 0 && selectedValues.length < options.length;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Filter Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`filter-button ${hasActiveFilter ? 'filter-button-active' : ''}`}
        title={`Filter ${columnName}`}
      >
        🔍
        {hasActiveFilter && <span className="filter-badge">{selectedValues.length}</span>}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="filter-dropdown">
          {/* Search */}
          <div className="filter-search">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={`Search ${columnName}...`}
              className="filter-search-input"
              autoFocus
            />
          </div>

          {/* Actions */}
          <div className="filter-actions">
            <button onClick={selectAll} className="filter-action-button">
              Select All
            </button>
            <button onClick={clearAll} className="filter-action-button">
              Clear All
            </button>
          </div>

          {/* Options List */}
          <div className="filter-options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <label key={option} className="filter-option">
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option)}
                    onChange={() => toggleOption(option)}
                    className="filter-checkbox"
                  />
                  <span className="filter-option-label">{option || '(Empty)'}</span>
                </label>
              ))
            ) : (
              <div className="filter-empty">
                No matches for "{searchText}"
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="filter-footer">
            <button onClick={() => setIsOpen(false)} className="filter-close-button">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

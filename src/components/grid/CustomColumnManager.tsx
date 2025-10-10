'use client';

import { useState } from 'react';
import { createCustomColumn, CustomColumn } from '@/lib/custom-columns';

interface CustomColumnManagerProps {
  tableName: 'candidates' | 'clients';
  onColumnAdded: () => void;
}

export default function CustomColumnManager({ tableName, onColumnAdded }: CustomColumnManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [columnName, setColumnName] = useState('');
  const [columnLabel, setColumnLabel] = useState('');
  const [columnType, setColumnType] = useState<'text' | 'number' | 'date'>('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate
      if (!columnName.trim()) {
        throw new Error('Column name is required');
      }
      if (!columnLabel.trim()) {
        throw new Error('Column label is required');
      }

      // Create column name from label (lowercase, replace spaces with underscores)
      const safeName = columnLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

      await createCustomColumn(tableName, safeName, columnLabel, columnType);

      // Reset form
      setColumnName('');
      setColumnLabel('');
      setColumnType('text');
      setIsOpen(false);

      // Notify parent
      onColumnAdded();
    } catch (err: any) {
      console.error('Error creating custom column:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="grid-toolbar-button"
        title="Add a custom column"
      >
        ➕ Add Column
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Add Custom Column</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Column Label (what users see)
            </label>
            <input
              type="text"
              value={columnLabel}
              onChange={(e) => setColumnLabel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., LinkedIn URL, Skills, Rating"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              This will appear as the column header
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Column Type
            </label>
            <select
              value={columnType}
              onChange={(e) => setColumnType(e.target.value as 'text' | 'number' | 'date')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
            </select>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setError(null);
                setColumnName('');
                setColumnLabel('');
                setColumnType('text');
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
              disabled={loading || !columnLabel.trim()}
            >
              {loading ? 'Creating...' : 'Create Column'}
            </button>
          </div>
        </form>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-xs text-blue-800">
            <strong>💡 Tip:</strong> Custom columns appear at the end of the grid. You can drag them to reorder.
          </p>
        </div>
      </div>
    </div>
  );
}

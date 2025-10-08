'use client';

import { useState } from 'react';
import { CustomColumn, addCustomColumn, deleteCustomColumn } from '@/lib/custom-columns';

interface ColumnManagerProps {
  tableName: 'candidates' | 'clients';
  customColumns: CustomColumn[];
  onColumnsChange: () => void;
}

export default function ColumnManager({ tableName, customColumns, onColumnsChange }: ColumnManagerProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [newColumnType, setNewColumnType] = useState<'text' | 'number' | 'date' | 'email' | 'phone' | 'url'>('text');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddColumn = async () => {
    if (!newColumnLabel.trim()) {
      setError('Column label is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await addCustomColumn(tableName, newColumnLabel.trim(), newColumnType);
      setNewColumnLabel('');
      setNewColumnType('text');
      setIsAddModalOpen(false);
      onColumnsChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add column');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteColumn = async (columnId: string, columnLabel: string) => {
    if (!confirm(`Are you sure you want to delete the column "${columnLabel}"? This will remove all data in this column.`)) {
      return;
    }

    try {
      await deleteCustomColumn(columnId);
      onColumnsChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete column');
    }
  };

  return (
    <>
      {/* Add Column Button */}
      <button
        onClick={() => setIsAddModalOpen(true)}
        className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors"
      >
        ➕ Add Column
      </button>

      {/* Add Column Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add New Column</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Column Name
                </label>
                <input
                  type="text"
                  value={newColumnLabel}
                  onChange={(e) => setNewColumnLabel(e.target.value)}
                  placeholder="e.g., License Number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Column Type
                </label>
                <select
                  value={newColumnType}
                  onChange={(e) => setNewColumnType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="url">URL</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddColumn}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Adding...' : 'Add Column'}
              </button>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewColumnLabel('');
                  setNewColumnType('text');
                  setError(null);
                }}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded hover:bg-gray-300 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Columns List (for delete functionality) */}
      {customColumns.length > 0 && (
        <div className="mt-4 border border-gray-300 rounded-lg p-4 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Custom Columns</h3>
          <div className="space-y-2">
            {customColumns.map((column) => (
              <div key={column.id} className="flex items-center justify-between bg-white px-3 py-2 rounded border border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{column.column_label}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {column.column_type}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteColumn(column.id, column.column_label)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  🗑️ Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

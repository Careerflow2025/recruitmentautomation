'use client';

import { useState } from 'react';
import { CustomColumn, addCustomColumn, deleteCustomColumn, updateCustomColumn } from '@/lib/custom-columns';

interface ColumnManagerProps {
  tableName: 'candidates' | 'clients';
  customColumns: CustomColumn[];
  onColumnsChange: () => void;
}

export default function ColumnManager({ tableName, customColumns, onColumnsChange }: ColumnManagerProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<CustomColumn | null>(null);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [newColumnType, setNewColumnType] = useState<'text' | 'number' | 'date' | 'email' | 'phone' | 'url'>('text');
  const [editColumnLabel, setEditColumnLabel] = useState('');
  const [editColumnType, setEditColumnType] = useState<'text' | 'number' | 'date' | 'email' | 'phone' | 'url'>('text');
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

  const handleEditColumn = (column: CustomColumn) => {
    setEditingColumn(column);
    setEditColumnLabel(column.column_label);
    setEditColumnType(column.column_type);
    setIsEditModalOpen(true);
    setIsListOpen(false);
    setError(null);
  };

  const handleUpdateColumn = async () => {
    if (!editColumnLabel.trim() || !editingColumn) {
      setError('Column label is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updateCustomColumn(editingColumn.id, editColumnLabel.trim(), editColumnType);
      setIsEditModalOpen(false);
      setEditingColumn(null);
      onColumnsChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update column');
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
    <div className="relative">
      {/* Manage Columns Dropdown Button */}
      <div className="flex gap-2">
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded hover:bg-green-700 border border-gray-400"
        >
          ➕ Add Column
        </button>

        {customColumns.length > 0 && (
          <button
            onClick={() => setIsListOpen(!isListOpen)}
            className="px-3 py-1.5 bg-purple-100 text-gray-900 text-sm font-semibold rounded hover:bg-purple-200 border border-gray-400"
          >
            📋 Manage Columns ({customColumns.length})
          </button>
        )}
      </div>

      {/* Dropdown List */}
      {isListOpen && customColumns.length > 0 && (
        <div className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-2xl rounded-lg z-50 min-w-[400px]">
          <div className="p-3 border-b-2 border-gray-300 bg-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Custom Columns</h3>
            <button
              onClick={() => setIsListOpen(false)}
              className="text-gray-700 hover:text-gray-900 text-xl font-bold"
            >
              ✕
            </button>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {customColumns.map((column) => (
              <div key={column.id} className="flex items-center justify-between p-3 border-b border-gray-200 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm text-gray-900">{column.column_label}</span>
                  <span className="text-xs text-gray-700 bg-gray-200 px-2 py-1 rounded font-medium">
                    {column.column_type}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditColumn(column)}
                    className="px-3 py-1 text-xs bg-blue-600 text-white font-semibold rounded hover:bg-blue-700"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDeleteColumn(column.id, column.column_label)}
                    className="px-3 py-1 text-xs bg-red-600 text-white font-semibold rounded hover:bg-red-700"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Column Modal - SMALL AND VISIBLE */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[100]"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl p-5 w-[350px] border-4 border-blue-600"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4 text-gray-900">Add New Column</h2>

            {error && (
              <div className="mb-3 p-3 bg-red-100 border-2 border-red-500 text-red-800 rounded text-sm font-semibold">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Column Name
                </label>
                <input
                  type="text"
                  value={newColumnLabel}
                  onChange={(e) => setNewColumnLabel(e.target.value)}
                  placeholder="e.g., License Number"
                  className="w-full px-3 py-2 text-base font-medium text-gray-900 border-2 border-gray-400 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Column Type
                </label>
                <select
                  value={newColumnType}
                  onChange={(e) => setNewColumnType(e.target.value as any)}
                  className="w-full px-3 py-2 text-base font-medium text-gray-900 border-2 border-gray-400 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleAddColumn}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 text-base bg-blue-600 text-white font-bold rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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
                className="flex-1 px-4 py-2 text-base bg-gray-300 text-gray-900 font-bold rounded hover:bg-gray-400 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Column Modal - SMALL AND VISIBLE */}
      {isEditModalOpen && editingColumn && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[100]"
          onClick={() => setIsEditModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl p-5 w-[350px] border-4 border-orange-600"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4 text-gray-900">Edit Column</h2>

            {error && (
              <div className="mb-3 p-3 bg-red-100 border-2 border-red-500 text-red-800 rounded text-sm font-semibold">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Column Name
                </label>
                <input
                  type="text"
                  value={editColumnLabel}
                  onChange={(e) => setEditColumnLabel(e.target.value)}
                  placeholder="e.g., License Number"
                  className="w-full px-3 py-2 text-base font-medium text-gray-900 border-2 border-gray-400 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Column Type
                </label>
                <select
                  value={editColumnType}
                  onChange={(e) => setEditColumnType(e.target.value as any)}
                  className="w-full px-3 py-2 text-base font-medium text-gray-900 border-2 border-gray-400 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
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

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleUpdateColumn}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 text-base bg-orange-600 text-white font-bold rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Updating...' : 'Update'}
              </button>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingColumn(null);
                  setError(null);
                }}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 text-base bg-gray-300 text-gray-900 font-bold rounded hover:bg-gray-400 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

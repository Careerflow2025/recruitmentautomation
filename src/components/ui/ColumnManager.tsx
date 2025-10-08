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
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50" onClick={() => setIsAddModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-2xl p-4 w-80 border-2 border-gray-400" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3">Add New Column</h2>

            {error && (
              <div className="mb-3 p-2 bg-red-100 border border-red-400 text-red-700 rounded text-xs">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Column Name
                </label>
                <input
                  type="text"
                  value={newColumnLabel}
                  onChange={(e) => setNewColumnLabel(e.target.value)}
                  placeholder="e.g., License Number"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Column Type
                </label>
                <select
                  value={newColumnType}
                  onChange={(e) => setNewColumnType(e.target.value as any)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleAddColumn}
                disabled={isSubmitting}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewColumnLabel('');
                  setNewColumnType('text');
                  setError(null);
                }}
                disabled={isSubmitting}
                className="flex-1 px-3 py-1.5 text-sm bg-gray-200 text-gray-700 font-medium rounded hover:bg-gray-300 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Column Modal */}
      {isEditModalOpen && editingColumn && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50" onClick={() => setIsEditModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-2xl p-4 w-80 border-2 border-gray-400" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3">Edit Column</h2>

            {error && (
              <div className="mb-3 p-2 bg-red-100 border border-red-400 text-red-700 rounded text-xs">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Column Name
                </label>
                <input
                  type="text"
                  value={editColumnLabel}
                  onChange={(e) => setEditColumnLabel(e.target.value)}
                  placeholder="e.g., License Number"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Column Type
                </label>
                <select
                  value={editColumnType}
                  onChange={(e) => setEditColumnType(e.target.value as any)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleUpdateColumn}
                disabled={isSubmitting}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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
                className="flex-1 px-3 py-1.5 text-sm bg-gray-200 text-gray-700 font-medium rounded hover:bg-gray-300 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Columns List (for edit and delete functionality) */}
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
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditColumn(column)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDeleteColumn(column.id, column.column_label)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

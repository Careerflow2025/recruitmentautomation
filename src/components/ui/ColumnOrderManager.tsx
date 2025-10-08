'use client';

import { useState, useEffect } from 'react';
import { ColumnOrderItem, getColumnOrder, saveColumnOrder, resetColumnOrder } from '@/lib/column-order';

interface ColumnOrderManagerProps {
  tableName: 'candidates' | 'clients';
  onOrderChange: (order: ColumnOrderItem[]) => void;
}

export default function ColumnOrderManager({ tableName, onOrderChange }: ColumnOrderManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnOrderItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadColumnOrder();
  }, [tableName]);

  const loadColumnOrder = async () => {
    const order = await getColumnOrder(tableName);
    setColumns(order);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newColumns = [...columns];
    const draggedItem = newColumns[draggedIndex];
    newColumns.splice(draggedIndex, 1);
    newColumns.splice(index, 0, draggedItem);

    setColumns(newColumns);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveColumnOrder(tableName, columns);
      onOrderChange(columns);
      setIsOpen(false);
    } catch (err) {
      alert('Failed to save column order');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset to default column order?')) return;
    const defaultOrder = await resetColumnOrder(tableName);
    setColumns(defaultOrder);
    onOrderChange(defaultOrder);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newColumns = [...columns];
    [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
    setColumns(newColumns);
  };

  const moveDown = (index: number) => {
    if (index === columns.length - 1) return;
    const newColumns = [...columns];
    [newColumns[index], newColumns[index + 1]] = [newColumns[index + 1], newColumns[index]];
    setColumns(newColumns);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 bg-yellow-100 border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-yellow-200"
        title="Reorder Columns"
      >
        ⇅ Column Order
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50" onClick={() => setIsOpen(false)}>
          <div className="bg-white rounded-lg shadow-2xl p-4 w-96 max-h-[600px] border-2 border-gray-400 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Column Order</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-600 hover:text-gray-900 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-600 mb-3">
              Drag columns to reorder, or use arrow buttons
            </p>

            <div className="flex-1 overflow-y-auto border border-gray-300 rounded mb-3">
              {columns.map((column, index) => (
                <div
                  key={column.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between p-2 border-b border-gray-200 cursor-move hover:bg-gray-50 ${
                    draggedIndex === index ? 'bg-blue-100' : ''
                  } ${column.type === 'custom' ? 'bg-purple-50' : ''}`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-gray-400">☰</span>
                    <span className="text-sm font-medium">{column.label}</span>
                    {column.type === 'custom' && (
                      <span className="text-xs bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded">Custom</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      className="px-1.5 py-0.5 text-xs bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move Up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveDown(index)}
                      disabled={index === columns.length - 1}
                      className="px-1.5 py-0.5 text-xs bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move Down"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 font-medium rounded hover:bg-gray-300"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isSaving ? 'Saving...' : 'Save Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

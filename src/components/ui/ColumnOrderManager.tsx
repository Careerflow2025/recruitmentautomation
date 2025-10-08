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
        <div
          className="fixed bg-white border-4 border-yellow-600 shadow-2xl z-50 rounded-lg flex flex-col"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '450px',
            maxWidth: 'calc(100vw - 100px)',
            maxHeight: 'calc(100vh - 100px)'
          }}
        >
          {/* Header */}
          <div className="p-4 border-b-2 border-gray-300 bg-yellow-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Reorder Columns</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-700 hover:text-gray-900 text-xl font-bold px-2"
            >
              ✕
            </button>
          </div>

          {/* Instructions */}
          <div className="px-4 pt-3 pb-2 bg-blue-50 border-b border-gray-200">
            <p className="text-xs text-gray-800 font-semibold">
              💡 Drag columns to reorder, or use ▲ ▼ arrow buttons
            </p>
          </div>

          {/* Column List */}
          <div className="flex-1 overflow-y-auto p-3">
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
                    <span className="text-gray-500 font-bold">☰</span>
                    <span className="text-sm font-bold text-gray-900">{column.label}</span>
                    {column.type === 'custom' && (
                      <span className="text-xs bg-purple-200 text-purple-900 px-2 py-0.5 rounded font-semibold">Custom</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      className="px-2 py-1 text-xs bg-gray-300 text-gray-900 font-bold rounded hover:bg-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move Up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveDown(index)}
                      disabled={index === columns.length - 1}
                      className="px-2 py-1 text-xs bg-gray-300 text-gray-900 font-bold rounded hover:bg-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move Down"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>

          {/* Footer */}
          <div className="p-4 border-t-2 border-gray-300 bg-gray-100 flex justify-end gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-300 border-2 border-gray-500 text-gray-900 font-semibold hover:bg-gray-400"
            >
              🔄 Reset
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-500 border-2 border-blue-700 text-white font-semibold hover:bg-blue-600 disabled:bg-gray-400"
            >
              {isSaving ? 'Saving...' : '💾 Save Order'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

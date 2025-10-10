'use client';

import { useState } from 'react';
import { addCustomColumn, getCustomColumns } from '@/lib/custom-columns';

interface CustomColumnManagerProps {
  tableName: 'candidates' | 'clients';
  onColumnAdded: () => void;
}

export default function CustomColumnManager({ tableName, onColumnAdded }: CustomColumnManagerProps) {
  const [loading, setLoading] = useState(false);

  const handleAddColumn = async () => {
    setLoading(true);
    try {
      // Get existing columns to determine next number
      const existingColumns = await getCustomColumns(tableName);
      const customCount = existingColumns.filter(col => col.column_label.startsWith('Custom ')).length;
      const nextNum = customCount + 1;

      // Add column with default name "Custom 1", "Custom 2", etc.
      const defaultName = `Custom ${nextNum}`;
      await addCustomColumn(tableName, defaultName, 'text');

      // Notify parent to reload columns
      onColumnAdded();
    } catch (err: any) {
      console.error('Error adding column:', err);
      alert(`Failed to add column: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleAddColumn}
      className="grid-toolbar-button"
      disabled={loading}
      title="Add a new custom column (click header to rename)"
    >
      {loading ? '⏳' : '➕'} Add Column
    </button>
  );
}

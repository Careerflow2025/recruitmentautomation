'use client';

import { useState } from 'react';
import ColumnTextFilter from './ColumnTextFilter';

interface EditableColumnHeaderProps {
  columnKey: string;
  columnName: string;
  onRename?: (newName: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  canEdit?: boolean;
  canDelete?: boolean;
  children?: React.ReactNode; // For filters, etc.
  // Text filter props
  showTextFilter?: boolean;
  textFilterValue?: string;
  onTextFilterChange?: (value: string) => void;
}

export default function EditableColumnHeader({
  columnKey,
  columnName,
  onRename,
  onDelete,
  canEdit = true,
  canDelete = false,
  children,
  showTextFilter = true,
  textFilterValue = '',
  onTextFilterChange,
}: EditableColumnHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(columnName);

  const handleSave = async () => {
    if (!editValue.trim()) {
      alert('Column name cannot be empty');
      setEditValue(columnName);
      setIsEditing(false);
      return;
    }

    if (onRename && editValue !== columnName) {
      try {
        await onRename(editValue);
      } catch (error) {
        console.error('Failed to rename column:', error);
        setEditValue(columnName);
      }
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    if (!confirm(`Delete column "${columnName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await onDelete();
    } catch (error) {
      console.error('Failed to delete column:', error);
      alert('Failed to delete column');
    }
  };

  if (isEditing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <input
          autoFocus
          type="text"
          className="rdg-text-editor"
          style={{ flex: 1, padding: '4px', fontSize: '13px', border: '1px solid #3b82f6' }}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSave();
            } else if (e.key === 'Escape') {
              setEditValue(columnName);
              setIsEditing(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '4px' }}>
      {/* Header row with name and buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '4px' }}>
        <span
          style={{
            flex: 1,
            cursor: canEdit ? 'pointer' : 'default',
            userSelect: 'none',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
          onClick={() => canEdit && setIsEditing(true)}
          title={canEdit ? `Click to rename "${columnName}"` : columnName}
        >
          {columnName}
        </span>
        {children}
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              padding: '1px 5px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              lineHeight: '1',
              flexShrink: 0,
            }}
            title={`Delete "${columnName}" column`}
          >
            ✕
          </button>
        )}
      </div>

      {/* Text filter input */}
      {showTextFilter && onTextFilterChange && (
        <ColumnTextFilter
          value={textFilterValue}
          onChange={onTextFilterChange}
          placeholder={`Filter ${columnName}...`}
        />
      )}
    </div>
  );
}

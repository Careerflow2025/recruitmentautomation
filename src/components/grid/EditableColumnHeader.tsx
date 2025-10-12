'use client';

import { useState, useRef } from 'react';
import ColumnTextFilterPopup from './ColumnTextFilterPopup';
import ColumnResizeHandle from './ColumnResizeHandle';

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
  // Resize props
  currentWidth?: number;
  onColumnResize?: (columnKey: string, newWidth: number) => void;
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
  currentWidth,
  onColumnResize,
}: EditableColumnHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(columnName);
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

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
    <>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingLeft: '8px',
        paddingRight: currentWidth && onColumnResize ? '20px' : '8px', // Extra padding when resize handle present
        gap: '6px',
        height: '100%',
        position: 'relative', // For absolute positioning of resize handle
        width: '100%',
        overflow: 'hidden', // Prevent content from spilling into next column
        boxSizing: 'border-box'
      }}>
        <div style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden'
        }}>
          <span
            style={{
              cursor: canEdit ? 'pointer' : 'default',
              userSelect: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block', // Make span respect parent width
              width: '100%'
            }}
            onClick={() => canEdit && setIsEditing(true)}
            title={canEdit ? `Click to rename "${columnName}"` : columnName}
          >
            {columnName}
          </span>
        </div>

        {/* Text filter icon */}
        {showTextFilter && onTextFilterChange && (
          <button
            ref={filterButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              setShowFilterPopup(!showFilterPopup);
            }}
            style={{
              background: textFilterValue ? '#3b82f6' : 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              padding: '2px 6px',
              cursor: 'pointer',
              fontSize: '11px',
              lineHeight: '1',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={textFilterValue ? `Filtering: ${textFilterValue}` : `Filter ${columnName}`}
          >
            🔍
          </button>
        )}

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

        {/* Custom resize handle positioned exactly on column border */}
        {currentWidth && onColumnResize && (
          <ColumnResizeHandle
            columnKey={columnKey}
            currentWidth={currentWidth}
            onResize={onColumnResize}
          />
        )}
      </div>

      {/* Text filter popup */}
      {showFilterPopup && showTextFilter && onTextFilterChange && (
        <ColumnTextFilterPopup
          value={textFilterValue}
          onChange={onTextFilterChange}
          placeholder={`Filter ${columnName}...`}
          triggerRef={filterButtonRef}
          onClose={() => setShowFilterPopup(false)}
        />
      )}
    </>
  );
}

'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import DataGrid, { Column, SortColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import '@/styles/data-grid-custom.css';
import { useSupabaseGridSync } from '@/hooks/useSupabaseGridSync';
import { useColumnPreferences } from '@/hooks/useColumnPreferences';
import ColumnFilter from './ColumnFilter';
import { Candidate } from '@/types';
import { Client } from '@/types';
import { debounce } from 'lodash';

type DataRow = Candidate | Client;

interface EnhancedDataGridProps<T extends DataRow> {
  tableName: string;
  userId: string | null;
  columns: Column<T>[];
  onCellUpdate?: (id: string, field: string, value: any) => Promise<void>;
  onRowAdd?: () => Promise<void>;
  onRowDelete?: (id: string) => Promise<void>;
  filterableColumns?: string[];
  title: string;
  icon: string;
}

export default function EnhancedDataGrid<T extends DataRow>({
  tableName,
  userId,
  columns: initialColumns,
  onCellUpdate,
  onRowAdd,
  onRowDelete,
  filterableColumns = [],
  title,
  icon,
}: EnhancedDataGridProps<T>) {
  const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Column preferences (order, widths, filters)
  const {
    columnOrder: savedOrder,
    columnFilters,
    updateColumnOrder,
    updateColumnFilters,
  } = useColumnPreferences(userId, tableName);

  // Sync with Supabase
  const {
    data,
    loading,
    deleteRow,
  } = useSupabaseGridSync<T>({
    tableName,
    filters: userId ? { user_id: userId } : {},
    orderBy: { column: 'created_at', ascending: false },
    onError: (error) => alert(`Error: ${error.message}`),
  });

  // Reorder columns based on saved preferences
  const orderedColumns = useMemo(() => {
    if (savedOrder.length === 0) return initialColumns;

    // Create a map of columns by key
    const columnMap = new Map(initialColumns.map(col => [col.key, col]));

    // Build ordered array based on saved order
    const ordered: Column<T>[] = [];

    // Add columns in saved order
    savedOrder.forEach(key => {
      const col = columnMap.get(key);
      if (col) {
        ordered.push(col);
        columnMap.delete(key);
      }
    });

    // Add any new columns that weren't in saved order
    columnMap.forEach(col => ordered.push(col));

    return ordered;
  }, [initialColumns, savedOrder]);

  // Handle column reordering via drag-and-drop
  const handleColumnsReorder = useCallback((sourceKey: string, targetKey: string) => {
    const newOrder = [...orderedColumns];
    const sourceIndex = newOrder.findIndex(col => col.key === sourceKey);
    const targetIndex = newOrder.findIndex(col => col.key === targetKey);

    if (sourceIndex === -1 || targetIndex === -1) return;

    // Don't allow reordering of frozen columns
    const sourceCol = newOrder[sourceIndex];
    const targetCol = newOrder[targetIndex];

    if (sourceCol.frozen || targetCol.frozen) {
      return; // Frozen columns stay in place
    }

    // Swap positions
    const [removed] = newOrder.splice(sourceIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    // Save new order
    updateColumnOrder(newOrder.map(col => col.key as string));
  }, [orderedColumns, updateColumnOrder]);

  // Extract unique values for filterable columns
  const getFilterOptions = useCallback((columnKey: string): string[] => {
    const values = data.map(row => {
      const value = row[columnKey as keyof T];
      return String(value || '');
    });
    return Array.from(new Set(values)).sort();
  }, [data]);

  // Apply filters to data
  const filteredData = useMemo(() => {
    let filtered = [...data];

    Object.entries(columnFilters).forEach(([columnKey, selectedValues]) => {
      if (selectedValues.length > 0) {
        filtered = filtered.filter(row => {
          const value = String(row[columnKey as keyof T] || '');
          return selectedValues.includes(value);
        });
      }
    });

    return filtered;
  }, [data, columnFilters]);

  // Apply sorting
  const sortedData = useMemo(() => {
    if (sortColumns.length === 0) return filteredData;

    return [...filteredData].sort((a, b) => {
      for (const sort of sortColumns) {
        const aValue = a[sort.columnKey as keyof T];
        const bValue = b[sort.columnKey as keyof T];

        if (aValue === bValue) continue;

        const comparison = aValue > bValue ? 1 : -1;
        return sort.direction === 'ASC' ? comparison : -comparison;
      }
      return 0;
    });
  }, [filteredData, sortColumns]);

  // Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedRows.size === 0) return;

    if (!confirm(`Delete ${selectedRows.size} selected row(s)?`)) return;

    try {
      await Promise.all(Array.from(selectedRows).map((id) => deleteRow(id)));
      setSelectedRows(new Set());
    } catch (error) {
      console.error('Bulk delete failed:', error);
    }
  }, [selectedRows, deleteRow]);

  // Enhance columns with filter UI
  const enhancedColumns = useMemo(() => {
    return orderedColumns.map(col => {
      // Add filter UI to filterable columns
      if (filterableColumns.includes(col.key as string)) {
        return {
          ...col,
          headerRenderer: (props: any) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>{col.name}</span>
              <ColumnFilter
                columnKey={col.key as string}
                columnName={col.name as string}
                options={getFilterOptions(col.key as string)}
                selectedValues={columnFilters[col.key as string] || []}
                onFilterChange={(values) => {
                  updateColumnFilters({
                    ...columnFilters,
                    [col.key as string]: values,
                  });
                }}
              />
            </div>
          ),
        };
      }
      return col;
    });
  }, [orderedColumns, filterableColumns, getFilterOptions, columnFilters, updateColumnFilters]);

  if (loading) {
    return (
      <div className="grid-loading">
        <div className="grid-loading-spinner"></div>
      </div>
    );
  }

  const activeFiltersCount = Object.values(columnFilters).filter(v => v.length > 0).length;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="grid-toolbar">
        <div className="grid-toolbar-title">
          <span>{icon} {title}</span>
          <span className="text-sm font-normal opacity-90">
            ({sortedData.length} {sortedData.length !== data.length ? `of ${data.length}` : 'total'})
          </span>
          {activeFiltersCount > 0 && (
            <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-1 rounded font-semibold">
              {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''} active
            </span>
          )}
        </div>
        <div className="grid-toolbar-actions">
          {selectedRows.size > 0 && (
            <button onClick={handleBulkDelete} className="grid-toolbar-button">
              🗑️ Delete ({selectedRows.size})
            </button>
          )}
          {onRowAdd && (
            <button onClick={onRowAdd} className="grid-toolbar-button grid-toolbar-button-primary">
              ➕ Add Row
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1">
        <DataGrid
          columns={enhancedColumns}
          rows={sortedData}
          rowKeyGetter={(row) => row.id}
          sortColumns={sortColumns}
          onSortColumnsChange={setSortColumns}
          onColumnsReorder={handleColumnsReorder}
          defaultColumnOptions={{
            resizable: true,
            sortable: true,
          }}
          className="rdg-light fill-grid"
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

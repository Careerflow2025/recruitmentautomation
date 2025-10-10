'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import DataGrid, { Column, SortColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import '@/styles/data-grid-custom.css';
import { useSupabaseGridSync } from '@/hooks/useSupabaseGridSync';
import { useColumnPreferences } from '@/hooks/useColumnPreferences';
import ColumnFilter from './ColumnFilter';
import { Client } from '@/types';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { getCustomColumns, CustomColumn, getCustomColumnData, setCustomColumnValue } from '@/lib/custom-columns';
import { normalizeRole } from '@/lib/utils/roleNormalizer';
import { debounce } from 'lodash';

// Extended Client type with user_id (exists in DB but not in type definition)
type ClientWithUser = Client & { user_id?: string };

export default function ClientsDataGrid() {
  const [userId, setUserId] = useState<string | null>(null);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [customData, setCustomData] = useState<Record<string, Record<string, string | null>>>({});
  const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Column preferences
  const {
    columnOrder: savedOrder,
    columnFilters,
    updateColumnOrder,
    updateColumnFilters,
  } = useColumnPreferences(userId, 'clients');

  // Get current user
  useEffect(() => {
    getCurrentUserId().then(setUserId);
  }, []);

  // Load custom columns
  useEffect(() => {
    if (!userId) return;

    async function loadCustomColumns() {
      try {
        const cols = await getCustomColumns('clients');
        setCustomColumns(cols);
      } catch (error) {
        console.error('Error loading custom columns:', error);
      }
    }

    loadCustomColumns();
  }, [userId]);

  // Memoize filters to prevent infinite loop
  const supabaseFilters = useMemo(() => {
    return userId ? { user_id: userId } : {};
  }, [userId]);

  // Sync with Supabase
  const {
    data: clients,
    loading,
    insertRow,
    updateRow,
    deleteRow,
  } = useSupabaseGridSync<ClientWithUser>({
    tableName: 'clients',
    filters: supabaseFilters,
    orderBy: { column: 'created_at', ascending: false },
    onError: (error) => alert(`Error: ${error.message}`),
  });

  // Load custom column data for all clients
  useEffect(() => {
    if (clients.length === 0 || customColumns.length === 0) return;

    async function loadCustomData() {
      const dataMap: Record<string, Record<string, string | null>> = {};

      for (const client of clients) {
        try {
          const data = await getCustomColumnData('clients', client.id);
          dataMap[client.id] = data;
        } catch (error) {
          console.error(`Error loading custom data for ${client.id}:`, error);
        }
      }

      setCustomData(dataMap);
    }

    loadCustomData();
  }, [clients, customColumns]);

  // Debounced update for cell changes
  const debouncedUpdate = useMemo(
    () =>
      debounce(async (id: string, field: string, value: any) => {
        try {
          await updateRow(id, { [field]: value } as Partial<ClientWithUser>);
        } catch (error) {
          console.error('Update failed:', error);
        }
      }, 300),
    [updateRow]
  );

  // Debounced update for custom columns
  const debouncedCustomUpdate = useMemo(
    () =>
      debounce(async (clientId: string, columnName: string, value: string) => {
        try {
          await setCustomColumnValue('clients', clientId, columnName, value);
          setCustomData((prev) => ({
            ...prev,
            [clientId]: {
              ...prev[clientId],
              [columnName]: value,
            },
          }));
        } catch (error) {
          console.error('Custom column update failed:', error);
        }
      }, 300),
    []
  );

  // Get unique values for filterable columns
  const getFilterOptions = useCallback((columnKey: string): string[] => {
    const values = clients.map(client => {
      const value = client[columnKey as keyof ClientWithUser];
      return String(value || '');
    });
    return Array.from(new Set(values)).filter(v => v).sort();
  }, [clients]);

  // Standard columns definition
  const standardColumns: Column<ClientWithUser>[] = useMemo(
    () => [
      {
        key: 'select',
        name: '',
        width: 50,
        frozen: true,
        headerCellClass: 'rdg-checkbox-label',
        renderHeaderCell: () => (
          <input
            type="checkbox"
            className="rdg-checkbox-input"
            checked={selectedRows.size === clients.length && clients.length > 0}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedRows(new Set(clients.map((c) => c.id)));
              } else {
                setSelectedRows(new Set());
              }
            }}
          />
        ),
        renderCell: ({ row }) => (
          <input
            type="checkbox"
            className="rdg-checkbox-input"
            checked={selectedRows.has(row.id)}
            onChange={(e) => {
              const newSelected = new Set(selectedRows);
              if (e.target.checked) {
                newSelected.add(row.id);
              } else {
                newSelected.delete(row.id);
              }
              setSelectedRows(newSelected);
            }}
          />
        ),
      },
      {
        key: 'id',
        name: 'ID',
        width: 100,
        frozen: true,
        editable: false,
        cellClass: 'font-semibold text-gray-700',
      },
      {
        key: 'surgery',
        name: 'Surgery',
        width: 200,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.surgery || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, surgery: e.target.value });
              debouncedUpdate(props.row.id, 'surgery', e.target.value);
            }}
          />
        ),
      },
      {
        key: 'client_name',
        name: 'Contact Name',
        width: 150,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.client_name || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, client_name: e.target.value });
              debouncedUpdate(props.row.id, 'client_name', e.target.value);
            }}
          />
        ),
      },
      {
        key: 'client_phone',
        name: 'Contact Phone',
        width: 140,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            type="tel"
            className="rdg-text-editor"
            value={props.row.client_phone || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, client_phone: e.target.value });
              debouncedUpdate(props.row.id, 'client_phone', e.target.value);
            }}
          />
        ),
      },
      {
        key: 'client_email',
        name: 'Contact Email',
        width: 200,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            type="email"
            className="rdg-text-editor"
            value={props.row.client_email || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, client_email: e.target.value });
              debouncedUpdate(props.row.id, 'client_email', e.target.value);
            }}
          />
        ),
      },
      {
        key: 'role',
        name: 'Role',
        width: 150,
        editable: true,
        renderCell: ({ row }) => normalizeRole(row.role),
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.role}
            onChange={(e) => {
              props.onRowChange({ ...props.row, role: e.target.value });
              debouncedUpdate(props.row.id, 'role', e.target.value);
            }}
          />
        ),
        headerRenderer: (props) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>Role</span>
            <ColumnFilter
              columnKey="role"
              columnName="Role"
              options={getFilterOptions('role')}
              selectedValues={columnFilters['role'] || []}
              onFilterChange={(values) => {
                updateColumnFilters({
                  ...columnFilters,
                  role: values,
                });
              }}
            />
          </div>
        ),
      },
      {
        key: 'postcode',
        name: 'Postcode',
        width: 120,
        editable: true,
        cellClass: 'font-mono font-bold',
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor font-mono"
            value={props.row.postcode}
            onChange={(e) => {
              const upper = e.target.value.toUpperCase();
              props.onRowChange({ ...props.row, postcode: upper });
              debouncedUpdate(props.row.id, 'postcode', upper);
            }}
          />
        ),
        headerRenderer: (props) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>Postcode</span>
            <ColumnFilter
              columnKey="postcode"
              columnName="Postcode"
              options={getFilterOptions('postcode')}
              selectedValues={columnFilters['postcode'] || []}
              onFilterChange={(values) => {
                updateColumnFilters({
                  ...columnFilters,
                  postcode: values,
                });
              }}
            />
          </div>
        ),
      },
      {
        key: 'budget',
        name: 'Budget',
        width: 120,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.budget || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, budget: e.target.value });
              debouncedUpdate(props.row.id, 'budget', e.target.value);
            }}
          />
        ),
        headerRenderer: (props) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>Budget</span>
            <ColumnFilter
              columnKey="budget"
              columnName="Budget"
              options={getFilterOptions('budget')}
              selectedValues={columnFilters['budget'] || []}
              onFilterChange={(values) => {
                updateColumnFilters({
                  ...columnFilters,
                  budget: values,
                });
              }}
            />
          </div>
        ),
      },
      {
        key: 'requirement',
        name: 'Requirement',
        width: 150,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.requirement || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, requirement: e.target.value });
              debouncedUpdate(props.row.id, 'requirement', e.target.value);
            }}
          />
        ),
        headerRenderer: (props) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>Requirement</span>
            <ColumnFilter
              columnKey="requirement"
              columnName="Requirement"
              options={getFilterOptions('requirement')}
              selectedValues={columnFilters['requirement'] || []}
              onFilterChange={(values) => {
                updateColumnFilters({
                  ...columnFilters,
                  requirement: values,
                });
              }}
            />
          </div>
        ),
      },
      {
        key: 'system',
        name: 'System',
        width: 120,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.system || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, system: e.target.value });
              debouncedUpdate(props.row.id, 'system', e.target.value);
            }}
          />
        ),
        headerRenderer: (props) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>System</span>
            <ColumnFilter
              columnKey="system"
              columnName="System"
              options={getFilterOptions('system')}
              selectedValues={columnFilters['system'] || []}
              onFilterChange={(values) => {
                updateColumnFilters({
                  ...columnFilters,
                  system: values,
                });
              }}
            />
          </div>
        ),
      },
      {
        key: 'notes',
        name: 'Notes',
        width: 200,
        editable: true,
        renderEditCell: (props) => (
          <textarea
            autoFocus
            className="rdg-text-editor"
            value={props.row.notes || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, notes: e.target.value });
              debouncedUpdate(props.row.id, 'notes', e.target.value);
            }}
            rows={3}
          />
        ),
      },
    ],
    [clients, selectedRows, debouncedUpdate, getFilterOptions, columnFilters, updateColumnFilters]
  );

  // Dynamic custom columns
  const dynamicColumns: Column<ClientWithUser>[] = useMemo(
    () =>
      customColumns.map((col) => ({
        key: col.column_name,
        name: col.column_label,
        width: 150,
        editable: true,
        cellClass: 'custom-column-cell',
        headerCellClass: 'custom-column-header',
        renderCell: ({ row }) => customData[row.id]?.[col.column_name] || '',
        renderEditCell: (props) => {
          const value = customData[props.row.id]?.[col.column_name] || '';
          return (
            <input
              autoFocus
              type={col.column_type === 'number' ? 'number' : col.column_type === 'date' ? 'date' : 'text'}
              className="rdg-text-editor"
              value={value}
              onChange={(e) => {
                debouncedCustomUpdate(props.row.id, col.column_name, e.target.value);
              }}
            />
          );
        },
      })),
    [customColumns, customData, debouncedCustomUpdate]
  );

  // Actions column
  const actionsColumn: Column<ClientWithUser> = useMemo(
    () => ({
      key: 'actions',
      name: 'Actions',
      width: 100,
      frozen: true,
      renderCell: ({ row }) => (
        <button
          onClick={() => handleDelete(row.id)}
          className="cell-action-button cell-action-button-delete"
        >
          Delete
        </button>
      ),
    }),
    []
  );

  // Combine all columns
  const allColumns = useMemo(
    () => [...standardColumns, ...dynamicColumns, actionsColumn],
    [standardColumns, dynamicColumns, actionsColumn]
  );

  // Reorder columns based on saved preferences
  const orderedColumns = useMemo(() => {
    if (savedOrder.length === 0) return allColumns;

    const columnMap = new Map(allColumns.map(col => [col.key, col]));
    const ordered: Column<ClientWithUser>[] = [];

    savedOrder.forEach(key => {
      const col = columnMap.get(key);
      if (col) {
        ordered.push(col);
        columnMap.delete(key);
      }
    });

    columnMap.forEach(col => ordered.push(col));

    return ordered;
  }, [allColumns, savedOrder]);

  // Apply filters to data
  const filteredClients = useMemo(() => {
    let filtered = [...clients];

    Object.entries(columnFilters).forEach(([columnKey, selectedValues]) => {
      if (selectedValues.length > 0) {
        filtered = filtered.filter(client => {
          const value = String(client[columnKey as keyof ClientWithUser] || '');
          return selectedValues.includes(value);
        });
      }
    });

    return filtered;
  }, [clients, columnFilters]);

  // Apply sorting
  const sortedClients = useMemo(() => {
    if (sortColumns.length === 0) return filteredClients;

    return [...filteredClients].sort((a, b) => {
      for (const sort of sortColumns) {
        const aValue = a[sort.columnKey as keyof ClientWithUser];
        const bValue = b[sort.columnKey as keyof ClientWithUser];

        if (aValue === bValue) continue;

        const comparison = aValue > bValue ? 1 : -1;
        return sort.direction === 'ASC' ? comparison : -comparison;
      }
      return 0;
    });
  }, [filteredClients, sortColumns]);

  // Handle column reordering
  const handleColumnsReorder = useCallback((sourceKey: string, targetKey: string) => {
    const newOrder = [...orderedColumns];
    const sourceIndex = newOrder.findIndex(col => col.key === sourceKey);
    const targetIndex = newOrder.findIndex(col => col.key === targetKey);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const sourceCol = newOrder[sourceIndex];
    const targetCol = newOrder[targetIndex];

    // Don't allow reordering of frozen columns
    if (sourceCol.frozen || targetCol.frozen) return;

    const [removed] = newOrder.splice(sourceIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    updateColumnOrder(newOrder.map(col => col.key as string));
  }, [orderedColumns, updateColumnOrder]);

  // Handle delete
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this client?')) return;
      try {
        await deleteRow(id);
        const newSelected = new Set(selectedRows);
        newSelected.delete(id);
        setSelectedRows(newSelected);
      } catch (error) {
        console.error('Delete failed:', error);
      }
    },
    [deleteRow, selectedRows]
  );

  // Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedRows.size === 0) return;

    if (!confirm(`Delete ${selectedRows.size} selected client(s)?`)) return;

    try {
      await Promise.all(Array.from(selectedRows).map((id) => deleteRow(id)));
      setSelectedRows(new Set());
    } catch (error) {
      console.error('Bulk delete failed:', error);
    }
  }, [selectedRows, deleteRow]);

  // Handle add row
  const handleAddRow = useCallback(async () => {
    if (!userId) return;

    const newClient: Partial<ClientWithUser> = {
      user_id: userId,
      surgery: '',
      client_name: '',
      client_phone: '',
      client_email: '',
      role: 'Dental Nurse',
      postcode: '',
      budget: '',
      requirement: '',
      system: '',
      notes: '',
    };

    try {
      await insertRow(newClient);
    } catch (error) {
      console.error('Add row failed:', error);
    }
  }, [userId, insertRow]);

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
          <span>🏥 Clients</span>
          <span className="text-sm font-normal opacity-90">
            ({sortedClients.length} {sortedClients.length !== clients.length ? `of ${clients.length}` : 'total'})
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
          <button onClick={handleAddRow} className="grid-toolbar-button grid-toolbar-button-primary">
            ➕ Add Client
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1">
        <DataGrid
          columns={orderedColumns}
          rows={sortedClients}
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

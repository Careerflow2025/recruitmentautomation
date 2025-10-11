'use client';

import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import DataGrid, { Column, SortColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import '@/styles/data-grid-custom.css';
import { useSupabaseGridSync } from '@/hooks/useSupabaseGridSync';
import { useColumnPreferences } from '@/hooks/useColumnPreferences';
import ColumnFilter from './ColumnFilter';
import { Client } from '@/types';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { getCustomColumns, CustomColumn, getCustomColumnData, setCustomColumnValue, updateCustomColumn, deleteCustomColumn } from '@/lib/custom-columns';
import { normalizeRole } from '@/lib/utils/roleNormalizer';
import { debounce } from 'lodash';
import CustomColumnManager from './CustomColumnManager';
import EditableColumnHeader from './EditableColumnHeader';
import NotesPopup from './NotesPopup';

// Extended Client type with user_id (exists in DB but not in type definition)
type ClientWithUser = Client & { user_id?: string };

export default function ClientsDataGrid() {
  const [userId, setUserId] = useState<string | null>(null);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [customData, setCustomData] = useState<Record<string, Record<string, string | null>>>({});
  const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingHeaderId, setEditingHeaderId] = useState<string | null>(null);
  const [headerEditValue, setHeaderEditValue] = useState('');
  const [columnRenames, setColumnRenames] = useState<Record<string, string>>({});
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [textFilters, setTextFilters] = useState<Record<string, string>>({});
  const [notesPopup, setNotesPopup] = useState<{ clientId: string; content: string } | null>(null);

  // Column preferences
  const {
    columnOrder: savedOrder,
    columnWidths: savedWidths,
    columnFilters,
    updateColumnOrder,
    updateColumnWidths,
    updateColumnFilters,
  } = useColumnPreferences(userId, 'clients');

  // Get current user
  useEffect(() => {
    getCurrentUserId().then(setUserId);
  }, []);

  // Load custom columns
  const loadCustomColumns = useCallback(async () => {
    if (!userId) return;

    try {
      const cols = await getCustomColumns('clients');
      setCustomColumns(cols);
    } catch (error) {
      console.error('Error loading custom columns:', error);
    }
  }, [userId]);

  useEffect(() => {
    loadCustomColumns();
  }, [loadCustomColumns]);

  // Load column renames and hidden columns from localStorage
  useEffect(() => {
    if (!userId) return;

    try {
      const renamesKey = `column-renames-clients-${userId}`;
      const hiddenKey = `column-hidden-clients-${userId}`;

      const storedRenames = localStorage.getItem(renamesKey);
      const storedHidden = localStorage.getItem(hiddenKey);

      if (storedRenames) {
        setColumnRenames(JSON.parse(storedRenames));
      }

      if (storedHidden) {
        setHiddenColumns(new Set(JSON.parse(storedHidden)));
      }
    } catch (error) {
      console.error('Failed to load column preferences:', error);
    }
  }, [userId]);

  // Memoize filters to prevent infinite loop
  const supabaseFilters = useMemo(() => {
    return userId ? { user_id: userId } : {};
  }, [userId]);

  // Memoize orderBy to prevent infinite loop
  const supabaseOrderBy = useMemo(() => {
    return { column: 'created_at', ascending: false };
  }, []);

  // Memoize error handler to prevent infinite loop
  const handleSupabaseError = useCallback((error: Error) => {
    alert(`Error: ${error.message}`);
  }, []);

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
    orderBy: supabaseOrderBy,
    onError: handleSupabaseError,
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

  // Debounced update for cell changes - increased to 1500ms for better typing experience
  const debouncedUpdate = useMemo(
    () =>
      debounce(async (id: string, field: string, value: any) => {
        try {
          await updateRow(id, { [field]: value } as Partial<ClientWithUser>);
        } catch (error) {
          console.error('Update failed:', error);
        }
      }, 1500),
    [updateRow]
  );

  // Debounced update for custom columns - increased to 1500ms
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
      }, 1500),
    []
  );

  // Handle saving custom column header rename
  const handleSaveHeaderEdit = useCallback(async (columnId: string, newLabel: string) => {
    if (!newLabel.trim()) {
      alert('Column name cannot be empty');
      setEditingHeaderId(null);
      return;
    }

    try {
      await updateCustomColumn(columnId, newLabel);
      // Reload custom columns to reflect the change
      await loadCustomColumns();
      setEditingHeaderId(null);
    } catch (error) {
      console.error('Failed to update column header:', error);
      alert('Failed to rename column');
    }
  }, [loadCustomColumns]);

  // Handle deleting custom column
  const handleDeleteColumn = useCallback(async (columnId: string, columnName: string) => {
    if (!confirm(`Delete column "${columnName}"? This will remove all data in this column.`)) {
      return;
    }

    try {
      await deleteCustomColumn(columnId);
      // Reload custom columns to reflect the change
      await loadCustomColumns();
    } catch (error) {
      console.error('Failed to delete column:', error);
      alert('Failed to delete column');
    }
  }, [loadCustomColumns]);

  // Handle renaming standard column
  const handleRenameColumn = useCallback(async (columnKey: string, newName: string) => {
    const newRenames = { ...columnRenames, [columnKey]: newName };
    setColumnRenames(newRenames);

    if (userId) {
      const renamesKey = `column-renames-clients-${userId}`;
      localStorage.setItem(renamesKey, JSON.stringify(newRenames));
    }
  }, [columnRenames, userId]);

  // Handle hiding/deleting standard column
  const handleHideColumn = useCallback(async (columnKey: string) => {
    const newHidden = new Set(hiddenColumns);
    newHidden.add(columnKey);
    setHiddenColumns(newHidden);

    if (userId) {
      const hiddenKey = `column-hidden-clients-${userId}`;
      localStorage.setItem(hiddenKey, JSON.stringify(Array.from(newHidden)));
    }
  }, [hiddenColumns, userId]);

  // Handle text filter change
  const handleTextFilterChange = useCallback((columnKey: string, value: string) => {
    setTextFilters(prev => ({
      ...prev,
      [columnKey]: value,
    }));
  }, []);

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
        name: columnRenames['surgery'] || 'Surgery',
        width: savedWidths['surgery'] || 200,
        editable: true,
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="surgery"
            columnName={columnRenames['surgery'] || 'Surgery'}
            onRename={(newName) => handleRenameColumn('surgery', newName)}
            onDelete={() => handleHideColumn('surgery')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['surgery'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('surgery', value)}
          />
        ),
        renderCell: ({ row }) => (
          <div title={row.surgery || ''}>{row.surgery || ''}</div>
        ),
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
        name: columnRenames['client_name'] || 'Contact Name',
        width: savedWidths['client_name'] || 150,
        editable: true,
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="client_name"
            columnName={columnRenames['client_name'] || 'Contact Name'}
            onRename={(newName) => handleRenameColumn('client_name', newName)}
            onDelete={() => handleHideColumn('client_name')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['client_name'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('client_name', value)}
          />
        ),
        renderCell: ({ row }) => (
          <div title={row.client_name || ''}>{row.client_name || ''}</div>
        ),
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
        name: columnRenames['client_phone'] || 'Contact Phone',
        width: savedWidths['client_phone'] || 140,
        editable: true,
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="client_phone"
            columnName={columnRenames['client_phone'] || 'Contact Phone'}
            onRename={(newName) => handleRenameColumn('client_phone', newName)}
            onDelete={() => handleHideColumn('client_phone')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['client_phone'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('client_phone', value)}
          />
        ),
        renderCell: ({ row }) => (
          <div title={row.client_phone || ''}>{row.client_phone || ''}</div>
        ),
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
        name: columnRenames['client_email'] || 'Contact Email',
        width: savedWidths['client_email'] || 200,
        editable: true,
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="client_email"
            columnName={columnRenames['client_email'] || 'Contact Email'}
            onRename={(newName) => handleRenameColumn('client_email', newName)}
            onDelete={() => handleHideColumn('client_email')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['client_email'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('client_email', value)}
          />
        ),
        renderCell: ({ row }) => (
          <div title={row.client_email || ''}>{row.client_email || ''}</div>
        ),
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
        name: columnRenames['role'] || 'Role',
        width: savedWidths['role'] || 150,
        editable: true,
        renderCell: ({ row }) => (
          <div title={normalizeRole(row.role)}>{normalizeRole(row.role)}</div>
        ),
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
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="role"
            columnName={columnRenames['role'] || 'Role'}
            onRename={(newName) => handleRenameColumn('role', newName)}
            onDelete={() => handleHideColumn('role')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['role'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('role', value)}
          >
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
          </EditableColumnHeader>
        ),
      },
      {
        key: 'postcode',
        name: columnRenames['postcode'] || 'Postcode',
        width: savedWidths['postcode'] || 120,
        editable: true,
        cellClass: 'font-mono font-bold',
        renderCell: ({ row }) => (
          <div title={row.postcode}>{row.postcode}</div>
        ),
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
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="postcode"
            columnName={columnRenames['postcode'] || 'Postcode'}
            onRename={(newName) => handleRenameColumn('postcode', newName)}
            onDelete={() => handleHideColumn('postcode')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['postcode'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('postcode', value)}
          >
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
          </EditableColumnHeader>
        ),
      },
      {
        key: 'budget',
        name: columnRenames['budget'] || 'Budget',
        width: savedWidths['budget'] || 120,
        editable: true,
        renderCell: ({ row }) => (
          <div title={row.budget || ''}>{row.budget || ''}</div>
        ),
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
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="budget"
            columnName={columnRenames['budget'] || 'Budget'}
            onRename={(newName) => handleRenameColumn('budget', newName)}
            onDelete={() => handleHideColumn('budget')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['budget'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('budget', value)}
          >
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
          </EditableColumnHeader>
        ),
      },
      {
        key: 'requirement',
        name: columnRenames['requirement'] || 'Requirement',
        width: savedWidths['requirement'] || 150,
        editable: true,
        renderCell: ({ row }) => (
          <div title={row.requirement || ''}>{row.requirement || ''}</div>
        ),
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
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="requirement"
            columnName={columnRenames['requirement'] || 'Requirement'}
            onRename={(newName) => handleRenameColumn('requirement', newName)}
            onDelete={() => handleHideColumn('requirement')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['requirement'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('requirement', value)}
          >
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
          </EditableColumnHeader>
        ),
      },
      {
        key: 'system',
        name: columnRenames['system'] || 'System',
        width: savedWidths['system'] || 120,
        editable: true,
        renderCell: ({ row }) => (
          <div title={row.system || ''}>{row.system || ''}</div>
        ),
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
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="system"
            columnName={columnRenames['system'] || 'System'}
            onRename={(newName) => handleRenameColumn('system', newName)}
            onDelete={() => handleHideColumn('system')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['system'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('system', value)}
          >
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
          </EditableColumnHeader>
        ),
      },
      {
        key: 'notes',
        name: columnRenames['notes'] || 'Notes',
        width: savedWidths['notes'] || 200,
        editable: false,
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="notes"
            columnName={columnRenames['notes'] || 'Notes'}
            onRename={(newName) => handleRenameColumn('notes', newName)}
            onDelete={() => handleHideColumn('notes')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['notes'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('notes', value)}
          />
        ),
        renderCell: ({ row }) => (
          <div
            title="Click to view/edit notes"
            onClick={(e) => {
              e.stopPropagation();
              setNotesPopup({ clientId: row.id, content: row.notes || '' });
            }}
            style={{
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.notes || '(Click to add notes)'}
            </span>
            <span style={{ fontSize: '12px', opacity: 0.6, flexShrink: 0 }}>📝</span>
          </div>
        ),
      },
    ],
    [clients, selectedRows, debouncedUpdate, getFilterOptions, columnFilters, updateColumnFilters, columnRenames, handleRenameColumn, handleHideColumn, savedWidths, textFilters, handleTextFilterChange]
  );

  // Handle renaming custom column
  const handleRenameCustomColumn = useCallback(async (columnId: string, newName: string, columnType: 'text' | 'number' | 'date' | 'email' | 'phone' | 'url') => {
    try {
      await updateCustomColumn(columnId, newName, columnType);
      await loadCustomColumns();
    } catch (error) {
      console.error('Failed to update column header:', error);
      alert('Failed to rename column');
    }
  }, [loadCustomColumns]);

  // Dynamic custom columns
  const dynamicColumns: Column<ClientWithUser>[] = useMemo(
    () =>
      customColumns.map((col) => ({
        key: col.column_name,
        name: col.column_label,
        width: savedWidths[col.column_name] || 150,
        editable: true,
        cellClass: 'custom-column-cell',
        headerCellClass: 'custom-column-header',
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey={col.column_name}
            columnName={col.column_label}
            onRename={(newName) => handleRenameCustomColumn(col.id, newName, col.column_type)}
            onDelete={() => handleDeleteColumn(col.id, col.column_label)}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters[col.column_name] || ''}
            onTextFilterChange={(value) => handleTextFilterChange(col.column_name, value)}
          />
        ),
        renderCell: ({ row }) => (
          <div title={customData[row.id]?.[col.column_name] || ''}>
            {customData[row.id]?.[col.column_name] || ''}
          </div>
        ),
        renderEditCell: (props) => {
          const value = customData[props.row.id]?.[col.column_name] || '';
          return (
            <input
              autoFocus
              type={col.column_type === 'number' ? 'number' : col.column_type === 'date' ? 'date' : 'text'}
              className="rdg-text-editor"
              value={value}
              onChange={(e) => {
                // Update local state immediately for responsive typing
                setCustomData((prev) => ({
                  ...prev,
                  [props.row.id]: {
                    ...prev[props.row.id],
                    [col.column_name]: e.target.value,
                  },
                }));
                // Save to database with debounce
                debouncedCustomUpdate(props.row.id, col.column_name, e.target.value);
              }}
            />
          );
        },
      })),
    [customColumns, customData, debouncedCustomUpdate, handleRenameCustomColumn, handleDeleteColumn, savedWidths, textFilters, handleTextFilterChange]
  );

  // Combine all columns (no Actions column - use checkbox + bulk delete instead)
  const allColumns = useMemo(
    () => [...standardColumns, ...dynamicColumns].filter(col => !hiddenColumns.has(col.key as string)),
    [standardColumns, dynamicColumns, hiddenColumns]
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

  // Auto-resize columns to fit screen width
  const autoResizedColumns = useMemo(() => {
    if (orderedColumns.length === 0) return orderedColumns;

    // Calculate total width of all columns
    const totalWidth = orderedColumns.reduce((sum, col) => sum + (col.width || 150), 0);

    // Get available viewport width (subtract some padding for scrollbars, etc.)
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth - 100 : 1400;

    // If total width exceeds viewport, proportionally resize all columns
    if (totalWidth > viewportWidth) {
      const scaleFactor = viewportWidth / totalWidth;
      const MIN_WIDTH = 80; // Minimum column width for usability

      return orderedColumns.map(col => {
        const originalWidth = col.width || 150;
        const scaledWidth = Math.max(MIN_WIDTH, Math.floor(originalWidth * scaleFactor));

        return {
          ...col,
          width: scaledWidth
        };
      });
    }

    return orderedColumns;
  }, [orderedColumns]);

  // Apply filters to data
  const filteredClients = useMemo(() => {
    let filtered = [...clients];

    // Apply dropdown filters
    Object.entries(columnFilters).forEach(([columnKey, selectedValues]) => {
      if (selectedValues.length > 0) {
        filtered = filtered.filter(client => {
          const value = String(client[columnKey as keyof ClientWithUser] || '');
          return selectedValues.includes(value);
        });
      }
    });

    // Apply text filters (standard + custom columns)
    Object.entries(textFilters).forEach(([columnKey, filterText]) => {
      if (filterText.trim()) {
        filtered = filtered.filter(client => {
          // Check if it's a standard column
          const standardValue = client[columnKey as keyof ClientWithUser];
          if (standardValue !== undefined) {
            const value = String(standardValue || '').toLowerCase();
            return value.includes(filterText.toLowerCase());
          }

          // Check if it's a custom column
          const customValue = customData[client.id]?.[columnKey];
          if (customValue !== undefined) {
            const value = String(customValue || '').toLowerCase();
            return value.includes(filterText.toLowerCase());
          }

          return false;
        });
      }
    });

    return filtered;
  }, [clients, columnFilters, textFilters, customData]);

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
    const newOrder = [...autoResizedColumns];
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
  }, [autoResizedColumns, updateColumnOrder]);

  // Handle column resize - SAVE WIDTHS
  const handleColumnResize = useCallback((idx: number, width: number) => {
    const column = autoResizedColumns[idx];
    if (!column) return;

    const newWidths = {
      ...savedWidths,
      [column.key]: width,
    };

    updateColumnWidths(newWidths);
  }, [autoResizedColumns, savedWidths, updateColumnWidths]);

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
          <CustomColumnManager
            tableName="clients"
            onColumnAdded={loadCustomColumns}
          />
          <button onClick={handleAddRow} className="grid-toolbar-button grid-toolbar-button-primary">
            ➕ Add Client
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1">
        <DataGrid
          columns={autoResizedColumns}
          rows={sortedClients}
          rowKeyGetter={(row) => row.id}
          sortColumns={sortColumns}
          onSortColumnsChange={setSortColumns}
          onColumnsReorder={handleColumnsReorder}
          onColumnResize={handleColumnResize}
          defaultColumnOptions={{
            resizable: true,
            sortable: true,
          }}
          className="rdg-light fill-grid"
          style={{ height: '100%' }}
        />
      </div>

      {/* Notes Popup */}
      {notesPopup && (
        <NotesPopup
          content={notesPopup.content}
          title="Client Notes"
          onClose={() => setNotesPopup(null)}
          onSave={async (newContent) => {
            await updateRow(notesPopup.clientId, { notes: newContent } as Partial<ClientWithUser>);
            setNotesPopup(null);
          }}
        />
      )}
    </div>
  );
}

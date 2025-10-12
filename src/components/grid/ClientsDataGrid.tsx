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
import MultiNotesPopup from './MultiNotesPopup';

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
  const [notesPopupClientId, setNotesPopupClientId] = useState<string | null>(null);
  const [latestNotes, setLatestNotes] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Validation state: tracks validation status for role and postcode fields
  const [fieldValidation, setFieldValidation] = useState<Record<string, {
    role?: { valid: boolean; message: string };
    postcode?: { valid: boolean; message: string };
  }>>({});

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

  // Load latest notes for all clients
  const loadLatestNotes = useCallback(async () => {
    try {
      const response = await fetch('/api/notes/clients/latest');
      const data = await response.json();

      if (data.success) {
        setLatestNotes(data.latestNotes || {});
      } else {
        console.error('Failed to fetch latest notes:', data.error);
      }
    } catch (error) {
      console.error('Error fetching latest notes:', error);
    }
  }, []);

  useEffect(() => {
    if (clients.length > 0) {
      loadLatestNotes();
    }
  }, [clients.length, loadLatestNotes]);

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

  // AI Validation function - flexible validation using AI
  const validateField = useCallback(async (clientId: string, fieldType: 'role' | 'postcode', value: string) => {
    // Skip validation if field is empty (already handled by red highlighting)
    if (!value || value.trim() === '') {
      setFieldValidation(prev => ({
        ...prev,
        [clientId]: {
          ...prev[clientId],
          [fieldType]: undefined
        }
      }));
      return;
    }

    try {
      const response = await fetch('/api/validate-field', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fieldType, value }),
      });

      const data = await response.json();

      if (data.success) {
        setFieldValidation(prev => ({
          ...prev,
          [clientId]: {
            ...prev[clientId],
            [fieldType]: {
              valid: data.valid,
              message: data.message
            }
          }
        }));
      }
    } catch (error) {
      console.error(`Error validating ${fieldType}:`, error);
      // Don't block user on validation error - silently fail
    }
  }, []);

  // Debounced validation - wait for user to stop typing before validating
  const debouncedValidate = useMemo(
    () =>
      debounce((clientId: string, fieldType: 'role' | 'postcode', value: string) => {
        validateField(clientId, fieldType, value);
      }, 1000),
    [validateField]
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

  // Helper function: Check if item is new (within 48 hours)
  const isNewItem = useCallback((createdAt: string) => {
    const now = new Date();
    const created = new Date(createdAt);
    const hoursDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
    return hoursDiff <= 48;
  }, []);

  // Helper function: Extract display ID (remove user prefix like "U3_")
  const getDisplayId = useCallback((fullId: string) => {
    const parts = fullId.split('_');
    if (parts.length > 1) {
      // Return everything after first underscore (e.g., "U3_CL11" -> "CL11")
      return parts.slice(1).join('_');
    }
    // Fallback to full ID if no underscore found
    return fullId;
  }, []);

  // Handle column resize by key (for custom resize handle) - MUST be defined before standardColumns
  const handleColumnResizeByKey = useCallback((columnKey: string, width: number) => {
    const newWidths = {
      ...savedWidths,
      [columnKey]: width,
    };

    updateColumnWidths(newWidths);
  }, [savedWidths, updateColumnWidths]);

  // Standard columns definition
  const standardColumns: Column<ClientWithUser>[] = useMemo(
    () => [
      {
        key: 'select',
        name: '',
        width: 50,
        frozen: true,
        resizable: false,
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
        width: 120,
        frozen: true,
        editable: false,
        resizable: false,
        cellClass: (row) => {
          const newItemClass = isNewItem(row.created_at) ? 'rdg-cell-new-item' : '';
          return `font-semibold text-gray-700 ${newItemClass}`;
        },
        renderHeaderCell: () => (
          <div style={{
            width: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            paddingLeft: '8px',
            paddingRight: '8px',
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            boxSizing: 'border-box',
            // TEMP DEBUG: Highly visible styles to confirm code is loading
            background: 'red !important',
            border: '5px solid yellow !important',
            color: 'white',
            fontWeight: 600,
            fontSize: '13px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            ID
          </div>
        ),
        renderCell: ({ row }) => {
          const isNew = isNewItem(row.created_at);
          const displayId = getDisplayId(row.id);
          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 'bold'
              }}
              title={isNew ? 'Added within last 48 hours' : ''}
            >
              {isNew && <span style={{ fontSize: '16px' }}>🟨</span>}
              {displayId}
            </div>
          );
        },
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
            currentWidth={savedWidths['surgery'] || 200}
            onColumnResize={handleColumnResizeByKey}
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
            currentWidth={savedWidths['client_name'] || 150}
            onColumnResize={handleColumnResizeByKey}
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
            currentWidth={savedWidths['client_phone'] || 140}
            onColumnResize={handleColumnResizeByKey}
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
            currentWidth={savedWidths['client_email'] || 200}
            onColumnResize={handleColumnResizeByKey}
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
        cellClass: (row) => {
          // ⚠️ REQUIRED FIELD: Red background if empty OR invalid (needed for matching)
          const isEmpty = !row.role || row.role.trim() === '';
          const validation = fieldValidation[row.id]?.role;
          const isInvalid = validation && !validation.valid;

          if (isEmpty || isInvalid) {
            return 'rdg-cell-required-empty';
          }
          return '';
        },
        renderCell: ({ row }) => {
          const isEmpty = !row.role || row.role.trim() === '';
          const validation = fieldValidation[row.id]?.role;

          let displayText = row.role || '⚠️ REQUIRED';
          let titleText = 'Role is required for matching!';

          if (!isEmpty && validation) {
            if (validation.valid) {
              displayText = `✓ ${row.role}`;
              titleText = `Valid role: ${validation.message}`;
            } else {
              displayText = `✗ ${row.role}`;
              titleText = `Invalid: ${validation.message}`;
            }
          }

          return (
            <div title={titleText}>
              {displayText}
            </div>
          );
        },
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.role}
            placeholder="Enter role (REQUIRED)"
            onChange={(e) => {
              props.onRowChange({ ...props.row, role: e.target.value });
              debouncedUpdate(props.row.id, 'role', e.target.value);
              // Trigger AI validation after user stops typing
              debouncedValidate(props.row.id, 'role', e.target.value);
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
            canDelete={false}
            showTextFilter={true}
            textFilterValue={textFilters['role'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('role', value)}
            currentWidth={savedWidths['role'] || 150}
            onColumnResize={handleColumnResizeByKey}
          />
        ),
      },
      {
        key: 'postcode',
        name: columnRenames['postcode'] || 'Postcode',
        width: savedWidths['postcode'] || 120,
        editable: true,
        cellClass: (row) => {
          // ⚠️ REQUIRED FIELD: Red background if empty OR invalid (needed for matching)
          const isEmpty = !row.postcode || row.postcode.trim() === '';
          const validation = fieldValidation[row.id]?.postcode;
          const isInvalid = validation && !validation.valid;

          if (isEmpty || isInvalid) {
            return 'rdg-cell-required-empty font-mono font-bold';
          }
          return 'font-mono font-bold';
        },
        renderCell: ({ row }) => {
          const isEmpty = !row.postcode || row.postcode.trim() === '';
          const validation = fieldValidation[row.id]?.postcode;

          let displayText = row.postcode || '⚠️ REQUIRED';
          let titleText = 'Postcode is required for matching!';

          if (!isEmpty && validation) {
            if (validation.valid) {
              displayText = `✓ ${row.postcode}`;
              titleText = `Valid postcode: ${validation.message}`;
            } else {
              displayText = `✗ ${row.postcode}`;
              titleText = `Invalid: ${validation.message}`;
            }
          }

          return (
            <div title={titleText}>
              {displayText}
            </div>
          );
        },
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor font-mono"
            value={props.row.postcode}
            placeholder="Enter postcode (REQUIRED)"
            onChange={(e) => {
              const upper = e.target.value.toUpperCase();
              props.onRowChange({ ...props.row, postcode: upper });
              debouncedUpdate(props.row.id, 'postcode', upper);
              // Trigger AI validation after user stops typing
              debouncedValidate(props.row.id, 'postcode', upper);
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
            canDelete={false}
            showTextFilter={true}
            textFilterValue={textFilters['postcode'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('postcode', value)}
            currentWidth={savedWidths['postcode'] || 120}
            onColumnResize={handleColumnResizeByKey}
          />
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
            currentWidth={savedWidths['budget'] || 120}
            onColumnResize={handleColumnResizeByKey}
          />
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
            currentWidth={savedWidths['requirement'] || 150}
            onColumnResize={handleColumnResizeByKey}
          />
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
            currentWidth={savedWidths['system'] || 120}
            onColumnResize={handleColumnResizeByKey}
          />
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
            currentWidth={savedWidths['notes'] || 200}
            onColumnResize={handleColumnResizeByKey}
          />
        ),
        renderCell: ({ row }) => {
          const latestNote = latestNotes[row.id]?.content || '';
          const displayText = latestNote || '(Click to add notes)';

          return (
            <div
              title={latestNote ? latestNote : "Click to view/edit notes"}
              onClick={(e) => {
                e.stopPropagation();
                setNotesPopupClientId(row.id);
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
                {displayText}
              </span>
              <span style={{ fontSize: '12px', opacity: 0.6, flexShrink: 0 }}>📝</span>
            </div>
          );
        },
      },
    ],
    [clients, selectedRows, debouncedUpdate, getFilterOptions, columnFilters, updateColumnFilters, columnRenames, handleRenameColumn, handleHideColumn, savedWidths, textFilters, handleTextFilterChange, latestNotes, isNewItem, getDisplayId, fieldValidation, debouncedValidate, handleColumnResizeByKey]
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
            currentWidth={savedWidths[col.column_name] || 150}
            onColumnResize={handleColumnResizeByKey}
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

  // Apply sorting - ALWAYS sort by created_at DESC when no user sorting is applied
  const sortedClients = useMemo(() => {
    // If no user-defined sort columns, maintain created_at DESC (newest first)
    if (sortColumns.length === 0) {
      return [...filteredClients].sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return bTime - aTime; // Descending (newest first)
      });
    }

    // User has clicked a column header to sort
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

  // Handle column resize - Excel-like drag behavior
  const handleColumnResize = useCallback((idx: number, width: number) => {
    const column = orderedColumns[idx];
    if (!column) return;

    const newWidths = {
      ...savedWidths,
      [column.key]: width,
    };

    updateColumnWidths(newWidths);
  }, [orderedColumns, savedWidths, updateColumnWidths]);

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

  // Handle download template
  const handleDownloadTemplate = useCallback(() => {
    window.open('/api/templates/clients', '_blank');
  }, []);

  // Handle bulk upload
  const handleBulkUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/clients', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setUploadMessage({
          type: 'success',
          text: `✅ ${result.message}${result.validationErrors && result.validationErrors.length > 0 ? ` (${result.validationErrors.length} errors)` : ''}`
        });
        setTimeout(() => setUploadMessage(null), 5000);
      } else {
        setUploadMessage({
          type: 'error',
          text: `❌ ${result.error || 'Upload failed'}`
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadMessage({
        type: 'error',
        text: `❌ Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  // Handle file input change
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleBulkUpload(file);
    }
  }, [handleBulkUpload]);

  // Handle add row
  const handleAddRow = useCallback(async () => {
    if (!userId) return;

    const newClient: Partial<ClientWithUser> = {
      user_id: userId,
      surgery: '',
      client_name: '',
      client_phone: '',
      client_email: '',
      role: '',
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
          <button onClick={handleDownloadTemplate} className="grid-toolbar-button" title="Download Excel template">
            📥 Download Template
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="grid-toolbar-button"
            disabled={uploading}
            title="Upload filled template (Excel or CSV)"
          >
            {uploading ? '⏳ Uploading...' : '📤 Upload Bulk'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <CustomColumnManager
            tableName="clients"
            onColumnAdded={loadCustomColumns}
          />
          <button onClick={handleAddRow} className="grid-toolbar-button grid-toolbar-button-primary">
            ➕ Add Client
          </button>
        </div>
      </div>

      {/* Upload Message */}
      {uploadMessage && (
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: uploadMessage.type === 'success' ? '#d1fae5' : '#fee2e2',
            borderLeft: `4px solid ${uploadMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: uploadMessage.type === 'success' ? '#065f46' : '#991b1b',
            fontWeight: '600',
            fontSize: '14px'
          }}
        >
          {uploadMessage.text}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1">
        <DataGrid
          columns={orderedColumns}
          rows={sortedClients}
          rowKeyGetter={(row) => row.id}
          sortColumns={sortColumns}
          onSortColumnsChange={setSortColumns}
          onColumnsReorder={handleColumnsReorder}
          onColumnResize={handleColumnResize}
          defaultColumnOptions={{
            resizable: true,
            sortable: false,
          }}
          className="rdg-light fill-grid"
          style={{ height: '100%' }}
        />
      </div>

      {/* Notes Popup */}
      {notesPopupClientId && (
        <MultiNotesPopup
          entityId={notesPopupClientId}
          entityType="client"
          title="Client Notes"
          onClose={() => {
            setNotesPopupClientId(null);
            // Reload latest notes after closing popup (in case user added/edited notes)
            loadLatestNotes();
          }}
        />
      )}
    </div>
  );
}

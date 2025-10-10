'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import DataGrid, { Column, SortColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import '@/styles/data-grid-custom.css';
import { useSupabaseGridSync } from '@/hooks/useSupabaseGridSync';
import { useColumnPreferences } from '@/hooks/useColumnPreferences';
import ColumnFilter from './ColumnFilter';
import { Candidate } from '@/types';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { getCustomColumns, CustomColumn, getCustomColumnData, setCustomColumnValue } from '@/lib/custom-columns';
import { normalizeRole } from '@/lib/utils/roleNormalizer';
import { debounce } from 'lodash';

export default function CandidatesDataGrid() {
  const [userId, setUserId] = useState<string | null>(null);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [customData, setCustomData] = useState<Record<string, Record<string, string | null>>>({});
  const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    getCurrentUserId().then(userId => {
      console.log('[CandidatesGrid] User ID:', userId);
      setUserId(userId);
    }).catch(err => {
      console.error('[CandidatesGrid] Auth error:', err);
      setError(`Authentication error: ${err.message}`);
    });
  }, []);

  // Memoize filters to prevent infinite loop
  const supabaseFilters = useMemo(() => {
    return userId ? { user_id: userId } : {};
  }, [userId]);

  // Column preferences (order, widths, filters)
  const {
    columnOrder: savedOrder,
    columnFilters,
    updateColumnOrder,
    updateColumnFilters,
  } = useColumnPreferences(userId, 'candidates');

  // Load custom columns
  useEffect(() => {
    if (!userId) {
      console.log('[CandidatesGrid] No userId yet, skipping custom columns');
      return;
    }

    async function loadCustomColumns() {
      try {
        console.log('[CandidatesGrid] Loading custom columns...');
        const cols = await getCustomColumns('candidates');
        console.log('[CandidatesGrid] ✅ Loaded custom columns:', cols.length);
        setCustomColumns(cols);
      } catch (error) {
        console.error('[CandidatesGrid] ❌ Error loading custom columns:', error);
      }
    }

    loadCustomColumns();
  }, [userId]);

  // Sync with Supabase
  const {
    data: candidates,
    loading,
    insertRow,
    updateRow,
    deleteRow,
  } = useSupabaseGridSync<Candidate>({
    tableName: 'candidates',
    filters: supabaseFilters,
    orderBy: { column: 'created_at', ascending: false },
    onError: (error) => {
      console.error('[CandidatesGrid] Supabase error:', error);
      setError(`Database error: ${error.message}. Check console for details.`);
    },
  });

  // Load custom column data for all candidates
  useEffect(() => {
    if (candidates.length === 0) {
      console.log('[CandidatesGrid] No candidates yet, skipping custom data');
      return;
    }
    if (customColumns.length === 0) {
      console.log('[CandidatesGrid] No custom columns, skipping custom data');
      return;
    }

    async function loadCustomData() {
      console.log(`[CandidatesGrid] Loading custom data for ${candidates.length} candidates...`);
      const dataMap: Record<string, Record<string, string | null>> = {};

      for (const candidate of candidates) {
        try {
          const data = await getCustomColumnData('candidates', candidate.id);
          dataMap[candidate.id] = data;
        } catch (error) {
          console.error(`[CandidatesGrid] ❌ Error loading custom data for ${candidate.id}:`, error);
        }
      }

      console.log('[CandidatesGrid] ✅ Custom data loaded');
      setCustomData(dataMap);
    }

    loadCustomData();
  }, [candidates, customColumns]);

  // Debounced update for cell changes
  const debouncedUpdate = useMemo(
    () =>
      debounce(async (id: string, field: string, value: any) => {
        try {
          await updateRow(id, { [field]: value } as Partial<Candidate>);
        } catch (error) {
          console.error('Update failed:', error);
        }
      }, 300),
    [updateRow]
  );

  // Debounced update for custom columns
  const debouncedCustomUpdate = useMemo(
    () =>
      debounce(async (candidateId: string, columnName: string, value: string) => {
        try {
          await setCustomColumnValue('candidates', candidateId, columnName, value);
          // Update local state
          setCustomData((prev) => ({
            ...prev,
            [candidateId]: {
              ...prev[candidateId],
              [columnName]: value,
            },
          }));
        } catch (error) {
          console.error('Custom column update failed:', error);
        }
      }, 300),
    []
  );

  // Extract unique values for filterable columns
  const getFilterOptions = useCallback((columnKey: string): string[] => {
    const values = candidates.map(row => {
      const value = row[columnKey as keyof Candidate];
      return String(value || '');
    });
    return Array.from(new Set(values)).sort();
  }, [candidates]);

  // Standard columns definition with filters
  const standardColumns: Column<Candidate>[] = useMemo(
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
            checked={selectedRows.size === candidates.length && candidates.length > 0}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedRows(new Set(candidates.map((c) => c.id)));
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
        key: 'first_name',
        name: 'First Name',
        width: 150,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.first_name || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, first_name: e.target.value });
              debouncedUpdate(props.row.id, 'first_name', e.target.value);
            }}
          />
        ),
      },
      {
        key: 'last_name',
        name: 'Last Name',
        width: 150,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.last_name || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, last_name: e.target.value });
              debouncedUpdate(props.row.id, 'last_name', e.target.value);
            }}
          />
        ),
      },
      {
        key: 'email',
        name: 'Email',
        width: 200,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            type="email"
            className="rdg-text-editor"
            value={props.row.email || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, email: e.target.value });
              debouncedUpdate(props.row.id, 'email', e.target.value);
            }}
          />
        ),
      },
      {
        key: 'phone',
        name: 'Phone',
        width: 140,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            type="tel"
            className="rdg-text-editor"
            value={props.row.phone || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, phone: e.target.value });
              debouncedUpdate(props.row.id, 'phone', e.target.value);
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
        key: 'salary',
        name: 'Salary',
        width: 120,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.salary}
            onChange={(e) => {
              props.onRowChange({ ...props.row, salary: e.target.value });
              debouncedUpdate(props.row.id, 'salary', e.target.value);
            }}
          />
        ),
        headerRenderer: (props) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>Salary</span>
            <ColumnFilter
              columnKey="salary"
              columnName="Salary"
              options={getFilterOptions('salary')}
              selectedValues={columnFilters['salary'] || []}
              onFilterChange={(values) => {
                updateColumnFilters({
                  ...columnFilters,
                  salary: values,
                });
              }}
            />
          </div>
        ),
      },
      {
        key: 'days',
        name: 'Availability',
        width: 150,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.days}
            onChange={(e) => {
              props.onRowChange({ ...props.row, days: e.target.value });
              debouncedUpdate(props.row.id, 'days', e.target.value);
            }}
          />
        ),
        headerRenderer: (props) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>Availability</span>
            <ColumnFilter
              columnKey="days"
              columnName="Availability"
              options={getFilterOptions('days')}
              selectedValues={columnFilters['days'] || []}
              onFilterChange={(values) => {
                updateColumnFilters({
                  ...columnFilters,
                  days: values,
                });
              }}
            />
          </div>
        ),
      },
      {
        key: 'experience',
        name: 'Experience',
        width: 150,
        editable: true,
        renderEditCell: (props) => (
          <input
            autoFocus
            className="rdg-text-editor"
            value={props.row.experience || ''}
            onChange={(e) => {
              props.onRowChange({ ...props.row, experience: e.target.value });
              debouncedUpdate(props.row.id, 'experience', e.target.value);
            }}
          />
        ),
        headerRenderer: (props) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>Experience</span>
            <ColumnFilter
              columnKey="experience"
              columnName="Experience"
              options={getFilterOptions('experience')}
              selectedValues={columnFilters['experience'] || []}
              onFilterChange={(values) => {
                updateColumnFilters({
                  ...columnFilters,
                  experience: values,
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
    [candidates, selectedRows, debouncedUpdate, getFilterOptions, columnFilters, updateColumnFilters]
  );

  // Dynamic custom columns
  const dynamicColumns: Column<Candidate>[] = useMemo(
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
  const actionsColumn: Column<Candidate> = useMemo(
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
    const ordered: Column<Candidate>[] = [];

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
  }, [allColumns, savedOrder]);

  // Handle column reordering via drag-and-drop
  const handleColumnsReorder = useCallback((sourceKey: string, targetKey: string) => {
    const newOrder = [...orderedColumns];
    const sourceIndex = newOrder.findIndex(col => col.key === sourceKey);
    const targetIndex = newOrder.findIndex(col => col.key === targetKey);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const sourceCol = newOrder[sourceIndex];
    const targetCol = newOrder[targetIndex];

    // Don't allow reordering of frozen columns
    if (sourceCol.frozen || targetCol.frozen) {
      return;
    }

    // Swap positions
    const [removed] = newOrder.splice(sourceIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    // Save new order
    updateColumnOrder(newOrder.map(col => col.key as string));
  }, [orderedColumns, updateColumnOrder]);

  // Apply filters to data
  const filteredCandidates = useMemo(() => {
    let filtered = [...candidates];

    Object.entries(columnFilters).forEach(([columnKey, selectedValues]) => {
      if (selectedValues.length > 0) {
        filtered = filtered.filter(row => {
          const value = String(row[columnKey as keyof Candidate] || '');
          return selectedValues.includes(value);
        });
      }
    });

    return filtered;
  }, [candidates, columnFilters]);

  // Apply sorting
  const sortedCandidates = useMemo(() => {
    if (sortColumns.length === 0) return filteredCandidates;

    return [...filteredCandidates].sort((a, b) => {
      for (const sort of sortColumns) {
        const aValue = a[sort.columnKey as keyof Candidate];
        const bValue = b[sort.columnKey as keyof Candidate];

        if (aValue === bValue) continue;

        const comparison = aValue > bValue ? 1 : -1;
        return sort.direction === 'ASC' ? comparison : -comparison;
      }
      return 0;
    });
  }, [filteredCandidates, sortColumns]);

  // Handle delete
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this candidate?')) return;
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

    if (!confirm(`Delete ${selectedRows.size} selected candidate(s)?`)) return;

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

    const newCandidate: Partial<Candidate> = {
      user_id: userId,
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: 'Dental Nurse',
      postcode: '',
      salary: '',
      days: '',
      experience: '',
      notes: '',
    };

    try {
      await insertRow(newCandidate);
    } catch (error) {
      console.error('Add row failed:', error);
    }
  }, [userId, insertRow]);

  // Show error if any
  if (error) {
    return (
      <div className="grid-loading">
        <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>❌ Error Loading Candidates</h3>
          <p style={{ marginBottom: '12px' }}>{error}</p>
          <details style={{ marginTop: '16px', textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Troubleshooting Steps</summary>
            <ol style={{ marginTop: '12px', paddingLeft: '24px', lineHeight: '1.8' }}>
              <li>Check browser console (F12) for detailed error</li>
              <li>Verify you're logged in (User ID: {userId || 'NOT LOGGED IN'})</li>
              <li>Run <code>FIX_REALTIME_AND_RLS.sql</code> in Supabase</li>
              <li>Check Supabase RLS policies on candidates table</li>
              <li>Verify NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local</li>
            </ol>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            🔄 Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid-loading">
        <div className="grid-loading-spinner"></div>
        <p style={{ marginTop: '16px', color: '#64748b' }}>Loading candidates...</p>
        {userId && <p style={{ fontSize: '12px', color: '#94a3b8' }}>User ID: {userId}</p>}
      </div>
    );
  }

  const activeFiltersCount = Object.values(columnFilters).filter(v => v.length > 0).length;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="grid-toolbar">
        <div className="grid-toolbar-title">
          <span>👥 Candidates</span>
          <span className="text-sm font-normal opacity-90">
            ({sortedCandidates.length} {sortedCandidates.length !== candidates.length ? `of ${candidates.length}` : 'total'})
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
            ➕ Add Candidate
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1">
        <DataGrid
          columns={orderedColumns}
          rows={sortedCandidates}
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

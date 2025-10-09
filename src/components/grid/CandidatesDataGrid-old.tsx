'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import DataGrid, { Column, SortColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import '@/styles/data-grid-custom.css';
import { useSupabaseGridSync } from '@/hooks/useSupabaseGridSync';
import { Candidate } from '@/types';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { getCustomColumns, CustomColumn, getCustomColumnData, setCustomColumnValue } from '@/lib/custom-columns';
import { normalizeRole } from '@/lib/role-normalizer';
import { debounce } from 'lodash';

export default function CandidatesDataGrid() {
  const [userId, setUserId] = useState<string | null>(null);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [customData, setCustomData] = useState<Record<string, Record<string, string | null>>>({});
  const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Get current user
  useEffect(() => {
    getCurrentUserId().then(setUserId);
  }, []);

  // Load custom columns
  useEffect(() => {
    if (!userId) return;

    async function loadCustomColumns() {
      try {
        const cols = await getCustomColumns('candidates');
        setCustomColumns(cols);
      } catch (error) {
        console.error('Error loading custom columns:', error);
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
    filters: userId ? { user_id: userId } : {},
    orderBy: { column: 'created_at', ascending: false },
    onError: (error) => alert(`Error: ${error.message}`),
  });

  // Load custom column data for all candidates
  useEffect(() => {
    if (candidates.length === 0 || customColumns.length === 0) return;

    async function loadCustomData() {
      const dataMap: Record<string, Record<string, string | null>> = {};

      for (const candidate of candidates) {
        try {
          const data = await getCustomColumnData('candidates', candidate.id);
          dataMap[candidate.id] = data;
        } catch (error) {
          console.error(`Error loading custom data for ${candidate.id}:`, error);
        }
      }

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

  // Standard columns definition
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
    [candidates, selectedRows, debouncedUpdate]
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

  // Apply sorting
  const sortedCandidates = useMemo(() => {
    if (sortColumns.length === 0) return candidates;

    return [...candidates].sort((a, b) => {
      for (const sort of sortColumns) {
        const aValue = a[sort.columnKey as keyof Candidate];
        const bValue = b[sort.columnKey as keyof Candidate];

        if (aValue === bValue) continue;

        const comparison = aValue > bValue ? 1 : -1;
        return sort.direction === 'ASC' ? comparison : -comparison;
      }
      return 0;
    });
  }, [candidates, sortColumns]);

  // Handle delete
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this candidate?')) return;
      try {
        await deleteRow(id);
        // Remove from selected
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

  if (loading) {
    return (
      <div className="grid-loading">
        <div className="grid-loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="grid-toolbar">
        <div className="grid-toolbar-title">
          <span>👥 Candidates</span>
          <span className="text-sm font-normal opacity-90">({candidates.length} total)</span>
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
          columns={allColumns}
          rows={sortedCandidates}
          rowKeyGetter={(row) => row.id}
          sortColumns={sortColumns}
          onSortColumnsChange={setSortColumns}
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

'use client';

import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import DataGrid, { Column, SortColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import '@/styles/data-grid-custom.css';
import { useSupabaseGridSync } from '@/hooks/useSupabaseGridSync';
import { useColumnPreferences } from '@/hooks/useColumnPreferences';
import ColumnFilter from './ColumnFilter';
import { Candidate } from '@/types';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { getCustomColumns, CustomColumn, getCustomColumnData, setCustomColumnValue, updateCustomColumn, deleteCustomColumn } from '@/lib/custom-columns';
import { normalizeRole } from '@/lib/utils/roleNormalizer';
import { debounce } from 'lodash';
import CustomColumnManager from './CustomColumnManager';
import EditableColumnHeader from './EditableColumnHeader';
import MultiNotesPopup from './MultiNotesPopup';
import BulkParseModal from './BulkParseModal';
import CVViewerModal from '@/components/cv/CVViewerModal';
import CVPreviewModal from '@/components/cv/CVPreviewModal';
import CVUploader from '@/components/cv/CVUploader';
import { parseNameFromEmail, findDuplicateCandidates, getDuplicateReasonText, isValidEmail } from '@/lib/utils/candidateHelpers';

export default function CandidatesDataGrid() {
  const [userId, setUserId] = useState<string | null>(null);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [customData, setCustomData] = useState<Record<string, Record<string, string | null>>>({});
  const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [columnRenames, setColumnRenames] = useState<Record<string, string>>({});
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [editingHeaderId, setEditingHeaderId] = useState<string | null>(null);
  const [headerEditValue, setHeaderEditValue] = useState<string>('');
  const [textFilters, setTextFilters] = useState<Record<string, string>>({});
  const [notesPopupCandidateId, setNotesPopupCandidateId] = useState<string | null>(null);
  const [latestNotes, setLatestNotes] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showBulkParseModal, setShowBulkParseModal] = useState(false);
  const [showCVUploader, setShowCVUploader] = useState(false);
  const [selectedCVId, setSelectedCVId] = useState<string | null>(null);
  const [previewCVId, setPreviewCVId] = useState<string | null>(null);
  const [candidateCVs, setCandidateCVs] = useState<Record<string, { id: string; filename: string; status: string }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Validation state: tracks validation status for role and postcode fields
  const [fieldValidation, setFieldValidation] = useState<Record<string, {
    role?: { valid: boolean; message: string };
    postcode?: { valid: boolean; message: string };
  }>>({});

  // Name suggestion from email parsing
  const [nameSuggestions, setNameSuggestions] = useState<Record<string, {
    firstName: string;
    lastName: string;
    fromEmail: string;
  }>>({});

  // Duplicate candidate warnings
  const [duplicateWarnings, setDuplicateWarnings] = useState<Record<string, Array<{
    id: string;
    first_name: string;
    last_name: string;
    matchReason: string;
  }>>>({});

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

  // Memoize orderBy to prevent infinite loop
  const supabaseOrderBy = useMemo(() => {
    return { column: 'created_at', ascending: false };
  }, []);

  // Memoize error handler to prevent infinite loop
  const handleSupabaseError = useCallback((error: Error) => {
    console.error('[CandidatesGrid] Supabase error:', error);
    setError(`Database error: ${error.message}. Check console for details.`);
  }, []);

  // Column preferences (order, widths, filters)
  const {
    columnOrder: savedOrder,
    columnWidths: savedWidths,
    columnFilters,
    updateColumnOrder,
    updateColumnWidths,
    updateColumnFilters,
  } = useColumnPreferences(userId, 'candidates');

  // Load column renames and hidden columns from localStorage
  useEffect(() => {
    if (!userId) return;

    try {
      const renamesKey = `column-renames-candidates-${userId}`;
      const hiddenKey = `column-hidden-candidates-${userId}`;

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

  // Load custom columns
  const loadCustomColumns = useCallback(async () => {
    if (!userId) {
      console.log('[CandidatesGrid] No userId yet, skipping custom columns');
      return;
    }

    try {
      console.log('[CandidatesGrid] Loading custom columns...');
      const cols = await getCustomColumns('candidates');
      console.log('[CandidatesGrid] ✅ Loaded custom columns:', cols.length);
      setCustomColumns(cols);
    } catch (error) {
      console.error('[CandidatesGrid] ❌ Error loading custom columns:', error);
    }
  }, [userId]);

  useEffect(() => {
    loadCustomColumns();
  }, [loadCustomColumns]);

  // Sync with Supabase
  const {
    data: candidates,
    loading,
    insertRow,
    updateRow,
    deleteRow,
    refresh,
  } = useSupabaseGridSync<Candidate>({
    tableName: 'candidates',
    filters: supabaseFilters,
    orderBy: supabaseOrderBy,
    onError: handleSupabaseError,
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

  // Load latest notes for all candidates
  const loadLatestNotes = useCallback(async () => {
    try {
      const response = await fetch('/api/notes/candidates/latest');
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
    if (candidates.length > 0) {
      loadLatestNotes();
    }
  }, [candidates.length, loadLatestNotes]);

  // Load CVs linked to candidates
  const loadCandidateCVs = useCallback(async () => {
    try {
      const response = await fetch('/api/cvs/upload');
      const data = await response.json();

      if (data.success && data.cvs) {
        const cvMap: Record<string, { id: string; filename: string; status: string }> = {};
        for (const cv of data.cvs) {
          if (cv.candidate_id) {
            cvMap[cv.candidate_id] = {
              id: cv.id,
              filename: cv.cv_filename,
              status: cv.status,
            };
          }
        }
        setCandidateCVs(cvMap);
      }
    } catch (error) {
      console.error('Error fetching candidate CVs:', error);
    }
  }, []);

  useEffect(() => {
    if (candidates.length > 0) {
      loadCandidateCVs();
    }
  }, [candidates.length, loadCandidateCVs]);

  // Debounced update for cell changes - increased to 1500ms for better typing experience
  const debouncedUpdate = useMemo(
    () =>
      debounce(async (id: string, field: string, value: any) => {
        try {
          await updateRow(id, { [field]: value } as Partial<Candidate>);
        } catch (error) {
          console.error('Update failed:', error);
        }
      }, 1500),
    [updateRow]
  );

  // Debounced update for custom columns - increased to 1500ms
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
      }, 1500),
    []
  );

  // AI Validation function - flexible validation using AI
  const validateField = useCallback(async (candidateId: string, fieldType: 'role' | 'postcode', value: string) => {
    // Skip validation if field is empty (already handled by red highlighting)
    if (!value || value.trim() === '') {
      setFieldValidation(prev => ({
        ...prev,
        [candidateId]: {
          ...prev[candidateId],
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
          [candidateId]: {
            ...prev[candidateId],
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
      debounce((candidateId: string, fieldType: 'role' | 'postcode', value: string) => {
        validateField(candidateId, fieldType, value);
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
  const handleDeleteCustomColumn = useCallback(async (columnId: string, columnName: string) => {
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
      const renamesKey = `column-renames-candidates-${userId}`;
      localStorage.setItem(renamesKey, JSON.stringify(newRenames));
    }
  }, [columnRenames, userId]);

  // Handle hiding/deleting standard column
  const handleHideColumn = useCallback(async (columnKey: string) => {
    const newHidden = new Set(hiddenColumns);
    newHidden.add(columnKey);
    setHiddenColumns(newHidden);

    if (userId) {
      const hiddenKey = `column-hidden-candidates-${userId}`;
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

  // Extract unique values for filterable columns
  const getFilterOptions = useCallback((columnKey: string): string[] => {
    const values = candidates.map(row => {
      const value = row[columnKey as keyof Candidate];
      return String(value || '');
    });
    return Array.from(new Set(values)).sort();
  }, [candidates]);

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
      // Return everything after first underscore (e.g., "U3_CAN27" -> "CAN27")
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

  // Standard columns definition with filters
  const standardColumns: Column<Candidate>[] = useMemo(
    () => [
      {
        key: 'select',
        name: '',
        width: 50,
        frozen: true,
        resizable: false,
        headerCellClass: 'rdg-checkbox-label',
        renderHeaderCell: (p) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
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
          </div>
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
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            width: '100%',
            paddingLeft: '8px',
            paddingRight: '8px',
            overflow: 'hidden',
            boxSizing: 'border-box'
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
        key: 'first_name',
        name: columnRenames['first_name'] || 'First Name',
        width: savedWidths['first_name'] || 150,
        editable: true,
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="first_name"
            columnName={columnRenames['first_name'] || 'First Name'}
            onRename={(newName) => handleRenameColumn('first_name', newName)}
            onDelete={() => handleHideColumn('first_name')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['first_name'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('first_name', value)}
            currentWidth={savedWidths['first_name'] || 150}
            onColumnResize={handleColumnResizeByKey}
          />
        ),
        renderCell: ({ row }) => (
          <div title={row.first_name || ''}>{row.first_name || ''}</div>
        ),
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
        name: columnRenames['last_name'] || 'Last Name',
        width: savedWidths['last_name'] || 150,
        editable: true,
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="last_name"
            columnName={columnRenames['last_name'] || 'Last Name'}
            onRename={(newName) => handleRenameColumn('last_name', newName)}
            onDelete={() => handleHideColumn('last_name')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['last_name'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('last_name', value)}
            currentWidth={savedWidths['last_name'] || 150}
            onColumnResize={handleColumnResizeByKey}
          />
        ),
        renderCell: ({ row }) => (
          <div title={row.last_name || ''}>{row.last_name || ''}</div>
        ),
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
        name: columnRenames['email'] || 'Email',
        width: savedWidths['email'] || 200,
        editable: true,
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="email"
            columnName={columnRenames['email'] || 'Email'}
            onRename={(newName) => handleRenameColumn('email', newName)}
            onDelete={() => handleHideColumn('email')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['email'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('email', value)}
            currentWidth={savedWidths['email'] || 200}
            onColumnResize={handleColumnResizeByKey}
          />
        ),
        renderCell: ({ row }) => (
          <div title={row.email || ''}>{row.email || ''}</div>
        ),
        renderEditCell: (props) => (
          <div className="relative">
            <input
              autoFocus
              type="email"
              className="rdg-text-editor"
              value={props.row.email || ''}
              onChange={(e) => {
                props.onRowChange({ ...props.row, email: e.target.value });
                debouncedUpdate(props.row.id, 'email', e.target.value);
              }}
              onBlur={async (e) => {
                const email = e.target.value.trim();
                if (!email || !isValidEmail(email)) return;

                // Parse name from email
                const parsedName = parseNameFromEmail(email);
                if (parsedName && parsedName.firstName) {
                  // Only suggest if first_name or last_name are empty
                  if (!props.row.first_name || !props.row.last_name) {
                    setNameSuggestions(prev => ({
                      ...prev,
                      [props.row.id]: {
                        firstName: parsedName.firstName,
                        lastName: parsedName.lastName,
                        fromEmail: email
                      }
                    }));
                  }
                }

                // Check for duplicates
                if (userId) {
                  const duplicates = await findDuplicateCandidates(
                    {
                      email,
                      phone: props.row.phone,
                      first_name: props.row.first_name,
                      last_name: props.row.last_name,
                      postcode: props.row.postcode
                    },
                    userId,
                    props.row.id
                  );

                  if (duplicates.length > 0) {
                    setDuplicateWarnings(prev => ({
                      ...prev,
                      [props.row.id]: duplicates.map(d => ({
                        id: d.id,
                        first_name: d.first_name,
                        last_name: d.last_name,
                        matchReason: getDuplicateReasonText(d.matchReason)
                      }))
                    }));
                  }
                }
              }}
            />
          </div>
        ),
      },
      {
        key: 'phone',
        name: columnRenames['phone'] || 'Phone',
        width: savedWidths['phone'] || 140,
        editable: true,
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="phone"
            columnName={columnRenames['phone'] || 'Phone'}
            onRename={(newName) => handleRenameColumn('phone', newName)}
            onDelete={() => handleHideColumn('phone')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['phone'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('phone', value)}
            currentWidth={savedWidths['phone'] || 140}
            onColumnResize={handleColumnResizeByKey}
          />
        ),
        renderCell: ({ row }) => (
          <div title={row.phone || ''}>{row.phone || ''}</div>
        ),
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
        name: columnRenames['role'] || 'Role',
        width: savedWidths['role'] || 150,
        editable: true,
        cellClass: (row) => {
          // ⚠️ FLAGGED FIELD: Red background if empty OR invalid (recommended for matching)
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

          let displayText = row.role || '⚠️ MISSING';
          let titleText = 'Role recommended for matching. Missing roles will be flagged.';

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
            placeholder="Enter role (recommended)"
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
          // ⚠️ FLAGGED FIELD: Red background if empty OR invalid (recommended for matching)
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

          let displayText = row.postcode || '⚠️ MISSING';
          let titleText = 'Postcode recommended for matching. Missing postcodes will be flagged.';

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
            placeholder="Enter postcode (recommended)"
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
        key: 'salary',
        name: columnRenames['salary'] || 'Salary',
        width: savedWidths['salary'] || 120,
        editable: true,
        renderCell: ({ row }) => (
          <div title={row.salary}>{row.salary}</div>
        ),
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
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="salary"
            columnName={columnRenames['salary'] || 'Salary'}
            onRename={(newName) => handleRenameColumn('salary', newName)}
            onDelete={() => handleHideColumn('salary')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['salary'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('salary', value)}
            currentWidth={savedWidths['salary'] || 120}
            onColumnResize={handleColumnResizeByKey}
          />
        ),
      },
      {
        key: 'days',
        name: columnRenames['days'] || 'Availability',
        width: savedWidths['days'] || 150,
        editable: true,
        renderCell: ({ row }) => (
          <div title={row.days}>{row.days}</div>
        ),
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
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="days"
            columnName={columnRenames['days'] || 'Availability'}
            onRename={(newName) => handleRenameColumn('days', newName)}
            onDelete={() => handleHideColumn('days')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['days'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('days', value)}
            currentWidth={savedWidths['days'] || 150}
            onColumnResize={handleColumnResizeByKey}
          />
        ),
      },
      {
        key: 'experience',
        name: columnRenames['experience'] || 'Experience',
        width: savedWidths['experience'] || 150,
        editable: true,
        renderCell: ({ row }) => (
          <div title={row.experience || ''}>{row.experience || ''}</div>
        ),
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
        renderHeaderCell: () => (
          <EditableColumnHeader
            columnKey="experience"
            columnName={columnRenames['experience'] || 'Experience'}
            onRename={(newName) => handleRenameColumn('experience', newName)}
            onDelete={() => handleHideColumn('experience')}
            canEdit={true}
            canDelete={true}
            showTextFilter={true}
            textFilterValue={textFilters['experience'] || ''}
            onTextFilterChange={(value) => handleTextFilterChange('experience', value)}
            currentWidth={savedWidths['experience'] || 150}
            onColumnResize={handleColumnResizeByKey}
          />
        ),
      },
      {
        key: 'notes',
        name: columnRenames['notes'] || 'Notes',
        width: savedWidths['notes'] || 200,
        editable: true,
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
                setNotesPopupCandidateId(row.id);
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
      {
        key: 'cv',
        name: columnRenames['cv'] || 'CV',
        width: savedWidths['cv'] || 100,
        editable: false,
        renderHeaderCell: () => (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            width: '100%',
            paddingLeft: '8px',
            paddingRight: '8px',
            overflow: 'hidden',
            boxSizing: 'border-box'
          }}>
            📄 CV
          </div>
        ),
        renderCell: ({ row }) => {
          const cv = candidateCVs[row.id];

          if (cv) {
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {/* Quick Preview Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewCVId(cv.id);
                  }}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    fontSize: '11px',
                    fontWeight: '600',
                    border: 'none',
                  }}
                  title={`Preview CV: ${cv.filename}`}
                >
                  👁️ View
                </button>
                {/* Info/Details Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCVId(cv.id);
                  }}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    backgroundColor: cv.status === 'linked' ? '#d1fae5' : '#e5e7eb',
                    color: cv.status === 'linked' ? '#065f46' : '#374151',
                    fontSize: '11px',
                    border: 'none',
                  }}
                  title="View CV details & parsed data"
                >
                  ℹ️
                </button>
              </div>
            );
          }

          return (
            <div
              style={{
                color: '#9ca3af',
                fontSize: '12px',
              }}
              title="No CV attached"
            >
              —
            </div>
          );
        },
      },
    ],
    [candidates, selectedRows, debouncedUpdate, getFilterOptions, columnFilters, updateColumnFilters, columnRenames, handleRenameColumn, handleHideColumn, savedWidths, textFilters, handleTextFilterChange, latestNotes, isNewItem, getDisplayId, fieldValidation, debouncedValidate, handleColumnResizeByKey, candidateCVs]
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
  const dynamicColumns: Column<Candidate>[] = useMemo(
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
            onDelete={() => handleDeleteCustomColumn(col.id, col.column_label)}
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
    [customColumns, customData, debouncedCustomUpdate, handleRenameCustomColumn, handleDeleteCustomColumn, savedWidths, textFilters, handleTextFilterChange]
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

  // Apply filters to data
  const filteredCandidates = useMemo(() => {
    let filtered = [...candidates];

    // Apply dropdown filters
    Object.entries(columnFilters).forEach(([columnKey, selectedValues]) => {
      if (selectedValues.length > 0) {
        filtered = filtered.filter(row => {
          const value = String(row[columnKey as keyof Candidate] || '');
          return selectedValues.includes(value);
        });
      }
    });

    // Apply text filters (standard columns)
    Object.entries(textFilters).forEach(([columnKey, filterText]) => {
      if (filterText.trim()) {
        filtered = filtered.filter(row => {
          // Check if it's a standard column
          const standardValue = row[columnKey as keyof Candidate];
          if (standardValue !== undefined) {
            const value = String(standardValue || '').toLowerCase();
            return value.includes(filterText.toLowerCase());
          }

          // Check if it's a custom column
          const customValue = customData[row.id]?.[columnKey];
          if (customValue !== undefined) {
            const value = String(customValue || '').toLowerCase();
            return value.includes(filterText.toLowerCase());
          }

          return false;
        });
      }
    });

    return filtered;
  }, [candidates, columnFilters, textFilters, customData]);

  // Apply sorting - ALWAYS sort by created_at DESC when no user sorting is applied
  const sortedCandidates = useMemo(() => {
    // If no user-defined sort columns, maintain created_at DESC (newest first)
    if (sortColumns.length === 0) {
      return [...filteredCandidates].sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return bTime - aTime; // Descending (newest first)
      });
    }

    // User has clicked a column header to sort
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
      role: '',
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

  // Handle download template
  const handleDownloadTemplate = useCallback(() => {
    window.open('/api/templates/candidates', '_blank');
  }, []);

  // Handle bulk upload
  const handleBulkUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/candidates', {
        method: 'POST',
        body: formData,
      });

      // ✅ FIX: Try to parse as JSON regardless of content-type if response is successful
      let result;
      try {
        result = await response.json();
      } catch (jsonError) {
        // If JSON parsing fails, check if it's HTML
        const contentType = response.headers.get('content-type');

        if (!contentType || !contentType.includes('application/json')) {
          console.error('Server returned non-JSON response');

          setUploadMessage({
            type: 'error',
            text: `❌ Upload failed: Server error (received invalid response). Please try again or contact support.`
          });
          return;
        }

        throw jsonError;
      }

      if (result.success) {
        setUploadMessage({
          type: 'success',
          text: `✅ ${result.message}${result.validationErrors && result.validationErrors.length > 0 ? ` (${result.validationErrors.length} errors)` : ''}`
        });

        // ✅ AUTO-REFRESH: Reload grid data to show newly uploaded candidates
        console.log('✅ Upload successful - refreshing grid data...');
        await refresh();

        // Automatically clear message after 5 seconds
        setTimeout(() => setUploadMessage(null), 5000);
      } else {
        // Show detailed error with validation errors if available
        let errorText = `❌ ${result.error || 'Upload failed'}`;

        if (result.validationErrors && result.validationErrors.length > 0) {
          errorText += `\n\nErrors found in ${result.validationErrors.length} row(s):\n`;
          errorText += result.validationErrors.slice(0, 5).join('\n');
          if (result.validationErrors.length > 5) {
            errorText += `\n... and ${result.validationErrors.length - 5} more`;
          }
        }

        // Add helpful tip if provided
        if (result.helpText) {
          errorText += `\n\n${result.helpText}`;
        }

        setUploadMessage({
          type: 'error',
          text: errorText
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
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [refresh]);

  // Handle file input change
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleBulkUpload(file);
    }
  }, [handleBulkUpload]);

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
          <button
            onClick={() => setShowBulkParseModal(true)}
            className="grid-toolbar-button"
            title="AI-powered bulk parsing - paste any messy data!"
          >
            🤖 AI Bulk Parse
          </button>
          <button
            onClick={() => setShowCVUploader(true)}
            className="grid-toolbar-button"
            title="Upload CVs to match with candidates"
          >
            📄 Upload CVs
          </button>
          <CustomColumnManager
            tableName="candidates"
            onColumnAdded={loadCustomColumns}
          />
          <button onClick={handleAddRow} className="grid-toolbar-button grid-toolbar-button-primary">
            ➕ Add Candidate
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
            fontSize: '14px',
            whiteSpace: 'pre-wrap', // ✅ Preserve line breaks
            maxHeight: '300px',
            overflowY: 'auto'
          }}
        >
          {uploadMessage.text}
        </div>
      )}

      {/* Name Suggestions from Email */}
      {Object.entries(nameSuggestions).map(([candidateId, suggestion]) => (
        <div
          key={`suggestion-${candidateId}`}
          style={{
            padding: '12px 16px',
            marginBottom: '8px',
            backgroundColor: '#dbeafe',
            border: '1px solid #3b82f6',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <strong style={{ color: '#1e40af' }}>💡 Name Suggestion:</strong>
            <span style={{ marginLeft: '8px', color: '#1e3a8a' }}>
              Is this person called <strong>{suggestion.firstName} {suggestion.lastName}</strong>?
              (from {suggestion.fromEmail})
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                // Apply the suggestion
                const candidate = candidates.find(c => c.id === candidateId);
                if (candidate) {
                  updateRow(candidateId, {
                    ...candidate,
                    first_name: suggestion.firstName,
                    last_name: suggestion.lastName
                  });
                }
                // Remove suggestion
                setNameSuggestions(prev => {
                  const updated = { ...prev };
                  delete updated[candidateId];
                  return updated;
                });
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              ✓ Yes, apply
            </button>
            <button
              onClick={() => {
                // Dismiss suggestion
                setNameSuggestions(prev => {
                  const updated = { ...prev };
                  delete updated[candidateId];
                  return updated;
                });
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              ✕ No, dismiss
            </button>
          </div>
        </div>
      ))}

      {/* Duplicate Candidate Warnings */}
      {Object.entries(duplicateWarnings).map(([candidateId, duplicates]) => (
        <div
          key={`warning-${candidateId}`}
          style={{
            padding: '12px 16px',
            marginBottom: '8px',
            backgroundColor: '#fef3c7',
            border: '2px solid #f59e0b',
            borderRadius: '6px'
          }}
        >
          <div style={{ marginBottom: '8px' }}>
            <strong style={{ color: '#92400e' }}>⚠️ Similar Candidate(s) Found:</strong>
          </div>
          {duplicates.map((dup, idx) => (
            <div
              key={idx}
              style={{
                marginLeft: '24px',
                marginBottom: '4px',
                color: '#78350f'
              }}
            >
              • <strong>{dup.first_name} {dup.last_name}</strong> ({dup.id}) - {dup.matchReason}
            </div>
          ))}
          <button
            onClick={() => {
              // Dismiss warning
              setDuplicateWarnings(prev => {
                const updated = { ...prev };
                delete updated[candidateId];
                return updated;
              });
            }}
            style={{
              marginTop: '8px',
              padding: '4px 12px',
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Dismiss
          </button>
        </div>
      ))}

      {/* Grid */}
      <div className="flex-1">
        <DataGrid
          columns={orderedColumns}
          rows={sortedCandidates}
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
      {notesPopupCandidateId && (
        <MultiNotesPopup
          entityId={notesPopupCandidateId}
          entityType="candidate"
          title="Candidate Notes"
          onClose={() => {
            setNotesPopupCandidateId(null);
            // Reload latest notes after closing popup (in case user added/edited notes)
            loadLatestNotes();
          }}
        />
      )}

      {/* Bulk Parse Modal */}
      {showBulkParseModal && (
        <BulkParseModal
          type="candidates"
          onClose={() => setShowBulkParseModal(false)}
          onSuccess={() => {
            // Grid will auto-refresh via real-time subscription
            loadLatestNotes();
          }}
        />
      )}

      {/* CV Uploader Modal */}
      {showCVUploader && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center">
            <div
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={() => setShowCVUploader(false)}
            />
            <div className="relative inline-block w-full max-w-xl p-6 my-8 text-left align-middle bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  📄 Upload CVs
                </h3>
                <button
                  onClick={() => setShowCVUploader(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Upload CVs to be parsed by AI and automatically matched to existing candidates.
              </p>
              <CVUploader
                onUploadComplete={() => {
                  loadCandidateCVs();
                }}
                onParseComplete={() => {
                  loadCandidateCVs();
                }}
              />
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowCVUploader(false)}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CV Viewer Modal (Details & Parsed Data) */}
      {selectedCVId && (
        <CVViewerModal
          cvId={selectedCVId}
          isOpen={!!selectedCVId}
          onClose={() => setSelectedCVId(null)}
          onDelete={() => {
            setSelectedCVId(null);
            loadCandidateCVs();
          }}
          onUnlink={() => {
            loadCandidateCVs();
          }}
        />
      )}

      {/* CV Preview Modal (Quick Full-Screen Preview) */}
      {previewCVId && (
        <CVPreviewModal
          cvId={previewCVId}
          isOpen={!!previewCVId}
          onClose={() => setPreviewCVId(null)}
        />
      )}
    </div>
  );
}

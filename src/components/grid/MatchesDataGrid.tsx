'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import DataGrid, { Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import '@/styles/data-grid-custom.css';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { normalizeRole } from '@/lib/utils/roleNormalizer';

// Match type with all fields
interface MatchRow {
  id: string;
  can_id: string;
  can_role: string;
  can_postcode: string;
  can_salary: string;
  can_days: string;
  can_email?: string;
  can_phone?: string;
  cl_id: string;
  cl_surgery: string;
  cl_role: string;
  cl_postcode: string;
  cl_budget?: string;
  cl_requirement?: string;
  cl_system?: string;
  commute_minutes: number;
  commute_display: string;
  role_match: boolean;
  role_match_display: string;
  notes?: string;
  status?: string;
}

interface MatchesDataGridProps {
  matches: any[];
  onRefresh?: () => void;
}

export default function MatchesDataGrid({ matches, onRefresh }: MatchesDataGridProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
    // Required columns (always visible)
    'commute',
    'role_match',
    'can_id',
    'can_role',
    'can_postcode',
    'cl_id',
    'cl_role',
    'cl_postcode',
    // Optional columns (default visible)
    'can_salary',
    'can_days',
    'cl_budget',
    'cl_requirement',
  ]));

  // Get current user
  useEffect(() => {
    getCurrentUserId().then(setUserId);
  }, []);

  // Load column visibility preferences from localStorage
  useEffect(() => {
    if (!userId) return;

    try {
      const storageKey = `matches-visible-columns-${userId}`;
      const stored = localStorage.getItem(storageKey);

      if (stored) {
        setVisibleColumns(new Set(JSON.parse(stored)));
      }
    } catch (error) {
      console.error('Failed to load column visibility preferences:', error);
    }
  }, [userId]);

  // Save column visibility preferences
  const toggleColumn = useCallback((columnKey: string, required: boolean) => {
    if (required) return; // Can't hide required columns

    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnKey)) {
        newSet.delete(columnKey);
      } else {
        newSet.add(columnKey);
      }

      // Save to localStorage
      if (userId) {
        const storageKey = `matches-visible-columns-${userId}`;
        localStorage.setItem(storageKey, JSON.stringify(Array.from(newSet)));
      }

      return newSet;
    });
  }, [userId]);

  // Transform matches into grid rows
  const rows: MatchRow[] = useMemo(() => {
    return matches.map((match, index) => ({
      id: `match-${index}`,
      can_id: match.candidate.id,
      can_role: normalizeRole(match.candidate.role),
      can_postcode: match.candidate.postcode,
      can_salary: match.candidate.salary || '',
      can_days: match.candidate.days || '',
      can_email: match.candidate.email,
      can_phone: match.candidate.phone,
      cl_id: match.client.id,
      cl_surgery: match.client.surgery,
      cl_role: normalizeRole(match.client.role),
      cl_postcode: match.client.postcode,
      cl_budget: match.client.budget,
      cl_requirement: match.client.requirement,
      cl_system: match.client.system,
      commute_minutes: match.commute_minutes,
      commute_display: match.commute_display,
      role_match: match.role_match,
      role_match_display: match.role_match_display,
      notes: '',
      status: 'New',
    }));
  }, [matches]);

  // Column definitions
  const allColumns: Column<MatchRow>[] = useMemo(() => [
    // COMMUTE (Required)
    {
      key: 'commute',
      name: '🚗 Commute',
      minWidth: 100,
      maxWidth: 120,
      frozen: true,
      renderCell: ({ row }) => (
        <div className="font-semibold" title={`${row.commute_minutes} minutes`}>
          {row.commute_display}
        </div>
      ),
    },
    // ROLE MATCH (Required)
    {
      key: 'role_match',
      name: '✓ Match',
      minWidth: 90,
      maxWidth: 110,
      frozen: true,
      renderCell: ({ row }) => (
        <div className="flex items-center justify-center">
          <span className={`px-2 py-1 rounded text-xs font-bold ${
            row.role_match
              ? 'bg-green-100 text-green-800 border border-green-300'
              : 'bg-orange-100 text-orange-800 border border-orange-300'
          }`}>
            {row.role_match ? '✅ Role' : '📍 Location'}
          </span>
        </div>
      ),
    },
    // CANDIDATE ID (Required)
    {
      key: 'can_id',
      name: 'CAN ID',
      minWidth: 100,
      renderCell: ({ row }) => (
        <div className="font-semibold text-blue-700" title={row.can_id}>
          {row.can_id}
        </div>
      ),
    },
    // CANDIDATE ROLE (Required)
    {
      key: 'can_role',
      name: 'CAN Role',
      minWidth: 120,
      renderCell: ({ row }) => (
        <div className="font-medium" title={row.can_role}>
          {row.can_role}
        </div>
      ),
    },
    // CANDIDATE POSTCODE (Required)
    {
      key: 'can_postcode',
      name: 'CAN PC',
      minWidth: 90,
      renderCell: ({ row }) => (
        <div className="font-mono font-semibold" title={row.can_postcode}>
          {row.can_postcode}
        </div>
      ),
    },
    // CANDIDATE SALARY (Optional)
    {
      key: 'can_salary',
      name: 'CAN £',
      minWidth: 90,
      renderCell: ({ row }) => (
        <div title={row.can_salary}>
          {row.can_salary}
        </div>
      ),
    },
    // CANDIDATE DAYS (Optional)
    {
      key: 'can_days',
      name: 'CAN Days',
      minWidth: 100,
      renderCell: ({ row }) => (
        <div title={row.can_days}>
          {row.can_days}
        </div>
      ),
    },
    // CLIENT ID (Required)
    {
      key: 'cl_id',
      name: 'CL ID',
      minWidth: 100,
      renderCell: ({ row }) => (
        <div className="font-semibold text-purple-700" title={row.cl_id}>
          {row.cl_id}
        </div>
      ),
    },
    // CLIENT SURGERY (Optional)
    {
      key: 'cl_surgery',
      name: 'Surgery',
      minWidth: 120,
      renderCell: ({ row }) => (
        <div title={row.cl_surgery}>
          {row.cl_surgery}
        </div>
      ),
    },
    // CLIENT ROLE (Required)
    {
      key: 'cl_role',
      name: 'CL Role',
      minWidth: 120,
      renderCell: ({ row }) => (
        <div className="font-medium" title={row.cl_role}>
          {row.cl_role}
        </div>
      ),
    },
    // CLIENT POSTCODE (Required)
    {
      key: 'cl_postcode',
      name: 'CL PC',
      minWidth: 90,
      renderCell: ({ row }) => (
        <div className="font-mono font-semibold" title={row.cl_postcode}>
          {row.cl_postcode}
        </div>
      ),
    },
    // CLIENT BUDGET (Optional)
    {
      key: 'cl_budget',
      name: 'CL £',
      minWidth: 90,
      renderCell: ({ row }) => (
        <div title={row.cl_budget || ''}>
          {row.cl_budget || ''}
        </div>
      ),
    },
    // CLIENT REQUIREMENT (Optional)
    {
      key: 'cl_requirement',
      name: 'CL Days',
      minWidth: 100,
      renderCell: ({ row }) => (
        <div title={row.cl_requirement || ''}>
          {row.cl_requirement || ''}
        </div>
      ),
    },
    // CLIENT SYSTEM (Optional)
    {
      key: 'cl_system',
      name: 'System',
      minWidth: 90,
      renderCell: ({ row }) => (
        <div title={row.cl_system || ''}>
          {row.cl_system || ''}
        </div>
      ),
    },
    // STATUS (Optional)
    {
      key: 'status',
      name: 'Status',
      minWidth: 100,
      renderCell: ({ row }) => (
        <div className="flex items-center justify-center">
          <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
            🟢 {row.status}
          </span>
        </div>
      ),
    },
    // NOTES (Optional)
    {
      key: 'notes',
      name: 'Notes',
      minWidth: 120,
      renderCell: ({ row }) => (
        <div className="text-gray-500 italic text-sm" title={row.notes || 'No notes'}>
          {row.notes || '(Add notes)'}
        </div>
      ),
    },
  ], []);

  // Filter columns based on visibility
  const visibleColumnsArray = useMemo(() => {
    return allColumns.filter(col => visibleColumns.has(col.key as string));
  }, [allColumns, visibleColumns]);

  // Required columns (cannot be hidden)
  const requiredColumns = new Set([
    'commute',
    'role_match',
    'can_id',
    'can_role',
    'can_postcode',
    'cl_id',
    'cl_role',
    'cl_postcode',
  ]);

  // Optional columns (can be toggled)
  const optionalColumns = [
    { key: 'can_salary', name: 'CAN Salary (£)' },
    { key: 'can_days', name: 'CAN Availability' },
    { key: 'cl_surgery', name: 'Surgery Name' },
    { key: 'cl_budget', name: 'CL Budget (£)' },
    { key: 'cl_requirement', name: 'CL Days Required' },
    { key: 'cl_system', name: 'System Used' },
    { key: 'status', name: 'Match Status' },
    { key: 'notes', name: 'Notes' },
  ];

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Column Visibility Controls */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-4 border-b-2 border-gray-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-lg">🔍 Matches</span>
            <span className="text-white/90 text-sm">
              ({rows.length} {rows.length === 1 ? 'match' : 'matches'})
            </span>
          </div>

          {/* Column Toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm font-semibold mr-2">Show Columns:</span>
            {optionalColumns.map(col => (
              <button
                key={col.key}
                onClick={() => toggleColumn(col.key, requiredColumns.has(col.key))}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  visibleColumns.has(col.key)
                    ? 'bg-white text-indigo-700 shadow-md'
                    : 'bg-white/20 text-white border border-white/40 hover:bg-white/30'
                }`}
                title={visibleColumns.has(col.key) ? 'Click to hide' : 'Click to show'}
              >
                {visibleColumns.has(col.key) ? '✓' : '○'} {col.name}
              </button>
            ))}

            {onRefresh && (
              <>
                <div className="border-l border-white/30 h-6 mx-2"></div>
                <button
                  onClick={onRefresh}
                  className="px-3 py-1.5 bg-white text-indigo-700 rounded-md text-xs font-bold shadow-md hover:bg-gray-100 transition-all"
                >
                  🔄 Refresh
                </button>
              </>
            )}
          </div>
        </div>

        {/* Required Columns Notice */}
        <div className="mt-3 text-xs text-white/80">
          <span className="font-semibold">Required columns (always visible):</span> Commute, Role Match, CAN ID, CAN Role, CAN Postcode, CL ID, CL Role, CL Postcode
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 bg-white overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-8">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">No Matches Yet</h3>
              <p className="text-gray-500 mb-4">Click "Generate Matches" to find candidate-client pairs</p>
            </div>
          </div>
        ) : (
          <DataGrid
            columns={visibleColumnsArray}
            rows={rows}
            rowKeyGetter={(row) => row.id}
            defaultColumnOptions={{
              resizable: true,
              sortable: true,
            }}
            className="rdg-light fill-grid"
            style={{ height: '100%', width: '100%' }}
          />
        )}
      </div>
    </div>
  );
}

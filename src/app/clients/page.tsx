'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/browser';
import { normalizeRole } from '@/lib/utils/roleNormalizer';
import { NewItemIndicator } from '@/components/ui/NewItemIndicator';
import { AddClientModal } from '@/components/forms/AddClientModal';
import { HoverableCell } from '@/components/ui/HoverableCell';
import Link from 'next/link';
import { Client } from '@/types';
import { saveColumnPreferences, loadColumnPreferences } from '@/lib/user-preferences';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{success: boolean; message: string; stats?: any} | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<{id: string; email: string} | null>(null);
  const [emailModalPosition, setEmailModalPosition] = useState({ x: 0, y: 0 });
  const [isEmailDragging, setIsEmailDragging] = useState(false);
  const [emailDragStart, setEmailDragStart] = useState({ x: 0, y: 0 });
  const [selectedNote, setSelectedNote] = useState<{id: string; note: string} | null>(null);
  const [editingNote, setEditingNote] = useState<string>('');
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Filter states
  const [showIdFilter, setShowIdFilter] = useState(false);
  const [idFilterText, setIdFilterText] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showSurgeryFilter, setShowSurgeryFilter] = useState(false);
  const [surgeryFilterText, setSurgeryFilterText] = useState('');
  const [selectedSurgeries, setSelectedSurgeries] = useState<string[]>([]);
  const [showClientNameFilter, setShowClientNameFilter] = useState(false);
  const [clientNameFilterText, setClientNameFilterText] = useState('');
  const [selectedClientNames, setSelectedClientNames] = useState<string[]>([]);
  const [showClientPhoneFilter, setShowClientPhoneFilter] = useState(false);
  const [clientPhoneFilterText, setClientPhoneFilterText] = useState('');
  const [selectedClientPhones, setSelectedClientPhones] = useState<string[]>([]);
  const [showClientEmailFilter, setShowClientEmailFilter] = useState(false);
  const [clientEmailFilterText, setClientEmailFilterText] = useState('');
  const [selectedClientEmails, setSelectedClientEmails] = useState<string[]>([]);
  const [showRoleFilter, setShowRoleFilter] = useState(false);
  const [roleFilterText, setRoleFilterText] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showPostcodeFilter, setShowPostcodeFilter] = useState(false);
  const [postcodeFilterText, setPostcodeFilterText] = useState('');
  const [selectedPostcodes, setSelectedPostcodes] = useState<string[]>([]);
  const [showBudgetFilter, setShowBudgetFilter] = useState(false);
  const [budgetFilterText, setBudgetFilterText] = useState('');
  const [selectedBudgets, setSelectedBudgets] = useState<string[]>([]);
  const [showRequirementFilter, setShowRequirementFilter] = useState(false);
  const [requirementFilterText, setRequirementFilterText] = useState('');
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>([]);
  const [showSystemFilter, setShowSystemFilter] = useState(false);
  const [systemFilterText, setSystemFilterText] = useState('');
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);

  // Column resize state - using percentages for flexible layout
  const defaultColumnWidths = {
    id: 6,
    surgery: 11,
    client_name: 9,
    client_email: 11,
    client_phone: 8,
    role: 9,
    postcode: 7,
    budget: 7,
    requirements: 11,
    system: 10,
    notes: 11
  };
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColumnWidths);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [tableWidth, setTableWidth] = useState(0);
  const [isColumnLayoutLocked, setIsColumnLayoutLocked] = useState(false);
  const tableRef = React.useRef<HTMLTableElement>(null);

  useEffect(() => {
    fetchClients();
    loadColumnSettings();
  }, []);

  // Load column settings from database
  const loadColumnSettings = async () => {
    try {
      const result = await loadColumnPreferences('clients');
      
      if (result.success) {
        // Load column widths if available
        if (result.columnWidths) {
          setColumnWidths(result.columnWidths);
        } else {
          // No saved widths, keep defaults but save them to database for future use
          saveColumnPreferences('clients', defaultColumnWidths, false);
        }
        
        // Load lock state if available
        if (result.isLocked !== null && result.isLocked !== undefined) {
          setIsColumnLayoutLocked(result.isLocked);
        } else {
          // No saved lock state, default to unlocked but save to database
          setIsColumnLayoutLocked(false);
          saveColumnPreferences('clients', columnWidths, false);
        }
      } else {
        console.warn('Failed to load column settings from database, using defaults:', result.error);
        // Set defaults and try to save them
        setColumnWidths(defaultColumnWidths);
        setIsColumnLayoutLocked(false);
        
        // Try to save defaults to database for future use
        const saveResult = await saveColumnPreferences('clients', defaultColumnWidths, false);
        if (!saveResult.success) {
          console.warn('Failed to save default preferences to database:', saveResult.error);
        }
        
        // Fallback to localStorage for migration purposes only if database fails
        try {
          const savedWidths = localStorage.getItem('clients-table-column-widths');
          const savedLockState = localStorage.getItem('clients-table-column-locked');
          
          if (savedWidths) {
            const parsedWidths = JSON.parse(savedWidths);
            setColumnWidths(parsedWidths);
          }
          
          if (savedLockState) {
            const parsedLockState = JSON.parse(savedLockState);
            setIsColumnLayoutLocked(parsedLockState);
          }
        } catch (localError) {
          console.warn('Failed to load column settings from localStorage:', localError);
        }
      }
    } catch (error) {
      console.warn('Failed to load column settings:', error);
      // Use defaults as fallback
      setColumnWidths(defaultColumnWidths);
      setIsColumnLayoutLocked(false);
    }
  };

  // Save column settings to database
  const saveColumnSettings = async (widths: Record<string, number>, locked: boolean) => {
    try {
      const result = await saveColumnPreferences('clients', widths, locked);
      
      if (!result.success) {
        console.warn('Failed to save column settings to database:', result.error);
        // Fallback to localStorage
        try {
          localStorage.setItem('clients-table-column-widths', JSON.stringify(widths));
          localStorage.setItem('clients-table-column-locked', JSON.stringify(locked));
        } catch (localError) {
          console.warn('Failed to save column settings to localStorage:', localError);
        }
      }
    } catch (error) {
      console.warn('Failed to save column settings:', error);
    }
  };

  // Toggle column layout lock
  const toggleColumnLock = () => {
    const newLockState = !isColumnLayoutLocked;
    setIsColumnLayoutLocked(newLockState);
    saveColumnSettings(columnWidths, newLockState);
  };

  // Reset column widths to default
  const resetColumnWidths = () => {
    setColumnWidths(defaultColumnWidths);
    setIsColumnLayoutLocked(false);
    saveColumnSettings(defaultColumnWidths, false);
  };

  // Update table width on mount and resize
  useEffect(() => {
    const updateTableWidth = () => {
      if (tableRef.current) {
        setTableWidth(tableRef.current.offsetWidth);
      }
    };

    // Initial update
    updateTableWidth();

    // Update after a short delay to ensure table is rendered
    const timer = setTimeout(updateTableWidth, 100);

    // Update on window resize
    window.addEventListener('resize', updateTableWidth);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateTableWidth);
    };
  }, [clients]);

  // Column resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn || !tableWidth) return;

      const delta = e.clientX - resizeStartX;
      const deltaPercent = (delta / tableWidth) * 100;
      const newWidth = Math.max(5, resizeStartWidth + deltaPercent);

      // Calculate total width and adjust proportionally
      setColumnWidths(prev => {
        const newWidths = { ...prev };
        const oldWidth = prev[resizingColumn];
        const widthChange = newWidth - oldWidth;

        // Adjust the resizing column
        newWidths[resizingColumn] = newWidth;

        // Distribute the change across other columns proportionally
        const otherColumns = Object.keys(prev).filter(k => k !== resizingColumn);
        const totalOtherWidth = otherColumns.reduce((sum, k) => sum + prev[k], 0);

        if (totalOtherWidth > 0) {
          otherColumns.forEach(col => {
            const proportion = prev[col] / totalOtherWidth;
            newWidths[col] = Math.max(5, prev[col] - (widthChange * proportion));
          });
        }

        return newWidths;
      });
    };

    const handleMouseUp = () => {
      if (resizingColumn && isColumnLayoutLocked) {
        // Save the new widths if layout is locked
        setColumnWidths(currentWidths => {
          // Save asynchronously without blocking state update
          saveColumnSettings(currentWidths, true);
          return currentWidths;
        });
      }
      setResizingColumn(null);
    };

    if (resizingColumn) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth, tableWidth]);

  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (tableRef.current) {
      setTableWidth(tableRef.current.offsetWidth);
    }
    setResizingColumn(columnKey);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[columnKey]);
  };

  async function fetchClients() {
    try {
      setLoading(true);
      setError(null);

      // Get current user from session (more reliable than getUser)
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        setError('Please log in to view clients');
        setLoading(false);
        return;
      }

      // Fetch only current user's clients
      const { data, error: fetchError } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', session.user.id)
        .order('added_at', { ascending: false });

      if (fetchError) throw fetchError;

      const transformedData: Client[] = data.map(c => ({
        ...c,
        added_at: new Date(c.added_at),
      }));

      setClients(transformedData);
    } catch (err: any) {
      console.error('Error fetching clients:', err);
      setError(err.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/clients', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      setUploadResult(result);

      if (result.success) {
        await fetchClients();
      }
    } catch (err: any) {
      setUploadResult({
        success: false,
        message: err.message || 'Upload failed'
      });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const downloadTemplate = () => {
    window.location.href = '/api/templates/clients';
  };

  const handleAddSuccess = async () => {
    await fetchClients();
  };

  // Filter logic
  let filteredClients = clients;

  if (selectedIds.length > 0) {
    filteredClients = filteredClients.filter(c => selectedIds.includes(c.id));
  }

  if (selectedSurgeries.length > 0) {
    filteredClients = filteredClients.filter(c => selectedSurgeries.includes(c.surgery));
  }

  if (selectedClientNames.length > 0) {
    filteredClients = filteredClients.filter(c => selectedClientNames.includes(c.client_name || ''));
  }

  if (selectedClientPhones.length > 0) {
    filteredClients = filteredClients.filter(c => selectedClientPhones.includes(c.client_phone || ''));
  }

  if (selectedClientEmails.length > 0) {
    filteredClients = filteredClients.filter(c => selectedClientEmails.includes(c.client_email || ''));
  }

  if (selectedRoles.length > 0) {
    filteredClients = filteredClients.filter(c => selectedRoles.includes(normalizeRole(c.role)));
  }

  if (selectedPostcodes.length > 0) {
    filteredClients = filteredClients.filter(c => selectedPostcodes.includes(c.postcode));
  }

  if (selectedBudgets.length > 0) {
    filteredClients = filteredClients.filter(c => selectedBudgets.includes(c.budget || ''));
  }

  if (selectedRequirements.length > 0) {
    filteredClients = filteredClients.filter(c => selectedRequirements.includes(c.requirement || ''));
  }

  if (selectedSystems.length > 0) {
    filteredClients = filteredClients.filter(c => selectedSystems.includes(c.system || ''));
  }

  // Helper functions for filters
  const getFilteredIdSuggestions = () => {
    if (!idFilterText || !clients) return [];
    return clients.map(c => c.id).filter(id => id.toLowerCase().includes(idFilterText.toLowerCase())).sort();
  };

  const toggleIdSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const getFilteredSurgerySuggestions = () => {
    if (!surgeryFilterText) return [];
    const unique = Array.from(new Set(clients.map(c => c.surgery)));
    return unique.filter(s => s.toLowerCase().includes(surgeryFilterText.toLowerCase())).sort();
  };

  const toggleSurgerySelection = (surgery: string) => {
    setSelectedSurgeries(prev => prev.includes(surgery) ? prev.filter(s => s !== surgery) : [...prev, surgery]);
  };

  const getFilteredClientNameSuggestions = () => {
    if (!clientNameFilterText) return [];
    const unique = Array.from(new Set(clients.map(c => c.client_name || '').filter(n => n)));
    return unique.filter(n => n.toLowerCase().includes(clientNameFilterText.toLowerCase())).sort();
  };

  const toggleClientNameSelection = (name: string) => {
    setSelectedClientNames(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const getFilteredClientPhoneSuggestions = () => {
    if (!clientPhoneFilterText) return [];
    const unique = Array.from(new Set(clients.map(c => c.client_phone || '').filter(p => p)));
    return unique.filter(p => p.toLowerCase().includes(clientPhoneFilterText.toLowerCase())).sort();
  };

  const toggleClientPhoneSelection = (phone: string) => {
    setSelectedClientPhones(prev => prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]);
  };

  const getFilteredClientEmailSuggestions = () => {
    if (!clientEmailFilterText) return [];
    const unique = Array.from(new Set(clients.map(c => c.client_email || '').filter(e => e)));
    return unique.filter(e => e.toLowerCase().includes(clientEmailFilterText.toLowerCase())).sort();
  };

  const toggleClientEmailSelection = (email: string) => {
    setSelectedClientEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };

  const getFilteredRoleSuggestions = () => {
    if (!roleFilterText) return [];
    const unique = Array.from(new Set(clients.map(c => normalizeRole(c.role))));
    return unique.filter(r => r.toLowerCase().includes(roleFilterText.toLowerCase())).sort();
  };

  const toggleRoleSelection = (role: string) => {
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const getFilteredPostcodeSuggestions = () => {
    if (!postcodeFilterText) return [];
    const unique = Array.from(new Set(clients.map(c => c.postcode)));
    return unique.filter(p => p.toLowerCase().includes(postcodeFilterText.toLowerCase())).sort();
  };

  const togglePostcodeSelection = (postcode: string) => {
    setSelectedPostcodes(prev => prev.includes(postcode) ? prev.filter(p => p !== postcode) : [...prev, postcode]);
  };

  const getFilteredBudgetSuggestions = () => {
    if (!budgetFilterText) return [];
    const unique = Array.from(new Set(clients.map(c => c.budget || '').filter(b => b)));
    return unique.filter(b => b.toLowerCase().includes(budgetFilterText.toLowerCase())).sort();
  };

  const toggleBudgetSelection = (budget: string) => {
    setSelectedBudgets(prev => prev.includes(budget) ? prev.filter(b => b !== budget) : [...prev, budget]);
  };

  const getFilteredRequirementSuggestions = () => {
    if (!requirementFilterText) return [];
    const unique = Array.from(new Set(clients.map(c => c.requirement || '').filter(r => r)));
    return unique.filter(r => r.toLowerCase().includes(requirementFilterText.toLowerCase())).sort();
  };

  const toggleRequirementSelection = (req: string) => {
    setSelectedRequirements(prev => prev.includes(req) ? prev.filter(r => r !== req) : [...prev, req]);
  };

  const getFilteredSystemSuggestions = () => {
    if (!systemFilterText) return [];
    const unique = Array.from(new Set(clients.map(c => c.system || '').filter(s => s)));
    return unique.filter(s => s.toLowerCase().includes(systemFilterText.toLowerCase())).sort();
  };

  const toggleSystemSelection = (system: string) => {
    setSelectedSystems(prev => prev.includes(system) ? prev.filter(s => s !== system) : [...prev, system]);
  };

  // Calculate empty rows to maintain minimum table height
  const MIN_ROWS = 10;
  const emptyRowsCount = Math.max(0, MIN_ROWS - filteredClients.length);

  const handleCellChange = async (clientId: string, field: keyof Client, value: any) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ [field]: value })
        .eq('id', clientId);

      if (error) throw error;

      setClients(prev => prev.map(c =>
        c.id === clientId ? { ...c, [field]: value } : c
      ));
    } catch (err: any) {
      console.error('Error updating client:', err);
      alert('Failed to update: ' + err.message);
      await fetchClients();
    }
  };

  const handleDeleteRow = async (clientId: string) => {
    if (!confirm('Delete this client? This will remove all associated matches.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId);

      if (error) throw error;

      await fetchClients();
    } catch (err: any) {
      console.error('Error deleting client:', err);
      alert('Failed to delete: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-900 font-medium">Loading clients...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-900 font-bold text-lg mb-2">Error Loading Data</h2>
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Page Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Clients</h1>

        {/* Collapsible Stats */}
        {showStats && (
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-white border border-gray-300 rounded p-3">
            <div className="text-center">
              <p className="text-xs text-gray-600">Total</p>
              <p className="text-xl font-bold text-orange-900">{clients.length}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">🟨 New (48h)</p>
              <p className="text-xl font-bold text-green-900">
                {clients.filter(c => {
                  const hours = (new Date().getTime() - c.added_at.getTime()) / (1000 * 60 * 60);
                  return hours <= 48;
                }).length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Dental Nurses</p>
              <p className="text-xl font-bold text-purple-900">
                {clients.filter(c => normalizeRole(c.role) === 'Dental Nurse').length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Dentists</p>
              <p className="text-xl font-bold text-blue-900">
                {clients.filter(c => normalizeRole(c.role) === 'Dentist').length}
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons - Excel Style */}
        <div className="mb-3 flex flex-wrap items-center gap-2 bg-white border border-gray-300 rounded p-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className="px-3 py-1.5 bg-gray-100 border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-gray-200"
            title={showStats ? "Hide Statistics" : "Show Statistics"}
          >
            👁️ Stats
          </button>

          <div className="border-l border-gray-300 h-6 mx-1"></div>

          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`px-3 py-1.5 border border-gray-400 rounded text-sm font-semibold text-gray-900 ${
              isEditMode ? 'bg-green-100 hover:bg-green-200' : 'bg-orange-100 hover:bg-orange-200'
            }`}
          >
            {isEditMode ? '✓ Done' : '✏️ Edit'}
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-1.5 bg-green-100 border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-green-200"
          >
            ➕ Add New
          </button>

          <button
            onClick={downloadTemplate}
            className="px-3 py-1.5 bg-white border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            📥 Download Template
          </button>

          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            <span className={`inline-block px-3 py-1.5 border border-gray-400 rounded text-sm font-semibold text-gray-900 ${
              uploading ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:bg-gray-50'
            }`}>
              {uploading ? '⏳ Uploading...' : '📤 Upload Excel'}
            </span>
          </label>

          <button
            onClick={toggleColumnLock}
            className={`px-3 py-1.5 border border-gray-400 rounded text-sm font-semibold text-gray-900 ${
              isColumnLayoutLocked 
                ? 'bg-green-100 hover:bg-green-200' 
                : 'bg-yellow-100 hover:bg-yellow-200'
            }`}
            title={isColumnLayoutLocked ? "Column layout is locked - click to unlock" : "Click to lock column layout"}
          >
            {isColumnLayoutLocked ? '🔒 Layout Locked' : '🔓 Lock Layout'}
          </button>

          <button
            onClick={resetColumnWidths}
            className="px-3 py-1.5 bg-gray-100 border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-gray-200"
            title="Reset column widths to default"
          >
            🔄 Reset Columns
          </button>

          <div className="border-l border-gray-300 h-6 mx-1"></div>

          <Link
            href="/matches"
            className="px-3 py-1.5 bg-blue-100 border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-blue-200"
          >
            View Matches
          </Link>

          <Link
            href="/candidates"
            className="px-3 py-1.5 bg-white border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Candidates
          </Link>
        </div>

        {/* Edit Mode Notice */}
        {isEditMode && (
          <div className="mb-3 bg-orange-50 border border-orange-300 rounded p-2 text-sm text-orange-800">
            📝 <strong>Edit Mode:</strong> Click any cell to edit. Changes save automatically.
          </div>
        )}

        {/* Upload Result */}
        {uploadResult && (
          <div className={`mb-3 p-2 rounded text-sm ${
            uploadResult.success
              ? 'bg-green-50 border border-green-300 text-green-900'
              : 'bg-red-50 border border-red-300 text-red-900'
          }`}>
            {uploadResult.success ? '✅' : '❌'} {uploadResult.message}
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-300 rounded overflow-hidden">
          <div className="overflow-hidden">
            <table ref={tableRef} className="w-full table-fixed divide-y divide-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  {/* Row Number Column Header */}
                  <th className="px-2 py-3 text-center text-xs font-bold text-gray-700 bg-gray-200 border-r-2 border-gray-400 sticky left-0 z-10" style={{ width: '50px', minWidth: '50px' }}>
                    #
                  </th>
                  {/* ID Column */}
                  <th
                    className={`px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedIds.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.id}%`, minWidth: '80px' }}
                  >
                    <div className="flex items-center gap-1 min-h-[20px] overflow-hidden">
                      <span className="truncate flex-shrink-0">A - ID</span>
                      <button
                        onClick={() => setShowIdFilter(!showIdFilter)}
                        className="hover:bg-gray-300 px-1 rounded flex-shrink-0 text-xs leading-none"
                        title="Filter IDs"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'id')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {showIdFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2">
                          <input
                            type="text"
                            value={idFilterText}
                            onChange={(e) => setIdFilterText(e.target.value)}
                            placeholder="Type ID..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            {getFilteredIdSuggestions().map(id => (
                              <label key={id} className="flex items-center gap-2 py-1 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.includes(id)}
                                  onChange={() => toggleIdSelection(id)}
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-900">{id}</span>
                              </label>
                            ))}
                          </div>
                          {selectedIds.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                              Selected: {selectedIds.length}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setSelectedIds([])}
                              className="flex-1 px-2 py-1 bg-gray-200 text-xs font-semibold text-gray-900 rounded hover:bg-gray-300"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowIdFilter(false)}
                              className="flex-1 px-2 py-1 bg-blue-500 text-xs font-semibold text-white rounded hover:bg-blue-600"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </th>

                  {/* Surgery Column */}
                  <th
                    className={`px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedSurgeries.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.surgery}%`, minWidth: '120px' }}
                  >
                    <div className="flex items-center gap-1 min-h-[20px] overflow-hidden">
                      <span className="truncate flex-shrink-0">B - Surgery</span>
                      <button
                        onClick={() => setShowSurgeryFilter(!showSurgeryFilter)}
                        className="hover:bg-gray-300 px-1 rounded flex-shrink-0 text-xs leading-none"
                        title="Filter Surgeries"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'surgery')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {showSurgeryFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2">
                          <input
                            type="text"
                            value={surgeryFilterText}
                            onChange={(e) => setSurgeryFilterText(e.target.value)}
                            placeholder="Type surgery name..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            {getFilteredSurgerySuggestions().map(surgery => (
                              <label key={surgery} className="flex items-center gap-2 py-1 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedSurgeries.includes(surgery)}
                                  onChange={() => toggleSurgerySelection(surgery)}
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-900">{surgery}</span>
                              </label>
                            ))}
                          </div>
                          {selectedSurgeries.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                              Selected: {selectedSurgeries.length}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setSelectedSurgeries([])}
                              className="flex-1 px-2 py-1 bg-gray-200 text-xs font-semibold text-gray-900 rounded hover:bg-gray-300"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowSurgeryFilter(false)}
                              className="flex-1 px-2 py-1 bg-blue-500 text-xs font-semibold text-white rounded hover:bg-blue-600"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </th>

                  {/* Client Name Column */}
                  <th
                    className={`px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedClientNames.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.client_name}%`, minWidth: '110px' }}
                  >
                    <div className="flex items-center gap-1 min-h-[20px] overflow-hidden">
                      <span className="truncate flex-shrink-0">C - Client Name</span>
                      <button
                        onClick={() => setShowClientNameFilter(!showClientNameFilter)}
                        className="hover:bg-gray-300 px-1 rounded flex-shrink-0 text-xs leading-none"
                        title="Filter Client Names"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'client_name')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {showClientNameFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2">
                          <input
                            type="text"
                            value={clientNameFilterText}
                            onChange={(e) => setClientNameFilterText(e.target.value)}
                            placeholder="Type client name..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            {getFilteredClientNameSuggestions().map(name => (
                              <label key={name} className="flex items-center gap-2 py-1 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedClientNames.includes(name)}
                                  onChange={() => toggleClientNameSelection(name)}
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-900">{name}</span>
                              </label>
                            ))}
                          </div>
                          {selectedClientNames.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                              Selected: {selectedClientNames.length}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setSelectedClientNames([])}
                              className="flex-1 px-2 py-1 bg-gray-200 text-xs font-semibold text-gray-900 rounded hover:bg-gray-300"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowClientNameFilter(false)}
                              className="flex-1 px-2 py-1 bg-blue-500 text-xs font-semibold text-white rounded hover:bg-blue-600"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </th>

                  {/* Client Phone Column */}
                  <th
                    className={`px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedClientPhones.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.client_phone}%`, minWidth: '110px' }}
                  >
                    <div className="flex items-center gap-1 min-h-[20px] overflow-hidden">
                      <span className="truncate flex-shrink-0">D - Client Phone</span>
                      <button
                        onClick={() => setShowClientPhoneFilter(!showClientPhoneFilter)}
                        className="hover:bg-gray-300 px-1 rounded flex-shrink-0 text-xs leading-none"
                        title="Filter Client Phones"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'client_phone')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {showClientPhoneFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2">
                          <input
                            type="text"
                            value={clientPhoneFilterText}
                            onChange={(e) => setClientPhoneFilterText(e.target.value)}
                            placeholder="Type phone..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            {getFilteredClientPhoneSuggestions().map(phone => (
                              <label key={phone} className="flex items-center gap-2 py-1 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedClientPhones.includes(phone)}
                                  onChange={() => toggleClientPhoneSelection(phone)}
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-900">{phone}</span>
                              </label>
                            ))}
                          </div>
                          {selectedClientPhones.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                              Selected: {selectedClientPhones.length}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setSelectedClientPhones([])}
                              className="flex-1 px-2 py-1 bg-gray-200 text-xs font-semibold text-gray-900 rounded hover:bg-gray-300"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowClientPhoneFilter(false)}
                              className="flex-1 px-2 py-1 bg-blue-500 text-xs font-semibold text-white rounded hover:bg-blue-600"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </th>

                  {/* Client Email Column */}
                  <th
                    className={`px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedClientEmails.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.client_email}%`, minWidth: '120px' }}
                  >
                    <div className="flex items-center gap-1 min-h-[20px] overflow-hidden">
                      <span className="truncate flex-shrink-0">E - Client Email</span>
                      <button
                        onClick={() => setShowClientEmailFilter(!showClientEmailFilter)}
                        className="hover:bg-gray-300 px-1 rounded flex-shrink-0 text-xs leading-none"
                        title="Filter Client Emails"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'client_email')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {showClientEmailFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2">
                          <input
                            type="text"
                            value={clientEmailFilterText}
                            onChange={(e) => setClientEmailFilterText(e.target.value)}
                            placeholder="Type email..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            {getFilteredClientEmailSuggestions().map(email => (
                              <label key={email} className="flex items-center gap-2 py-1 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedClientEmails.includes(email)}
                                  onChange={() => toggleClientEmailSelection(email)}
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-900">{email}</span>
                              </label>
                            ))}
                          </div>
                          {selectedClientEmails.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                              Selected: {selectedClientEmails.length}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setSelectedClientEmails([])}
                              className="flex-1 px-2 py-1 bg-gray-200 text-xs font-semibold text-gray-900 rounded hover:bg-gray-300"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowClientEmailFilter(false)}
                              className="flex-1 px-2 py-1 bg-blue-500 text-xs font-semibold text-white rounded hover:bg-blue-600"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </th>

                  {/* Role Column */}
                  <th
                    className={`px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedRoles.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.role}%`, minWidth: '100px' }}
                  >
                    <div className="flex items-center gap-1 min-h-[20px] overflow-hidden">
                      <span className="truncate flex-shrink-0">F - Role</span>
                      <button
                        onClick={() => setShowRoleFilter(!showRoleFilter)}
                        className="hover:bg-gray-300 px-1 rounded flex-shrink-0 text-xs leading-none"
                        title="Filter Roles"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'role')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {showRoleFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2">
                          <input
                            type="text"
                            value={roleFilterText}
                            onChange={(e) => setRoleFilterText(e.target.value)}
                            placeholder="Type role..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            {getFilteredRoleSuggestions().map(role => (
                              <label key={role} className="flex items-center gap-2 py-1 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedRoles.includes(role)}
                                  onChange={() => toggleRoleSelection(role)}
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-900">{role}</span>
                              </label>
                            ))}
                          </div>
                          {selectedRoles.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                              Selected: {selectedRoles.length}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setSelectedRoles([])}
                              className="flex-1 px-2 py-1 bg-gray-200 text-xs font-semibold text-gray-900 rounded hover:bg-gray-300"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowRoleFilter(false)}
                              className="flex-1 px-2 py-1 bg-blue-500 text-xs font-semibold text-white rounded hover:bg-blue-600"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </th>

                  {/* Postcode Column */}
                  <th
                    className={`px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedPostcodes.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.postcode}%`, minWidth: '90px' }}
                  >
                    <div className="flex items-center gap-1 min-h-[20px] overflow-hidden">
                      <span className="truncate flex-shrink-0">G - Postcode</span>
                      <button
                        onClick={() => setShowPostcodeFilter(!showPostcodeFilter)}
                        className="hover:bg-gray-300 px-1 rounded flex-shrink-0 text-xs leading-none"
                        title="Filter Postcodes"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'postcode')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {showPostcodeFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2">
                          <input
                            type="text"
                            value={postcodeFilterText}
                            onChange={(e) => setPostcodeFilterText(e.target.value)}
                            placeholder="Type postcode..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            {getFilteredPostcodeSuggestions().map(postcode => (
                              <label key={postcode} className="flex items-center gap-2 py-1 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedPostcodes.includes(postcode)}
                                  onChange={() => togglePostcodeSelection(postcode)}
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-900">{postcode}</span>
                              </label>
                            ))}
                          </div>
                          {selectedPostcodes.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                              Selected: {selectedPostcodes.length}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setSelectedPostcodes([])}
                              className="flex-1 px-2 py-1 bg-gray-200 text-xs font-semibold text-gray-900 rounded hover:bg-gray-300"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowPostcodeFilter(false)}
                              className="flex-1 px-2 py-1 bg-blue-500 text-xs font-semibold text-white rounded hover:bg-blue-600"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </th>

                  {/* Budget Column */}
                  <th
                    className={`px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedBudgets.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.budget}%`, minWidth: '80px' }}
                  >
                    <div className="flex items-center gap-1 min-h-[20px] overflow-hidden">
                      <span className="truncate flex-shrink-0">H - Budget</span>
                      <button
                        onClick={() => setShowBudgetFilter(!showBudgetFilter)}
                        className="hover:bg-gray-300 px-1 rounded flex-shrink-0 text-xs leading-none"
                        title="Filter Budgets"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'budget')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {showBudgetFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2">
                          <input
                            type="text"
                            value={budgetFilterText}
                            onChange={(e) => setBudgetFilterText(e.target.value)}
                            placeholder="Type budget..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            {getFilteredBudgetSuggestions().map(budget => (
                              <label key={budget} className="flex items-center gap-2 py-1 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedBudgets.includes(budget)}
                                  onChange={() => toggleBudgetSelection(budget)}
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-900">{budget}</span>
                              </label>
                            ))}
                          </div>
                          {selectedBudgets.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                              Selected: {selectedBudgets.length}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setSelectedBudgets([])}
                              className="flex-1 px-2 py-1 bg-gray-200 text-xs font-semibold text-gray-900 rounded hover:bg-gray-300"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowBudgetFilter(false)}
                              className="flex-1 px-2 py-1 bg-blue-500 text-xs font-semibold text-white rounded hover:bg-blue-600"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </th>

                  {/* Requirement Column */}
                  <th
                    className={`px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedRequirements.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.requirements}%`, minWidth: '120px' }}
                  >
                    <div className="flex items-center gap-1 min-h-[20px] overflow-hidden">
                      <span className="truncate flex-shrink-0">I - Requirement</span>
                      <button
                        onClick={() => setShowRequirementFilter(!showRequirementFilter)}
                        className="hover:bg-gray-300 px-1 rounded flex-shrink-0 text-xs leading-none"
                        title="Filter Requirements"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'requirements')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {showRequirementFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2">
                          <input
                            type="text"
                            value={requirementFilterText}
                            onChange={(e) => setRequirementFilterText(e.target.value)}
                            placeholder="Type requirement..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            {getFilteredRequirementSuggestions().map(req => (
                              <label key={req} className="flex items-center gap-2 py-1 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedRequirements.includes(req)}
                                  onChange={() => toggleRequirementSelection(req)}
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-900">{req}</span>
                              </label>
                            ))}
                          </div>
                          {selectedRequirements.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                              Selected: {selectedRequirements.length}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setSelectedRequirements([])}
                              className="flex-1 px-2 py-1 bg-gray-200 text-xs font-semibold text-gray-900 rounded hover:bg-gray-300"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowRequirementFilter(false)}
                              className="flex-1 px-2 py-1 bg-blue-500 text-xs font-semibold text-white rounded hover:bg-blue-600"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </th>

                  {/* System Column */}
                  <th
                    className={`px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedSystems.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.system}%`, minWidth: '100px' }}
                  >
                    <div className="flex items-center gap-1 min-h-[20px] overflow-hidden">
                      <span className="truncate flex-shrink-0">J - System</span>
                      <button
                        onClick={() => setShowSystemFilter(!showSystemFilter)}
                        className="hover:bg-gray-300 px-1 rounded flex-shrink-0 text-xs leading-none"
                        title="Filter Systems"
                      >
                        ▼
                      </button>
                    </div>

                    {showSystemFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2">
                          <input
                            type="text"
                            value={systemFilterText}
                            onChange={(e) => setSystemFilterText(e.target.value)}
                            placeholder="Type system..."
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            {getFilteredSystemSuggestions().map(system => (
                              <label key={system} className="flex items-center gap-2 py-1 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedSystems.includes(system)}
                                  onChange={() => toggleSystemSelection(system)}
                                  className="rounded"
                                />
                                <span className="text-sm text-gray-900">{system}</span>
                              </label>
                            ))}
                          </div>
                          {selectedSystems.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
                              Selected: {selectedSystems.length}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setSelectedSystems([])}
                              className="flex-1 px-2 py-1 bg-gray-200 text-xs font-semibold text-gray-900 rounded hover:bg-gray-300"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowSystemFilter(false)}
                              className="flex-1 px-2 py-1 bg-blue-500 text-xs font-semibold text-white rounded hover:bg-blue-600"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'system')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />
                  </th>

                  <th
                    className="px-2 py-3 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group"
                    style={{ width: `${columnWidths.notes}%`, minWidth: '100px' }}
                  >
                    <div className="min-h-[20px] overflow-hidden">
                      <span className="truncate block">K - Notes</span>
                    </div>
                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'notes')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />
                  </th>
                  {isEditMode && (
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-900 uppercase">Del</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2 text-center text-xs font-semibold text-gray-700 bg-gray-50 border-r-2 border-gray-400 sticky left-0 z-10">
                      {filteredClients.indexOf(client) + 1}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.id}%` }}
                    >
                      <div className="flex items-center">
                        <HoverableCell 
                          value={client.id} 
                          label="Client ID"
                          onCopy={() => {
                            console.log(`Copied client ID: ${client.id}`);
                          }}
                        />
                        <NewItemIndicator id={client.id} addedAt={client.added_at} />
                      </div>
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.surgery}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={client.surgery}
                          onChange={(e) => handleCellChange(client.id, 'surgery', e.target.value)}
                          onBlur={(e) => handleCellChange(client.id, 'surgery', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <HoverableCell value={client.surgery} label="Surgery" />
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.client_name}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={client.client_name || ''}
                          onChange={(e) => handleCellChange(client.id, 'client_name', e.target.value)}
                          onBlur={(e) => handleCellChange(client.id, 'client_name', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <HoverableCell value={client.client_name} label="Client Name" />
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.client_phone}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="tel"
                          value={client.client_phone || ''}
                          onChange={(e) => handleCellChange(client.id, 'client_phone', e.target.value)}
                          onBlur={(e) => handleCellChange(client.id, 'client_phone', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <HoverableCell value={client.client_phone} label="Client Phone" />
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.client_email}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="email"
                          value={client.client_email || ''}
                          onChange={(e) => handleCellChange(client.id, 'client_email', e.target.value)}
                          onBlur={(e) => handleCellChange(client.id, 'client_email', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            if (client.client_email) {
                              setSelectedEmail({id: client.id, email: client.client_email});
                              setEmailModalPosition({ x: 100, y: 100 });
                            }
                          }}
                          className="text-left hover:text-blue-600 cursor-pointer underline"
                          disabled={!client.client_email}
                        >
                          {client.client_email
                            ? (client.client_email.length > 7 ? client.client_email.substring(0, 7) + '...' : client.client_email)
                            : '-'
                          }
                        </button>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.role}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={client.role}
                          onChange={(e) => handleCellChange(client.id, 'role', e.target.value)}
                          onBlur={(e) => handleCellChange(client.id, 'role', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <HoverableCell value={normalizeRole(client.role)} label="Role" />
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-mono font-bold text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.postcode}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={client.postcode}
                          onChange={(e) => handleCellChange(client.id, 'postcode', e.target.value.toUpperCase())}
                          onBlur={(e) => handleCellChange(client.id, 'postcode', e.target.value.toUpperCase())}
                          className="px-2 py-1 border border-gray-400 rounded w-full font-mono text-sm font-bold text-gray-900"
                        />
                      ) : (
                        <HoverableCell value={client.postcode} label="Postcode" />
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.budget}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={client.budget || ''}
                          onChange={(e) => handleCellChange(client.id, 'budget', e.target.value)}
                          onBlur={(e) => handleCellChange(client.id, 'budget', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <HoverableCell value={client.budget} label="Budget" />
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.requirements}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={client.requirement || ''}
                          onChange={(e) => handleCellChange(client.id, 'requirement', e.target.value)}
                          onBlur={(e) => handleCellChange(client.id, 'requirement', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <HoverableCell value={client.requirement} label="Requirement" />
                      )}
                    </td>
                    {/* System Column */}
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.system}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={client.system || ''}
                          onChange={(e) => handleCellChange(client.id, 'system', e.target.value)}
                          onBlur={(e) => handleCellChange(client.id, 'system', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <HoverableCell value={client.system} label="System" />
                      )}
                    </td>
                    <td
                      className="px-3 py-2 text-sm font-medium text-gray-900 border-r border-gray-300"
                      style={{ width: `${columnWidths.notes}%`, maxHeight: '100px', overflow: 'hidden' }}
                      title={client.notes || undefined}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={client.notes || ''}
                          onChange={(e) => handleCellChange(client.id, 'notes', e.target.value)}
                          onBlur={(e) => handleCellChange(client.id, 'notes', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedNote({id: client.id, note: client.notes || ''});
                            setEditingNote(client.notes || '');
                            setModalPosition({ x: 50, y: 50 });
                          }}
                          className="text-left hover:text-blue-600 cursor-pointer underline break-words line-clamp-3"
                        >
                          {client.notes || '-'}
                        </button>
                      )}
                    </td>
                    {isEditMode && (
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleDeleteRow(client.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {/* Empty rows to maintain table height */}
                {Array.from({ length: emptyRowsCount }).map((_, index) => (
                  <tr key={`empty-${index}`} className="bg-white">
                    <td className="px-2 py-2 text-center text-xs font-semibold text-gray-700 bg-gray-50 border-r-2 border-gray-400 sticky left-0 z-10">
                      {filteredClients.length + index + 1}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300">&nbsp;</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300">&nbsp;</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300">&nbsp;</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300">&nbsp;</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300">&nbsp;</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300">&nbsp;</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-mono font-bold text-gray-900 border-r border-gray-300">&nbsp;</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300">&nbsp;</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300">&nbsp;</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300">&nbsp;</td>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900 max-w-xs border-r border-gray-300">&nbsp;</td>
                    {isEditMode && (
                      <td className="px-3 py-2 whitespace-nowrap text-center">&nbsp;</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-2 text-sm text-gray-600">
          {(() => {
            const activeFilters: string[] = [];
            if (selectedIds.length > 0) activeFilters.push('ID');
            if (selectedSurgeries.length > 0) activeFilters.push('Surgery');
            if (selectedClientNames.length > 0) activeFilters.push('Client Name');
            if (selectedClientPhones.length > 0) activeFilters.push('Client Phone');
            if (selectedClientEmails.length > 0) activeFilters.push('Client Email');
            if (selectedRoles.length > 0) activeFilters.push('Role');
            if (selectedPostcodes.length > 0) activeFilters.push('Postcode');
            if (selectedBudgets.length > 0) activeFilters.push('Budget');
            if (selectedRequirements.length > 0) activeFilters.push('Requirement');

            if (activeFilters.length > 0) {
              return `Showing ${filteredClients.length} of ${clients.length} clients (Filtered by ${activeFilters.join(' & ')})`;
            }
            return `Showing ${clients.length} clients`;
          })()}
        </div>
      </div>

      {/* Notes Modal - Draggable */}
      {selectedNote && (
        <div
          className="fixed bg-white border-4 border-gray-400 shadow-2xl z-50"
          style={{
            left: `${modalPosition.x}px`,
            top: `${modalPosition.y}px`,
            width: '800px',
            maxWidth: 'calc(100vw - 100px)'
          }}
        >
          {/* Header - Draggable */}
          <div
            className="bg-gray-200 px-4 py-3 border-b-2 border-gray-400 flex items-center justify-between cursor-move select-none"
            onMouseDown={(e) => {
              setIsDragging(true);
              setDragStart({
                x: e.clientX - modalPosition.x,
                y: e.clientY - modalPosition.y
              });
            }}
            onMouseMove={(e) => {
              if (isDragging) {
                setModalPosition({
                  x: e.clientX - dragStart.x,
                  y: e.clientY - dragStart.y
                });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            <div>
              <h3 className="text-base font-bold text-gray-900">📝 Note for {selectedNote.id}</h3>
              <p className="text-xs text-gray-600 mt-1">
                Last edited: {new Date().toLocaleString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <button
              onClick={() => setSelectedNote(null)}
              className="text-gray-700 hover:text-gray-900 text-xl font-bold px-2"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-6 bg-white">
            <textarea
              value={editingNote}
              onChange={(e) => setEditingNote(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  await handleCellChange(selectedNote.id, 'notes', editingNote);
                  setSelectedNote(null);
                }
              }}
              className="w-full h-80 p-4 border-2 border-gray-400 font-mono text-sm text-gray-900 focus:outline-none focus:border-gray-600 resize-none"
              placeholder="Enter notes here..."
            />
            <p className="text-xs text-gray-600 mt-2">💡 Drag the header to move | Press Ctrl+Enter to save</p>
          </div>

          {/* Footer */}
          <div className="bg-gray-200 px-4 py-3 border-t-2 border-gray-400 flex justify-end gap-2">
            <button
              onClick={() => setSelectedNote(null)}
              className="px-4 py-2 bg-gray-300 border-2 border-gray-500 text-gray-900 font-semibold hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await handleCellChange(selectedNote.id, 'notes', editingNote);
                setSelectedNote(null);
              }}
              className="px-4 py-2 bg-blue-500 border-2 border-blue-700 text-white font-semibold hover:bg-blue-600"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Email Modal - Draggable */}
      {selectedEmail && (
        <div
          className="fixed bg-white border-4 border-gray-400 shadow-2xl z-50"
          style={{
            left: `${emailModalPosition.x}px`,
            top: `${emailModalPosition.y}px`,
            width: '600px',
            maxWidth: 'calc(100vw - 100px)'
          }}
        >
          {/* Header - Draggable */}
          <div
            className="bg-gray-200 px-4 py-3 border-b-2 border-gray-400 flex items-center justify-between cursor-move select-none"
            onMouseDown={(e) => {
              setIsEmailDragging(true);
              setEmailDragStart({
                x: e.clientX - emailModalPosition.x,
                y: e.clientY - emailModalPosition.y
              });
            }}
            onMouseMove={(e) => {
              if (isEmailDragging) {
                setEmailModalPosition({
                  x: e.clientX - emailDragStart.x,
                  y: e.clientY - emailDragStart.y
                });
              }
            }}
            onMouseUp={() => setIsEmailDragging(false)}
            onMouseLeave={() => setIsEmailDragging(false)}
          >
            <div>
              <h3 className="text-base font-bold text-gray-900">📧 Client Email for {selectedEmail.id}</h3>
            </div>
            <button
              onClick={() => setSelectedEmail(null)}
              className="text-gray-700 hover:text-gray-900 text-xl font-bold px-2"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-6 bg-white">
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 mb-2">EMAIL ADDRESS</label>
              <div className="w-full p-4 border-2 border-gray-400 bg-gray-50 font-mono text-sm text-gray-900 rounded">
                {selectedEmail.email}
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">💡 Drag the header to move | Click Copy to copy email to clipboard</p>
          </div>

          {/* Footer */}
          <div className="bg-gray-200 px-4 py-3 border-t-2 border-gray-400 flex justify-end gap-2">
            <button
              onClick={() => setSelectedEmail(null)}
              className="px-4 py-2 bg-gray-300 border-2 border-gray-500 text-gray-900 font-semibold hover:bg-gray-400"
            >
              Close
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(selectedEmail.email);
                alert('Email copied to clipboard!');
              }}
              className="px-4 py-2 bg-blue-500 border-2 border-blue-700 text-white font-semibold hover:bg-blue-600"
            >
              📋 Copy Email
            </button>
          </div>
        </div>
      )}

      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}

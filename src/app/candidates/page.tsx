'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/browser';
import { normalizeRole } from '@/lib/utils/roleNormalizer';
import { NewItemIndicator } from '@/components/ui/NewItemIndicator';
import { AddCandidateModal } from '@/components/forms/AddCandidateModal';
import Link from 'next/link';
import { Candidate } from '@/types';
import { getCurrentUserId } from '@/lib/auth-helpers';

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{success: boolean; message: string; stats?: any} | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [selectedNote, setSelectedNote] = useState<{id: string; note: string} | null>(null);
  const [editingNote, setEditingNote] = useState<string>('');
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showIdFilter, setShowIdFilter] = useState(false);
  const [idFilterText, setIdFilterText] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showRoleFilter, setShowRoleFilter] = useState(false);
  const [roleFilterText, setRoleFilterText] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showPostcodeFilter, setShowPostcodeFilter] = useState(false);
  const [postcodeFilterText, setPostcodeFilterText] = useState('');
  const [selectedPostcodes, setSelectedPostcodes] = useState<string[]>([]);
  const [showSalaryFilter, setShowSalaryFilter] = useState(false);
  const [salaryFilterText, setSalaryFilterText] = useState('');
  const [selectedSalaries, setSelectedSalaries] = useState<string[]>([]);
  const [showAvailabilityFilter, setShowAvailabilityFilter] = useState(false);
  const [availabilityFilterText, setAvailabilityFilterText] = useState('');
  const [selectedAvailabilities, setSelectedAvailabilities] = useState<string[]>([]);
  const [showExperienceFilter, setShowExperienceFilter] = useState(false);
  const [experienceFilterText, setExperienceFilterText] = useState('');
  const [selectedExperiences, setSelectedExperiences] = useState<string[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<{id: string; email: string} | null>(null);
  const [emailModalPosition, setEmailModalPosition] = useState({ x: 0, y: 0 });
  const [isEmailDragging, setIsEmailDragging] = useState(false);
  const [emailDragStart, setEmailDragStart] = useState({ x: 0, y: 0 });

  // AI Smart Paste state
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [aiResult, setAiResult] = useState<{success: boolean; message: string; count?: number} | null>(null);

  // Column resize state - using percentages for flexible layout
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    id: 8,
    first_name: 10,
    last_name: 10,
    email: 12,
    phone: 9,
    role: 10,
    postcode: 8,
    salary: 7,
    days: 10,
    experience: 9,
    notes: 7
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [tableWidth, setTableWidth] = useState(0);
  const tableRef = React.useRef<HTMLTableElement>(null);

  useEffect(() => {
    fetchCandidates();
  }, []);

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
  }, [candidates]);

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

  async function fetchCandidates() {
    try {
      setLoading(true);
      setError(null);

      // Get current user from session (more reliable than getUser)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      console.log('🔍 Auth Debug:');
      console.log('Session:', session);
      console.log('Session Error:', sessionError);
      console.log('User:', session?.user);
      console.log('User ID:', session?.user?.id);

      if (!session?.user) {
        setError('Please log in to view candidates');
        setLoading(false);
        return;
      }

      // Fetch only current user's candidates
      const { data, error: fetchError } = await supabase
        .from('candidates')
        .select('*')
        .eq('user_id', session.user.id)
        .order('added_at', { ascending: false });

      if (fetchError) throw fetchError;

      const transformedData: Candidate[] = data.map(c => ({
        ...c,
        added_at: new Date(c.added_at),
      }));

      setCandidates(transformedData);
    } catch (err: any) {
      console.error('Error fetching candidates:', err);
      setError(err.message || 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }

  // Filter candidates by selected IDs, Roles, and Postcodes
  let filteredCandidates = candidates;

  if (selectedIds.length > 0) {
    filteredCandidates = filteredCandidates.filter(c => selectedIds.includes(c.id));
  }

  if (selectedRoles.length > 0) {
    filteredCandidates = filteredCandidates.filter(c =>
      selectedRoles.includes(normalizeRole(c.role))
    );
  }

  if (selectedPostcodes.length > 0) {
    filteredCandidates = filteredCandidates.filter(c =>
      selectedPostcodes.includes(c.postcode)
    );
  }

  if (selectedSalaries.length > 0) {
    filteredCandidates = filteredCandidates.filter(c =>
      selectedSalaries.includes(c.salary)
    );
  }

  if (selectedAvailabilities.length > 0) {
    filteredCandidates = filteredCandidates.filter(c =>
      selectedAvailabilities.includes(c.days)
    );
  }

  if (selectedExperiences.length > 0) {
    filteredCandidates = filteredCandidates.filter(c =>
      selectedExperiences.includes(c.experience || '')
    );
  }

  // Calculate minimum rows to show (at least 10 rows)
  const MIN_ROWS = 10;
  const emptyRowsCount = Math.max(0, MIN_ROWS - filteredCandidates.length);

  // Get unique IDs that match the filter text
  const getFilteredIdSuggestions = () => {
    if (!idFilterText) return [];
    return candidates
      .map(c => c.id)
      .filter(id => id.toLowerCase().includes(idFilterText.toLowerCase()))
      .sort();
  };

  const toggleIdSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Get unique Roles that match the filter text
  const getFilteredRoleSuggestions = () => {
    if (!roleFilterText) return [];
    const uniqueRoles = Array.from(new Set(candidates.map(c => normalizeRole(c.role))));
    return uniqueRoles
      .filter(role => role.toLowerCase().includes(roleFilterText.toLowerCase()))
      .sort();
  };

  const toggleRoleSelection = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  // Get unique Postcodes that match the filter text
  const getFilteredPostcodeSuggestions = () => {
    if (!postcodeFilterText) return [];
    const uniquePostcodes = Array.from(new Set(candidates.map(c => c.postcode)));
    return uniquePostcodes
      .filter(postcode => postcode.toLowerCase().includes(postcodeFilterText.toLowerCase()))
      .sort();
  };

  const togglePostcodeSelection = (postcode: string) => {
    setSelectedPostcodes(prev =>
      prev.includes(postcode) ? prev.filter(p => p !== postcode) : [...prev, postcode]
    );
  };

  // Get unique Salaries that match the filter text
  const getFilteredSalarySuggestions = () => {
    if (!salaryFilterText) return [];
    const uniqueSalaries = Array.from(new Set(candidates.map(c => c.salary)));
    return uniqueSalaries
      .filter(salary => salary.toLowerCase().includes(salaryFilterText.toLowerCase()))
      .sort();
  };

  const toggleSalarySelection = (salary: string) => {
    setSelectedSalaries(prev =>
      prev.includes(salary) ? prev.filter(s => s !== salary) : [...prev, salary]
    );
  };

  // Get unique Availabilities that match the filter text
  const getFilteredAvailabilitySuggestions = () => {
    if (!availabilityFilterText) return [];
    const uniqueAvailabilities = Array.from(new Set(candidates.map(c => c.days)));
    return uniqueAvailabilities
      .filter(avail => avail.toLowerCase().includes(availabilityFilterText.toLowerCase()))
      .sort();
  };

  const toggleAvailabilitySelection = (availability: string) => {
    setSelectedAvailabilities(prev =>
      prev.includes(availability) ? prev.filter(a => a !== availability) : [...prev, availability]
    );
  };

  // Get unique Experiences that match the filter text
  const getFilteredExperienceSuggestions = () => {
    if (!experienceFilterText) return [];
    const uniqueExperiences = Array.from(new Set(candidates.map(c => c.experience || '').filter(e => e)));
    return uniqueExperiences
      .filter(exp => exp.toLowerCase().includes(experienceFilterText.toLowerCase()))
      .sort();
  };

  const toggleExperienceSelection = (experience: string) => {
    setSelectedExperiences(prev =>
      prev.includes(experience) ? prev.filter(e => e !== experience) : [...prev, experience]
    );
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/candidates', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      setUploadResult(result);

      if (result.success) {
        await fetchCandidates();
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
    window.location.href = '/api/templates/candidates';
  };

  const handleAddSuccess = async () => {
    await fetchCandidates();
  };

  const handleCellChange = async (candidateId: string, field: keyof Candidate, value: any) => {
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ [field]: value })
        .eq('id', candidateId);

      if (error) throw error;

      setCandidates(prev => prev.map(c =>
        c.id === candidateId ? { ...c, [field]: value } : c
      ));
    } catch (err: any) {
      console.error('Error updating candidate:', err);
      alert('Failed to update: ' + err.message);
      await fetchCandidates();
    }
  };

  const handleDeleteRow = async (candidateId: string) => {
    if (!confirm('Delete this candidate? This will remove all associated matches.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('candidates')
        .delete()
        .eq('id', candidateId);

      if (error) throw error;

      await fetchCandidates();
    } catch (err: any) {
      console.error('Error deleting candidate:', err);
      alert('Failed to delete: ' + err.message);
    }
  };

  // AI Smart Paste handler
  const handleSmartPaste = async () => {
    if (!aiText.trim()) {
      setAiResult({ success: false, message: 'Please paste some text first' });
      return;
    }

    setIsParsing(true);
    setAiResult(null);

    try {
      const response = await fetch('/api/ai/parse-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse candidates');
      }

      if (!result.candidates || result.candidates.length === 0) {
        setAiResult({ success: false, message: 'No candidates found in the text' });
        setIsParsing(false);
        return;
      }

      // Add each candidate to database
      let successCount = 0;
      let errorCount = 0;

      // Get current user ID
      const userId = await getCurrentUserId();
      if (!userId) {
        setAiResult({ success: false, message: 'You must be logged in to add candidates' });
        setIsParsing(false);
        return;
      }

      for (const candidate of result.candidates) {
        try {
          const { error } = await supabase.from('candidates').insert({
            id: candidate.id || `CAN${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            first_name: candidate.first_name || '',
            last_name: candidate.last_name || '',
            email: candidate.email || '',
            phone: candidate.phone || '',
            role: candidate.role || '',
            postcode: candidate.postcode || '',
            salary: candidate.salary || '',
            days: candidate.days || '',
            experience: candidate.experience || '',
            notes: candidate.notes || '',
            user_id: userId,
            added_at: new Date()
          });

          if (error) {
            console.error('Error adding candidate:', error);
            errorCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          console.error('Error adding candidate:', err);
          errorCount++;
        }
      }

      // Show result
      if (successCount > 0) {
        setAiResult({
          success: true,
          message: `✅ Added ${successCount} candidate${successCount > 1 ? 's' : ''}${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
          count: successCount
        });
        setAiText('');
        await fetchCandidates();
      } else {
        setAiResult({
          success: false,
          message: `❌ Failed to add candidates. Check the format and try again.`
        });
      }
    } catch (err: any) {
      setAiResult({
        success: false,
        message: err.message || 'Failed to parse candidates'
      });
    } finally {
      setIsParsing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-900 font-medium">Loading candidates...</p>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Candidates</h1>

        {/* Collapsible Stats */}
        {showStats && (
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-white border border-gray-300 rounded p-3">
            <div className="text-center">
              <p className="text-xs text-gray-600">Total</p>
              <p className="text-xl font-bold text-blue-900">{candidates.length}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">🟨 New (48h)</p>
              <p className="text-xl font-bold text-green-900">
                {candidates.filter(c => {
                  const hours = (new Date().getTime() - c.added_at.getTime()) / (1000 * 60 * 60);
                  return hours <= 48;
                }).length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Dental Nurses</p>
              <p className="text-xl font-bold text-purple-900">
                {candidates.filter(c => normalizeRole(c.role) === 'Dental Nurse').length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Dentists</p>
              <p className="text-xl font-bold text-orange-900">
                {candidates.filter(c => normalizeRole(c.role) === 'Dentist').length}
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
              isEditMode ? 'bg-green-100 hover:bg-green-200' : 'bg-blue-100 hover:bg-blue-200'
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

          <div className="border-l border-gray-300 h-6 mx-1"></div>

          <Link
            href="/matches"
            className="px-3 py-1.5 bg-blue-100 border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-blue-200"
          >
            View Matches
          </Link>

          <Link
            href="/clients"
            className="px-3 py-1.5 bg-white border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Clients
          </Link>

          <div className="border-l border-gray-300 h-6 mx-1"></div>

          <button
            onClick={() => setShowSmartPaste(!showSmartPaste)}
            className="px-3 py-1.5 bg-purple-100 border border-purple-400 rounded text-sm font-semibold text-gray-900 hover:bg-purple-200"
          >
            🤖 AI Smart Paste
          </button>
        </div>

        {/* AI Smart Paste Section */}
        {showSmartPaste && (
          <div className="mb-3 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-300 rounded-lg">
            <h3 className="text-lg font-bold text-purple-900 mb-2">🤖 AI Smart Paste</h3>
            <p className="text-sm text-gray-700 mb-3">
              Paste WhatsApp messages, emails, or any text with candidate info. AI will extract and add them automatically.
            </p>

            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder="Example:
298697 receptionist CR0 8JD 7723610278 2-3 days a week, 14 per hour
298782 dental nurse HA8 0NN 7947366593 Part time, Mon/Wed/Fri, 14 per hour"
              className="w-full p-3 border-2 border-purple-300 rounded-lg mb-3 font-mono text-sm"
              rows={6}
            />

            <div className="flex gap-2">
              <button
                onClick={handleSmartPaste}
                disabled={isParsing || !aiText.trim()}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold ${
                  isParsing || !aiText.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {isParsing ? '🔄 Processing with AI...' : '✨ Extract & Add Candidates'}
              </button>
              <button
                onClick={() => {
                  setAiText('');
                  setAiResult(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg text-sm font-semibold hover:bg-gray-300"
              >
                Clear
              </button>
              <button
                onClick={() => setShowSmartPaste(false)}
                className="px-4 py-2 bg-red-100 text-red-900 rounded-lg text-sm font-semibold hover:bg-red-200"
              >
                Close
              </button>
            </div>

            {aiResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm font-semibold ${
                aiResult.success
                  ? 'bg-green-100 border border-green-400 text-green-900'
                  : 'bg-red-100 border border-red-400 text-red-900'
              }`}>
                {aiResult.message}
              </div>
            )}
          </div>
        )}

        {/* Edit Mode Notice */}
        {isEditMode && (
          <div className="mb-3 bg-blue-50 border border-blue-300 rounded p-2 text-sm text-blue-800">
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
                  <th
                    className={`px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedIds.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.id}%` }}
                  >
                    <div className="flex items-center gap-1">
                      <span>ID</span>
                      <button
                        onClick={() => setShowIdFilter(!showIdFilter)}
                        className="hover:bg-gray-300 px-1 rounded"
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

                    {/* Filter Dropdown */}
                    {showIdFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2 border-b-2 border-gray-300 bg-gray-100">
                          <input
                            type="text"
                            value={idFilterText}
                            onChange={(e) => setIdFilterText(e.target.value)}
                            placeholder="Search IDs..."
                            className="w-full px-2 py-1 border-2 border-gray-400 text-sm font-normal text-gray-900"
                          />
                        </div>

                        <div className="max-h-64 overflow-y-auto">
                          {selectedIds.length > 0 && (
                            <div className="p-2 border-b border-gray-300 bg-blue-50">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-gray-900">
                                  Selected ({selectedIds.length})
                                </span>
                                <button
                                  onClick={() => setSelectedIds([])}
                                  className="text-xs text-blue-600 hover:underline font-semibold"
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}

                          {getFilteredIdSuggestions().length > 0 ? (
                            getFilteredIdSuggestions().map(id => (
                              <label
                                key={id}
                                className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedIds.includes(id)}
                                  onChange={() => toggleIdSelection(id)}
                                  className="mr-2"
                                />
                                <span className="font-medium text-gray-900">{id}</span>
                              </label>
                            ))
                          ) : idFilterText ? (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              No IDs match "{idFilterText}"
                            </div>
                          ) : (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              Type to search IDs
                            </div>
                          )}
                        </div>

                        <div className="p-2 border-t-2 border-gray-300 bg-gray-100 flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setShowIdFilter(false);
                              setIdFilterText('');
                            }}
                            className="px-3 py-1 bg-gray-300 border border-gray-500 text-xs font-semibold text-gray-900 hover:bg-gray-400"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group"
                    style={{ width: `${columnWidths.first_name}%` }}
                  >
                    First Name
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'first_name')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group"
                    style={{ width: `${columnWidths.last_name}%` }}
                  >
                    Last Name
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'last_name')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group"
                    style={{ width: `${columnWidths.email}%` }}
                  >
                    Email
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'email')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group"
                    style={{ width: `${columnWidths.phone}%` }}
                  >
                    Phone
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'phone')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />
                  </th>
                  <th
                    className={`px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedRoles.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.role}%` }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Role</span>
                      <button
                        onClick={() => setShowRoleFilter(!showRoleFilter)}
                        className="hover:bg-gray-300 px-1 rounded"
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

                    {/* Role Filter Dropdown */}
                    {showRoleFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2 border-b-2 border-gray-300 bg-gray-100">
                          <input
                            type="text"
                            value={roleFilterText}
                            onChange={(e) => setRoleFilterText(e.target.value)}
                            placeholder="Search Roles..."
                            className="w-full px-2 py-1 border-2 border-gray-400 text-sm font-normal text-gray-900"
                          />
                        </div>

                        <div className="max-h-64 overflow-y-auto">
                          {selectedRoles.length > 0 && (
                            <div className="p-2 border-b border-gray-300 bg-blue-50">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-gray-900">
                                  Selected ({selectedRoles.length})
                                </span>
                                <button
                                  onClick={() => setSelectedRoles([])}
                                  className="text-xs text-blue-600 hover:underline font-semibold"
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}

                          {getFilteredRoleSuggestions().length > 0 ? (
                            getFilteredRoleSuggestions().map(role => (
                              <label
                                key={role}
                                className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedRoles.includes(role)}
                                  onChange={() => toggleRoleSelection(role)}
                                  className="mr-2"
                                />
                                <span className="font-medium text-gray-900">{role}</span>
                              </label>
                            ))
                          ) : roleFilterText ? (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              No roles match "{roleFilterText}"
                            </div>
                          ) : (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              Type to search roles
                            </div>
                          )}
                        </div>

                        <div className="p-2 border-t-2 border-gray-300 bg-gray-100 flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setShowRoleFilter(false);
                              setRoleFilterText('');
                            }}
                            className="px-3 py-1 bg-gray-300 border border-gray-500 text-xs font-semibold text-gray-900 hover:bg-gray-400"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                  <th
                    className={`px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedPostcodes.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.postcode}%` }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Postcode</span>
                      <button
                        onClick={() => setShowPostcodeFilter(!showPostcodeFilter)}
                        className="hover:bg-gray-300 px-1 rounded"
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

                    {/* Postcode Filter Dropdown */}
                    {showPostcodeFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2 border-b-2 border-gray-300 bg-gray-100">
                          <input
                            type="text"
                            value={postcodeFilterText}
                            onChange={(e) => setPostcodeFilterText(e.target.value.toUpperCase())}
                            placeholder="Search Postcodes..."
                            className="w-full px-2 py-1 border-2 border-gray-400 text-sm font-normal text-gray-900"
                          />
                        </div>

                        <div className="max-h-64 overflow-y-auto">
                          {selectedPostcodes.length > 0 && (
                            <div className="p-2 border-b border-gray-300 bg-blue-50">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-gray-900">
                                  Selected ({selectedPostcodes.length})
                                </span>
                                <button
                                  onClick={() => setSelectedPostcodes([])}
                                  className="text-xs text-blue-600 hover:underline font-semibold"
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}

                          {getFilteredPostcodeSuggestions().length > 0 ? (
                            getFilteredPostcodeSuggestions().map(postcode => (
                              <label
                                key={postcode}
                                className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPostcodes.includes(postcode)}
                                  onChange={() => togglePostcodeSelection(postcode)}
                                  className="mr-2"
                                />
                                <span className="font-medium text-gray-900 font-mono">{postcode}</span>
                              </label>
                            ))
                          ) : postcodeFilterText ? (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              No postcodes match "{postcodeFilterText}"
                            </div>
                          ) : (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              Type to search postcodes
                            </div>
                          )}
                        </div>

                        <div className="p-2 border-t-2 border-gray-300 bg-gray-100 flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setShowPostcodeFilter(false);
                              setPostcodeFilterText('');
                            }}
                            className="px-3 py-1 bg-gray-300 border border-gray-500 text-xs font-semibold text-gray-900 hover:bg-gray-400"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                  <th
                    className={`px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedSalaries.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.salary}%` }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Salary</span>
                      <button
                        onClick={() => setShowSalaryFilter(!showSalaryFilter)}
                        className="hover:bg-gray-300 px-1 rounded"
                        title="Filter Salaries"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'salary')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {/* Salary Filter Dropdown */}
                    {showSalaryFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2 border-b-2 border-gray-300 bg-gray-100">
                          <input
                            type="text"
                            value={salaryFilterText}
                            onChange={(e) => setSalaryFilterText(e.target.value)}
                            placeholder="Search Salaries..."
                            className="w-full px-2 py-1 border-2 border-gray-400 text-sm font-normal text-gray-900"
                          />
                        </div>

                        <div className="max-h-64 overflow-y-auto">
                          {selectedSalaries.length > 0 && (
                            <div className="p-2 border-b border-gray-300 bg-blue-50">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-gray-900">
                                  Selected ({selectedSalaries.length})
                                </span>
                                <button
                                  onClick={() => setSelectedSalaries([])}
                                  className="text-xs text-blue-600 hover:underline font-semibold"
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}

                          {getFilteredSalarySuggestions().length > 0 ? (
                            getFilteredSalarySuggestions().map(salary => (
                              <label
                                key={salary}
                                className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedSalaries.includes(salary)}
                                  onChange={() => toggleSalarySelection(salary)}
                                  className="mr-2"
                                />
                                <span className="font-medium text-gray-900">{salary}</span>
                              </label>
                            ))
                          ) : salaryFilterText ? (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              No salaries match "{salaryFilterText}"
                            </div>
                          ) : (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              Type to search salaries
                            </div>
                          )}
                        </div>

                        <div className="p-2 border-t-2 border-gray-300 bg-gray-100 flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setShowSalaryFilter(false);
                              setSalaryFilterText('');
                            }}
                            className="px-3 py-1 bg-gray-300 border border-gray-500 text-xs font-semibold text-gray-900 hover:bg-gray-400"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                  <th
                    className={`px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedAvailabilities.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.days}%` }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Availability</span>
                      <button
                        onClick={() => setShowAvailabilityFilter(!showAvailabilityFilter)}
                        className="hover:bg-gray-300 px-1 rounded"
                        title="Filter Availability"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'days')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {/* Availability Filter Dropdown */}
                    {showAvailabilityFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2 border-b-2 border-gray-300 bg-gray-100">
                          <input
                            type="text"
                            value={availabilityFilterText}
                            onChange={(e) => setAvailabilityFilterText(e.target.value)}
                            placeholder="Search Availability..."
                            className="w-full px-2 py-1 border-2 border-gray-400 text-sm font-normal text-gray-900"
                          />
                        </div>

                        <div className="max-h-64 overflow-y-auto">
                          {selectedAvailabilities.length > 0 && (
                            <div className="p-2 border-b border-gray-300 bg-blue-50">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-gray-900">
                                  Selected ({selectedAvailabilities.length})
                                </span>
                                <button
                                  onClick={() => setSelectedAvailabilities([])}
                                  className="text-xs text-blue-600 hover:underline font-semibold"
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}

                          {getFilteredAvailabilitySuggestions().length > 0 ? (
                            getFilteredAvailabilitySuggestions().map(availability => (
                              <label
                                key={availability}
                                className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedAvailabilities.includes(availability)}
                                  onChange={() => toggleAvailabilitySelection(availability)}
                                  className="mr-2"
                                />
                                <span className="font-medium text-gray-900">{availability}</span>
                              </label>
                            ))
                          ) : availabilityFilterText ? (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              No availability match "{availabilityFilterText}"
                            </div>
                          ) : (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              Type to search availability
                            </div>
                          )}
                        </div>

                        <div className="p-2 border-t-2 border-gray-300 bg-gray-100 flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setShowAvailabilityFilter(false);
                              setAvailabilityFilterText('');
                            }}
                            className="px-3 py-1 bg-gray-300 border border-gray-500 text-xs font-semibold text-gray-900 hover:bg-gray-400"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                  <th
                    className={`px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group ${selectedExperiences.length > 0 ? 'bg-blue-100' : ''}`}
                    style={{ width: `${columnWidths.experience}%` }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Experience</span>
                      <button
                        onClick={() => setShowExperienceFilter(!showExperienceFilter)}
                        className="hover:bg-gray-300 px-1 rounded"
                        title="Filter Experience"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => handleResizeStart(e, 'experience')}
                      style={{ zIndex: 50 }}
                      title="Drag to resize"
                    />

                    {/* Experience Filter Dropdown */}
                    {showExperienceFilter && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-400 shadow-xl z-50"
                        style={{ width: 'calc(100% - 4px)' }}
                      >
                        <div className="p-2 border-b-2 border-gray-300 bg-gray-100">
                          <input
                            type="text"
                            value={experienceFilterText}
                            onChange={(e) => setExperienceFilterText(e.target.value)}
                            placeholder="Search Experience..."
                            className="w-full px-2 py-1 border-2 border-gray-400 text-sm font-normal text-gray-900"
                          />
                        </div>

                        <div className="max-h-64 overflow-y-auto">
                          {selectedExperiences.length > 0 && (
                            <div className="p-2 border-b border-gray-300 bg-blue-50">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-gray-900">
                                  Selected ({selectedExperiences.length})
                                </span>
                                <button
                                  onClick={() => setSelectedExperiences([])}
                                  className="text-xs text-blue-600 hover:underline font-semibold"
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}

                          {getFilteredExperienceSuggestions().length > 0 ? (
                            getFilteredExperienceSuggestions().map(experience => (
                              <label
                                key={experience}
                                className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedExperiences.includes(experience)}
                                  onChange={() => toggleExperienceSelection(experience)}
                                  className="mr-2"
                                />
                                <span className="font-medium text-gray-900">{experience}</span>
                              </label>
                            ))
                          ) : experienceFilterText ? (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              No experience match "{experienceFilterText}"
                            </div>
                          ) : (
                            <div className="p-3 text-xs text-gray-600 text-center">
                              Type to search experience
                            </div>
                          )}
                        </div>

                        <div className="p-2 border-t-2 border-gray-300 bg-gray-100 flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setShowExperienceFilter(false);
                              setExperienceFilterText('');
                            }}
                            className="px-3 py-1 bg-gray-300 border border-gray-500 text-xs font-semibold text-gray-900 hover:bg-gray-400"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-bold text-gray-900 uppercase border-r border-gray-300 relative group"
                    style={{ width: `${columnWidths.notes}%` }}
                  >
                    Notes
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
                {filteredCandidates.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-gray-50">
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.id}%` }}
                    >
                      <NewItemIndicator id={candidate.id} addedAt={candidate.added_at} />
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.first_name}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={candidate.first_name || ''}
                          onChange={(e) => handleCellChange(candidate.id, 'first_name', e.target.value)}
                          onBlur={(e) => handleCellChange(candidate.id, 'first_name', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        candidate.first_name || '-'
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.last_name}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={candidate.last_name || ''}
                          onChange={(e) => handleCellChange(candidate.id, 'last_name', e.target.value)}
                          onBlur={(e) => handleCellChange(candidate.id, 'last_name', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        candidate.last_name || '-'
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.email}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="email"
                          value={candidate.email || ''}
                          onChange={(e) => handleCellChange(candidate.id, 'email', e.target.value)}
                          onBlur={(e) => handleCellChange(candidate.id, 'email', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            if (candidate.email) {
                              setSelectedEmail({id: candidate.id, email: candidate.email});
                              setEmailModalPosition({ x: 100, y: 100 });
                            }
                          }}
                          className="text-left hover:text-blue-600 cursor-pointer underline"
                          disabled={!candidate.email}
                        >
                          {candidate.email
                            ? (candidate.email.length > 7 ? candidate.email.substring(0, 7) + '...' : candidate.email)
                            : '-'
                          }
                        </button>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.phone}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="tel"
                          value={candidate.phone || ''}
                          onChange={(e) => handleCellChange(candidate.id, 'phone', e.target.value)}
                          onBlur={(e) => handleCellChange(candidate.id, 'phone', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        candidate.phone || '-'
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.role}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={candidate.role}
                          onChange={(e) => handleCellChange(candidate.id, 'role', e.target.value)}
                          onBlur={(e) => handleCellChange(candidate.id, 'role', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        normalizeRole(candidate.role)
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-mono font-bold text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.postcode}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={candidate.postcode}
                          onChange={(e) => handleCellChange(candidate.id, 'postcode', e.target.value.toUpperCase())}
                          onBlur={(e) => handleCellChange(candidate.id, 'postcode', e.target.value.toUpperCase())}
                          className="px-2 py-1 border border-gray-400 rounded w-full font-mono text-sm font-bold text-gray-900"
                        />
                      ) : (
                        candidate.postcode
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.salary}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={candidate.salary}
                          onChange={(e) => handleCellChange(candidate.id, 'salary', e.target.value)}
                          onBlur={(e) => handleCellChange(candidate.id, 'salary', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        candidate.salary
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.days}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={candidate.days}
                          onChange={(e) => handleCellChange(candidate.id, 'days', e.target.value)}
                          onBlur={(e) => handleCellChange(candidate.id, 'days', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        candidate.days
                      )}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.experience}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={candidate.experience || ''}
                          onChange={(e) => handleCellChange(candidate.id, 'experience', e.target.value)}
                          onBlur={(e) => handleCellChange(candidate.id, 'experience', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        candidate.experience || '-'
                      )}
                    </td>
                    <td
                      className="px-3 py-2 text-sm font-medium text-gray-900 border-r border-gray-300 overflow-hidden text-ellipsis"
                      style={{ width: `${columnWidths.notes}%` }}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={candidate.notes || ''}
                          onChange={(e) => handleCellChange(candidate.id, 'notes', e.target.value)}
                          onBlur={(e) => handleCellChange(candidate.id, 'notes', e.target.value)}
                          className="px-2 py-1 border border-gray-400 rounded w-full text-sm font-medium text-gray-900"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedNote({id: candidate.id, note: candidate.notes || ''});
                            setEditingNote(candidate.notes || '');
                            setModalPosition({ x: 50, y: 50 });
                          }}
                          className="text-left hover:text-blue-600 cursor-pointer underline"
                        >
                          {candidate.notes
                            ? (candidate.notes.split(' ').slice(0, 2).join(' ') + (candidate.notes.split(' ').length > 2 ? '...' : ''))
                            : '-'
                          }
                        </button>
                      )}
                    </td>
                    {isEditMode && (
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleDeleteRow(candidate.id)}
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
          Showing {filteredCandidates.length} of {candidates.length} candidates
          {(selectedIds.length > 0 || selectedRoles.length > 0 || selectedPostcodes.length > 0 || selectedSalaries.length > 0 || selectedAvailabilities.length > 0 || selectedExperiences.length > 0) && (
            <span className="ml-2 text-blue-600 font-semibold">
              (Filtered by {[
                selectedIds.length > 0 ? 'ID' : '',
                selectedRoles.length > 0 ? 'Role' : '',
                selectedPostcodes.length > 0 ? 'Postcode' : '',
                selectedSalaries.length > 0 ? 'Salary' : '',
                selectedAvailabilities.length > 0 ? 'Availability' : '',
                selectedExperiences.length > 0 ? 'Experience' : ''
              ].filter(Boolean).join(' & ')})
            </span>
          )}
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
              <h3 className="text-base font-bold text-gray-900">📧 Email for {selectedEmail.id}</h3>
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

      <AddCandidateModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}

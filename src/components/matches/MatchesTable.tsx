'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Match, Candidate, Client } from '@/types';
import { CommuteBadge } from '../ui/CommuteBadge';
import { RoleMatchBadge } from '../ui/RoleMatchBadge';
import { NewItemIndicator } from '../ui/NewItemIndicator';
import { CommuteMapModal } from './CommuteMapModal';
import { supabase } from '@/lib/supabase/browser';
import { getCurrentUserId } from '@/lib/auth-helpers';
import MatchNotesPopup from './MatchNotesPopup';

interface MatchesTableProps {
  matches: Match[];
  visibleColumns: {
    salary_budget: boolean;
    availability_requirement: boolean;
  };
}

interface ModalInstance {
  id: string;
  type: 'candidate' | 'client';
  data: Candidate | Client;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

type MatchStatus = 'placed' | 'in-progress' | 'rejected' | null;

interface MatchNote {
  id: string;
  text: string;
  timestamp: string;
}

interface MatchStatusData {
  status: MatchStatus;
  notes: MatchNote[];
}

export function MatchesTable({ matches, visibleColumns }: MatchesTableProps) {
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openModals, setOpenModals] = useState<ModalInstance[]>([]);
  const [draggingModalId, setDraggingModalId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [matchStatuses, setMatchStatuses] = useState<Record<string, MatchStatusData>>({});
  const [selectedMatchForNote, setSelectedMatchForNote] = useState<Match | null>(null);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, x: 0, y: 0, width: 0, height: 0 });
  const openModalsRef = useRef(openModals);
  const [editingModalId, setEditingModalId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Candidate | Client>>({});

  // Keep ref in sync with state
  useEffect(() => {
    openModalsRef.current = openModals;
  }, [openModals]);

  // Global mouse move and up handlers for resize
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Handle candidate/client modal resize
        const modalId = isResizing.split('-').slice(0, -1).join('-');
        const direction = isResizing.split('-').slice(-1)[0];
        const deltaX = e.clientX - resizeStart.mouseX;
        const deltaY = e.clientY - resizeStart.mouseY;

        setOpenModals(prev => prev.map(modal => {
          if (modal.id !== modalId) return modal;

          let newWidth = resizeStart.width;
          let newHeight = resizeStart.height;
          let newX = resizeStart.x;
          let newY = resizeStart.y;

          // East (right edge) - increase width
          if (direction.includes('e')) {
            newWidth = Math.max(300, resizeStart.width + deltaX);
          }

          // South (bottom edge) - increase height
          if (direction.includes('s')) {
            newHeight = Math.max(200, resizeStart.height + deltaY);
          }

          // West (left edge) - adjust width and position
          if (direction.includes('w')) {
            const potentialWidth = resizeStart.width - deltaX;
            if (potentialWidth >= 300) {
              newWidth = potentialWidth;
              newX = resizeStart.x + deltaX;
            } else {
              newWidth = 300;
              newX = resizeStart.x + resizeStart.width - 300;
            }
          }

          // North (top edge) - adjust height and position
          if (direction.includes('n')) {
            const potentialHeight = resizeStart.height - deltaY;
            if (potentialHeight >= 200) {
              newHeight = potentialHeight;
              newY = resizeStart.y + deltaY;
            } else {
              newHeight = 200;
              newY = resizeStart.y + resizeStart.height - 200;
            }
          }

          return {
            ...modal,
            size: { width: newWidth, height: newHeight },
            position: { x: newX, y: newY }
          };
        }));
    };

    const handleGlobalMouseUp = () => {
      setIsResizing(null);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isResizing, resizeStart]);

  // Load match statuses from Supabase on component mount
  useEffect(() => {
    loadMatchStatusesFromDB();
  }, []);

  const loadMatchStatusesFromDB = async () => {
    try {
      // Fetch match statuses from database
      const { data: statuses, error: statusError } = await supabase
        .from('match_statuses')
        .select('*');

      if (statusError) throw statusError;

      // Fetch all notes
      const { data: notes, error: notesError } = await supabase
        .from('match_notes')
        .select('*')
        .order('created_at', { ascending: true });

      if (notesError) throw notesError;

      // Build match statuses object
      const statusMap: Record<string, MatchStatusData> = {};

      statuses?.forEach(status => {
        const key = `${status.candidate_id}-${status.client_id}`;
        const matchNotes = notes?.filter(
          n => n.candidate_id === status.candidate_id && n.client_id === status.client_id
        ).map(n => ({
          id: n.id,
          text: n.note_text,
          timestamp: n.created_at
        })) || [];

        statusMap[key] = {
          status: status.status,
          notes: matchNotes
        };
      });

      setMatchStatuses(statusMap);
    } catch (error) {
      console.error('Failed to load match statuses from database:', error);
    }
  };

  const handleCommuteClick = (match: Match) => {
    setSelectedMatch(match);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMatch(null);
  };

  const handleCandidateClick = (candidate: Candidate) => {
    const newModal: ModalInstance = {
      id: `candidate-${candidate.id}-${Date.now()}`,
      type: 'candidate',
      data: candidate,
      position: { x: 100 + (openModals.length * 30), y: 100 + (openModals.length * 30) },
      size: { width: 650, height: 750 }
    };
    setOpenModals(prev => [...prev, newModal]);
  };

  const handleClientClick = (client: Client) => {
    const newModal: ModalInstance = {
      id: `client-${client.id}-${Date.now()}`,
      type: 'client',
      data: client,
      position: { x: 100 + (openModals.length * 30), y: 100 + (openModals.length * 30) },
      size: { width: 650, height: 700 }
    };
    setOpenModals(prev => [...prev, newModal]);
  };

  const handleCloseModal_Detail = (modalId: string) => {
    setOpenModals(prev => prev.filter(m => m.id !== modalId));
  };

  const handleModalMouseDown = (e: React.MouseEvent, modalId: string) => {
    // Only start dragging if not resizing
    if (!isResizing) {
      setDraggingModalId(modalId);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleModalMouseMove = (e: React.MouseEvent, modalId: string) => {
    // Prioritize resizing over dragging
    if (isResizing && isResizing.startsWith(modalId)) {
      return; // Resize handler will handle this
    }

    if (draggingModalId !== modalId) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    setOpenModals(prev => prev.map(modal =>
      modal.id === modalId
        ? { ...modal, position: { x: modal.position.x + deltaX, y: modal.position.y + deltaY } }
        : modal
    ));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleModalMouseUp = () => {
    setDraggingModalId(null);
  };

  const handleEditClick = (modalId: string, data: Candidate | Client) => {
    setEditingModalId(modalId);
    setEditData({ ...data });
  };

  const handleCancelEdit = () => {
    setEditingModalId(null);
    setEditData({});
  };

  const handleSaveEdit = async (modalId: string, type: 'candidate' | 'client') => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      const table = type === 'candidate' ? 'candidates' : 'clients';
      const { error } = await supabase
        .from(table)
        .update(editData)
        .eq('id', editData.id)
        .eq('user_id', userId);

      if (error) throw error;

      // Update the modal data
      setOpenModals(prev => prev.map(modal =>
        modal.id === modalId ? { ...modal, data: { ...modal.data, ...editData } } : modal
      ));

      setEditingModalId(null);
      setEditData({});

      // Show success message (optional)
      alert(`${type === 'candidate' ? 'Candidate' : 'Client'} updated successfully!`);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save changes. Please try again.');
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  // Helper function to strip user prefix from IDs (e.g., "U3_CAN27" -> "CAN27")
  const getDisplayId = (fullId: string) => {
    const parts = fullId.split('_');
    if (parts.length > 1) {
      // Return everything after first underscore
      return parts.slice(1).join('_');
    }
    // Fallback to full ID if no underscore found
    return fullId;
  };

  const getMatchKey = (match: Match) => {
    return `${match.candidate.id}-${match.client.id}`;
  };

  const handleStatusClick = async (match: Match, status: MatchStatus) => {
    const key = getMatchKey(match);
    const currentData = matchStatuses[key] || { status: null, notes: [] };

    try {
      // Get current user ID
      const userId = await getCurrentUserId();
      if (!userId) {
        alert('You must be logged in to update match status');
        return;
      }

      // Toggle status off if clicking the same one
      if (currentData.status === status) {
        // Delete from database
        const { error } = await supabase
          .from('match_statuses')
          .delete()
          .eq('candidate_id', match.candidate.id)
          .eq('client_id', match.client.id);

        if (error) throw error;

        // Update local state
        setMatchStatuses(prev => ({
          ...prev,
          [key]: { ...currentData, status: null }
        }));
      } else {
        // Upsert to database
        const { error } = await supabase
          .from('match_statuses')
          .upsert({
            candidate_id: match.candidate.id,
            client_id: match.client.id,
            status: status,
            user_id: userId
          }, {
            onConflict: 'candidate_id,client_id'
          });

        if (error) throw error;

        // Update local state
        setMatchStatuses(prev => ({
          ...prev,
          [key]: { ...currentData, status }
        }));
      }
    } catch (error) {
      console.error('Failed to update match status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  const handleNoteClick = (match: Match) => {
    setSelectedMatchForNote(match);
  };

  const handleAddNote = async (noteText: string) => {
    if (selectedMatchForNote && noteText.trim()) {
      const key = getMatchKey(selectedMatchForNote);
      const currentData = matchStatuses[key] || { status: null, notes: [] };

      try {
        // Get current user ID
        const userId = await getCurrentUserId();
        if (!userId) {
          console.error('❌ User not authenticated');
          alert('You must be logged in to add notes');
          return;
        }

        console.log('📝 Adding note:', {
          candidate_id: selectedMatchForNote.candidate.id,
          client_id: selectedMatchForNote.client.id,
          note_length: noteText.trim().length,
          user_id: userId
        });

        // IMPORTANT: Ensure match_statuses row exists first (required for foreign key)
        // Always upsert to ensure the row exists in database
        console.log('📊 Ensuring match_statuses row exists...');
        const { error: statusError } = await supabase
          .from('match_statuses')
          .upsert({
            candidate_id: selectedMatchForNote.candidate.id,
            client_id: selectedMatchForNote.client.id,
            status: currentData.status || null,
            user_id: userId
          }, {
            onConflict: 'candidate_id,client_id'
          });

        if (statusError) {
          console.error('❌ Failed to create/update match_statuses row:', statusError);
          throw statusError;
        }
        console.log('✅ match_statuses row ensured');

        // Now insert note into database
        const { data, error } = await supabase
          .from('match_notes')
          .insert({
            candidate_id: selectedMatchForNote.candidate.id,
            client_id: selectedMatchForNote.client.id,
            note_text: noteText.trim(),
            user_id: userId
          })
          .select()
          .single();

        if (error) {
          console.error('❌ Database error details:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
          throw error;
        }

        console.log('✅ Note saved successfully:', data);

        // Create local note object
        const newNote: MatchNote = {
          id: data.id,
          text: data.note_text,
          timestamp: data.created_at
        };

        // Update local state (ensure status exists in local state too)
        setMatchStatuses(prev => ({
          ...prev,
          [key]: {
            status: currentData.status || null,
            notes: [...(currentData.notes || []), newNote]
          }
        }));

        // Note: Do NOT close popup or reset text - the MatchNotesPopup handles its own state
      } catch (error: any) {
        console.error('❌ Failed to save note:', error);
        const errorMessage = error?.message || 'Unknown error';
        alert(`Failed to save note:\n${errorMessage}\n\nCheck browser console for details.`);
      }
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (selectedMatchForNote) {
      const key = getMatchKey(selectedMatchForNote);
      const currentData = matchStatuses[key];

      if (currentData) {
        try {
          // Delete from database
          const { error } = await supabase
            .from('match_notes')
            .delete()
            .eq('id', noteId);

          if (error) throw error;

          // Update local state
          setMatchStatuses(prev => ({
            ...prev,
            [key]: {
              ...currentData,
              notes: currentData.notes.filter(n => n.id !== noteId)
            }
          }));
        } catch (error) {
          console.error('Failed to delete note:', error);
          alert('Failed to delete note. Please try again.');
        }
      }
    }
  };


  // Resize handlers for candidate/client modals
  const handleResizeMouseDown = (e: React.MouseEvent, modalId: string, direction: string) => {
    e.stopPropagation();
    const modal = openModals.find(m => m.id === modalId);
    if (modal) {
      setIsResizing(`${modalId}-${direction}`);
      setResizeStart({
        mouseX: e.clientX,
        mouseY: e.clientY,
        x: modal.position.x,
        y: modal.position.y,
        width: modal.size.width,
        height: modal.size.height
      });
    }
  };


  const getRowStyle = (match: Match) => {
    const key = getMatchKey(match);
    const statusData = matchStatuses[key];

    if (!statusData || !statusData.status) return {};

    if (statusData.status === 'placed') {
      return {
        backgroundColor: '#22c55e', // green-500 - EXACT match to icon
        borderLeft: '4px solid #15803d', // darker green border
        color: '#ffffff' // white text for readability
      };
    } else if (statusData.status === 'in-progress') {
      return {
        backgroundColor: '#f97316', // orange-500 - EXACT match to icon
        borderLeft: '4px solid #c2410c', // darker orange border
        color: '#ffffff' // white text for readability
      };
    } else if (statusData.status === 'rejected') {
      return {
        backgroundColor: '#ef4444', // red-500 - EXACT match to icon
        borderLeft: '4px solid #b91c1c', // darker red border
        color: '#ffffff' // white text for readability
      };
    }

    return {};
  };

  if (matches.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-gray-900 font-medium">No matches found with current filters.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-xl border border-gray-200">
      {/* Table Header Info */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          💡 Click commute time to view route | Edit data on{' '}
          <Link href="/candidates" className="text-blue-600 hover:underline font-medium">
            Candidates
          </Link>
          {' '}or{' '}
          <Link href="/clients" className="text-blue-600 hover:underline font-medium">
            Clients
          </Link>
          {' '}pages
        </span>
        <span className="text-sm text-blue-600 font-medium">
          📌 Status column is always visible (sticky)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr style={{ backgroundColor: '#1e293b' }}>
              {/* Match Info Section - COMMUTE PRIORITY: MUST BE WIDE ENOUGH FOR "🟢🟢🟢 15m" */}
              <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-xs font-bold text-white uppercase tracking-tighter border-r w-[180px] lg:w-[200px] xl:w-auto" style={{ borderColor: '#334155' }}>
                <span className="hidden xl:inline">Commute</span>
                <span className="xl:hidden">Com</span>
              </th>
              <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-xs font-bold text-white uppercase tracking-tighter border-r-4 border-white w-[32px] lg:w-[40px] xl:w-auto">
                <span className="hidden xl:inline">Role Match</span>
                <span className="xl:hidden">Rol</span>
              </th>

              {/* Alternating Candidate/Client Columns - Ultra compact to save space for commute */}
              <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-[10px] font-bold text-white uppercase tracking-tighter border-r w-[30px] lg:w-[35px] xl:w-auto" style={{ backgroundColor: '#334155', borderColor: '#475569' }}>
                CAN
              </th>
              <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-[10px] font-bold text-white uppercase tracking-tighter border-r w-[28px] lg:w-[32px] xl:w-auto" style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}>
                CL
              </th>

              <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-xs font-bold text-white uppercase tracking-tighter border-r w-[45px] lg:w-[50px] xl:w-auto" style={{ backgroundColor: '#334155', borderColor: '#475569' }}>
                <span className="hidden xl:inline">C-Post</span>
                <span className="xl:hidden">CPC</span>
              </th>
              <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-xs font-bold text-white uppercase tracking-tighter border-r w-[45px] lg:w-[50px] xl:w-auto" style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}>
                <span className="hidden xl:inline">L-Post</span>
                <span className="xl:hidden">LPC</span>
              </th>

              {visibleColumns.salary_budget && (
                <>
                  <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-[10px] font-bold text-white uppercase tracking-tighter border-r w-[40px] lg:w-[45px] xl:w-auto" style={{ backgroundColor: '#334155', borderColor: '#475569' }}>
                    £C
                  </th>
                  <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-[10px] font-bold text-white uppercase tracking-tighter border-r w-[40px] lg:w-[45px] xl:w-auto" style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}>
                    £L
                  </th>
                </>
              )}

              <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-[10px] font-bold text-white uppercase tracking-tighter border-r w-[45px] lg:w-[55px] xl:w-auto" style={{ backgroundColor: '#334155', borderColor: '#475569' }}>
                <span className="hidden lg:inline">C-Rol</span>
                <span className="lg:hidden">CR</span>
              </th>
              <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-[10px] font-bold text-white uppercase tracking-tighter border-r w-[45px] lg:w-[55px] xl:w-auto" style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}>
                <span className="hidden lg:inline">L-Rol</span>
                <span className="lg:hidden">LR</span>
              </th>

              {visibleColumns.availability_requirement && (
                <>
                  <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-[10px] font-bold text-white uppercase tracking-tighter border-r w-[45px] lg:w-[50px] xl:w-auto" style={{ backgroundColor: '#334155', borderColor: '#475569' }}>
                    <span className="hidden xl:inline">Ava</span>
                    <span className="xl:hidden">Av</span>
                  </th>
                  <th className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-2 text-left text-[7px] lg:text-[8px] xl:text-[10px] font-bold text-white uppercase tracking-tighter border-r w-[45px] lg:w-[50px] xl:w-auto" style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}>
                    <span className="hidden xl:inline">Req</span>
                    <span className="xl:hidden">Rq</span>
                  </th>
                </>
              )}

              <th className="px-1 lg:px-2 xl:px-3 py-1 lg:py-2 text-center text-[7px] lg:text-[8px] xl:text-xs font-bold text-white uppercase tracking-tighter sticky right-0 z-10 w-[100px] lg:w-[110px] xl:w-[140px]" style={{ backgroundColor: '#1e293b' }}>
                Stat
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {matches.map((match, index) => (
              <tr
                key={`${match.candidate.id}-${match.client.id}`}
                className={`transition-colors hover:bg-blue-50 ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                }`}
                style={getRowStyle(match)}
              >
                {/* Match Info - COMMUTE: Wide enough to contain all content without overlap */}
                <td className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap border-r border-gray-200 overflow-hidden">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCommuteClick(match);
                    }}
                    className="w-full text-left hover:scale-105 transition-transform cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 rounded text-[7px] lg:text-[8px] xl:text-xs"
                    title="Click to view commute route on map"
                  >
                    <CommuteBadge
                      display={match.commute_display}
                      band={match.commute_band}
                      minutes={match.commute_minutes}
                    />
                  </button>
                </td>
                <td className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap border-r-4 border-gray-300 overflow-hidden">
                  <RoleMatchBadge
                    isMatch={match.role_match}
                    display={match.role_match_display}
                  />
                </td>

                {/* Alternating Candidate/Client Columns - Ultra compact */}
                {/* CAN ID */}
                <td className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap text-[8px] lg:text-[9px] xl:text-xs font-bold text-gray-900 border-r border-gray-200 overflow-hidden">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCandidateClick(match.candidate);
                    }}
                    className="w-full text-left hover:underline cursor-pointer focus:outline-none rounded p-0 transition-colors"
                    title="Click to view candidate details"
                  >
                    <NewItemIndicator
                      id={getDisplayId(match.candidate.id)}
                      addedAt={match.candidate.added_at}
                    />
                  </button>
                </td>
                {/* CL ID */}
                <td className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap text-[8px] lg:text-[9px] xl:text-xs font-bold text-gray-900 border-r border-gray-200 overflow-hidden">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClientClick(match.client);
                    }}
                    className="w-full text-left hover:underline cursor-pointer focus:outline-none rounded p-0 transition-colors"
                    title="Click to view client details"
                  >
                    <NewItemIndicator
                      id={getDisplayId(match.client.id)}
                      addedAt={match.client.added_at}
                    />
                  </button>
                </td>

                {/* CAN Postcode */}
                <td
                  className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap font-mono text-[8px] lg:text-[9px] xl:text-sm font-bold text-gray-900 border-r border-gray-200 overflow-hidden"
                  title={`Candidate Postcode: ${match.candidate.postcode}`}
                >
                  {match.candidate.postcode}
                </td>
                {/* CL Postcode */}
                <td
                  className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap font-mono text-[8px] lg:text-[9px] xl:text-sm font-bold text-gray-900 border-r border-gray-200 overflow-hidden"
                  title={`Client Postcode: ${match.client.postcode}`}
                >
                  {match.client.postcode}
                </td>

                {visibleColumns.salary_budget && (
                  <>
                    {/* CAN Salary */}
                    <td
                      className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap text-[8px] lg:text-[9px] xl:text-xs font-semibold text-gray-900 border-r border-gray-200 overflow-hidden"
                      title={`Candidate Salary: ${match.candidate.salary}`}
                    >
                      {match.candidate.salary}
                    </td>
                    {/* CL Budget */}
                    <td
                      className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap text-[8px] lg:text-[9px] xl:text-xs font-semibold text-gray-900 border-r border-gray-200 overflow-hidden"
                      title={`Client Budget: ${match.client.budget}`}
                    >
                      {match.client.budget}
                    </td>
                  </>
                )}

                {/* CAN Role */}
                <td
                  className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap text-[8px] lg:text-[9px] xl:text-xs font-medium text-gray-800 border-r border-gray-200 overflow-hidden"
                  title={`Candidate Role: ${match.candidate.role}`}
                >
                  {match.candidate.role}
                </td>
                {/* CL Role */}
                <td
                  className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap text-[8px] lg:text-[9px] xl:text-xs font-medium text-gray-800 border-r border-gray-200 overflow-hidden"
                  title={`Client Role: ${match.client.role}`}
                >
                  {match.client.role}
                </td>

                {visibleColumns.availability_requirement && (
                  <>
                    {/* CAN Availability */}
                    <td
                      className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap text-[8px] lg:text-[9px] xl:text-xs text-gray-700 border-r border-gray-200 overflow-hidden"
                      title={`Candidate Availability: ${match.candidate.days}`}
                    >
                      {match.candidate.days}
                    </td>
                    {/* CL Requirement */}
                    <td
                      className="px-0.5 lg:px-1 xl:px-2 py-1 lg:py-1.5 whitespace-nowrap text-[8px] lg:text-[9px] xl:text-xs text-gray-700 border-r border-gray-200 overflow-hidden"
                      title={`Client Requirement: ${match.client.requirement}`}
                    >
                      {match.client.requirement}
                    </td>
                  </>
                )}

                {/* Status - Ultra compact buttons */}
                <td className="px-1 lg:px-2 xl:px-3 py-1 lg:py-1.5 whitespace-nowrap text-center sticky right-0 z-10 bg-inherit">
                  <div className="flex items-center justify-center gap-0.5">
                    {/* Placed - Green Check */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusClick(match, 'placed');
                      }}
                      className={`w-5 h-5 lg:w-6 lg:h-6 xl:w-8 xl:h-8 flex items-center justify-center rounded-full border transition-all font-bold text-[10px] lg:text-xs xl:text-sm ${
                        matchStatuses[getMatchKey(match)]?.status === 'placed'
                          ? 'bg-green-500 border-green-600 text-white shadow-lg scale-110'
                          : 'bg-white border-gray-400 text-gray-500 hover:border-green-500 hover:text-green-600 hover:bg-green-50'
                      }`}
                      title="Mark as Placed"
                    >
                      ✓
                    </button>

                    {/* In Progress - Orange */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusClick(match, 'in-progress');
                      }}
                      className={`w-5 h-5 lg:w-6 lg:h-6 xl:w-8 xl:h-8 flex items-center justify-center rounded-full border transition-all font-bold text-[10px] lg:text-xs xl:text-sm ${
                        matchStatuses[getMatchKey(match)]?.status === 'in-progress'
                          ? 'bg-orange-500 border-orange-600 text-white shadow-lg scale-110'
                          : 'bg-white border-gray-400 text-gray-500 hover:border-orange-500 hover:text-orange-600 hover:bg-orange-50'
                      }`}
                      title="Mark as In Progress"
                    >
                      ⏳
                    </button>

                    {/* Rejected - Red X */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusClick(match, 'rejected');
                      }}
                      className={`w-5 h-5 lg:w-6 lg:h-6 xl:w-8 xl:h-8 flex items-center justify-center rounded-full border transition-all font-bold text-[10px] lg:text-xs xl:text-sm ${
                        matchStatuses[getMatchKey(match)]?.status === 'rejected'
                          ? 'bg-red-500 border-red-600 text-white shadow-lg scale-110'
                          : 'bg-white border-gray-400 text-gray-500 hover:border-red-500 hover:text-red-600 hover:bg-red-50'
                      }`}
                      title="Mark as Rejected"
                    >
                      ✕
                    </button>

                    {/* Note */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNoteClick(match);
                      }}
                      className={`w-5 h-5 lg:w-6 lg:h-6 xl:w-8 xl:h-8 flex items-center justify-center rounded-full border transition-all font-bold text-[10px] lg:text-xs xl:text-sm ${
                        matchStatuses[getMatchKey(match)]?.notes?.length > 0
                          ? 'bg-blue-500 border-blue-600 text-white shadow-lg scale-110'
                          : 'bg-white border-gray-400 text-gray-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                      title={`${matchStatuses[getMatchKey(match)]?.notes?.length || 0} note(s) - Click to add/view`}
                    >
                      📝
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-200">
        <p className="text-sm font-bold text-gray-900">
          Showing <span className="font-bold text-blue-600 text-lg">{matches.length}</span> match{matches.length !== 1 ? 'es' : ''}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          💡 Click on any commute time to see the route on Google Maps
        </p>
        <p className="text-xs text-gray-600 mt-1">
          📊 Status Column: <span className="text-green-600">✓ Green = Placed</span> | <span className="text-orange-600">⏳ Orange = In Progress</span> | <span className="text-red-600">✕ Red = Rejected</span> | <span className="text-blue-600">📝 Blue = Notes</span>
        </p>
      </div>

      {/* Commute Map Modal */}
      {selectedMatch && (
        <CommuteMapModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          originPostcode={selectedMatch.candidate.postcode}
          destinationPostcode={selectedMatch.client.postcode}
          candidateName={`${selectedMatch.candidate.role} (${selectedMatch.candidate.id})`}
          clientName={`${selectedMatch.client.surgery} (${selectedMatch.client.id})`}
          commuteMinutes={selectedMatch.commute_minutes}
          commuteDisplay={selectedMatch.commute_display}
        />
      )}

      {/* Multiple Detail Modals */}
      {openModals.map((modal) => (
        <div key={modal.id} className="fixed inset-0 z-50 pointer-events-none">
          {/* Modal */}
          <div
            className="absolute bg-white border-2 border-gray-400 shadow-2xl pointer-events-auto flex flex-col cursor-move"
            style={{
              left: modal.position.x,
              top: modal.position.y,
              width: modal.size.width,
              height: modal.size.height,
              overflow: 'hidden'
            }}
            onMouseDown={(e) => {
              // Only start drag if not clicking on resize handles or buttons
              const target = e.target as HTMLElement;
              if (!target.closest('button') && !target.classList.contains('resize-handle')) {
                handleModalMouseDown(e, modal.id);
              }
            }}
            onMouseMove={(e) => handleModalMouseMove(e, modal.id)}
            onMouseUp={handleModalMouseUp}
            onMouseLeave={handleModalMouseUp}
          >
            {/* Header */}
            <div
              className={`${
                modal.type === 'candidate'
                  ? 'bg-blue-100 border-b-2 border-blue-400'
                  : 'bg-orange-100 border-b-2 border-orange-400'
              } px-3 py-2 flex justify-between items-center flex-shrink-0`}
            >
              <h3 className="font-bold text-sm text-gray-900 uppercase">
                {modal.type === 'candidate' ? '👤 Candidate Details' : '🏢 Client Details'}
              </h3>
              <div className="flex gap-2 items-center">
                {editingModalId === modal.id ? (
                  <>
                    <button
                      onClick={() => handleSaveEdit(modal.id, modal.type)}
                      className="px-3 py-1 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleEditClick(modal.id, modal.data)}
                    className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => handleCloseModal_Detail(modal.id)}
                  className={`${
                    modal.type === 'candidate'
                      ? 'text-gray-900 hover:text-gray-600 hover:bg-blue-200'
                      : 'text-gray-900 hover:text-gray-600 hover:bg-orange-200'
                  } text-xl font-bold leading-none px-2 rounded`}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 bg-gray-50 flex-1 overflow-auto" style={{ minHeight: 0 }}>
              {modal.type === 'candidate' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">ID</label>
                      <p className="text-sm font-bold text-gray-900">{(modal.data as Candidate).id}</p>
                    </div>
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Role</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="text"
                          value={(editData as Candidate).role || ''}
                          onChange={(e) => handleFieldChange('role', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm font-semibold text-gray-900">{(modal.data as Candidate).role}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">First Name</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="text"
                          value={(editData as Candidate).first_name || ''}
                          onChange={(e) => handleFieldChange('first_name', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm text-gray-900">{(modal.data as Candidate).first_name || 'N/A'}</p>
                      )}
                    </div>
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Last Name</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="text"
                          value={(editData as Candidate).last_name || ''}
                          onChange={(e) => handleFieldChange('last_name', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm text-gray-900">{(modal.data as Candidate).last_name || 'N/A'}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Email</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="email"
                          value={(editData as Candidate).email || ''}
                          onChange={(e) => handleFieldChange('email', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm text-gray-900 break-all">{(modal.data as Candidate).email || 'N/A'}</p>
                      )}
                    </div>
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Phone</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="tel"
                          value={(editData as Candidate).phone || ''}
                          onChange={(e) => handleFieldChange('phone', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm text-gray-900">{(modal.data as Candidate).phone || 'N/A'}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Postcode</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="text"
                          value={(editData as Candidate).postcode || ''}
                          onChange={(e) => handleFieldChange('postcode', e.target.value)}
                          className="w-full px-2 py-1 text-sm font-mono text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm font-mono font-bold text-gray-900">{(modal.data as Candidate).postcode}</p>
                      )}
                    </div>
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Salary</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="text"
                          value={(editData as Candidate).salary || ''}
                          onChange={(e) => handleFieldChange('salary', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm font-bold text-green-700">{(modal.data as Candidate).salary}</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border-2 border-gray-300 p-2">
                    <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Availability</label>
                    {editingModalId === modal.id ? (
                      <input
                        type="text"
                        value={(editData as Candidate).days || ''}
                        onChange={(e) => handleFieldChange('days', e.target.value)}
                        className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                      />
                    ) : (
                      <p className="text-sm text-gray-900">{(modal.data as Candidate).days}</p>
                    )}
                  </div>

                  <div className="bg-white border-2 border-gray-300 p-2">
                    <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Experience</label>
                    {editingModalId === modal.id ? (
                      <input
                        type="text"
                        value={(editData as Candidate).experience || ''}
                        onChange={(e) => handleFieldChange('experience', e.target.value)}
                        className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                      />
                    ) : (
                      <p className="text-sm text-gray-900">{(modal.data as Candidate).experience || 'N/A'}</p>
                    )}
                  </div>

                  <div className="bg-white border-2 border-gray-300 p-2">
                    <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Travel Flexibility</label>
                    {editingModalId === modal.id ? (
                      <input
                        type="text"
                        value={(editData as Candidate).travel_flexibility || ''}
                        onChange={(e) => handleFieldChange('travel_flexibility', e.target.value)}
                        className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                      />
                    ) : (
                      <p className="text-sm text-gray-900">{(modal.data as Candidate).travel_flexibility || 'N/A'}</p>
                    )}
                  </div>

                  <div className="bg-white border-2 border-gray-300 p-2">
                    <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Notes</label>
                    {editingModalId === modal.id ? (
                      <textarea
                        value={(editData as Candidate).notes || ''}
                        onChange={(e) => handleFieldChange('notes', e.target.value)}
                        rows={3}
                        className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{(modal.data as Candidate).notes || 'No notes'}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">ID</label>
                      <p className="text-sm font-bold text-gray-900">{(modal.data as Client).id}</p>
                    </div>
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Surgery</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="text"
                          value={(editData as Client).surgery || ''}
                          onChange={(e) => handleFieldChange('surgery', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm font-semibold text-gray-900">{(modal.data as Client).surgery}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Client Name</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="text"
                          value={(editData as Client).client_name || ''}
                          onChange={(e) => handleFieldChange('client_name', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm text-gray-900">{(modal.data as Client).client_name || 'N/A'}</p>
                      )}
                    </div>
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Role</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="text"
                          value={(editData as Client).role || ''}
                          onChange={(e) => handleFieldChange('role', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm font-semibold text-gray-900">{(modal.data as Client).role}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Email</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="email"
                          value={(editData as Client).client_email || ''}
                          onChange={(e) => handleFieldChange('client_email', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm text-gray-900 break-all">{(modal.data as Client).client_email || 'N/A'}</p>
                      )}
                    </div>
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Phone</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="tel"
                          value={(editData as Client).client_phone || ''}
                          onChange={(e) => handleFieldChange('client_phone', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm text-gray-900">{(modal.data as Client).client_phone || 'N/A'}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Postcode</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="text"
                          value={(editData as Client).postcode || ''}
                          onChange={(e) => handleFieldChange('postcode', e.target.value)}
                          className="w-full px-2 py-1 text-sm font-mono text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm font-mono font-bold text-gray-900">{(modal.data as Client).postcode}</p>
                      )}
                    </div>
                    <div className="bg-white border-2 border-gray-300 p-2">
                      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Budget</label>
                      {editingModalId === modal.id ? (
                        <input
                          type="text"
                          value={(editData as Client).budget || ''}
                          onChange={(e) => handleFieldChange('budget', e.target.value)}
                          className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                        />
                      ) : (
                        <p className="text-sm font-bold text-green-700">{(modal.data as Client).budget}</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border-2 border-gray-300 p-2">
                    <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Requirement</label>
                    {editingModalId === modal.id ? (
                      <input
                        type="text"
                        value={(editData as Client).requirement || ''}
                        onChange={(e) => handleFieldChange('requirement', e.target.value)}
                        className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                      />
                    ) : (
                      <p className="text-sm text-gray-900">{(modal.data as Client).requirement}</p>
                    )}
                  </div>

                  <div className="bg-white border-2 border-gray-300 p-2">
                    <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">System</label>
                    {editingModalId === modal.id ? (
                      <input
                        type="text"
                        value={(editData as Client).system || ''}
                        onChange={(e) => handleFieldChange('system', e.target.value)}
                        className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                      />
                    ) : (
                      <p className="text-sm text-gray-900">{(modal.data as Client).system || 'N/A'}</p>
                    )}
                  </div>

                  <div className="bg-white border-2 border-gray-300 p-2">
                    <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Notes</label>
                    {editingModalId === modal.id ? (
                      <textarea
                        value={(editData as Client).notes || ''}
                        onChange={(e) => handleFieldChange('notes', e.target.value)}
                        rows={3}
                        className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-400 rounded"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{(modal.data as Client).notes || 'No notes'}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Resize Handles - Large and Visible */}
            {/* Edge handles */}
            <div
              className="resize-handle absolute top-0 left-0 right-0 h-1 cursor-n-resize bg-blue-300 hover:bg-blue-500 z-50 opacity-50 hover:opacity-100"
              onMouseDown={(e) => handleResizeMouseDown(e, modal.id, 'n')}
              title="Resize from top"
            />
            <div
              className="resize-handle absolute bottom-0 left-0 right-0 h-1 cursor-s-resize bg-blue-300 hover:bg-blue-500 z-50 opacity-50 hover:opacity-100"
              onMouseDown={(e) => handleResizeMouseDown(e, modal.id, 's')}
              title="Resize from bottom"
            />
            <div
              className="resize-handle absolute top-0 left-0 bottom-0 w-1 cursor-w-resize bg-blue-300 hover:bg-blue-500 z-50 opacity-50 hover:opacity-100"
              onMouseDown={(e) => handleResizeMouseDown(e, modal.id, 'w')}
              title="Resize from left"
            />
            <div
              className="resize-handle absolute top-0 right-0 bottom-0 w-1 cursor-e-resize bg-blue-300 hover:bg-blue-500 z-50 opacity-50 hover:opacity-100"
              onMouseDown={(e) => handleResizeMouseDown(e, modal.id, 'e')}
              title="Resize from right"
            />
            {/* Corner handles - Larger and more visible */}
            <div
              className="resize-handle absolute top-0 left-0 w-3 h-3 cursor-nw-resize bg-blue-500 hover:bg-blue-700 z-50"
              onMouseDown={(e) => handleResizeMouseDown(e, modal.id, 'nw')}
              title="Resize from top-left corner"
            />
            <div
              className="resize-handle absolute top-0 right-0 w-3 h-3 cursor-ne-resize bg-blue-500 hover:bg-blue-700 z-50"
              onMouseDown={(e) => handleResizeMouseDown(e, modal.id, 'ne')}
              title="Resize from top-right corner"
            />
            <div
              className="resize-handle absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize bg-blue-500 hover:bg-blue-700 z-50"
              onMouseDown={(e) => handleResizeMouseDown(e, modal.id, 'sw')}
              title="Resize from bottom-left corner"
            />
            <div
              className="resize-handle absolute bottom-0 right-0 w-3 h-3 cursor-se-resize bg-blue-500 hover:bg-blue-700 z-50"
              onMouseDown={(e) => handleResizeMouseDown(e, modal.id, 'se')}
              title="Resize from bottom-right corner"
            />
          </div>
        </div>
      ))}

      {/* Match Notes Popup */}
      {selectedMatchForNote && (
        <MatchNotesPopup
          notes={matchStatuses[getMatchKey(selectedMatchForNote)]?.notes || []}
          title={`Match Notes - CAN ${selectedMatchForNote.candidate.id} ↔ CL ${selectedMatchForNote.client.id}`}
          onClose={() => setSelectedMatchForNote(null)}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
        />
      )}
    </div>
  );
}

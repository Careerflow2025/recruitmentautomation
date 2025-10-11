'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Note {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface MultiNotesPopupProps {
  entityId: string; // candidate_id or client_id
  entityType: 'candidate' | 'client';
  onClose: () => void;
  title?: string;
}

export default function MultiNotesPopup({
  entityId,
  entityType,
  onClose,
  title = 'Notes',
}: MultiNotesPopupProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth / 2 - 300, y: 80 });
  const [size, setSize] = useState({ width: 600, height: 500 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const popupRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch notes when component mounts
  useEffect(() => {
    fetchNotes();
  }, [entityId, entityType]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const apiPath = entityType === 'candidate'
        ? `/api/notes/candidates/${entityId}`
        : `/api/notes/clients/${entityId}`;

      const response = await fetch(apiPath);
      const data = await response.json();

      if (data.success) {
        setNotes(data.notes);
      } else {
        console.error('Failed to fetch notes:', data.error);
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;

    setSaving(true);
    try {
      const apiPath = entityType === 'candidate'
        ? `/api/notes/candidates/${entityId}`
        : `/api/notes/clients/${entityId}`;

      const response = await fetch(apiPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: newNoteContent }),
      });

      const data = await response.json();

      if (data.success) {
        // Add new note to the top of the list
        setNotes([data.note, ...notes]);
        setNewNoteContent('');
      } else {
        alert(`Failed to add note: ${data.error}`);
      }
    } catch (error) {
      console.error('Error adding note:', error);
      alert('Failed to add note');
    } finally {
      setSaving(false);
    }
  };

  // Format timestamp to exact date and time
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);

    // Format: "15 Jan 2025, 14:30"
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    return date.toLocaleString('en-GB', options);
  };

  // Handle dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // Handle resizing
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(400, resizeStart.width + (e.clientX - resizeStart.x));
      const newHeight = Math.max(300, resizeStart.height + (e.clientY - resizeStart.y));
      setSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart]);

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    });
  };

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!mounted) return null;

  const popupElement = (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 99998,
        }}
        onClick={onClose}
      />

      {/* Popup */}
      <div
        ref={popupRef}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header - Draggable */}
        <div
          onMouseDown={handleDragStart}
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>{title}</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
              {notes.length} note{notes.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: 'white',
              fontSize: '24px',
              cursor: 'pointer',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            ×
          </button>
        </div>

        {/* Add Note Section */}
        <div style={{ padding: '16px', borderBottom: '2px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="Type a new note here..."
            disabled={saving}
            style={{
              width: '100%',
              minHeight: '80px',
              border: '2px solid #cbd5e1',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '14px',
              lineHeight: '1.5',
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              transition: 'border-color 0.2s',
              color: '#1e293b',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#667eea';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
          />
          <button
            onClick={handleAddNote}
            disabled={!newNoteContent.trim() || saving}
            style={{
              marginTop: '8px',
              padding: '10px 20px',
              background: newNoteContent.trim() && !saving ? '#3b82f6' : '#cbd5e1',
              border: 'none',
              borderRadius: '8px',
              cursor: newNoteContent.trim() && !saving ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: '600',
              color: 'white',
              transition: 'background 0.2s',
            }}
          >
            {saving ? '💾 Saving...' : '➕ Add Note'}
          </button>
        </div>

        {/* Notes List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📝</div>
              <p>Loading notes...</p>
            </div>
          ) : notes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>📝</div>
              <p style={{ fontSize: '16px', fontWeight: '500' }}>No notes yet</p>
              <p style={{ fontSize: '14px', marginTop: '8px' }}>Add your first note above to get started!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {notes.map((note) => (
                <div
                  key={note.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '14px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#64748b',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span style={{ fontSize: '14px' }}>🕐</span>
                    <span style={{ fontWeight: '600' }}>{formatTimestamp(note.created_at)}</span>
                  </div>
                  <div
                    style={{
                      fontSize: '14px',
                      lineHeight: '1.6',
                      color: '#1e293b',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {note.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: '24px',
            height: '24px',
            cursor: 'nwse-resize',
            background: 'linear-gradient(135deg, transparent 0%, transparent 50%, #94a3b8 50%)',
            borderBottomRightRadius: '12px',
          }}
        />
      </div>
    </>
  );

  return createPortal(popupElement, document.body);
}

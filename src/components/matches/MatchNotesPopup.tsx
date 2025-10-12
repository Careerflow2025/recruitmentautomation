'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface MatchNote {
  id: string;
  text: string;
  timestamp: string;
}

interface MatchNotesPopupProps {
  notes: MatchNote[];
  onClose: () => void;
  onAddNote: (noteText: string) => void;
  onDeleteNote: (noteId: string) => void;
  title?: string;
}

export default function MatchNotesPopup({
  notes,
  onClose,
  onAddNote,
  onDeleteNote,
  title = 'Match Notes',
}: MatchNotesPopupProps) {
  const [newNoteText, setNewNoteText] = useState('');
  const [position, setPosition] = useState({ x: window.innerWidth / 2 - 300, y: 100 });
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
    if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'BUTTON') return;
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

  const handleAddNote = () => {
    if (newNoteText.trim()) {
      onAddNote(newNoteText.trim());
      setNewNoteText('');
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '2px solid #e2e8f0',
        }}
      >
        {/* Header - Draggable */}
        <div
          onMouseDown={handleDragStart}
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
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
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '20px' }}>📝</span>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', letterSpacing: '0.5px' }}>{title}</h3>
            <span style={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '600',
            }}>
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
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
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            }}
          >
            ×
          </button>
        </div>

        {/* Existing Notes List */}
        <div style={{
          flex: 1,
          padding: '20px',
          overflowY: 'auto',
          backgroundColor: '#f8fafc',
        }}>
          {notes.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#94a3b8',
              fontSize: '15px',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
              <p style={{ margin: 0, fontWeight: '500' }}>No notes yet</p>
              <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>Add your first note below</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {notes.map((note) => (
                <div
                  key={note.id}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '16px',
                    position: 'relative',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  {/* Delete Button */}
                  <button
                    onClick={() => onDeleteNote(note.id)}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#fecaca';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fee2e2';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="Delete this note"
                  >
                    ✕
                  </button>

                  {/* Timestamp */}
                  <div style={{
                    fontSize: '11px',
                    color: '#64748b',
                    fontWeight: '600',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    <span>🕐</span>
                    {formatTimestamp(note.timestamp)}
                  </div>

                  {/* Note Text */}
                  <div style={{
                    fontSize: '15px',
                    lineHeight: '1.6',
                    color: '#1e293b',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    paddingRight: '30px',
                    fontWeight: '500',
                  }}>
                    {note.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New Note Section */}
        <div style={{
          borderTop: '2px solid #e2e8f0',
          padding: '20px',
          backgroundColor: 'white',
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: '600',
            color: '#475569',
            marginBottom: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            ✏️ Add New Note
          </div>
          <textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="Type your note here..."
            style={{
              width: '100%',
              height: '80px',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '14px',
              lineHeight: '1.5',
              resize: 'none',
              outline: 'none',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              marginBottom: '12px',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                color: '#475569',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e2e8f0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f1f5f9';
              }}
            >
              Close
            </button>
            <button
              onClick={handleAddNote}
              disabled={!newNoteText.trim()}
              style={{
                padding: '10px 20px',
                background: newNoteText.trim() ? '#3b82f6' : '#cbd5e1',
                border: 'none',
                borderRadius: '8px',
                cursor: newNoteText.trim() ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: '600',
                color: 'white',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (newNoteText.trim()) {
                  e.currentTarget.style.background = '#2563eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (newNoteText.trim()) {
                  e.currentTarget.style.background = '#3b82f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              Add Note
            </button>
          </div>
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

'use client';

import { useState, useRef } from 'react';

interface BulkParseModalProps {
  type: 'candidates' | 'clients';
  onClose: () => void;
  onSuccess: () => void;
}

export default function BulkParseModal({ type, onClose, onSuccess }: BulkParseModalProps) {
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    added: number;
    failed: number;
    errors: string[];
    items?: any[];
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleParse = async () => {
    if (!text.trim()) {
      alert('Please paste some data to parse');
      return;
    }

    setParsing(true);
    setResult(null);

    try {
      const response = await fetch('/api/ai/bulk-parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, type }),
      });

      const data = await response.json();
      setResult(data);

      if (data.success && data.added > 0) {
        // Wait a moment, then notify parent and close
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('Bulk parse error:', error);
      setResult({
        success: false,
        message: `Failed to parse: ${error instanceof Error ? error.message : 'Unknown error'}`,
        added: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
    } finally {
      setParsing(false);
    }
  };

  const handleClear = () => {
    setText('');
    setResult(null);
    textareaRef.current?.focus();
  };

  const entityLabel = type === 'candidates' ? 'Candidates' : 'Clients';
  const exampleText = type === 'candidates'
    ? `Example formats:

CAN001, John Smith, DN, CR0 1AB, £15-17, Mon-Wed, 07123456789
Jane Doe | Dental Nurse | SW1A 1AA | £16/hr | Full-time | jane@email.com
Dentist - Sarah Jones - SE1 2AB - 5 years experience - 07987654321

Or copy-paste emails, tables, or any messy data!`
    : `Example formats:

Smile Dental Surgery, CL001, SW1A 1AA, Dental Nurse, £16-18, Mon-Fri
Happy Teeth Clinic | SE1 2AB | Dentist | £45/hr | Dr. Brown | 02012345678
Practice needing receptionist in CR0 area, 3 days per week, £14-16

Or copy-paste emails, tables, or any messy data!`;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          width: '100%',
          maxWidth: '900px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', margin: 0 }}>
              🤖 AI Bulk Parse - {entityLabel}
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px', marginBottom: 0 }}>
              Paste any messy data - emails, tables, notes, etc. AI will organize it automatically!
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 12px',
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
              lineHeight: '1',
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '24px',
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Instructions */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#374151',
              lineHeight: '1.6',
            }}
          >
            <strong>📋 How it works:</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li>Paste any format: structured tables, copy-pasted emails, mixed data, etc.</li>
              <li>AI extracts: postcodes, phones, emails, roles, salary/budget, days, experience</li>
              <li>Handles 10x the size of examples - processes in batches automatically</li>
              <li>Unclear/extra text goes into notes field for you to review later</li>
            </ul>
          </div>

          {/* Example */}
          <details style={{ fontSize: '13px', color: '#6b7280' }}>
            <summary style={{ cursor: 'pointer', fontWeight: '600', color: '#374151' }}>
              💡 See example formats
            </summary>
            <pre
              style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.5',
              }}
            >
              {exampleText}
            </pre>
          </details>

          {/* Textarea */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
            <label
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px',
                display: 'block',
              }}
            >
              Paste your data here:
            </label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Paste ${type} data here... Any format works!`}
              disabled={parsing}
              style={{
                flex: 1,
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                fontFamily: 'monospace',
                resize: 'vertical',
                minHeight: '250px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            />
          </div>

          {/* Result */}
          {result && (
            <div
              style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: result.success ? '#d1fae5' : '#fee2e2',
                borderLeft: `4px solid ${result.success ? '#10b981' : '#ef4444'}`,
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '8px', color: result.success ? '#065f46' : '#991b1b' }}>
                {result.success ? '✅ Success!' : '❌ Error'}
              </div>
              <div style={{ fontSize: '14px', color: result.success ? '#065f46' : '#991b1b', marginBottom: '8px' }}>
                {result.message}
              </div>
              {result.added > 0 && (
                <div style={{ fontSize: '13px', color: result.success ? '#047857' : '#7f1d1d' }}>
                  <strong>{result.added}</strong> {entityLabel.toLowerCase()} added successfully
                </div>
              )}
              {result.failed > 0 && (
                <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '4px' }}>
                  <strong>{result.failed}</strong> failed
                </div>
              )}
              {result.errors && result.errors.length > 0 && (
                <details style={{ marginTop: '12px', fontSize: '12px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: '600' }}>View errors</summary>
                  <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                    {result.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={handleClear}
            disabled={parsing || !text}
            style={{
              padding: '10px 20px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: parsing || !text ? 'not-allowed' : 'pointer',
              color: '#6b7280',
              opacity: parsing || !text ? 0.5 : 1,
            }}
          >
            Clear
          </button>
          <button
            onClick={onClose}
            disabled={parsing}
            style={{
              padding: '10px 20px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: parsing ? 'not-allowed' : 'pointer',
              color: '#374151',
              opacity: parsing ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleParse}
            disabled={parsing || !text.trim()}
            style={{
              padding: '10px 24px',
              backgroundColor: parsing || !text.trim() ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: parsing || !text.trim() ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!parsing && text.trim()) {
                e.currentTarget.style.backgroundColor = '#2563eb';
              }
            }}
            onMouseLeave={(e) => {
              if (!parsing && text.trim()) {
                e.currentTarget.style.backgroundColor = '#3b82f6';
              }
            }}
          >
            {parsing ? '⏳ Parsing & Adding...' : '🤖 Parse & Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

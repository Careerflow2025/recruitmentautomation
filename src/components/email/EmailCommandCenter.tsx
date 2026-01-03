'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Candidate } from '@/types';

interface EmailCommandCenterProps {
  candidateId: string;
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'manual' | 'ai' | 'bulk' | 'ai-select';

interface CandidateWithCV extends Candidate {
  cv?: {
    id: string;
    filename: string;
    storage_url?: string;
    parsed_data?: any;
  };
}

/**
 * Email Command Center - Main modal for all email operations
 *
 * Features:
 * - Manual Email: Compose and send emails yourself
 * - AI Email: Let Claude compose personalized emails
 * - Bulk Campaign: Send to multiple candidates
 * - AI Smart Select: AI recommends who to email
 */
export default function EmailCommandCenter({
  candidateId,
  isOpen,
  onClose,
}: EmailCommandCenterProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ai');
  const [candidate, setCandidate] = useState<CandidateWithCV | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Email composition state
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeCV, setIncludeCV] = useState(true);
  const [redactCV, setRedactCV] = useState(true);

  // AI generation state
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  // Sending state
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Load candidate data
  useEffect(() => {
    if (!isOpen || !candidateId) return;

    const loadCandidate = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get candidate data
        const { data: candidateData, error: candidateError } = await supabase
          .from('candidates')
          .select('*')
          .eq('id', candidateId)
          .single();

        if (candidateError) throw candidateError;

        // Get CV data if exists
        const { data: cvData } = await supabase
          .from('candidate_cvs')
          .select('id, cv_filename, cv_storage_path, cv_parsed_data, status')
          .eq('candidate_id', candidateId)
          .eq('status', 'linked')
          .single();

        // Get signed URL for CV if exists
        let cvWithUrl = null;
        if (cvData?.cv_storage_path) {
          const { data: urlData } = await supabase.storage
            .from('cvs')
            .createSignedUrl(cvData.cv_storage_path, 3600);

          cvWithUrl = {
            id: cvData.id,
            filename: cvData.cv_filename,
            storage_url: urlData?.signedUrl,
            parsed_data: cvData.cv_parsed_data,
          };
        }

        setCandidate({
          ...candidateData,
          cv: cvWithUrl,
        });
      } catch (err) {
        console.error('Failed to load candidate:', err);
        setError(err instanceof Error ? err.message : 'Failed to load candidate');
      } finally {
        setLoading(false);
      }
    };

    loadCandidate();
  }, [isOpen, candidateId, supabase]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Generate email with AI
  const handleGenerateWithAI = async () => {
    if (!candidate) return;

    setAiGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/emails/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          email_type: 'cv_submission',
          include_cv_context: true,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate email');
      }

      setSubject(result.subject);
      setBody(result.body_html);
      setAiGenerated(true);
    } catch (err) {
      console.error('AI generation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate email');
    } finally {
      setAiGenerating(false);
    }
  };

  // Send email
  const handleSendEmail = async () => {
    if (!candidate?.email || !subject || !body) {
      setError('Missing required fields: recipient email, subject, or body');
      return;
    }

    setSending(true);
    setError(null);
    setSendResult(null);

    try {
      const response = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          recipient_email: candidate.email,
          recipient_name: `${candidate.first_name} ${candidate.last_name}`.trim(),
          subject,
          body_html: body,
          email_type: 'cv_submission',
          include_cv: includeCV && !!candidate.cv,
          redact_cv: redactCV,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to send email');
      }

      setSendResult({
        success: true,
        message: 'Email sent successfully!',
      });

      // Reset after success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Send failed:', err);
      setSendResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to send email',
      });
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'ai', label: 'AI Email', icon: '🤖' },
    { id: 'manual', label: 'Manual', icon: '✏️' },
    { id: 'bulk', label: 'Bulk Campaign', icon: '📊' },
    { id: 'ai-select', label: 'AI Smart Select', icon: '🎯' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-[95vw] max-w-4xl h-[90vh] max-h-[800px] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-purple-600">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✉️</span>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Email Command Center
              </h2>
              {candidate && (
                <p className="text-sm text-blue-100">
                  {candidate.first_name} {candidate.last_name}
                  {candidate.email && ` • ${candidate.email}`}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-white dark:bg-gray-900'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <svg
                  className="animate-spin h-10 w-10 text-blue-500 mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <p className="text-gray-500 dark:text-gray-400">Loading candidate data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-red-500">
                <div className="text-4xl mb-4">❌</div>
                <p>{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* AI Email Tab */}
              {activeTab === 'ai' && (
                <div className="space-y-6">
                  {/* Candidate Info Card */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                      Candidate Overview
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Name:</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {candidate?.first_name} {candidate?.last_name}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Role:</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {candidate?.role || 'Not specified'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Email:</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {candidate?.email || 'No email'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">CV:</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {candidate?.cv ? '✅ Attached' : '❌ Not attached'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* AI Generate Button */}
                  {!aiGenerated && (
                    <div className="text-center py-8">
                      <button
                        onClick={handleGenerateWithAI}
                        disabled={aiGenerating || !candidate?.email}
                        className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {aiGenerating ? (
                          <>
                            <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span>AI is composing your email...</span>
                          </>
                        ) : (
                          <>
                            <span className="text-2xl">🤖</span>
                            <span>Generate Email with AI</span>
                          </>
                        )}
                      </button>
                      {!candidate?.email && (
                        <p className="mt-4 text-amber-600 dark:text-amber-400">
                          ⚠️ This candidate has no email address
                        </p>
                      )}
                    </div>
                  )}

                  {/* Email Editor (shows after AI generates) */}
                  {aiGenerated && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Subject
                        </label>
                        <input
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Email Body
                        </label>
                        <textarea
                          value={body.replace(/<[^>]*>/g, '')}
                          onChange={(e) => setBody(e.target.value)}
                          rows={12}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        />
                      </div>

                      {/* CV Options */}
                      {candidate?.cv && (
                        <div className="flex items-center gap-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includeCV}
                              onChange={(e) => setIncludeCV(e.target.checked)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              Attach CV
                            </span>
                          </label>

                          {includeCV && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={redactCV}
                                onChange={(e) => setRedactCV(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                🔒 Redact contact details
                              </span>
                            </label>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex justify-between items-center pt-4">
                        <button
                          onClick={() => {
                            setAiGenerated(false);
                            setSubject('');
                            setBody('');
                          }}
                          className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                          ← Regenerate
                        </button>

                        <button
                          onClick={handleSendEmail}
                          disabled={sending || !candidate?.email}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sending ? (
                            <>
                              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <span>📤</span>
                              <span>Send Email</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Email Tab */}
              {activeTab === 'manual' && (
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-700">
                    <p className="text-amber-800 dark:text-amber-200">
                      ✏️ <strong>Manual Mode:</strong> Compose your email from scratch
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      To
                    </label>
                    <input
                      type="email"
                      value={candidate?.email || ''}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Enter email subject..."
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Message
                    </label>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={12}
                      placeholder="Type your message here..."
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSendEmail}
                      disabled={sending || !candidate?.email || !subject || !body}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? 'Sending...' : '📤 Send Email'}
                    </button>
                  </div>
                </div>
              )}

              {/* Bulk Campaign Tab */}
              {activeTab === 'bulk' && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📊</div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Bulk Email Campaigns
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Send emails to multiple candidates at once with Brevo integration.
                  </p>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 max-w-md mx-auto">
                    <p className="text-blue-800 dark:text-blue-200">
                      🚧 Coming Soon: Campaign builder with template selection,
                      recipient filtering, and delivery tracking.
                    </p>
                  </div>
                </div>
              )}

              {/* AI Smart Select Tab */}
              {activeTab === 'ai-select' && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🎯</div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    AI Smart Selection
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Let Claude AI recommend which candidates to email based on your criteria.
                  </p>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-6 max-w-md mx-auto">
                    <p className="text-purple-800 dark:text-purple-200">
                      🚧 Coming Soon: Natural language criteria input,
                      AI-powered candidate matching, and smart recommendations.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Send Result Toast */}
        {sendResult && (
          <div
            className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg ${
              sendResult.success
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {sendResult.success ? '✅' : '❌'} {sendResult.message}
          </div>
        )}
      </div>
    </div>
  );
}

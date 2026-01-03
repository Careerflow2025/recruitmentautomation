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

  // Bulk Campaign state
  const [allCandidates, setAllCandidates] = useState<CandidateWithCV[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkBody, setBulkBody] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed: number } | null>(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [postcodeFilter, setPostcodeFilter] = useState('');

  // AI Smart Select state
  const [smartCriteria, setSmartCriteria] = useState('');
  const [smartSearching, setSmartSearching] = useState(false);
  const [smartResults, setSmartResults] = useState<any[]>([]);
  const [smartParsedCriteria, setSmartParsedCriteria] = useState<any>(null);

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

  // Load all candidates for bulk campaign
  useEffect(() => {
    if (!isOpen || activeTab !== 'bulk') return;

    const loadAllCandidates = async () => {
      setBulkLoading(true);
      try {
        const { data: candidates } = await supabase
          .from('candidates')
          .select('id, first_name, last_name, email, phone, role, postcode, days')
          .order('added_at', { ascending: false });

        setAllCandidates(candidates || []);
      } catch (err) {
        console.error('Failed to load candidates:', err);
      } finally {
        setBulkLoading(false);
      }
    };

    loadAllCandidates();
  }, [isOpen, activeTab, supabase]);

  // Filter candidates for bulk campaign
  const filteredBulkCandidates = allCandidates.filter(c => {
    if (!c.email) return false; // Must have email
    if (roleFilter && !c.role?.toLowerCase().includes(roleFilter.toLowerCase())) return false;
    if (postcodeFilter && !c.postcode?.toLowerCase().startsWith(postcodeFilter.toLowerCase())) return false;
    return true;
  });

  // Toggle candidate selection
  const toggleCandidateSelection = (id: string) => {
    setSelectedCandidateIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Select/deselect all filtered candidates
  const toggleSelectAll = () => {
    if (selectedCandidateIds.size === filteredBulkCandidates.length) {
      setSelectedCandidateIds(new Set());
    } else {
      setSelectedCandidateIds(new Set(filteredBulkCandidates.map(c => c.id)));
    }
  };

  // Send bulk campaign
  const handleSendBulkCampaign = async () => {
    if (selectedCandidateIds.size === 0 || !bulkSubject || !bulkBody) {
      setError('Please select candidates and fill in subject and body');
      return;
    }

    setBulkSending(true);
    setError(null);
    setBulkResult(null);

    try {
      // Create campaign
      const createResponse = await fetch('/api/emails/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Campaign ${new Date().toLocaleDateString()}`,
          subject: bulkSubject,
          body_html: bulkBody,
          candidate_ids: Array.from(selectedCandidateIds),
        }),
      });

      const createResult = await createResponse.json();
      if (!createResult.success) {
        throw new Error(createResult.error || 'Failed to create campaign');
      }

      // Send campaign
      const sendResponse = await fetch(`/api/emails/campaigns/${createResult.campaign.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const sendResult = await sendResponse.json();
      if (!sendResult.success) {
        throw new Error(sendResult.error || 'Failed to send campaign');
      }

      setBulkResult({
        sent: sendResult.results.sent,
        failed: sendResult.results.failed,
      });

      // Clear selection after success
      setTimeout(() => {
        setSelectedCandidateIds(new Set());
        setBulkSubject('');
        setBulkBody('');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send campaign');
    } finally {
      setBulkSending(false);
    }
  };

  // AI Smart Select search
  const handleSmartSearch = async () => {
    if (!smartCriteria.trim()) {
      setError('Please enter selection criteria');
      return;
    }

    setSmartSearching(true);
    setError(null);
    setSmartResults([]);
    setSmartParsedCriteria(null);

    try {
      const response = await fetch('/api/candidates/smart-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criteria: smartCriteria,
          limit: 30,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to search candidates');
      }

      setSmartResults(result.candidates || []);
      setSmartParsedCriteria(result.parsedCriteria);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search');
    } finally {
      setSmartSearching(false);
    }
  };

  // Add smart select results to bulk campaign
  const addSmartResultsToBulk = () => {
    const newIds = new Set(selectedCandidateIds);
    smartResults.forEach(c => newIds.add(c.id));
    setSelectedCandidateIds(newIds);
    setActiveTab('bulk');
  };

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

      // Response structure: { success, email: { subject, body }, usage }
      setSubject(result.email.subject);
      setBody(result.email.body);
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
                <div className="space-y-6">
                  {/* Campaign Result */}
                  {bulkResult && (
                    <div className={`rounded-lg p-4 ${
                      bulkResult.failed === 0
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
                        : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700'
                    }`}>
                      <p className={bulkResult.failed === 0 ? 'text-green-800 dark:text-green-200' : 'text-amber-800 dark:text-amber-200'}>
                        {bulkResult.failed === 0 ? '✅' : '⚠️'} Campaign sent: {bulkResult.sent} emails delivered
                        {bulkResult.failed > 0 && `, ${bulkResult.failed} failed`}
                      </p>
                    </div>
                  )}

                  {/* Filters */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Filter Candidates</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Role</label>
                        <input
                          type="text"
                          value={roleFilter}
                          onChange={(e) => setRoleFilter(e.target.value)}
                          placeholder="e.g., Dental Nurse"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Postcode Prefix</label>
                        <input
                          type="text"
                          value={postcodeFilter}
                          onChange={(e) => setPostcodeFilter(e.target.value)}
                          placeholder="e.g., SW, E, NW"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Candidate Selection */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCandidateIds.size === filteredBulkCandidates.length && filteredBulkCandidates.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Select All
                          </span>
                        </label>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {selectedCandidateIds.size} of {filteredBulkCandidates.length} selected
                        {filteredBulkCandidates.length !== allCandidates.length && (
                          <span className="text-xs ml-1">({allCandidates.length} total)</span>
                        )}
                      </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto">
                      {bulkLoading ? (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                          <svg className="animate-spin h-6 w-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Loading candidates...
                        </div>
                      ) : filteredBulkCandidates.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                          No candidates with email addresses found
                        </div>
                      ) : (
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredBulkCandidates.map((c) => (
                              <tr
                                key={c.id}
                                className={`hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${
                                  selectedCandidateIds.has(c.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                }`}
                                onClick={() => toggleCandidateSelection(c.id)}
                              >
                                <td className="px-4 py-2 w-10">
                                  <input
                                    type="checkbox"
                                    checked={selectedCandidateIds.has(c.id)}
                                    onChange={() => {}}
                                    className="w-4 h-4 text-blue-600 rounded"
                                  />
                                </td>
                                <td className="px-4 py-2 text-gray-900 dark:text-white">
                                  {c.first_name} {c.last_name}
                                </td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                                  {c.role || '-'}
                                </td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                                  {c.postcode || '-'}
                                </td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                                  {c.email}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Email Composer */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Subject <span className="text-xs text-gray-400">(use {'{{first_name}}'} for personalization)</span>
                      </label>
                      <input
                        type="text"
                        value={bulkSubject}
                        onChange={(e) => setBulkSubject(e.target.value)}
                        placeholder="e.g., Exciting Opportunity for {{first_name}}"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Email Body <span className="text-xs text-gray-400">(use {'{{first_name}}'}, {'{{last_name}}'}, {'{{candidate_name}}'})</span>
                      </label>
                      <textarea
                        value={bulkBody}
                        onChange={(e) => setBulkBody(e.target.value)}
                        rows={8}
                        placeholder="Dear {{first_name}},&#10;&#10;We have exciting opportunities that match your profile...&#10;&#10;Best regards"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Send Button */}
                  <div className="flex justify-end pt-4">
                    <button
                      onClick={handleSendBulkCampaign}
                      disabled={bulkSending || selectedCandidateIds.size === 0 || !bulkSubject || !bulkBody}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                    >
                      {bulkSending ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span>Sending to {selectedCandidateIds.size} recipients...</span>
                        </>
                      ) : (
                        <>
                          <span>📤</span>
                          <span>Send Campaign to {selectedCandidateIds.size} Recipients</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* AI Smart Select Tab */}
              {activeTab === 'ai-select' && (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                    <h3 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
                      AI-Powered Candidate Selection
                    </h3>
                    <p className="text-sm text-purple-700 dark:text-purple-300">
                      Describe who you want to email in plain English. Claude AI will find matching candidates.
                    </p>
                  </div>

                  {/* Search Input */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Selection Criteria
                    </label>
                    <textarea
                      value={smartCriteria}
                      onChange={(e) => setSmartCriteria(e.target.value)}
                      rows={3}
                      placeholder="Examples:&#10;• Dental nurses in London available Monday to Friday&#10;• Experienced dentists in SW postcodes&#10;• All hygienists with weekend availability"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      onClick={handleSmartSearch}
                      disabled={smartSearching || !smartCriteria.trim()}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {smartSearching ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span>AI is searching...</span>
                        </>
                      ) : (
                        <>
                          <span>🤖</span>
                          <span>Find Candidates with AI</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Parsed Criteria Display */}
                  {smartParsedCriteria && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        AI Understood:
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {smartParsedCriteria.role && (
                          <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm">
                            Role: {smartParsedCriteria.role}
                          </span>
                        )}
                        {smartParsedCriteria.postcode_prefix && (
                          <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-sm">
                            Area: {smartParsedCriteria.postcode_prefix}
                          </span>
                        )}
                        {smartParsedCriteria.availability && (
                          <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-full text-sm">
                            Availability: {smartParsedCriteria.availability}
                          </span>
                        )}
                        {smartParsedCriteria.experience_keywords?.length > 0 && (
                          <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded-full text-sm">
                            Keywords: {smartParsedCriteria.experience_keywords.join(', ')}
                          </span>
                        )}
                        <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-sm">
                          Has Email: Yes
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Results */}
                  {smartResults.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Found {smartResults.length} Matching Candidates
                        </h4>
                        <button
                          onClick={addSmartResultsToBulk}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                        >
                          Add All to Bulk Campaign →
                        </button>
                      </div>

                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                            <tr>
                              <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400">Match</th>
                              <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400">Name</th>
                              <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400">Role</th>
                              <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400">Postcode</th>
                              <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400">Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {smartResults.map((c: any) => (
                              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td className="px-4 py-2">
                                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                    (c.match_score || 0) >= 80
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                                      : (c.match_score || 0) >= 60
                                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                  }`}>
                                    {c.match_score || 70}%
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-gray-900 dark:text-white">
                                  {c.first_name} {c.last_name}
                                </td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                                  {c.role || '-'}
                                </td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                                  {c.postcode || '-'}
                                </td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs max-w-[200px] truncate">
                                  {c.match_reason || 'Matches criteria'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {!smartSearching && smartResults.length === 0 && smartParsedCriteria && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <div className="text-4xl mb-2">🔍</div>
                      <p>No candidates matched your criteria. Try broadening your search.</p>
                    </div>
                  )}
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

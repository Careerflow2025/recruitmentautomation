'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Client, Candidate } from '@/types';

interface ClientEmailCommandCenterProps {
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'manual' | 'ai' | 'bulk' | 'ai-select';

interface ClientWithDetails extends Client {
  contact_name?: string;
  contact_email?: string;
}

interface CandidateForAttachment {
  id: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  postcode?: string;
  email?: string;
  has_cv?: boolean;
}

/**
 * Client Email Command Center - Modal for emailing clients/surgeries
 *
 * Features:
 * - Manual Email: Compose and send emails yourself
 * - AI Email: Let Claude compose personalized emails with candidate CV attached
 * - Bulk Campaign: Send to multiple clients
 * - AI Smart Select: AI recommends which clients to email
 */
export default function ClientEmailCommandCenter({
  clientId,
  isOpen,
  onClose,
}: ClientEmailCommandCenterProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ai');
  const [client, setClient] = useState<ClientWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Email composition state
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Candidate selection for CV attachment
  const [candidates, setCandidates] = useState<CandidateForAttachment[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [attachRedactedCV, setAttachRedactedCV] = useState(true);

  // AI generation state
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [emailTone, setEmailTone] = useState<'professional' | 'friendly' | 'formal'>('professional');

  // Sending state
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // Bulk Campaign state
  const [allClients, setAllClients] = useState<ClientWithDetails[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkBody, setBulkBody] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed: number } | null>(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [postcodeFilter, setPostcodeFilter] = useState('');
  const [bulkCandidateId, setBulkCandidateId] = useState<string | null>(null);

  // AI Smart Select state
  const [smartCriteria, setSmartCriteria] = useState('');
  const [smartSearching, setSmartSearching] = useState(false);
  const [smartResults, setSmartResults] = useState<any[]>([]);
  const [smartParsedCriteria, setSmartParsedCriteria] = useState<any>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Load client data
  useEffect(() => {
    if (!isOpen || !clientId) return;

    const loadClient = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get client data
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .eq('id', clientId)
          .single();

        if (clientError) throw clientError;

        setClient({
          ...clientData,
          contact_name: clientData.client_name,
          contact_email: clientData.client_email,
        });

        // Load candidates with CVs for attachment selection
        const { data: candidatesData } = await supabase
          .from('candidates')
          .select(`
            id,
            first_name,
            last_name,
            role,
            postcode,
            email,
            candidate_cvs!inner(id)
          `)
          .order('added_at', { ascending: false })
          .limit(50);

        if (candidatesData) {
          setCandidates(candidatesData.map(c => ({
            ...c,
            has_cv: true,
          })));
        }
      } catch (err) {
        console.error('Failed to load client:', err);
        setError(err instanceof Error ? err.message : 'Failed to load client');
      } finally {
        setLoading(false);
      }
    };

    loadClient();
  }, [isOpen, clientId, supabase]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Load all clients for bulk campaign
  useEffect(() => {
    if (!isOpen || activeTab !== 'bulk') return;

    const loadAllClients = async () => {
      setBulkLoading(true);
      try {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, surgery, client_name, client_email, role, postcode, requirement')
          .order('added_at', { ascending: false });

        setAllClients(clients || []);
      } catch (err) {
        console.error('Failed to load clients:', err);
      } finally {
        setBulkLoading(false);
      }
    };

    loadAllClients();
  }, [isOpen, activeTab, supabase]);

  // Filter clients for bulk campaign
  const filteredBulkClients = allClients.filter(c => {
    if (!c.client_email) return false; // Must have email
    if (roleFilter && !c.role?.toLowerCase().includes(roleFilter.toLowerCase())) return false;
    if (postcodeFilter && !c.postcode?.toLowerCase().startsWith(postcodeFilter.toLowerCase())) return false;
    return true;
  });

  // Toggle client selection
  const toggleClientSelection = (id: string) => {
    setSelectedClientIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Select/deselect all filtered clients
  const toggleSelectAll = () => {
    if (selectedClientIds.size === filteredBulkClients.length) {
      setSelectedClientIds(new Set());
    } else {
      setSelectedClientIds(new Set(filteredBulkClients.map(c => c.id)));
    }
  };

  // Send bulk campaign to clients
  const handleSendBulkCampaign = async () => {
    if (selectedClientIds.size === 0 || !bulkSubject || !bulkBody) {
      setError('Please select clients and fill in subject and body');
      return;
    }

    setBulkSending(true);
    setError(null);
    setBulkResult(null);

    try {
      const response = await fetch('/api/emails/clients/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Client Campaign ${new Date().toLocaleDateString()}`,
          subject: bulkSubject,
          body_html: bulkBody,
          client_ids: Array.from(selectedClientIds),
          attach_candidate_id: bulkCandidateId || undefined,
          redact_cv: attachRedactedCV,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to send campaign');
      }

      setBulkResult({
        sent: result.sent || selectedClientIds.size,
        failed: result.failed || 0,
      });

      // Clear selection after success
      setTimeout(() => {
        setSelectedClientIds(new Set());
        setBulkSubject('');
        setBulkBody('');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send campaign');
    } finally {
      setBulkSending(false);
    }
  };

  // AI Smart Select search for clients
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
      const response = await fetch('/api/clients/smart-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criteria: smartCriteria,
          limit: 30,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to search clients');
      }

      setSmartResults(result.clients || []);
      setSmartParsedCriteria(result.parsedCriteria);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search');
    } finally {
      setSmartSearching(false);
    }
  };

  // Add smart select results to bulk campaign
  const addSmartResultsToBulk = () => {
    const newIds = new Set(selectedClientIds);
    smartResults.forEach(c => newIds.add(c.id));
    setSelectedClientIds(newIds);
    setActiveTab('bulk');
  };

  // Generate email with AI
  const handleGenerateWithAI = async () => {
    if (!client) return;

    setAiGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/emails/clients/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          candidate_id: selectedCandidateId || undefined,
          tone: emailTone,
          custom_prompt: customPrompt.trim() || undefined,
          include_cv_context: !!selectedCandidateId,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate email');
      }

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

  // Send email to client
  const handleSendEmail = async () => {
    if (!client?.client_email || !subject || !body) {
      setError('Missing required fields: recipient email, subject, or body');
      return;
    }

    setSending(true);
    setError(null);
    setSendResult(null);

    try {
      const response = await fetch('/api/emails/clients/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          recipient_email: client.client_email,
          recipient_name: client.client_name || client.surgery,
          subject,
          body_html: body,
          attach_candidate_id: selectedCandidateId || undefined,
          redact_cv: attachRedactedCV,
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-green-600 to-teal-600">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏥</span>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Client Email Center
              </h2>
              {client && (
                <p className="text-sm text-green-100">
                  {client.surgery}
                  {client.client_email && ` • ${client.client_email}`}
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
                  ? 'text-green-600 dark:text-green-400 border-b-2 border-green-600 dark:border-green-400 bg-white dark:bg-gray-900'
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
                  className="animate-spin h-10 w-10 text-green-500 mx-auto mb-4"
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
                <p className="text-gray-500 dark:text-gray-400">Loading client data...</p>
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
                  {/* Client Info Card */}
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
                    <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                      Client Overview
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Surgery:</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {client?.surgery}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Role Needed:</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {client?.role || 'Not specified'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Contact:</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {client?.client_name || 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Email:</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {client?.client_email || 'No email'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Candidate Selection for CV Attachment */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
                      📄 Attach Candidate CV (Optional)
                    </h3>
                    <select
                      value={selectedCandidateId || ''}
                      onChange={(e) => setSelectedCandidateId(e.target.value || null)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No CV attachment</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.first_name} {c.last_name} - {c.role || 'Unknown role'} ({c.postcode})
                        </option>
                      ))}
                    </select>
                    {selectedCandidateId && (
                      <label className="flex items-center gap-2 mt-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={attachRedactedCV}
                          onChange={(e) => setAttachRedactedCV(e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          🔒 Redact contact details from CV (recommended)
                        </span>
                      </label>
                    )}
                  </div>

                  {/* AI Prompt Input & Generate Button */}
                  {!aiGenerated && (
                    <div className="space-y-6">
                      {/* Custom Prompt Box */}
                      <div className="bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          🤖 Tell Claude what you want (optional)
                        </label>
                        <textarea
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          rows={4}
                          placeholder="Examples:&#10;• Introduce this dental nurse candidate with 5 years experience&#10;• Ask if they have any current vacancies for the role&#10;• Follow up on our previous conversation about staffing needs&#10;• Enquire about their upcoming recruitment needs for Q2"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 text-sm"
                        />
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Leave empty for a standard introduction email. Or tell Claude exactly what you want!
                        </p>
                      </div>

                      {/* Tone Selector */}
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tone:</span>
                        <div className="flex gap-2">
                          {(['professional', 'friendly', 'formal'] as const).map((tone) => (
                            <button
                              key={tone}
                              onClick={() => setEmailTone(tone)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                emailTone === tone
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                            >
                              {tone === 'professional' && '💼 '}
                              {tone === 'friendly' && '😊 '}
                              {tone === 'formal' && '📋 '}
                              {tone.charAt(0).toUpperCase() + tone.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Generate Button */}
                      <div className="text-center py-4">
                        <button
                          onClick={handleGenerateWithAI}
                          disabled={aiGenerating || !client?.client_email}
                          className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
                        {!client?.client_email && (
                          <p className="mt-4 text-amber-600 dark:text-amber-400">
                            ⚠️ This client has no email address
                          </p>
                        )}
                      </div>
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
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
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
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 font-mono text-sm"
                        />
                      </div>

                      {/* CV Attachment Info */}
                      {selectedCandidateId && (
                        <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                          <span className="text-blue-600 dark:text-blue-400">📎</span>
                          <div>
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                              CV will be attached
                            </p>
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                              {attachRedactedCV ? '🔒 Contact details will be redacted' : '⚠️ Full CV with contact details'}
                            </p>
                          </div>
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
                          disabled={sending || !client?.client_email}
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
                      value={client?.client_email || ''}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  {/* Candidate CV Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Attach Candidate CV (Optional)
                    </label>
                    <select
                      value={selectedCandidateId || ''}
                      onChange={(e) => setSelectedCandidateId(e.target.value || null)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">No CV attachment</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.first_name} {c.last_name} - {c.role || 'Unknown role'}
                        </option>
                      ))}
                    </select>
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
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
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
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSendEmail}
                      disabled={sending || !client?.client_email || !subject || !body}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Filter Clients</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Role Needed</label>
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

                  {/* CV Attachment for Bulk */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">📄 Attach Candidate CV to All</h4>
                    <select
                      value={bulkCandidateId || ''}
                      onChange={(e) => setBulkCandidateId(e.target.value || null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">No CV attachment</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.first_name} {c.last_name} - {c.role || 'Unknown role'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Client Selection */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedClientIds.size === filteredBulkClients.length && filteredBulkClients.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 text-green-600 rounded"
                          />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Select All
                          </span>
                        </label>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {selectedClientIds.size} of {filteredBulkClients.length} selected
                      </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto">
                      {bulkLoading ? (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                          <svg className="animate-spin h-6 w-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Loading clients...
                        </div>
                      ) : filteredBulkClients.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                          No clients with email addresses found
                        </div>
                      ) : (
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredBulkClients.map((c) => (
                              <tr
                                key={c.id}
                                className={`hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${
                                  selectedClientIds.has(c.id) ? 'bg-green-50 dark:bg-green-900/20' : ''
                                }`}
                                onClick={() => toggleClientSelection(c.id)}
                              >
                                <td className="px-4 py-2 w-10">
                                  <input
                                    type="checkbox"
                                    checked={selectedClientIds.has(c.id)}
                                    onChange={() => {}}
                                    className="w-4 h-4 text-green-600 rounded"
                                  />
                                </td>
                                <td className="px-4 py-2 text-gray-900 dark:text-white">
                                  {c.surgery}
                                </td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                                  {c.role || '-'}
                                </td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                                  {c.postcode || '-'}
                                </td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                                  {c.client_email}
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
                        Subject <span className="text-xs text-gray-400">(use {'{{surgery}}'} for personalization)</span>
                      </label>
                      <input
                        type="text"
                        value={bulkSubject}
                        onChange={(e) => setBulkSubject(e.target.value)}
                        placeholder="e.g., Excellent Dental Nurse Available for {{surgery}}"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Email Body <span className="text-xs text-gray-400">(use {'{{surgery}}'}, {'{{contact_name}}'})</span>
                      </label>
                      <textarea
                        value={bulkBody}
                        onChange={(e) => setBulkBody(e.target.value)}
                        rows={8}
                        placeholder="Dear {{contact_name}},&#10;&#10;I'm reaching out regarding {{surgery}}...&#10;&#10;Best regards"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>

                  {/* Send Button */}
                  <div className="flex justify-end pt-4">
                    <button
                      onClick={handleSendBulkCampaign}
                      disabled={bulkSending || selectedClientIds.size === 0 || !bulkSubject || !bulkBody}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg font-semibold hover:from-green-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                    >
                      {bulkSending ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span>Sending to {selectedClientIds.size} clients...</span>
                        </>
                      ) : (
                        <>
                          <span>📤</span>
                          <span>Send Campaign to {selectedClientIds.size} Clients</span>
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
                  <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4 border border-teal-200 dark:border-teal-700">
                    <h3 className="font-semibold text-teal-900 dark:text-teal-100 mb-1">
                      AI-Powered Client Selection
                    </h3>
                    <p className="text-sm text-teal-700 dark:text-teal-300">
                      Describe which clients you want to email in plain English. Claude AI will find matching surgeries.
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
                      placeholder="Examples:&#10;• Surgeries in London looking for dental nurses&#10;• Practices in SW postcodes needing hygienists&#10;• All clients with weekday requirements"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                      onClick={handleSmartSearch}
                      disabled={smartSearching || !smartCriteria.trim()}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-lg font-semibold hover:from-teal-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                          <span>Find Clients with AI</span>
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
                          <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-sm">
                            Role: {smartParsedCriteria.role}
                          </span>
                        )}
                        {smartParsedCriteria.postcode_prefix && (
                          <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm">
                            Area: {smartParsedCriteria.postcode_prefix}
                          </span>
                        )}
                        {smartParsedCriteria.requirement && (
                          <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-full text-sm">
                            Days: {smartParsedCriteria.requirement}
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
                          Found {smartResults.length} Matching Clients
                        </h4>
                        <button
                          onClick={addSmartResultsToBulk}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                        >
                          Add All to Bulk Campaign →
                        </button>
                      </div>

                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                            <tr>
                              <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400">Match</th>
                              <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400">Surgery</th>
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
                                  {c.surgery}
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
                      <p>No clients matched your criteria. Try broadening your search.</p>
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

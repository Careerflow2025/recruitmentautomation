'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface SimpleEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientIds: string[];  // Works for 1 or many!
}

interface Client {
  id: string;
  surgery: string;
  client_name?: string;
  client_email?: string;
  role?: string;
  postcode?: string;
}

interface Candidate {
  id: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  postcode?: string;
  has_cv?: boolean; // Whether candidate has a CV with parsed data
}

type Status = 'idle' | 'generating' | 'ready' | 'sending' | 'sent' | 'error';

/**
 * SimpleEmailModal - Ultra-simple email modal
 *
 * Works for 1 client or 100 clients - same UI!
 * Flow: Pick CV → Tell AI what you want → Generate → Send
 */
export default function SimpleEmailModal({
  isOpen,
  onClose,
  clientIds,
}: SimpleEmailModalProps) {
  // Only 7 states needed!
  const [clients, setClients] = useState<Client[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const isBulk = clientIds.length > 1;
  const clientsWithEmail = clients.filter(c => c.client_email);

  // Load clients and candidates on open
  useEffect(() => {
    if (!isOpen || clientIds.length === 0) return;

    const loadData = async () => {
      try {
        // Load selected clients
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, surgery, client_name, client_email, role, postcode')
          .in('id', clientIds);

        if (clientsData) {
          setClients(clientsData);
        }

        // Load ALL candidates (not just those with CVs)
        // This allows users to reference any candidate
        const { data: candidatesData } = await supabase
          .from('candidates')
          .select('id, first_name, last_name, role, postcode')
          .order('added_at', { ascending: false })
          .limit(100);

        if (candidatesData) {
          // Check which candidates have CVs with parsed data
          const candidateIds = candidatesData.map(c => c.id);
          const { data: cvsData } = await supabase
            .from('candidate_cvs')
            .select('candidate_id, cv_parsed_data')
            .in('candidate_id', candidateIds);

          // Create a set of candidate IDs that have CVs with parsed data
          const candidatesWithCV = new Set(
            (cvsData || [])
              .filter(cv => cv.cv_parsed_data !== null)
              .map(cv => cv.candidate_id)
          );

          // Mark candidates with has_cv flag
          const candidatesWithCVFlag = candidatesData.map(c => ({
            ...c,
            has_cv: candidatesWithCV.has(c.id),
          }));

          setCandidates(candidatesWithCVFlag);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };

    loadData();
  }, [isOpen, clientIds, supabase]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setClients([]);
      setCandidates([]);
      setSelectedCandidateId('');
      setPrompt('');
      setSubject('');
      setBody('');
      setStatus('idle');
      setErrorMessage('');
      setSendResult(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'sending') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, status]);

  // Generate email with AI
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setErrorMessage('Please tell AI what you want to write');
      return;
    }

    setStatus('generating');
    setErrorMessage('');

    try {
      // Use the first client as context for AI generation
      const contextClient = clients[0];

      const response = await fetch('/api/emails/clients/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: contextClient?.id,
          candidate_id: selectedCandidateId || undefined,
          custom_prompt: prompt,
          include_cv_context: !!selectedCandidateId,
          // For bulk, tell AI to use {{surgery_name}} placeholder
          is_bulk: isBulk,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate email');
      }

      setSubject(result.email.subject);
      setBody(result.email.body);
      setStatus('ready');
    } catch (error) {
      console.error('Generation failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate email');
      setStatus('error');
    }
  };

  // Send email(s)
  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setErrorMessage('Subject and body are required');
      return;
    }

    if (clientsWithEmail.length === 0) {
      setErrorMessage('No clients have email addresses');
      return;
    }

    setStatus('sending');
    setErrorMessage('');

    try {
      // Step 1: Generate CV in browser FIRST (if candidate selected)
      // This ensures we have proper auth cookies - internal API calls lose auth context
      let cvBase64: string | null = null;
      let cvFilename: string | null = null;

      if (selectedCandidateId) {
        try {
          const cvResponse = await fetch('/api/cvs/generate-redacted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidate_id: selectedCandidateId }),
          });

          if (cvResponse.ok) {
            const cvData = await cvResponse.json();
            if (cvData.success && cvData.base64) {
              cvBase64 = cvData.base64;
              cvFilename = cvData.filename;
            }
          }

          if (!cvBase64) {
            setErrorMessage('Failed to generate CV. Please try again.');
            setStatus('error');
            return;
          }
        } catch (cvError) {
          console.error('CV generation failed:', cvError);
          setErrorMessage('Failed to generate CV. Please try again.');
          setStatus('error');
          return;
        }
      }

      // Step 2: Send email(s) with pre-generated CV
      if (isBulk) {
        // Bulk send via campaigns API
        const response = await fetch('/api/emails/clients/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Email Campaign ${new Date().toLocaleDateString()}`,
            client_ids: clientsWithEmail.map(c => c.id),
            subject: subject,
            body_html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>`,
            candidate_id: selectedCandidateId || undefined,
            cv_base64: cvBase64 || undefined,
            cv_filename: cvFilename || undefined,
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to create campaign');
        }

        // Now send the campaign (pass CV data)
        const sendResponse = await fetch(`/api/emails/clients/campaigns/${result.campaign.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cv_base64: cvBase64 || undefined,
            cv_filename: cvFilename || undefined,
          }),
        });

        const sendResult = await sendResponse.json();

        if (!sendResult.success) {
          throw new Error(sendResult.error || 'Failed to send campaign');
        }

        setSendResult({
          sent: sendResult.sent || clientsWithEmail.length,
          failed: sendResult.failed || 0,
        });
      } else {
        // Single client send
        const client = clientsWithEmail[0];

        const response = await fetch('/api/emails/clients/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: client.id,
            recipient_email: client.client_email,
            recipient_name: client.client_name || client.surgery,
            subject: subject,
            body_html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>`,
            candidate_id: selectedCandidateId || undefined,
            cv_base64: cvBase64 || undefined,
            cv_filename: cvFilename || undefined,
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to send email');
        }

        setSendResult({ sent: 1, failed: 0 });
      }

      setStatus('sent');

      // Auto close after success
      setTimeout(() => onClose(), 2500);
    } catch (error) {
      console.error('Send failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send');
      setStatus('error');
    }
  };

  // Regenerate - go back to prompt
  const handleRegenerate = () => {
    setSubject('');
    setBody('');
    setStatus('idle');
    setErrorMessage('');
  };

  if (!isOpen) return null;

  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={status !== 'sending' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-[95vw] max-w-2xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-green-600 to-teal-600">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✉️</span>
            <div>
              <h2 className="text-lg font-semibold text-white">Send Email</h2>
              <p className="text-sm text-green-100">
                {isBulk
                  ? `To: ${clientsWithEmail.length} clients selected`
                  : clients[0]?.surgery || 'Loading...'}
              </p>
            </div>
          </div>
          <button
            onClick={status !== 'sending' ? onClose : undefined}
            disabled={status === 'sending'}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Success State */}
          {status === 'sent' && sendResult && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
                Email{sendResult.sent > 1 ? 's' : ''} Sent!
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {sendResult.sent} sent successfully
                {sendResult.failed > 0 && `, ${sendResult.failed} failed`}
              </p>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && status !== 'sent' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <p className="text-red-800 dark:text-red-200 flex items-center gap-2">
                <span>❌</span> {errorMessage}
              </p>
            </div>
          )}

          {/* Main Content (not sent state) */}
          {status !== 'sent' && (
            <>
              {/* Step 1: CV Selection */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                <label className="block text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                  📄 Which candidate CV to attach? (optional)
                </label>
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  disabled={status === 'sending' || status === 'generating'}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">No CV attachment</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.has_cv ? '✅' : '⚠️'} {c.first_name} {c.last_name} - {c.role || 'Unknown role'} ({c.postcode || 'No postcode'})
                    </option>
                  ))}
                </select>
                {selectedCandidateId && selectedCandidate?.has_cv && (
                  <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                    🔒 Contact details will be removed from CV (redacted)
                  </p>
                )}
                {selectedCandidateId && selectedCandidate && !selectedCandidate.has_cv && (
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
                    <p className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-1">
                      <span>⚠️</span>
                      <span>
                        <strong>No CV uploaded</strong> for this candidate. The attached PDF will only contain basic profile info (role, location).
                        For full CV content, upload their CV first.
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Step 2: AI Prompt (only show if not ready/sending) */}
              {(status === 'idle' || status === 'error') && (
                <div className="bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    💬 What do you want Claude to write?
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    placeholder={`Examples:\n• "Introduce ${selectedCandidate ? `${selectedCandidate.first_name}` : 'this candidate'} as an experienced dental nurse, mention availability Mon-Fri"\n• "Ask if they have any current vacancies for the role"\n• "Follow up on our previous conversation about staffing needs"`}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 text-sm"
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Tell Claude what you want - be as specific as you like!
                  </p>

                  {/* Generate Button */}
                  <div className="mt-4 text-center">
                    <button
                      onClick={handleGenerate}
                      disabled={!prompt.trim() || status === 'generating'}
                      className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {status === 'generating' ? (
                        <>
                          <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl">🤖</span>
                          <span>Generate Email</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Preview & Edit (show when ready) */}
              {(status === 'ready' || status === 'sending') && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      disabled={status === 'sending'}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email Body
                    </label>
                    <textarea
                      value={body.replace(/<[^>]*>/g, '')}
                      onChange={(e) => setBody(e.target.value)}
                      rows={10}
                      disabled={status === 'sending'}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 font-mono text-sm disabled:opacity-50"
                    />
                  </div>

                  {/* CV Attachment Info */}
                  {selectedCandidateId && selectedCandidate && (
                    <div className={`flex items-center gap-4 p-4 rounded-lg border ${
                      selectedCandidate.has_cv
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
                        : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
                    }`}>
                      <span className={`text-xl ${selectedCandidate.has_cv ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {selectedCandidate.has_cv ? '📎' : '⚠️'}
                      </span>
                      <div>
                        <p className={`text-sm font-medium ${selectedCandidate.has_cv ? 'text-blue-900 dark:text-blue-100' : 'text-amber-900 dark:text-amber-100'}`}>
                          {selectedCandidate.has_cv
                            ? `CV Attached: ${selectedCandidate.first_name} ${selectedCandidate.last_name}`
                            : `Profile Only: ${selectedCandidate.first_name} ${selectedCandidate.last_name}`
                          }
                        </p>
                        <p className={`text-xs ${selectedCandidate.has_cv ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'}`}>
                          {selectedCandidate.has_cv
                            ? '🔒 Contact details will be redacted'
                            : 'No CV uploaded - basic profile info only'
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {status !== 'sent' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            {status === 'ready' || status === 'sending' ? (
              <>
                <button
                  onClick={handleRegenerate}
                  disabled={status === 'sending'}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
                >
                  ↻ Regenerate
                </button>
                <button
                  onClick={handleSend}
                  disabled={status === 'sending' || !subject.trim() || !body.trim() || clientsWithEmail.length === 0}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {status === 'sending' ? (
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
                      <span>
                        {isBulk
                          ? `Send to ${clientsWithEmail.length} clients`
                          : 'Send Email'}
                      </span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <div className="w-full text-center text-sm text-gray-500 dark:text-gray-400">
                {clientsWithEmail.length === 0 && clients.length > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    ⚠️ No selected clients have email addresses
                  </span>
                ) : clientsWithEmail.length < clients.length ? (
                  <span>
                    {clientsWithEmail.length} of {clients.length} clients have email addresses
                  </span>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

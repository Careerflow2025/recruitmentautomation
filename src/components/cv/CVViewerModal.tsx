'use client';

import { useState, useEffect } from 'react';

interface CVData {
  id: string;
  candidate_id?: string;
  cv_filename: string;
  cv_file_size: number;
  cv_mime_type: string;
  cv_parsed_data?: {
    extracted_name?: string;
    extracted_email?: string;
    extracted_phone?: string;
    skills?: string[];
    qualifications?: string[];
    experience_years?: number;
    work_history?: Array<{
      role: string;
      employer: string;
      duration: string;
    }>;
    education?: Array<{
      qualification: string;
      institution: string;
      year?: number;
    }>;
    summary?: string;
  };
  match_confidence?: number;
  match_method?: string;
  status: string;
  storage_url?: string;
  created_at: string;
}

interface CandidateData {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  postcode?: string;
}

interface CVViewerModalProps {
  cvId: string;
  isOpen: boolean;
  onClose: () => void;
  onLink?: (cvId: string, candidateId: string) => void;
  onUnlink?: (cvId: string) => void;
  onDelete?: (cvId: string) => void;
}

export default function CVViewerModal({
  cvId,
  isOpen,
  onClose,
  onLink,
  onUnlink,
  onDelete,
}: CVViewerModalProps) {
  const [cvData, setCvData] = useState<CVData | null>(null);
  const [candidate, setCandidate] = useState<CandidateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'parsed'>('parsed');

  useEffect(() => {
    if (isOpen && cvId) {
      fetchCVData();
    }
  }, [isOpen, cvId]);

  const fetchCVData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/cvs/${cvId}`);
      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Failed to load CV');
        return;
      }

      setCvData(result.cv);
      setCandidate(result.candidate);
    } catch (err) {
      setError('Failed to load CV data');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this CV?')) return;

    try {
      const response = await fetch(`/api/cvs/${cvId}`, { method: 'DELETE' });
      const result = await response.json();

      if (result.success) {
        onDelete?.(cvId);
        onClose();
      } else {
        setError(result.error || 'Failed to delete CV');
      }
    } catch (err) {
      setError('Failed to delete CV');
    }
  };

  const handleUnlink = async () => {
    try {
      const response = await fetch(`/api/cvs/link?cv_id=${cvId}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        setCvData((prev) => (prev ? { ...prev, candidate_id: undefined } : null));
        setCandidate(null);
        onUnlink?.(cvId);
      } else {
        setError(result.error || 'Failed to unlink CV');
      }
    } catch (err) {
      setError('Failed to unlink CV');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative inline-block w-full max-w-3xl p-6 my-8 text-left align-middle bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              CV Details
            </h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <svg
                className="animate-spin h-8 w-8 text-blue-500"
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
            </div>
          ) : error ? (
            <div className="text-center text-red-500 py-8">{error}</div>
          ) : cvData ? (
            <>
              {/* File Info */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-4">
                  <div className="text-3xl">
                    {cvData.cv_mime_type === 'application/pdf' ? '📕' : '📘'}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {cvData.cv_filename}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {formatFileSize(cvData.cv_file_size)} •{' '}
                      {formatDate(cvData.created_at)}
                    </div>
                  </div>
                  {cvData.storage_url && (
                    <a
                      href={cvData.storage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      View File
                    </a>
                  )}
                </div>

                {/* Status & Linked Candidate */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      cvData.status === 'linked'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : cvData.status === 'parsed'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : cvData.status === 'error'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {cvData.status.charAt(0).toUpperCase() + cvData.status.slice(1)}
                  </span>

                  {cvData.match_method && (
                    <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      {cvData.match_method.replace('_', ' ')}
                    </span>
                  )}

                  {cvData.match_confidence && (
                    <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                      {Math.round(cvData.match_confidence * 100)}% match
                    </span>
                  )}
                </div>

                {/* Linked Candidate Info */}
                {candidate && (
                  <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-green-800 dark:text-green-200">
                          🔗 Linked to Candidate
                        </div>
                        <div className="text-sm text-green-700 dark:text-green-300">
                          {[candidate.first_name, candidate.last_name]
                            .filter(Boolean)
                            .join(' ') || candidate.id}
                          {candidate.email && ` • ${candidate.email}`}
                        </div>
                      </div>
                      <button
                        onClick={handleUnlink}
                        className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                      >
                        Unlink
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-600">
                <button
                  onClick={() => setActiveTab('parsed')}
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === 'parsed'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  Parsed Data
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === 'preview'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  Preview
                </button>
              </div>

              {/* Tab Content */}
              <div className="max-h-96 overflow-y-auto">
                {activeTab === 'parsed' && cvData.cv_parsed_data ? (
                  <div className="space-y-4">
                    {/* Contact Info */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Contact Information
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Name
                          </div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {cvData.cv_parsed_data.extracted_name || '—'}
                          </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Email
                          </div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {cvData.cv_parsed_data.extracted_email || '—'}
                          </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Phone
                          </div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {cvData.cv_parsed_data.extracted_phone || '—'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Skills */}
                    {cvData.cv_parsed_data.skills &&
                      cvData.cv_parsed_data.skills.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Skills
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {cvData.cv_parsed_data.skills.map((skill, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full dark:bg-blue-900/30 dark:text-blue-400"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Qualifications */}
                    {cvData.cv_parsed_data.qualifications &&
                      cvData.cv_parsed_data.qualifications.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Qualifications
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {cvData.cv_parsed_data.qualifications.map((qual, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full dark:bg-green-900/30 dark:text-green-400"
                              >
                                {qual}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Experience */}
                    {cvData.cv_parsed_data.experience_years && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Experience
                        </h4>
                        <div className="text-lg font-semibold text-gray-900 dark:text-white">
                          {cvData.cv_parsed_data.experience_years} years
                        </div>
                      </div>
                    )}

                    {/* Work History */}
                    {cvData.cv_parsed_data.work_history &&
                      cvData.cv_parsed_data.work_history.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Work History
                          </h4>
                          <div className="space-y-2">
                            {cvData.cv_parsed_data.work_history.map((job, i) => (
                              <div
                                key={i}
                                className="bg-gray-50 dark:bg-gray-700 p-3 rounded"
                              >
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {job.role}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-300">
                                  {job.employer}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {job.duration}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Education */}
                    {cvData.cv_parsed_data.education &&
                      cvData.cv_parsed_data.education.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Education
                          </h4>
                          <div className="space-y-2">
                            {cvData.cv_parsed_data.education.map((edu, i) => (
                              <div
                                key={i}
                                className="bg-gray-50 dark:bg-gray-700 p-3 rounded"
                              >
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {edu.qualification}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-300">
                                  {edu.institution}
                                </div>
                                {edu.year && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {edu.year}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Summary */}
                    {cvData.cv_parsed_data.summary && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Summary
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {cvData.cv_parsed_data.summary}
                        </p>
                      </div>
                    )}
                  </div>
                ) : activeTab === 'preview' ? (
                  <div className="flex items-center justify-center h-64 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    {cvData.storage_url ? (
                      cvData.cv_mime_type === 'application/pdf' ? (
                        <iframe
                          src={cvData.storage_url}
                          className="w-full h-96 rounded-lg"
                          title="CV Preview"
                        />
                      ) : (
                        <div className="text-center text-gray-500 dark:text-gray-400">
                          <div className="text-4xl mb-2">📄</div>
                          <p>Word document preview not available</p>
                          <a
                            href={cvData.storage_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            Download to view
                          </a>
                        </div>
                      )
                    ) : (
                      <div className="text-gray-500 dark:text-gray-400">
                        Preview not available
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No parsed data available
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Delete CV
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  Close
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

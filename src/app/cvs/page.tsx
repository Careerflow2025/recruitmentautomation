'use client';

import { useState, useEffect, useCallback } from 'react';
import CVUploader from '@/components/cv/CVUploader';
import CVViewerModal from '@/components/cv/CVViewerModal';

interface CV {
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
  };
  match_confidence?: number;
  match_method?: string;
  status: string;
  created_at: string;
  candidate?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

interface Candidate {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

export default function CVsPage() {
  const [cvs, setCVs] = useState<CV[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCVId, setSelectedCVId] = useState<string | null>(null);
  const [linkingCVId, setLinkingCVId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const loadCVs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cvs/upload');
      const data = await response.json();

      if (data.success) {
        setCVs(data.cvs || []);
      }
    } catch (error) {
      console.error('Error loading CVs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCandidates = useCallback(async () => {
    try {
      const response = await fetch('/api/candidates');
      const data = await response.json();

      if (data.success) {
        setCandidates(data.candidates || []);
      }
    } catch (error) {
      console.error('Error loading candidates:', error);
    }
  }, []);

  useEffect(() => {
    loadCVs();
    loadCandidates();
  }, [loadCVs, loadCandidates]);

  const handleLinkCV = async (cvId: string, candidateId: string) => {
    try {
      const response = await fetch('/api/cvs/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cv_id: cvId, candidate_id: candidateId }),
      });

      const result = await response.json();

      if (result.success) {
        setLinkingCVId(null);
        loadCVs();
      } else {
        alert(result.error || 'Failed to link CV');
      }
    } catch (error) {
      console.error('Error linking CV:', error);
      alert('Failed to link CV');
    }
  };

  const handleDeleteCV = async (cvId: string) => {
    if (!confirm('Are you sure you want to delete this CV?')) return;

    try {
      const response = await fetch(`/api/cvs/${cvId}`, { method: 'DELETE' });
      const result = await response.json();

      if (result.success) {
        loadCVs();
      } else {
        alert(result.error || 'Failed to delete CV');
      }
    } catch (error) {
      console.error('Error deleting CV:', error);
      alert('Failed to delete CV');
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
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      uploaded: 'bg-gray-100 text-gray-700',
      parsing: 'bg-blue-100 text-blue-700',
      parsed: 'bg-green-100 text-green-700',
      linked: 'bg-purple-100 text-purple-700',
      error: 'bg-red-100 text-red-700',
    };

    return (
      <span
        className={`px-2 py-1 text-xs rounded-full ${styles[status] || styles.uploaded}`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // Filter CVs
  const filteredCVs = cvs.filter((cv) => {
    // Status filter
    if (filterStatus !== 'all' && cv.status !== filterStatus) {
      return false;
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesFilename = cv.cv_filename.toLowerCase().includes(term);
      const matchesName = cv.cv_parsed_data?.extracted_name
        ?.toLowerCase()
        .includes(term);
      const matchesEmail = cv.cv_parsed_data?.extracted_email
        ?.toLowerCase()
        .includes(term);

      if (!matchesFilename && !matchesName && !matchesEmail) {
        return false;
      }
    }

    return true;
  });

  // Unlinked candidates for linking dropdown
  const unlinkedCandidates = candidates.filter(
    (c) => !cvs.some((cv) => cv.candidate_id === c.id)
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              📄 CV Management
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Upload, parse, and link CVs to candidates
            </p>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {filteredCVs.length} of {cvs.length} CVs
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar - Upload */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Upload CVs
          </h2>
          <CVUploader
            onUploadComplete={loadCVs}
            onParseComplete={loadCVs}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search by filename, name, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="uploaded">Uploaded</option>
                <option value="parsing">Parsing</option>
                <option value="parsed">Parsed</option>
                <option value="linked">Linked</option>
                <option value="error">Error</option>
              </select>
              <button
                onClick={loadCVs}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* CV List */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <svg
                    className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-4"
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
                  <p className="text-gray-500 dark:text-gray-400">Loading CVs...</p>
                </div>
              </div>
            ) : filteredCVs.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📄</div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No CVs found
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  {cvs.length === 0
                    ? 'Upload CVs using the panel on the left'
                    : 'Try adjusting your filters'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCVs.map((cv) => (
                  <div
                    key={cv.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">
                          {cv.cv_mime_type === 'application/pdf' ? '📕' : '📘'}
                        </span>
                        <div>
                          <div
                            className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]"
                            title={cv.cv_filename}
                          >
                            {cv.cv_filename}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatFileSize(cv.cv_file_size)} •{' '}
                            {formatDate(cv.created_at)}
                          </div>
                        </div>
                      </div>
                      {getStatusBadge(cv.status)}
                    </div>

                    {/* Parsed Info */}
                    {cv.cv_parsed_data && (
                      <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                        {cv.cv_parsed_data.extracted_name && (
                          <div className="text-gray-900 dark:text-white font-medium">
                            {cv.cv_parsed_data.extracted_name}
                          </div>
                        )}
                        {cv.cv_parsed_data.extracted_email && (
                          <div className="text-gray-500 dark:text-gray-400 text-xs">
                            {cv.cv_parsed_data.extracted_email}
                          </div>
                        )}
                        {cv.cv_parsed_data.skills &&
                          cv.cv_parsed_data.skills.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {cv.cv_parsed_data.skills.slice(0, 3).map((skill, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded"
                                >
                                  {skill}
                                </span>
                              ))}
                              {cv.cv_parsed_data.skills.length > 3 && (
                                <span className="text-xs text-gray-400">
                                  +{cv.cv_parsed_data.skills.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                      </div>
                    )}

                    {/* Linked Candidate */}
                    {cv.candidate_id && cv.candidate && (
                      <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
                        <div className="flex items-center gap-1 text-green-700 dark:text-green-400">
                          <span>🔗</span>
                          <span className="font-medium">
                            {[cv.candidate.first_name, cv.candidate.last_name]
                              .filter(Boolean)
                              .join(' ') || cv.candidate.email || cv.candidate_id}
                          </span>
                        </div>
                        {cv.match_confidence && (
                          <div className="text-xs text-green-600 dark:text-green-500 mt-1">
                            {Math.round(cv.match_confidence * 100)}% match •{' '}
                            {cv.match_method?.replace('_', ' ')}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Link to Candidate (if not linked) */}
                    {!cv.candidate_id && cv.status === 'parsed' && (
                      <div className="mb-3">
                        {linkingCVId === cv.id ? (
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleLinkCV(cv.id, e.target.value);
                              }
                            }}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            autoFocus
                          >
                            <option value="">Select candidate...</option>
                            {unlinkedCandidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {[c.first_name, c.last_name].filter(Boolean).join(' ') ||
                                  c.email ||
                                  c.id}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setLinkingCVId(cv.id)}
                            className="w-full px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                          >
                            🔗 Link to Candidate
                          </button>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedCVId(cv.id)}
                        className="flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleDeleteCV(cv.id)}
                        className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CV Viewer Modal */}
      {selectedCVId && (
        <CVViewerModal
          cvId={selectedCVId}
          isOpen={!!selectedCVId}
          onClose={() => setSelectedCVId(null)}
          onDelete={() => {
            setSelectedCVId(null);
            loadCVs();
          }}
          onUnlink={loadCVs}
        />
      )}
    </div>
  );
}

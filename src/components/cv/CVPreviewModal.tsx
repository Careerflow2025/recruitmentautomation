'use client';

import { useState, useEffect } from 'react';

interface CVPreviewModalProps {
  cvId?: string;
  storageUrl?: string;
  filename?: string;
  mimeType?: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * CV Preview Modal - Full-screen preview for PDF and Word documents
 * - PDFs: Native browser rendering via iframe
 * - Word docs: Google Docs Viewer (free, no download required)
 */
export default function CVPreviewModal({
  cvId,
  storageUrl: propStorageUrl,
  filename: propFilename,
  mimeType: propMimeType,
  isOpen,
  onClose,
}: CVPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageUrl, setStorageUrl] = useState<string | null>(propStorageUrl || null);
  const [filename, setFilename] = useState<string>(propFilename || 'CV');
  const [mimeType, setMimeType] = useState<string>(propMimeType || '');

  // Fetch CV data if cvId is provided but storageUrl is not
  useEffect(() => {
    if (!isOpen) return;

    if (propStorageUrl) {
      setStorageUrl(propStorageUrl);
      setFilename(propFilename || 'CV');
      setMimeType(propMimeType || '');
      setLoading(false);
      return;
    }

    if (cvId) {
      fetchCVData();
    }
  }, [isOpen, cvId, propStorageUrl, propFilename, propMimeType]);

  const fetchCVData = async () => {
    if (!cvId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/cvs/${cvId}`);
      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Failed to load CV');
        return;
      }

      setStorageUrl(result.cv.storage_url);
      setFilename(result.cv.cv_filename);
      setMimeType(result.cv.cv_mime_type);
    } catch (err) {
      setError('Failed to load CV data');
    } finally {
      setLoading(false);
    }
  };

  const isPDF = mimeType === 'application/pdf' || filename?.toLowerCase().endsWith('.pdf');
  const isWord = mimeType?.includes('word') ||
                 mimeType?.includes('document') ||
                 filename?.toLowerCase().endsWith('.doc') ||
                 filename?.toLowerCase().endsWith('.docx');

  // Generate Google Docs Viewer URL for Word documents
  const getViewerUrl = () => {
    if (!storageUrl) return null;

    if (isPDF) {
      // PDFs can be viewed directly in iframe
      return storageUrl;
    }

    if (isWord) {
      // Use Google Docs Viewer for Word documents
      // Note: The URL must be publicly accessible for Google Docs Viewer
      const encodedUrl = encodeURIComponent(storageUrl);
      return `https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`;
    }

    return storageUrl;
  };

  const viewerUrl = getViewerUrl();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-[95vw] h-[95vh] max-w-7xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isPDF ? '📕' : '📘'}</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate max-w-[400px]">
                {filename}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isPDF ? 'PDF Document' : isWord ? 'Word Document' : 'Document'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {storageUrl && (
              <a
                href={storageUrl}
                download={filename}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-gray-100 dark:bg-gray-800 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <svg
                  className="animate-spin h-12 w-12 text-blue-500 mx-auto mb-4"
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
                <p className="text-gray-500 dark:text-gray-400">Loading CV preview...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-red-500">
                <div className="text-4xl mb-4">❌</div>
                <p>{error}</p>
                {storageUrl && (
                  <a
                    href={storageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    Open in New Tab
                  </a>
                )}
              </div>
            </div>
          ) : !viewerUrl ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500 dark:text-gray-400">
                <div className="text-4xl mb-4">📄</div>
                <p>Preview not available</p>
                {storageUrl && (
                  <a
                    href={storageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    Open in New Tab
                  </a>
                )}
              </div>
            </div>
          ) : (
            <iframe
              src={viewerUrl}
              className="w-full h-full border-0"
              title={`CV Preview: ${filename}`}
              onLoad={() => setLoading(false)}
              onError={() => setError('Failed to load document preview')}
            />
          )}
        </div>

        {/* Footer with tips for Word docs */}
        {isWord && !loading && !error && (
          <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-700">
            <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <span>💡</span>
              <span>Word documents are rendered via Google Docs Viewer. For best results, download the file.</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

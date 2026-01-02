'use client';

import { useState, useCallback, useRef } from 'react';
import { CV_UPLOAD_LIMITS, ACCEPTED_CV_TYPES } from '@/lib/constants';

interface UploadedCV {
  id: string;
  filename: string;
  status: 'uploading' | 'uploaded' | 'parsing' | 'parsed' | 'linked' | 'error';
  progress?: number;
  error?: string;
  parsed_data?: {
    extracted_name?: string;
    extracted_email?: string;
    extracted_phone?: string;
  };
  suggested_matches?: Array<{
    candidate_id: string;
    candidate_name: string;
    confidence: number;
    match_reasons: string[];
  }>;
}

interface CVUploaderProps {
  onUploadComplete?: (cvs: UploadedCV[]) => void;
  onParseComplete?: (cv: UploadedCV) => void;
  className?: string;
}

export default function CVUploader({
  onUploadComplete,
  onParseComplete,
  className = '',
}: CVUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedCVs, setUploadedCVs] = useState<UploadedCV[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch limit warning state
  const [limitExceeded, setLimitExceeded] = useState<{
    selected: number;
    processed: number;
  } | null>(null);

  // Duplicates warning state
  const [duplicatesFound, setDuplicatesFound] = useState<Array<{
    filename: string;
    reason: string;
  }>>([]);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_CV_TYPES.MIME_TYPES.includes(file.type as any)) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !['pdf', 'doc', 'docx'].includes(ext)) {
        return 'Invalid file type. Only PDF and Word documents are accepted.';
      }
    }
    if (file.size > CV_UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES) {
      return `File too large. Maximum size is ${CV_UPLOAD_LIMITS.MAX_FILE_SIZE_MB}MB.`;
    }
    return null;
  };

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setIsUploading(true);
      setLimitExceeded(null); // Reset limit warning
      setDuplicatesFound([]); // Reset duplicates warning

      // BATCH LIMIT CHECK - Process only first MAX_BATCH_SIZE files
      let filesToUpload = files;
      if (files.length > CV_UPLOAD_LIMITS.MAX_BATCH_SIZE) {
        filesToUpload = files.slice(0, CV_UPLOAD_LIMITS.MAX_BATCH_SIZE);
        setLimitExceeded({
          selected: files.length,
          processed: CV_UPLOAD_LIMITS.MAX_BATCH_SIZE,
        });
      }

      const validFiles = filesToUpload.filter((file) => {
        const error = validateFile(file);
        if (error) {
          setUploadedCVs((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}-${Math.random()}`,
              filename: file.name,
              status: 'error',
              error,
            },
          ]);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) {
        setIsUploading(false);
        return;
      }

      // Add files to upload queue with uploading status
      const newCVs: UploadedCV[] = validFiles.map((file) => ({
        id: `temp-${Date.now()}-${Math.random()}`,
        filename: file.name,
        status: 'uploading' as const,
        progress: 0,
      }));

      setUploadedCVs((prev) => [...prev, ...newCVs]);

      // Create FormData for upload
      const formData = new FormData();
      validFiles.forEach((file) => {
        formData.append('files', file);
      });

      try {
        const response = await fetch('/api/cvs/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (!result.success && !result.duplicates) {
          // Mark all as error (only if no duplicates - if all were duplicates, that's not an error)
          setUploadedCVs((prev) =>
            prev.map((cv) =>
              newCVs.some((n) => n.id === cv.id)
                ? { ...cv, status: 'error', error: result.error }
                : cv
            )
          );
        } else {
          // Handle duplicates from API response
          if (result.duplicates && result.duplicates.length > 0) {
            setDuplicatesFound(result.duplicates);
            // Remove duplicates from the upload queue UI
            setUploadedCVs((prev) =>
              prev.filter((cv) =>
                !result.duplicates.some((d: { filename: string }) => d.filename === cv.filename)
              )
            );
          }

          // Update with real IDs and trigger parsing
          const uploadedFiles = result.uploaded || [];

          setUploadedCVs((prev) =>
            prev.map((cv) => {
              const uploadedFile = uploadedFiles.find(
                (u: { filename: string }) => u.filename === cv.filename
              );
              if (uploadedFile) {
                return {
                  ...cv,
                  id: uploadedFile.cv_id,
                  status: 'uploaded',
                };
              }
              return cv;
            })
          );

          // Start parsing each uploaded file
          for (const uploaded of uploadedFiles) {
            parseCV(uploaded.cv_id);
          }

          onUploadComplete?.(uploadedFiles);
        }
      } catch (error) {
        setUploadedCVs((prev) =>
          prev.map((cv) =>
            newCVs.some((n) => n.id === cv.id)
              ? {
                  ...cv,
                  status: 'error',
                  error: 'Upload failed. Please try again.',
                }
              : cv
          )
        );
      }

      setIsUploading(false);
    },
    [onUploadComplete]
  );

  const parseCV = async (cvId: string) => {
    setUploadedCVs((prev) =>
      prev.map((cv) => (cv.id === cvId ? { ...cv, status: 'parsing' } : cv))
    );

    try {
      const response = await fetch('/api/cvs/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cv_id: cvId }),
      });

      const result = await response.json();

      if (!result.success) {
        setUploadedCVs((prev) =>
          prev.map((cv) =>
            cv.id === cvId ? { ...cv, status: 'error', error: result.error } : cv
          )
        );
      } else {
        const updatedCV: UploadedCV = {
          id: cvId,
          filename:
            uploadedCVs.find((cv) => cv.id === cvId)?.filename || 'Unknown',
          status: result.auto_linked ? 'linked' : 'parsed',
          parsed_data: result.parsed_data,
          suggested_matches: result.suggested_matches,
        };

        setUploadedCVs((prev) =>
          prev.map((cv) => (cv.id === cvId ? updatedCV : cv))
        );

        onParseComplete?.(updatedCV);
      }
    } catch (error) {
      setUploadedCVs((prev) =>
        prev.map((cv) =>
          cv.id === cvId
            ? { ...cv, status: 'error', error: 'Parse failed. Please try again.' }
            : cv
        )
      );
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        uploadFiles(files);
      }
    },
    [uploadFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) {
        uploadFiles(files);
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [uploadFiles]
  );

  const getStatusIcon = (status: UploadedCV['status']) => {
    switch (status) {
      case 'uploading':
        return (
          <svg
            className="animate-spin h-4 w-4 text-blue-500"
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
        );
      case 'uploaded':
        return <span className="text-blue-500">📤</span>;
      case 'parsing':
        return (
          <svg
            className="animate-spin h-4 w-4 text-purple-500"
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
        );
      case 'parsed':
        return <span className="text-green-500">✅</span>;
      case 'linked':
        return <span className="text-green-600">🔗</span>;
      case 'error':
        return <span className="text-red-500">❌</span>;
      default:
        return null;
    }
  };

  const getStatusText = (cv: UploadedCV) => {
    switch (cv.status) {
      case 'uploading':
        return 'Uploading...';
      case 'uploaded':
        return 'Uploaded, waiting to parse...';
      case 'parsing':
        return 'Parsing with AI...';
      case 'parsed':
        return cv.parsed_data?.extracted_name
          ? `Found: ${cv.parsed_data.extracted_name}`
          : 'Parsed successfully';
      case 'linked':
        return 'Auto-linked to candidate';
      case 'error':
        return cv.error || 'Error occurred';
      default:
        return '';
    }
  };

  const clearCompleted = () => {
    setUploadedCVs((prev) =>
      prev.filter((cv) => !['parsed', 'linked', 'error'].includes(cv.status))
    );
  };

  return (
    <div className={`${className}`}>
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-all duration-200
          ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
          }
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_CV_TYPES.EXTENSIONS.join(',')}
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <div className="text-4xl">📄</div>
          <div className="text-lg font-medium text-gray-700 dark:text-gray-200">
            {isDragging ? 'Drop CVs here' : 'Drag & drop CVs here'}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            or click to browse
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500">
            PDF, DOC, DOCX • Max {CV_UPLOAD_LIMITS.MAX_FILE_SIZE_MB}MB per file • Max {CV_UPLOAD_LIMITS.MAX_BATCH_SIZE} files per batch
          </div>
        </div>
      </div>

      {/* Batch Limit Exceeded Warning */}
      {limitExceeded && (
        <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Batch limit exceeded
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                You selected {limitExceeded.selected} files. Only the first {limitExceeded.processed} will be uploaded.
                Please upload remaining files in another batch.
              </p>
            </div>
            <button
              onClick={() => setLimitExceeded(null)}
              className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Duplicates Warning */}
      {duplicatesFound.length > 0 && (
        <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <span className="text-orange-500 mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                Duplicates Skipped ({duplicatesFound.length} file{duplicatesFound.length > 1 ? 's' : ''})
              </p>
              <ul className="text-xs text-orange-700 dark:text-orange-300 mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                {duplicatesFound.map((dup, idx) => (
                  <li key={idx} className="truncate">
                    • {dup.filename} - {dup.reason}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setDuplicatesFound([])}
              className="text-orange-500 hover:text-orange-700 dark:hover:text-orange-300 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Upload Queue */}
      {uploadedCVs.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Uploads ({uploadedCVs.length})
            </h4>
            {uploadedCVs.some((cv) =>
              ['parsed', 'linked', 'error'].includes(cv.status)
            ) && (
              <button
                onClick={clearCompleted}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Clear completed
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {uploadedCVs.map((cv) => (
              <div
                key={cv.id}
                className={`
                  flex items-center gap-3 p-3 rounded-lg text-sm
                  ${
                    cv.status === 'error'
                      ? 'bg-red-50 dark:bg-red-900/20'
                      : cv.status === 'linked'
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'bg-gray-50 dark:bg-gray-800'
                  }
                `}
              >
                {getStatusIcon(cv.status)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-gray-700 dark:text-gray-200">
                    {cv.filename}
                  </div>
                  <div
                    className={`text-xs ${
                      cv.status === 'error'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {getStatusText(cv)}
                  </div>

                  {/* Suggested matches preview */}
                  {cv.status === 'parsed' &&
                    cv.suggested_matches &&
                    cv.suggested_matches.length > 0 && (
                      <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                        {cv.suggested_matches.length} potential match
                        {cv.suggested_matches.length > 1 ? 'es' : ''} found
                      </div>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

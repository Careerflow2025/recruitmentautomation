/**
 * Application-wide constants
 * Centralized configuration for limits, thresholds, and settings
 */

// CV Upload Limits
export const CV_UPLOAD_LIMITS = {
  MAX_BATCH_SIZE: 50,           // Maximum CVs per batch upload
  MAX_FILE_SIZE_MB: 10,         // Maximum file size in MB
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB in bytes
} as const;

// Accepted CV file types
export const ACCEPTED_CV_TYPES = {
  MIME_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  EXTENSIONS: ['.pdf', '.doc', '.docx'],
} as const;

/**
 * CV Text Extraction Utilities
 * Extracts text content from PDF and Word documents
 */

/**
 * Extract text from a PDF buffer
 * Uses dynamic import for pdf-parse to handle ESM/CJS compatibility
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import for pdf-parse (CJS module)
    const pdfParse = (await import('pdf-parse')).default || (await import('pdf-parse'));
    const data = await pdfParse(buffer);
    return data.text.trim();
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from a Word document buffer (.docx)
 * Uses mammoth for .docx files
 */
export async function extractTextFromWord(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid issues with SSR
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch (error) {
    console.error('Word extraction error:', error);
    throw new Error(`Failed to extract text from Word document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from a CV based on its MIME type
 */
export async function extractTextFromCV(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf':
      return extractTextFromPDF(buffer);

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword':
      return extractTextFromWord(buffer);

    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

/**
 * Clean and normalize extracted text
 */
export function cleanExtractedText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Trim
    .trim();
}

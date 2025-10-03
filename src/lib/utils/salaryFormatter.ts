/**
 * Format salary values according to matching_json_final.json spec
 * Single value: £14
 * Range: £15–£17 (en-dash, not hyphen)
 */

/**
 * Clean and format salary input
 * @param input - Raw salary input (e.g., "14", "15-17", "£15 ph", "16+")
 * @returns Formatted salary string
 */
export function formatSalary(input: string): string {
  if (!input) return '';
  
  // Remove unwanted characters: 'ph', '/hr', '+', extra spaces
  let cleaned = input
    .replace(/ph|\/hr|\+/gi, '')
    .replace(/\s+/g, '')
    .replace(/£/g, '');
  
  // Check if it's a range (contains - or –)
  const isRange = cleaned.includes('-') || cleaned.includes('–');
  
  if (isRange) {
    // Split by hyphen or en-dash
    const parts = cleaned.split(/[-–]/);
    if (parts.length === 2) {
      const min = parts[0].trim();
      const max = parts[1].trim();
      return `£${min}–£${max}`; // Use en-dash
    }
  }
  
  // Single value
  const num = cleaned.trim();
  return num ? `£${num}` : '';
}

/**
 * Parse salary to get numeric values for comparison
 * @param salary - Formatted salary string
 * @returns Object with min and max values
 */
export function parseSalary(salary: string): { min: number; max: number } {
  const cleaned = salary.replace(/£/g, '');
  
  if (cleaned.includes('–')) {
    const [min, max] = cleaned.split('–').map(s => parseFloat(s.trim()));
    return { min, max };
  }
  
  const value = parseFloat(cleaned);
  return { min: value, max: value };
}

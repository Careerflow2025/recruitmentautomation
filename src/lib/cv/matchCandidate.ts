/**
 * Candidate Matching Algorithm
 * Matches parsed CV data to existing candidates in the database
 */

interface ParsedCVData {
  extracted_name: string | null;
  extracted_email: string | null;
  extracted_phone: string | null;
  [key: string]: any;
}

interface Candidate {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  [key: string]: any;
}

export interface MatchResult {
  candidate_id: string;
  candidate_name: string;
  confidence: number;
  match_reasons: ('email_match' | 'phone_match' | 'name_match')[];
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10); // Last 10 digits
}

/**
 * Normalize email for comparison
 */
function normalizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.toLowerCase().trim();
}

/**
 * Calculate Levenshtein distance for fuzzy name matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate name similarity score (0-1)
 */
function nameSimilarity(name1: string | null, name2: string | null): number {
  if (!name1 || !name2) return 0;

  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();

  if (n1 === n2) return 1;

  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 0;

  const distance = levenshteinDistance(n1, n2);
  return 1 - distance / maxLen;
}

/**
 * Find matching candidates for parsed CV data
 */
export function findMatchingCandidates(
  parsedData: ParsedCVData,
  candidates: Candidate[]
): MatchResult[] {
  const matches: MatchResult[] = [];

  for (const candidate of candidates) {
    const matchReasons: ('email_match' | 'phone_match' | 'name_match')[] = [];
    let confidence = 0;

    // 1. Email match (exact) - highest confidence
    if (parsedData.extracted_email && candidate.email) {
      const cvEmail = normalizeEmail(parsedData.extracted_email);
      const candidateEmail = normalizeEmail(candidate.email);
      if (cvEmail && candidateEmail && cvEmail === candidateEmail) {
        matchReasons.push('email_match');
        confidence = Math.max(confidence, 1.0);
      }
    }

    // 2. Phone match (normalized) - high confidence
    if (parsedData.extracted_phone && candidate.phone) {
      const cvPhone = normalizePhone(parsedData.extracted_phone);
      const candidatePhone = normalizePhone(candidate.phone);
      if (cvPhone && candidatePhone && cvPhone === candidatePhone) {
        matchReasons.push('phone_match');
        confidence = Math.max(confidence, 0.95);
      }
    }

    // 3. Name match (fuzzy) - medium confidence
    if (parsedData.extracted_name) {
      const candidateFullName = [candidate.first_name, candidate.last_name]
        .filter(Boolean)
        .join(' ');

      if (candidateFullName) {
        const similarity = nameSimilarity(parsedData.extracted_name, candidateFullName);
        if (similarity >= 0.8) {
          matchReasons.push('name_match');
          confidence = Math.max(confidence, 0.7 + (similarity - 0.8) * 1.5); // 0.7-1.0 range
        }
      }
    }

    // Only include if there's at least one match reason
    if (matchReasons.length > 0) {
      // Boost confidence if multiple match reasons
      if (matchReasons.length >= 2) {
        confidence = Math.min(1.0, confidence + 0.1);
      }
      if (matchReasons.length >= 3) {
        confidence = 1.0;
      }

      const candidateName = [candidate.first_name, candidate.last_name]
        .filter(Boolean)
        .join(' ') || candidate.id;

      matches.push({
        candidate_id: candidate.id,
        candidate_name: candidateName,
        confidence: Math.round(confidence * 100) / 100,
        match_reasons: matchReasons,
      });
    }
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/**
 * Get the best match if confidence is high enough
 */
export function getBestMatch(
  parsedData: ParsedCVData,
  candidates: Candidate[],
  minConfidence: number = 0.7
): MatchResult | null {
  const matches = findMatchingCandidates(parsedData, candidates);

  if (matches.length > 0 && matches[0].confidence >= minConfidence) {
    return matches[0];
  }

  return null;
}

/**
 * Determine the match method based on match reasons
 */
export function getMatchMethod(matchReasons: ('email_match' | 'phone_match' | 'name_match')[]): string {
  if (matchReasons.includes('email_match')) return 'auto_email';
  if (matchReasons.includes('phone_match')) return 'auto_phone';
  if (matchReasons.includes('name_match')) return 'auto_name';
  return 'manual';
}

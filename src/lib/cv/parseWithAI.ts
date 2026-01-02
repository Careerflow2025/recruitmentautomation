/**
 * AI-Powered CV Parsing
 * Uses Claude API to extract structured data from CV text
 */

import Anthropic from '@anthropic-ai/sdk';

interface ParsedCVData {
  extracted_name: string | null;
  extracted_email: string | null;
  extracted_phone: string | null;
  skills: string[];
  qualifications: string[];
  experience_years: number | null;
  work_history: Array<{
    role: string;
    employer: string;
    duration: string;
    start_year?: number;
    end_year?: number;
  }>;
  education: Array<{
    qualification: string;
    institution: string;
    year?: number;
  }>;
  summary: string | null;
  parse_timestamp: string;
}

/**
 * Parse CV text using Claude API
 */
export async function parseWithAI(cvText: string): Promise<ParsedCVData> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not configured, using fallback regex parsing');
    return fallbackParsing(cvText);
  }

  try {
    const client = new Anthropic({
      apiKey: apiKey,
    });

    const prompt = `You are a CV parsing assistant specializing in dental recruitment. Extract structured information from the following CV text.

Return ONLY a valid JSON object with these exact fields (no markdown, no explanation):
{
  "extracted_name": "Full name or null",
  "extracted_email": "Email address or null",
  "extracted_phone": "Phone number or null",
  "skills": ["array of relevant skills"],
  "qualifications": ["array of professional qualifications like GDC, NEBDN, NVQ, etc."],
  "experience_years": number or null,
  "work_history": [{"role": "Job title", "employer": "Company name", "duration": "e.g. 2019-2023"}],
  "education": [{"qualification": "Degree/Cert name", "institution": "School/Uni name", "year": 2020}],
  "summary": "Brief professional summary or null"
}

CV TEXT:
${cvText.slice(0, 12000)}

Return ONLY the JSON object, nothing else.`;

    const message = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    // Extract text content from response
    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const responseText = content.text;

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      extracted_name: parsed.extracted_name || null,
      extracted_email: parsed.extracted_email || null,
      extracted_phone: parsed.extracted_phone || null,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      qualifications: Array.isArray(parsed.qualifications) ? parsed.qualifications : [],
      experience_years: typeof parsed.experience_years === 'number' ? parsed.experience_years : null,
      work_history: Array.isArray(parsed.work_history) ? parsed.work_history : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      summary: parsed.summary || null,
      parse_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Claude parsing error:', error);
    return fallbackParsing(cvText);
  }
}

/**
 * Fallback regex-based parsing when Claude API is unavailable
 */
function fallbackParsing(cvText: string): ParsedCVData {
  // Email regex
  const emailMatch = cvText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

  // UK phone regex
  const phoneMatch = cvText.match(/(?:(?:\+44\s?|0)(?:7\d{3}|\d{4})[\s.-]?\d{3}[\s.-]?\d{3,4})/);

  // Name extraction (first line often contains name)
  const lines = cvText.split('\n').filter(l => l.trim());
  const potentialName = lines[0]?.trim().slice(0, 50);
  const nameMatch = potentialName?.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/);

  // Skills keywords
  const dentalSkills = [
    'dental nursing', 'patient care', 'sterilization', 'infection control',
    'x-ray', 'radiography', 'chairside assistance', 'dental software',
    'orthodontics', 'endodontics', 'periodontics', 'implants',
    'sedation', 'emergency care', 'child patient care',
  ];

  const foundSkills = dentalSkills.filter(skill =>
    cvText.toLowerCase().includes(skill.toLowerCase())
  );

  // Qualifications
  const qualPatterns = [
    'GDC', 'NEBDN', 'NVQ', 'City & Guilds', 'BTEC', 'Diploma',
    'Certificate', 'Registered Dental Nurse', 'BDS', 'BSc',
  ];

  const foundQualifications = qualPatterns.filter(qual =>
    cvText.includes(qual)
  );

  // Experience years estimation
  const yearMatches = cvText.match(/\b(19|20)\d{2}\b/g);
  let experienceYears: number | null = null;
  if (yearMatches && yearMatches.length >= 2) {
    const years = yearMatches.map(y => parseInt(y)).sort();
    experienceYears = new Date().getFullYear() - years[0];
    if (experienceYears > 50) experienceYears = null; // Sanity check
  }

  return {
    extracted_name: nameMatch ? nameMatch[0] : null,
    extracted_email: emailMatch ? emailMatch[0] : null,
    extracted_phone: phoneMatch ? phoneMatch[0] : null,
    skills: foundSkills,
    qualifications: foundQualifications,
    experience_years: experienceYears,
    work_history: [],
    education: [],
    summary: null,
    parse_timestamp: new Date().toISOString(),
  };
}

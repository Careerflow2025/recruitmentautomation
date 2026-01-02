/**
 * AI-Powered CV Parsing
 * Uses Mistral 7B to extract structured data from CV text
 */

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
 * Parse CV text using Mistral 7B AI
 */
export async function parseWithAI(cvText: string): Promise<ParsedCVData> {
  const vpsUrl = process.env.VPS_AI_URL;
  const vpsSecret = process.env.VPS_AI_SECRET;

  if (!vpsUrl || !vpsSecret) {
    console.warn('VPS AI not configured, using fallback regex parsing');
    return fallbackParsing(cvText);
  }

  try {
    const prompt = `You are a CV parsing assistant. Extract structured information from the following CV text.

Return ONLY a valid JSON object with these fields:
{
  "extracted_name": "Full name or null",
  "extracted_email": "Email address or null",
  "extracted_phone": "Phone number or null",
  "skills": ["array of skills"],
  "qualifications": ["array of professional qualifications like GDC, NEBDN, etc."],
  "experience_years": number or null,
  "work_history": [{"role": "Job title", "employer": "Company name", "duration": "e.g. 2019-2023"}],
  "education": [{"qualification": "Degree/Cert name", "institution": "School/Uni name", "year": 2020}],
  "summary": "Brief professional summary or null"
}

CV TEXT:
${cvText.slice(0, 8000)}

Return ONLY the JSON object, no explanation.`;

    const response = await fetch(vpsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vpsSecret}`,
      },
      body: JSON.stringify({
        model: '/workspace/models/mistral-7b-instruct',
        messages: [
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
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
    console.error('AI parsing error:', error);
    return fallbackParsing(cvText);
  }
}

/**
 * Fallback regex-based parsing when AI is unavailable
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

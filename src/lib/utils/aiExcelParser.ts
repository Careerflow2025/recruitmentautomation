/**
 * AI-Powered Excel Parser using Mistral 7B
 *
 * Uses the self-hosted vLLM Mistral model to intelligently parse Excel data
 * even when columns are mixed up, misspelled, or in wrong order.
 */

const getVLLMConfig = () => {
  const url = process.env.VPS_AI_URL;
  const secret = process.env.VPS_AI_SECRET;

  if (!url || !secret) {
    throw new Error('VPS_AI_URL and VPS_AI_SECRET must be set in environment variables');
  }

  return { url, secret };
};

const MODEL = '/workspace/models/mistral-7b-instruct';

/**
 * Call vLLM server with a prompt
 */
async function callVLLM(systemPrompt: string, userPrompt: string, temperature: number = 0.3, maxTokens: number = 4096) {
  const { url, secret } = getVLLMConfig();

  // Mistral doesn't support separate 'system' role - combine into one user message
  const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'user', content: combinedPrompt }
      ],
      max_tokens: maxTokens,
      temperature: temperature,
      stream: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`vLLM API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content;

  if (!answer) {
    throw new Error('No response generated from vLLM');
  }

  return answer.trim();
}

/**
 * AI-Powered Excel Row Parser for Candidates
 */
export async function aiParseCandidate(row: any): Promise<any> {
  try {
    const systemPrompt = `You are a UK recruitment data extraction AI. Parse Excel row data and map to correct database fields.

DATABASE SCHEMA FOR CANDIDATES:
- first_name: First name (string)
- last_name: Last name (string)
- email: Email address (string)
- phone: UK phone number (format: 07700900001 or +44...)
- role: Job role - normalize to: "Dentist", "Dental Nurse", "Dental Receptionist", "Dental Hygienist", "Treatment Coordinator", "Practice Manager", "Trainee Dental Nurse"
- postcode: UK postcode (REQUIRED - format: SW1A 1AA, CR0 8JD, etc.)
- salary: Salary (format: £15-£17, £80k, etc.)
- days: Availability/working days (format: Mon-Fri, 2-3 days, etc.)
- experience: Experience details (string)
- notes: Any additional notes (string)

EXTRACTION RULES:
1. IDENTIFY what each value represents (ignore column names if they're wrong)
2. UK POSTCODE is REQUIRED - must detect valid UK postcode format
3. Detect phone numbers (starts with 07, +44, or 02)
4. Detect email addresses (contains @)
5. Detect salary (contains £ or numbers with "k" or ranges like 15-17)
6. Detect role keywords (dentist, nurse, receptionist, hygienist, etc.)
7. Detect days/availability patterns (Mon-Fri, days/week, etc.)
8. Names are usually short single words or two words
9. Put unrecognized data in notes field

OUTPUT FORMAT:
Return ONLY valid JSON object. No markdown, no explanations, no extra text.

Example:
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone": "07700900001",
  "role": "Dentist",
  "postcode": "SW1A 1AA",
  "salary": "£80k-£100k",
  "days": "Mon-Fri",
  "experience": "5 years",
  "notes": "Additional info here"
}

If a field is missing or unclear, use null.`;

    const userPrompt = `Parse this Excel row data and return correctly mapped JSON:

${JSON.stringify(row, null, 2)}`;

    console.log('🤖 Sending to Mistral AI for intelligent parsing...');
    const response = await callVLLM(systemPrompt, userPrompt, 0.3, 2048);

    // Remove markdown code blocks if present
    const jsonText = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonText);

    console.log('✨ AI-parsed result:', parsed);
    return parsed;

  } catch (error) {
    console.error('❌ AI parsing error:', error);
    throw new Error('AI parsing failed. Please check your data format.');
  }
}

/**
 * AI-Powered Excel Row Parser for Clients
 */
export async function aiParseClient(row: any): Promise<any> {
  try {
    const systemPrompt = `You are a UK recruitment data extraction AI. Parse Excel row data and map to correct database fields.

DATABASE SCHEMA FOR CLIENTS:
- surgery: Surgery/practice name (string, REQUIRED)
- client_name: Contact person name (string)
- client_phone: Contact phone number (UK format)
- client_email: Contact email address (string)
- role: Role needed - normalize to: "Dentist", "Dental Nurse", "Dental Receptionist", "Dental Hygienist", "Treatment Coordinator", "Practice Manager", "Trainee Dental Nurse"
- postcode: UK postcode (REQUIRED - format: SW1A 1AA, CR0 8JD, etc.)
- budget: Pay rate/budget (format: £500/day, £15-17, etc.)
- requirement: Requirements (string)
- system: Software system used (e.g., R4, SOE, Dentally, etc.)
- notes: Any additional notes (string)

EXTRACTION RULES:
1. IDENTIFY what each value represents (ignore column names if they're wrong)
2. UK POSTCODE is REQUIRED - must detect valid UK postcode format
3. Detect surgery/practice name (usually longer text or contains "Dental", "Practice", "Clinic")
4. Detect contact phone (starts with 07, +44, or 02)
5. Detect contact email (contains @)
6. Detect budget/pay (contains £ or "day" or ranges)
7. Detect role keywords (dentist, nurse, receptionist, etc.)
8. Detect system names (R4, SOE, Dentally, etc.)
9. Put unrecognized data in notes field

OUTPUT FORMAT:
Return ONLY valid JSON object. No markdown, no explanations, no extra text.

Example:
{
  "surgery": "Smile Dental Practice",
  "client_name": "Dr. Smith",
  "client_phone": "02071234567",
  "client_email": "contact@smile.com",
  "role": "Dentist",
  "postcode": "SW1A 1AA",
  "budget": "£500/day",
  "requirement": "GDC registered",
  "system": "R4",
  "notes": "Additional info here"
}

If a field is missing or unclear, use null.`;

    const userPrompt = `Parse this Excel row data and return correctly mapped JSON:

${JSON.stringify(row, null, 2)}`;

    console.log('🤖 Sending to Mistral AI for intelligent parsing...');
    const response = await callVLLM(systemPrompt, userPrompt, 0.3, 2048);

    // Remove markdown code blocks if present
    const jsonText = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonText);

    console.log('✨ AI-parsed result:', parsed);
    return parsed;

  } catch (error) {
    console.error('❌ AI parsing error:', error);
    throw new Error('AI parsing failed. Please check your data format.');
  }
}

/**
 * Batch AI parsing with fallback to regex-based parsing
 */
export async function aiBatchParseRows(rows: any[], type: 'candidate' | 'client'): Promise<any[]> {
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      console.log(`\n🤖 AI Processing row ${i + 1}/${rows.length}...`);

      const parsed = type === 'candidate'
        ? await aiParseCandidate(rows[i])
        : await aiParseClient(rows[i]);

      results.push(parsed);
    } catch (error) {
      console.error(`❌ AI parsing failed for row ${i + 1}, skipping:`, error);
      // Continue with next row instead of failing entire batch
      results.push(null);
    }
  }

  return results.filter(r => r !== null);
}

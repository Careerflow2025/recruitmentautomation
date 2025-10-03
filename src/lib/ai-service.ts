import Anthropic from '@anthropic-ai/sdk';

// Initialize Claude client with better error handling
const getClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
  }

  if (!apiKey.startsWith('sk-ant-')) {
    throw new Error('ANTHROPIC_API_KEY appears to be invalid (should start with sk-ant-)');
  }

  return new Anthropic({
    apiKey: apiKey,
  });
};

// Using Claude 3 Haiku - fast and efficient model
const MODEL = 'claude-3-haiku-20240307';

/**
 * Parse unstructured text (WhatsApp, emails, etc.) and extract candidate data
 */
export async function parseCandidates(rawText: string) {
  try {
    const client = getClient();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a UK dental recruitment data extraction expert. Extract ALL candidates from this text.

INPUT TEXT:
${rawText}

EXTRACTION RULES:
1. Each candidate has: id, role, postcode, phone, notes, salary, days, experience
2. Normalize roles to: "Dentist", "Dental Nurse", "Dental Receptionist", "Dental Hygienist", "Treatment Coordinator", "Practice Manager", "Trainee Dental Nurse"
3. Format phone: Add leading 0 if missing (e.g., 7723610278 → 07723610278)
4. Format salary: Add £ symbol (e.g., "14" → "£14", "15-17" → "£15-17")
5. Extract UK postcodes (e.g., CR0 8JD, HA8 0NN, LE1, N18 1QS)
6. Extract working days (e.g., "Mon-Wed", "2-3 days/week")
7. Put ALL other info in notes field
8. If field is missing/unclear, use empty string ""

OUTPUT FORMAT:
Return ONLY valid JSON array. No markdown, no explanations.

Example output:
[
  {
    "id": "298697",
    "role": "Dental Receptionist",
    "postcode": "CR0 8JD",
    "phone": "07723610278",
    "salary": "£14",
    "days": "2-3 days/week",
    "experience": "",
    "notes": "Part time, start from October, any days, travel 5-10 miles, added by AA on 26/9/25"
  }
]

Now extract from the input text above:`
      }],
      temperature: 0.3, // Lower temperature for more consistent extraction
    });

    const content = message.content[0];
    if (content.type === 'text') {
      const text = content.text.trim();
      // Remove markdown code blocks if present
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(jsonText);
    }

    throw new Error('Unexpected response format from Claude');
  } catch (error) {
    console.error('Error parsing candidates:', error);
    throw new Error('Failed to parse candidates. Please check the input format.');
  }
}

/**
 * Parse unstructured text and extract client data
 */
export async function parseClients(rawText: string) {
  try {
    const client = getClient();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a UK dental recruitment data extraction expert. Extract ALL clients/surgeries from this text.

INPUT TEXT:
${rawText}

EXTRACTION RULES:
1. Each client has: id, surgery (practice name), role (needed), postcode, budget (pay rate), days (needed), requirement, notes
2. Normalize roles to: "Dentist", "Dental Nurse", "Dental Receptionist", "Dental Hygienist", "Treatment Coordinator", "Practice Manager", "Trainee Dental Nurse"
3. Format budget: Add £ symbol (e.g., "14" → "£14", "15-17" → "£15-17")
4. Extract UK postcodes
5. Extract working days needed
6. Put ALL other info in notes field
7. If field is missing/unclear, use empty string ""

OUTPUT FORMAT:
Return ONLY valid JSON array. No markdown, no explanations.

Example output:
[
  {
    "id": "CL001",
    "surgery": "Smile Dental Practice",
    "role": "Dental Nurse",
    "postcode": "SW1A 1AA",
    "budget": "£15-17",
    "days": "Mon-Fri",
    "requirement": "GDC registered",
    "notes": "ASAP start, near station"
  }
]

Now extract from the input text above:`
      }],
      temperature: 0.3,
    });

    const content = message.content[0];
    if (content.type === 'text') {
      const text = content.text.trim();
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(jsonText);
    }

    throw new Error('Unexpected response format from Claude');
  } catch (error) {
    console.error('Error parsing clients:', error);
    throw new Error('Failed to parse clients. Please check the input format.');
  }
}

/**
 * AI Assistant - Answer questions about candidates, clients, and matches
 */
export async function askAssistant(
  question: string,
  context: {
    candidates?: any[];
    clients?: any[];
    matches?: any[];
  }
) {
  try {
    const client = getClient();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are an AI assistant for a UK dental recruitment system. Answer questions about candidates, clients, and matches.

AVAILABLE DATA:
${JSON.stringify(context, null, 2)}

SYSTEM KNOWLEDGE:
- Candidates have: id, role, postcode, phone, salary, days, experience, notes, added_at
- Clients have: id, surgery, role, postcode, budget, days, requirement, notes, added_at
- Matches connect candidates to clients with commute_minutes and role_match fields
- Commute times are calculated via Google Maps API (driving, morning traffic)
- UK postcodes format: SW1A 1AA, CR0 8JD, etc.
- Roles: Dentist, Dental Nurse, Dental Receptionist, Dental Hygienist, Treatment Coordinator, Practice Manager, Trainee Dental Nurse

INSTRUCTIONS:
1. Answer the question clearly and concisely
2. Use the actual data provided above
3. Include relevant numbers, names, postcodes
4. Format lists clearly
5. If data is missing, say so
6. For location queries, use postcode proximity
7. Be helpful and professional

USER QUESTION:
${question}

YOUR ANSWER:`
      }],
      temperature: 0.7,
    });

    const content = message.content[0];
    if (content.type === 'text') {
      return content.text.trim();
    }

    throw new Error('Unexpected response format from Claude');
  } catch (error) {
    console.error('Error asking assistant:', error);
    throw new Error('Failed to get answer from AI assistant.');
  }
}

/**
 * Smart matching suggestions - AI analyzes and suggests best matches
 */
export async function suggestMatches(
  candidateId: string,
  candidates: any[],
  clients: any[],
  matches: any[]
) {
  try {
    const client = getClient();
    const candidate = candidates.find(c => c.id === candidateId);
    if (!candidate) {
      throw new Error('Candidate not found');
    }

    const relevantMatches = matches.filter(m => m.candidate_id === candidateId);

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `You are a recruitment AI. Analyze this candidate and suggest the TOP 3 best client matches.

CANDIDATE:
${JSON.stringify(candidate, null, 2)}

ALL MATCHES FOR THIS CANDIDATE:
${JSON.stringify(relevantMatches, null, 2)}

ALL CLIENTS:
${JSON.stringify(clients, null, 2)}

RANKING CRITERIA:
1. Role match (exact match = highest priority)
2. Commute time (shorter = better)
3. Salary/budget alignment
4. Working days compatibility
5. Experience level match

OUTPUT:
Provide 3 best matches with brief explanation why each is good.
Format as clear numbered list.

YOUR RECOMMENDATIONS:`
      }],
      temperature: 0.5,
    });

    const content = message.content[0];
    if (content.type === 'text') {
      return content.text.trim();
    }

    throw new Error('Unexpected response format from Claude');
  } catch (error) {
    console.error('Error suggesting matches:', error);
    throw new Error('Failed to generate match suggestions.');
  }
}

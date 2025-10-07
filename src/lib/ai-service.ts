// AI Service - Uses self-hosted RunPod vLLM server instead of Claude API

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
async function callVLLM(systemPrompt: string, userPrompt: string, temperature: number = 0.7, maxTokens: number = 2000) {
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
 * Parse unstructured text (WhatsApp, emails, etc.) and extract candidate data
 */
export async function parseCandidates(rawText: string) {
  try {
    const systemPrompt = `You are a UK dental recruitment data extraction expert. Extract ALL candidates from text.

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
]`;

    const userPrompt = `Extract candidates from this text:\n\n${rawText}`;

    const response = await callVLLM(systemPrompt, userPrompt, 0.3, 4096);

    // Remove markdown code blocks if present
    const jsonText = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonText);
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
    const systemPrompt = `You are a UK dental recruitment data extraction expert. Extract ALL clients/surgeries from text.

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
]`;

    const userPrompt = `Extract clients from this text:\n\n${rawText}`;

    const response = await callVLLM(systemPrompt, userPrompt, 0.3, 4096);

    const jsonText = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonText);
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
    const systemPrompt = `You are an AI assistant for a UK dental recruitment system. Answer questions about candidates, clients, and matches.

SYSTEM KNOWLEDGE:
- Candidates have: id, role, postcode, phone, salary, days, experience, notes, added_at
- Clients have: id, surgery, role, postcode, budget, days, requirement, notes, added_at
- Matches connect candidates to clients with commute_minutes and role_match fields
- Commute times are calculated via Google Maps API (driving, morning traffic)
- UK postcodes format: SW1A 1AA, CR0 8JD, etc.
- Roles: Dentist, Dental Nurse, Dental Receptionist, Dental Hygienist, Treatment Coordinator, Practice Manager, Trainee Dental Nurse

INSTRUCTIONS:
1. Answer the question clearly and concisely
2. Use the actual data provided
3. Include relevant numbers, names, postcodes
4. Format lists clearly
5. If data is missing, say so
6. For location queries, use postcode proximity
7. Be helpful and professional`;

    const userPrompt = `AVAILABLE DATA:
${JSON.stringify(context, null, 2)}

USER QUESTION:
${question}`;

    const response = await callVLLM(systemPrompt, userPrompt, 0.7, 4096);
    return response;
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
    const candidate = candidates.find(c => c.id === candidateId);
    if (!candidate) {
      throw new Error('Candidate not found');
    }

    const relevantMatches = matches.filter(m => m.candidate_id === candidateId);

    const systemPrompt = `You are a recruitment AI. Analyze candidates and suggest the TOP 3 best client matches.

RANKING CRITERIA:
1. Role match (exact match = highest priority)
2. Commute time (shorter = better)
3. Salary/budget alignment
4. Working days compatibility
5. Experience level match

OUTPUT:
Provide 3 best matches with brief explanation why each is good.
Format as clear numbered list.`;

    const userPrompt = `CANDIDATE:
${JSON.stringify(candidate, null, 2)}

ALL MATCHES FOR THIS CANDIDATE:
${JSON.stringify(relevantMatches, null, 2)}

ALL CLIENTS:
${JSON.stringify(clients, null, 2)}

Provide your top 3 recommendations:`;

    const response = await callVLLM(systemPrompt, userPrompt, 0.5, 2048);
    return response;
  } catch (error) {
    console.error('Error suggesting matches:', error);
    throw new Error('Failed to generate match suggestions.');
  }
}

import { NextRequest, NextResponse } from 'next/server';

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
async function callVLLM(systemPrompt: string, userPrompt: string, temperature: number = 0.3, maxTokens: number = 200) {
  const { url, secret } = getVLLMConfig();

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
 * Validate role field - flexible but catches obvious mistakes
 */
async function validateRole(role: string): Promise<{ valid: boolean; message: string }> {
  if (!role || role.trim() === '') {
    return { valid: false, message: 'Role is required for matching' };
  }

  const systemPrompt = `You are a UK dental recruitment validation assistant. Your job is to validate role field entries.

VALID DENTAL ROLES:
- Dentist (DT, DDS, BDS, GDP)
- Dental Nurse (DN, D.N., Nurse)
- Dental Receptionist (Receptionist, Reception, Front Desk, FOH)
- Dental Hygienist (Hygienist)
- Treatment Coordinator (TCO, TC)
- Practice Manager (PM, Manager)
- Trainee Dental Nurse (TDN, Trainee)

VALIDATION RULES (FLEXIBLE):
1. Check if the text looks like a dental role (allow variations, abbreviations, typos)
2. REJECT if it's clearly: phone number, email, address, random text, salary
3. ACCEPT if it contains any dental-related keywords or role terms
4. Be LENIENT - when in doubt, ACCEPT

OUTPUT FORMAT:
Reply ONLY with: "VALID" or "INVALID: reason"

Examples:
- "Dental Nurse" → VALID
- "dn" → VALID
- "dentist" → VALID
- "07723610278" → INVALID: phone number not a role
- "£15" → INVALID: salary not a role
- "Croydon" → INVALID: location not a role
- "hygienist trainee" → VALID`;

  const userPrompt = `Validate this role entry: "${role}"`;

  try {
    const response = await callVLLM(systemPrompt, userPrompt, 0.2, 100);

    if (response.toUpperCase().includes('VALID') && !response.toUpperCase().includes('INVALID')) {
      return { valid: true, message: 'Valid role' };
    } else {
      const reason = response.replace(/INVALID:/i, '').trim();
      return { valid: false, message: reason || 'Invalid role entry' };
    }
  } catch (error) {
    console.error('Role validation error:', error);
    // If AI fails, do basic validation
    const phonePattern = /^[\d\s+()-]+$/;
    const emailPattern = /@/;
    const salaryPattern = /^[£\d\s-]+$/;

    if (phonePattern.test(role)) {
      return { valid: false, message: 'Phone number not a valid role' };
    }
    if (emailPattern.test(role)) {
      return { valid: false, message: 'Email not a valid role' };
    }
    if (salaryPattern.test(role)) {
      return { valid: false, message: 'Salary not a valid role' };
    }

    // If basic checks pass, accept it
    return { valid: true, message: 'Valid role' };
  }
}

/**
 * Validate postcode field - flexible UK postcode check
 */
async function validatePostcode(postcode: string): Promise<{ valid: boolean; message: string }> {
  if (!postcode || postcode.trim() === '') {
    return { valid: false, message: 'Postcode is required for matching' };
  }

  const systemPrompt = `You are a UK postcode validation assistant. Your job is to validate UK postcode entries.

UK POSTCODE FORMAT:
- Full: SW1A 1AA, CR0 8JD, N18 1QS, HA8 0NN
- Partial: SW1A, CR0, N18, LE1
- Area only: SW1, CR, N, HA

VALIDATION RULES (FLEXIBLE):
1. Check if it looks like a UK postcode (letters + numbers, with optional space)
2. ACCEPT area codes (e.g., "CR", "SW1", "LE1")
3. ACCEPT full postcodes (e.g., "CR0 8JD", "SW1A 1AA")
4. REJECT if it's clearly: phone number, email, salary, random text
5. Be LENIENT - when in doubt, ACCEPT

OUTPUT FORMAT:
Reply ONLY with: "VALID" or "INVALID: reason"

Examples:
- "CR0 8JD" → VALID
- "SW1A" → VALID
- "LE1" → VALID
- "Croydon" → INVALID: area name not postcode
- "07723610278" → INVALID: phone number not postcode
- "£15" → INVALID: salary not postcode
- "cr08jd" → VALID (missing space but valid format)`;

  const userPrompt = `Validate this postcode entry: "${postcode}"`;

  try {
    const response = await callVLLM(systemPrompt, userPrompt, 0.2, 100);

    if (response.toUpperCase().includes('VALID') && !response.toUpperCase().includes('INVALID')) {
      return { valid: true, message: 'Valid postcode' };
    } else {
      const reason = response.replace(/INVALID:/i, '').trim();
      return { valid: false, message: reason || 'Invalid postcode entry' };
    }
  } catch (error) {
    console.error('Postcode validation error:', error);
    // If AI fails, do basic UK postcode validation
    const ukPostcodePattern = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d?[A-Z]{0,2}$/i;
    const basicAreaPattern = /^[A-Z]{1,2}\d{0,2}$/i;

    const normalized = postcode.trim().toUpperCase();

    if (ukPostcodePattern.test(normalized) || basicAreaPattern.test(normalized)) {
      return { valid: true, message: 'Valid postcode' };
    } else {
      return { valid: false, message: 'Does not look like a valid UK postcode' };
    }
  }
}

/**
 * API Route: Validate Role or Postcode field
 * POST /api/validate-field
 * Body: { fieldType: 'role' | 'postcode', value: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fieldType, value } = body;

    if (!fieldType || !value) {
      return NextResponse.json(
        { success: false, error: 'Missing fieldType or value' },
        { status: 400 }
      );
    }

    let result: { valid: boolean; message: string };

    if (fieldType === 'role') {
      result = await validateRole(value);
    } else if (fieldType === 'postcode') {
      result = await validatePostcode(value);
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid fieldType. Use "role" or "postcode"' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      valid: result.valid,
      message: result.message
    });

  } catch (error) {
    console.error('Validation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      },
      { status: 500 }
    );
  }
}

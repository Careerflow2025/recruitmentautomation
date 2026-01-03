import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';

interface ComposeRequest {
  candidateId: string;
  clientId?: string;
  emailType: 'cv_submission' | 'interview' | 'terms' | 'follow_up' | 'marketing' | 'custom';
  tone?: 'professional' | 'friendly' | 'formal';
  additionalContext?: string;
  includeCV?: boolean;
  templateId?: string;
}

interface CandidateContext {
  name: string;
  role: string;
  experience?: string;
  skills?: string[];
  qualifications?: string[];
  salary_expectation?: string;
  availability?: string;
  cv_summary?: string;
}

interface ClientContext {
  surgery_name: string;
  role_needed: string;
  requirements?: string;
  pay_rate?: string;
  location?: string;
}

/**
 * POST /api/emails/compose
 * AI-powered email composition using Claude
 */
export async function POST(request: NextRequest) {
  try {
    const requestBody: ComposeRequest = await request.json();
    const { candidateId, clientId, emailType, tone = 'professional', additionalContext, includeCV } = requestBody;

    if (!candidateId) {
      return NextResponse.json(
        { success: false, error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Fetch candidate data
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (candidateError || !candidate) {
      return NextResponse.json(
        { success: false, error: 'Candidate not found' },
        { status: 404 }
      );
    }

    // Fetch candidate's CV if exists
    let cvData = null;
    if (includeCV) {
      const { data: cv } = await supabase
        .from('candidate_cvs')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      cvData = cv;
    }

    // Fetch client data if provided
    let clientData = null;
    if (clientId) {
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      clientData = client;
    }

    // Build candidate context
    const candidateContext: CandidateContext = {
      name: `${candidate.first_name} ${candidate.last_name}`.trim(),
      role: candidate.role || 'Dental Professional',
      experience: candidate.experience,
      skills: candidate.skills ? (Array.isArray(candidate.skills) ? candidate.skills : [candidate.skills]) : [],
      qualifications: candidate.qualifications ? (Array.isArray(candidate.qualifications) ? candidate.qualifications : [candidate.qualifications]) : [],
      salary_expectation: candidate.salary,
      availability: candidate.days,
      cv_summary: cvData?.parsed_content?.summary || cvData?.parsed_content?.raw_text?.substring(0, 500),
    };

    // Build client context if available
    let clientContext: ClientContext | null = null;
    if (clientData) {
      clientContext = {
        surgery_name: clientData.surgery || clientData.name,
        role_needed: clientData.role,
        requirements: clientData.requirements,
        pay_rate: clientData.pay,
        location: clientData.postcode,
      };
    }

    // Check for Anthropic API key
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { success: false, error: 'AI service not configured. Please add ANTHROPIC_API_KEY.' },
        { status: 500 }
      );
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });

    // Build the prompt
    const prompt = buildEmailPrompt(emailType, tone, candidateContext, clientContext, additionalContext);

    // Generate email with Claude
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract the generated content
    const generatedContent = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse subject and body from response
    const { subject, body } = parseEmailResponse(generatedContent);

    // Log the AI generation
    const { data: logEntry, error: logError } = await supabase
      .from('ai_email_logs')
      .insert({
        user_id: user.id,
        candidate_id: candidateId,
        client_id: clientId || null,
        email_type: emailType,
        generated_subject: subject,
        generated_body: body,
        model_used: 'claude-3-haiku-20240307',
        tokens_used: message.usage.input_tokens + message.usage.output_tokens,
        sent: false,
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to log AI email generation:', logError);
    }

    return NextResponse.json({
      success: true,
      email: {
        subject,
        body,
        candidateName: candidateContext.name,
        clientName: clientContext?.surgery_name,
        hasCV: !!cvData,
        logId: logEntry?.id,
      },
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error('Email composition error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to compose email',
      },
      { status: 500 }
    );
  }
}

/**
 * Build the prompt for Claude based on email type and context
 */
function buildEmailPrompt(
  emailType: string,
  tone: string,
  candidate: CandidateContext,
  client: ClientContext | null,
  additionalContext?: string
): string {
  const toneInstructions = {
    professional: 'Write in a professional, business-appropriate tone.',
    friendly: 'Write in a warm, friendly but still professional tone.',
    formal: 'Write in a formal, traditional business tone.',
  };

  const emailTypeInstructions: Record<string, string> = {
    cv_submission: `Write an email to submit this candidate's CV to the dental practice. Highlight their relevant experience and qualifications. The goal is to get the practice interested in the candidate for an interview.`,
    interview: `Write an email to schedule or confirm an interview. Be clear about logistics and next steps.`,
    terms: `Write an email to discuss terms of employment or placement. Be professional and clear about expectations.`,
    follow_up: `Write a follow-up email to check on the status of a previous conversation or application.`,
    marketing: `Write a marketing email to promote this candidate to potential practices. Make it compelling but not pushy.`,
    custom: `Write a professional recruitment email based on the context provided.`,
  };

  let prompt = `You are a professional UK dental recruitment consultant writing an email.

${toneInstructions[tone as keyof typeof toneInstructions] || toneInstructions.professional}

${emailTypeInstructions[emailType] || emailTypeInstructions.custom}

CANDIDATE INFORMATION:
- Name: ${candidate.name}
- Role: ${candidate.role}
${candidate.experience ? `- Experience: ${candidate.experience}` : ''}
${candidate.skills?.length ? `- Skills: ${candidate.skills.join(', ')}` : ''}
${candidate.qualifications?.length ? `- Qualifications: ${candidate.qualifications.join(', ')}` : ''}
${candidate.salary_expectation ? `- Salary Expectation: ${candidate.salary_expectation}` : ''}
${candidate.availability ? `- Availability: ${candidate.availability}` : ''}
${candidate.cv_summary ? `- CV Summary: ${candidate.cv_summary}` : ''}
`;

  if (client) {
    prompt += `
CLIENT/PRACTICE INFORMATION:
- Practice Name: ${client.surgery_name}
- Role Needed: ${client.role_needed}
${client.requirements ? `- Requirements: ${client.requirements}` : ''}
${client.pay_rate ? `- Pay Rate: ${client.pay_rate}` : ''}
${client.location ? `- Location: ${client.location}` : ''}
`;
  }

  if (additionalContext) {
    prompt += `
ADDITIONAL CONTEXT:
${additionalContext}
`;
  }

  prompt += `
IMPORTANT FORMATTING RULES:
1. Start your response with "SUBJECT: " followed by a clear, professional subject line
2. Then add a blank line
3. Then write the email body
4. Keep the email concise but informative (150-300 words)
5. Include a professional sign-off
6. Do NOT include any contact details of the candidate in the email body - these will be provided separately
7. Sign the email as "The Locum Meds Recruitment Team"

Generate the email now:`;

  return prompt;
}

/**
 * Parse the AI response to extract subject and body
 */
function parseEmailResponse(response: string): { subject: string; body: string } {
  const lines = response.trim().split('\n');
  let subject = '';
  let body = '';
  let foundSubject = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.toLowerCase().startsWith('subject:')) {
      subject = line.substring(8).trim();
      foundSubject = true;
    } else if (foundSubject) {
      // Skip empty lines right after subject
      if (line.trim() === '' && body === '') continue;
      body += (body ? '\n' : '') + line;
    }
  }

  // Fallback if no subject found
  if (!subject) {
    subject = 'Candidate Introduction - Dental Professional';
    body = response;
  }

  return { subject, body };
}

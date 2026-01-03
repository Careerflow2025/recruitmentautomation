import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';

interface ComposeClientEmailRequest {
  client_id: string;
  candidate_id?: string;  // Optional - for attaching CV context
  email_type?: 'cv_introduction' | 'availability_check' | 'follow_up' | 'marketing' | 'custom';
  tone?: 'professional' | 'friendly' | 'formal';
  custom_prompt?: string;  // Free text prompt from recruiter
  include_cv_context?: boolean;
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
  anonymous_reference?: string;
}

interface ClientContext {
  surgery_name: string;
  contact_name?: string;
  role_needed?: string;
  requirements?: string;
  pay_rate?: string;
  location?: string;
}

/**
 * POST /api/emails/clients/compose
 * AI-powered email composition for emailing clients (dental practices)
 */
export async function POST(request: NextRequest) {
  try {
    const body: ComposeClientEmailRequest = await request.json();
    const {
      client_id,
      candidate_id,
      email_type = 'cv_introduction',
      tone = 'professional',
      custom_prompt,
      include_cv_context = true
    } = body;

    if (!client_id) {
      return NextResponse.json(
        { success: false, error: 'Client ID is required' },
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

    // Fetch client data
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { success: false, error: 'Client not found' },
        { status: 404 }
      );
    }

    // Build client context
    const clientContext: ClientContext = {
      surgery_name: client.surgery || client.name || 'the practice',
      contact_name: client.contact_name || client.name,
      role_needed: client.role,
      requirements: client.requirements,
      pay_rate: client.pay,
      location: client.postcode,
    };

    // Fetch candidate data if provided (for CV introduction emails)
    let candidateContext: CandidateContext | null = null;
    let cvData = null;

    if (candidate_id) {
      const { data: candidate, error: candidateError } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', candidate_id)
        .single();

      if (candidate && !candidateError) {
        // Generate anonymous reference
        const anonymousRef = `DN-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

        candidateContext = {
          name: `${candidate.first_name} ${candidate.last_name}`.trim(),
          role: candidate.role || 'Dental Professional',
          experience: candidate.experience,
          skills: candidate.skills ? (Array.isArray(candidate.skills) ? candidate.skills : [candidate.skills]) : [],
          qualifications: candidate.qualifications ? (Array.isArray(candidate.qualifications) ? candidate.qualifications : [candidate.qualifications]) : [],
          salary_expectation: candidate.salary,
          availability: candidate.days,
          anonymous_reference: anonymousRef,
        };

        // Fetch CV if we want to include CV context
        if (include_cv_context) {
          const { data: cv } = await supabase
            .from('candidate_cvs')
            .select('*')
            .eq('candidate_id', candidate_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (cv) {
            cvData = cv;
            candidateContext.cv_summary = cv.parsed_content?.summary ||
              cv.redacted_content?.structuredContent?.summary ||
              cv.parsed_content?.raw_text?.substring(0, 500);
          }
        }
      }
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
    const prompt = buildClientEmailPrompt(email_type, tone, clientContext, candidateContext, custom_prompt);

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
    const { subject: rawSubject, body: rawBody } = parseEmailResponse(generatedContent);

    // Post-process to replace any leftover placeholders with actual values
    const replacePlaceholders = (text: string): string => {
      return text
        .replace(/\[Practice Name\]/gi, clientContext.surgery_name)
        .replace(/\[Surgery Name\]/gi, clientContext.surgery_name)
        .replace(/\[Surgery\]/gi, clientContext.surgery_name)
        .replace(/\[Practice\]/gi, clientContext.surgery_name)
        .replace(/\[Contact Name\]/gi, clientContext.contact_name || 'there')
        .replace(/\[Name\]/gi, clientContext.contact_name || 'there')
        .replace(/\{\{surgery_name\}\}/gi, clientContext.surgery_name)
        .replace(/\{\{practice_name\}\}/gi, clientContext.surgery_name)
        .replace(/\{\{contact_name\}\}/gi, clientContext.contact_name || 'there');
    };

    const subject = replacePlaceholders(rawSubject);
    const emailBody = replacePlaceholders(rawBody);

    // Log the AI generation
    await supabase
      .from('ai_email_logs')
      .insert({
        user_id: user.id,
        candidate_id: candidate_id || null,
        client_id: client_id,
        email_type: email_type,
        generated_subject: subject,
        generated_body: emailBody,
        model_used: 'claude-3-haiku-20240307',
        tokens_used: message.usage.input_tokens + message.usage.output_tokens,
        sent: false,
      });

    return NextResponse.json({
      success: true,
      email: {
        subject,
        body: emailBody,
        clientName: clientContext.surgery_name,
        candidateName: candidateContext?.name,
        candidateReference: candidateContext?.anonymous_reference,
        hasCV: !!cvData,
      },
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error('Client email composition error:', error);
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
function buildClientEmailPrompt(
  emailType: string,
  tone: string,
  client: ClientContext,
  candidate: CandidateContext | null,
  customPrompt?: string
): string {
  const toneInstructions = {
    professional: 'Write in a professional, business-appropriate tone.',
    friendly: 'Write in a warm, friendly but still professional tone.',
    formal: 'Write in a formal, traditional business tone.',
  };

  const emailTypeInstructions: Record<string, string> = {
    cv_introduction: `Write an email to introduce a dental professional candidate to this practice. Highlight their relevant experience and qualifications. The goal is to get the practice interested in the candidate for an interview. DO NOT include the candidate's name or contact details - use their reference number instead.`,
    availability_check: `Write an email to check if this dental practice has any current or upcoming staffing needs. Be professional and offer to help with their recruitment requirements.`,
    follow_up: `Write a follow-up email to check on the status of a previous conversation or candidate introduction.`,
    marketing: `Write a marketing email to promote our dental recruitment services to this practice. Make it compelling but not pushy.`,
    custom: `Write a professional recruitment email based on the context provided.`,
  };

  // If custom prompt is provided, it takes precedence
  const taskInstructions = customPrompt
    ? `THE RECRUITER'S SPECIFIC REQUEST:\n${customPrompt}\n\nFollow the recruiter's instructions above while maintaining professionalism.`
    : emailTypeInstructions[emailType] || emailTypeInstructions.custom;

  let prompt = `You are a professional UK dental recruitment consultant writing an email to a dental practice.

${toneInstructions[tone as keyof typeof toneInstructions] || toneInstructions.professional}

${taskInstructions}

PRACTICE/CLIENT INFORMATION:
- Practice Name: ${client.surgery_name}
${client.contact_name ? `- Contact Name: ${client.contact_name}` : ''}
${client.role_needed ? `- Role They Need: ${client.role_needed}` : ''}
${client.requirements ? `- Their Requirements: ${client.requirements}` : ''}
${client.pay_rate ? `- Pay Rate: ${client.pay_rate}` : ''}
${client.location ? `- Location: ${client.location}` : ''}
`;

  if (candidate) {
    prompt += `
CANDIDATE INFORMATION (for introduction):
- Reference Number: ${candidate.anonymous_reference}
- Role: ${candidate.role}
${candidate.experience ? `- Experience: ${candidate.experience}` : ''}
${candidate.skills?.length ? `- Skills: ${candidate.skills.join(', ')}` : ''}
${candidate.qualifications?.length ? `- Qualifications: ${candidate.qualifications.join(', ')}` : ''}
${candidate.salary_expectation ? `- Salary Expectation: ${candidate.salary_expectation}` : ''}
${candidate.availability ? `- Availability: ${candidate.availability}` : ''}
${candidate.cv_summary ? `- Professional Summary: ${candidate.cv_summary}` : ''}

IMPORTANT: Do NOT include the candidate's real name or personal contact details. Use only their reference number (${candidate.anonymous_reference}) when referring to them.
`;
  }

  prompt += `
IMPORTANT FORMATTING RULES:
1. Start your response with "SUBJECT: " followed by a clear, professional subject line
2. Then add a blank line
3. Then write the email body
4. Keep the email concise but informative (150-300 words)
5. Include a professional sign-off
6. CRITICAL: Use the ACTUAL practice name "${client.surgery_name}" in the email - do NOT use placeholders like [Practice Name] or [Surgery Name]
7. Sign the email as "The Locum Meds Recruitment Team"
${candidate ? `8. Mention that a redacted CV is attached (if applicable)` : ''}
9. NEVER use square bracket placeholders like [Name], [Practice], etc. Always use the real values provided above.

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
    subject = 'Dental Recruitment Opportunity';
    body = response;
  }

  return { subject, body };
}

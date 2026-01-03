import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface SendEmailRequest {
  // Accept both camelCase and snake_case
  to?: string;
  recipient_email?: string;
  toName?: string;
  recipient_name?: string;
  subject: string;
  htmlContent?: string;
  body_html?: string;
  textContent?: string;
  body_text?: string;
  candidateId?: string;
  candidate_id?: string;
  clientId?: string;
  client_id?: string;
  aiLogId?: string;
  ai_log_id?: string;
  attachments?: Array<{
    name: string;
    content: string; // Base64 encoded
    contentType: string;
  }>;
  replyTo?: string;
  reply_to?: string;
}

/**
 * POST /api/emails/send
 * Send email via Brevo API
 */
export async function POST(request: NextRequest) {
  try {
    const body: SendEmailRequest = await request.json();

    // Normalize field names (accept both camelCase and snake_case)
    const to = body.to || body.recipient_email;
    const toName = body.toName || body.recipient_name;
    const subject = body.subject;
    const htmlContent = body.htmlContent || body.body_html;
    const textContent = body.textContent || body.body_text;
    const candidateId = body.candidateId || body.candidate_id;
    const clientId = body.clientId || body.client_id;
    const aiLogId = body.aiLogId || body.ai_log_id;
    const attachments = body.attachments;
    const replyTo = body.replyTo || body.reply_to;

    // Validate required fields
    if (!to || !subject || !htmlContent) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: to, subject, htmlContent' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address format' },
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

    // Check for Brevo API key
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (!brevoApiKey) {
      return NextResponse.json(
        { success: false, error: 'Email service not configured. Please add BREVO_API_KEY.' },
        { status: 500 }
      );
    }

    // Get sender email from environment or default
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@locummeds.co.uk';
    const senderName = process.env.BREVO_SENDER_NAME || 'Locum Meds Recruitment';

    // Build Brevo API request
    const brevoPayload: Record<string, unknown> = {
      sender: {
        email: senderEmail,
        name: senderName,
      },
      to: [
        {
          email: to,
          name: toName || to.split('@')[0],
        },
      ],
      subject: subject,
      htmlContent: htmlContent,
    };

    // Add text content if provided
    if (textContent) {
      brevoPayload.textContent = textContent;
    }

    // Add reply-to if provided
    if (replyTo) {
      brevoPayload.replyTo = { email: replyTo };
    }

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      brevoPayload.attachment = attachments.map((att) => ({
        name: att.name,
        content: att.content,
        contentType: att.contentType,
      }));
    }

    // Send via Brevo API
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(brevoPayload),
    });

    const brevoResult = await brevoResponse.json();

    if (!brevoResponse.ok) {
      console.error('Brevo API error:', brevoResult);
      return NextResponse.json(
        {
          success: false,
          error: brevoResult.message || 'Failed to send email via Brevo',
          details: brevoResult,
        },
        { status: brevoResponse.status }
      );
    }

    // Log the sent email
    const { data: emailLog, error: logError } = await supabase
      .from('email_sends')
      .insert({
        user_id: user.id,
        candidate_id: candidateId || null,
        client_id: clientId || null,
        ai_log_id: aiLogId || null,
        recipient_email: to,
        recipient_name: toName || null,
        subject: subject,
        body_html: htmlContent,
        body_text: textContent || null,
        has_attachments: attachments && attachments.length > 0,
        attachment_count: attachments?.length || 0,
        brevo_message_id: brevoResult.messageId || null,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to log email send:', logError);
    }

    // Update AI log if provided
    if (aiLogId) {
      await supabase
        .from('ai_email_logs')
        .update({ sent: true })
        .eq('id', aiLogId);
    }

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
      messageId: brevoResult.messageId,
      emailLogId: emailLog?.id,
    });
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/emails/send
 * Get email send history for current user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get('candidate_id');
    const clientId = searchParams.get('client_id');
    const limit = parseInt(searchParams.get('limit') || '50');

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

    // Build query
    let query = supabase
      .from('email_sends')
      .select('*')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (candidateId) {
      query = query.eq('candidate_id', candidateId);
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data: emails, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: emails?.length || 0,
      emails,
    });
  } catch (error) {
    console.error('Email history error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch email history',
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface SendClientEmailRequest {
  client_id: string;
  candidate_id?: string;  // If attaching CV
  subject: string;
  body_html: string;
  body_text?: string;
  attach_redacted_cv?: boolean;
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
}

interface BrevoAttachment {
  content: string;  // Base64 encoded
  name: string;
}

/**
 * POST /api/emails/clients/send
 * Send email to a client (dental practice) via Brevo with optional redacted CV attachment
 */
export async function POST(request: NextRequest) {
  try {
    const body: SendClientEmailRequest = await request.json();
    const {
      client_id,
      candidate_id,
      subject,
      body_html,
      body_text,
      attach_redacted_cv = false,
      cc,
      bcc,
      reply_to,
    } = body;

    // Validation
    if (!client_id) {
      return NextResponse.json(
        { success: false, error: 'Client ID is required' },
        { status: 400 }
      );
    }

    if (!subject || !body_html) {
      return NextResponse.json(
        { success: false, error: 'Subject and body are required' },
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

    // Check client has email
    const clientEmail = client.client_email || client.email;
    if (!clientEmail) {
      return NextResponse.json(
        { success: false, error: 'Client has no email address' },
        { status: 400 }
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

    // Prepare attachments
    const attachments: BrevoAttachment[] = [];

    // Generate and attach redacted CV if requested
    if (attach_redacted_cv && candidate_id) {
      try {
        // Call our generate-redacted API to get the PDF
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const redactedResponse = await fetch(`${baseUrl}/api/cvs/generate-redacted`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ candidate_id }),
        });

        if (redactedResponse.ok) {
          const redactedData = await redactedResponse.json();
          if (redactedData.success && redactedData.base64) {
            attachments.push({
              content: redactedData.base64,
              name: redactedData.filename || `candidate_profile_${redactedData.anonymousReference}.pdf`,
            });
          }
        } else {
          console.warn('Failed to generate redacted CV, sending without attachment');
        }
      } catch (cvError) {
        console.error('Error generating redacted CV:', cvError);
        // Continue sending email without attachment
      }
    }

    // Prepare Brevo email payload
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'recruitment@locummeds.co.uk';
    const senderName = process.env.BREVO_SENDER_NAME || 'Locum Meds Recruitment';

    const brevoPayload: {
      sender: { email: string; name: string };
      to: { email: string; name?: string }[];
      subject: string;
      htmlContent: string;
      textContent?: string;
      cc?: { email: string }[];
      bcc?: { email: string }[];
      replyTo?: { email: string };
      attachment?: BrevoAttachment[];
    } = {
      sender: {
        email: senderEmail,
        name: senderName,
      },
      to: [
        {
          email: clientEmail,
          name: client.contact_name || client.surgery || client.name,
        },
      ],
      subject: subject,
      htmlContent: body_html,
    };

    // Add optional fields
    if (body_text) {
      brevoPayload.textContent = body_text;
    }

    if (cc && cc.length > 0) {
      brevoPayload.cc = cc.map(email => ({ email }));
    }

    if (bcc && bcc.length > 0) {
      brevoPayload.bcc = bcc.map(email => ({ email }));
    }

    if (reply_to) {
      brevoPayload.replyTo = { email: reply_to };
    }

    if (attachments.length > 0) {
      brevoPayload.attachment = attachments;
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

    if (!brevoResponse.ok) {
      const errorData = await brevoResponse.json().catch(() => ({}));
      console.error('Brevo API error:', errorData);
      return NextResponse.json(
        {
          success: false,
          error: `Email service error: ${errorData.message || brevoResponse.statusText}`,
        },
        { status: 500 }
      );
    }

    const brevoResult = await brevoResponse.json();

    // Log the email send
    const { data: logEntry, error: logError } = await supabase
      .from('email_sends')
      .insert({
        user_id: user.id,
        client_id: client_id,
        candidate_id: candidate_id || null,
        recipient_email: clientEmail,
        recipient_type: 'client',
        subject: subject,
        body_html: body_html,
        body_text: body_text || null,
        has_attachment: attachments.length > 0,
        attachment_count: attachments.length,
        brevo_message_id: brevoResult.messageId,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to log email send:', logError);
    }

    // Update ai_email_logs if this was an AI-generated email
    if (candidate_id) {
      await supabase
        .from('ai_email_logs')
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq('client_id', client_id)
        .eq('candidate_id', candidate_id)
        .eq('sent', false)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    return NextResponse.json({
      success: true,
      messageId: brevoResult.messageId,
      recipient: clientEmail,
      recipientName: client.surgery || client.name,
      hasAttachment: attachments.length > 0,
      attachmentCount: attachments.length,
      logId: logEntry?.id,
    });
  } catch (error) {
    console.error('Send client email error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      },
      { status: 500 }
    );
  }
}

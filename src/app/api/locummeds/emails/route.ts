import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/locummeds/emails
 * Get email logs for pipeline
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const userId = await verifyApiKey(supabase, apiKey);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const pipelineId = searchParams.get('pipeline_id');
    const emailType = searchParams.get('email_type');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('locummeds_email_logs')
      .select('*')
      .eq('user_id', userId)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (pipelineId) {
      query = query.eq('pipeline_id', pipelineId);
    }
    if (emailType) {
      query = query.eq('email_type', emailType);
    }

    const { data: emails, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: emails?.length || 0,
      emails,
    });

  } catch (error) {
    console.error('Emails GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/locummeds/emails
 * Send an email via Brevo and log it
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const body = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const userId = await verifyApiKey(supabase, apiKey);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const {
      pipeline_id,
      email_type,
      recipient_type,
      recipient_email,
      recipient_name,
      subject,
      template_id,
      template_variables = {},
      html_content,
      attachments = [],
    } = body;

    if (!pipeline_id || !email_type || !recipient_email || !subject) {
      return NextResponse.json({
        error: 'pipeline_id, email_type, recipient_email, and subject are required'
      }, { status: 400 });
    }

    // Prepare Brevo API request
    const brevoPayload: any = {
      sender: {
        name: 'Shebaz from LocumMeds',
        email: process.env.BREVO_SENDER_EMAIL || 'shebaz@locummeds.co.uk',
      },
      to: [{ email: recipient_email, name: recipient_name || recipient_email }],
      subject,
    };

    if (template_id) {
      brevoPayload.templateId = parseInt(template_id);
      brevoPayload.params = template_variables;
    } else if (html_content) {
      brevoPayload.htmlContent = html_content;
    }

    if (attachments.length > 0) {
      brevoPayload.attachment = attachments.map((a: any) => ({
        url: a.url,
        name: a.name,
      }));
    }

    // Send via Brevo API
    let brevoMessageId = null;
    let sendError = null;

    try {
      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': process.env.BREVO_API_KEY || '',
        },
        body: JSON.stringify(brevoPayload),
      });

      if (brevoResponse.ok) {
        const result = await brevoResponse.json();
        brevoMessageId = result.messageId;
      } else {
        const errorResult = await brevoResponse.json();
        sendError = errorResult.message || 'Failed to send email';
      }
    } catch (e) {
      sendError = e instanceof Error ? e.message : 'Email sending failed';
    }

    // Log the email attempt
    const { data: emailLog, error } = await supabase
      .from('locummeds_email_logs')
      .insert({
        user_id: userId,
        pipeline_id,
        email_type,
        recipient_type: recipient_type || 'unknown',
        recipient_email,
        recipient_name,
        subject,
        template_id,
        template_variables,
        brevo_message_id: brevoMessageId,
        sent_at: brevoMessageId ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to log email:', error);
    }

    // Log pipeline event
    await supabase.from('locummeds_pipeline_events').insert({
      pipeline_id,
      event_type: 'email_sent',
      event_data: {
        email_type,
        recipient_email,
        subject,
        brevo_message_id: brevoMessageId,
        error: sendError,
      },
      triggered_by: 'api',
    });

    if (sendError) {
      return NextResponse.json({
        success: false,
        error: sendError,
        email_log_id: emailLog?.id,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
      brevo_message_id: brevoMessageId,
      email_log: emailLog,
    });

  } catch (error) {
    console.error('Emails POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/locummeds/emails
 * Update email log (e.g., when response received)
 */
export async function PATCH(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const body = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const userId = await verifyApiKey(supabase, apiKey);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const {
      email_id,
      delivered_at,
      opened_at,
      clicked_at,
      bounced_at,
      bounce_reason,
      response_received_at,
      response_type,
      response_content,
    } = body;

    if (!email_id) {
      return NextResponse.json({ error: 'email_id required' }, { status: 400 });
    }

    const updates: any = {};
    if (delivered_at) updates.delivered_at = delivered_at;
    if (opened_at) updates.opened_at = opened_at;
    if (clicked_at) updates.clicked_at = clicked_at;
    if (bounced_at) updates.bounced_at = bounced_at;
    if (bounce_reason) updates.bounce_reason = bounce_reason;
    if (response_received_at) updates.response_received_at = response_received_at;
    if (response_type) updates.response_type = response_type;
    if (response_content) updates.response_content = response_content;

    const { data, error } = await supabase
      .from('locummeds_email_logs')
      .update(updates)
      .eq('id', email_id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      email: data,
    });

  } catch (error) {
    console.error('Emails PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update email' },
      { status: 500 }
    );
  }
}

async function verifyApiKey(supabase: any, apiKey: string): Promise<string | null> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const { data: keyData } = await supabase
    .from('locummeds_api_keys')
    .select('user_id')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (keyData) {
    await supabase
      .from('locummeds_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash);
  }

  return keyData?.user_id || null;
}

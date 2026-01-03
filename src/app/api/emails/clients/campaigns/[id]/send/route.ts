import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface BrevoAttachment {
  content: string;
  name: string;
}

/**
 * POST /api/emails/clients/campaigns/[id]/send
 * Start sending a campaign to all recipients
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Fetch campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('client_email_campaigns')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check campaign status
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return NextResponse.json(
        { success: false, error: `Campaign cannot be sent (status: ${campaign.status})` },
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

    // Update campaign status to sending
    await supabase
      .from('client_email_campaigns')
      .update({
        status: 'sending',
        started_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Fetch pending recipients
    const { data: recipients, error: recipientsError } = await supabase
      .from('client_campaign_recipients')
      .select('*')
      .eq('campaign_id', id)
      .eq('status', 'pending');

    if (recipientsError || !recipients || recipients.length === 0) {
      await supabase
        .from('client_email_campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);

      return NextResponse.json({
        success: true,
        message: 'No pending recipients to send to',
        sent: 0,
        failed: 0,
      });
    }

    // Prepare CV attachment if needed
    let cvAttachment: BrevoAttachment | null = null;
    if (campaign.attach_cv && campaign.candidate_id) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const redactedResponse = await fetch(`${baseUrl}/api/cvs/generate-redacted`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ candidate_id: campaign.candidate_id }),
        });

        if (redactedResponse.ok) {
          const redactedData = await redactedResponse.json();
          if (redactedData.success && redactedData.base64) {
            cvAttachment = {
              content: redactedData.base64,
              name: redactedData.filename || `candidate_profile.pdf`,
            };
          }
        }
      } catch (cvError) {
        console.error('Error generating CV for campaign:', cvError);
      }
    }

    // Sender details
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'recruitment@locummeds.co.uk';
    const senderName = process.env.BREVO_SENDER_NAME || 'Locum Meds Recruitment';

    let sentCount = 0;
    let failedCount = 0;
    const errors: { email: string; error: string }[] = [];

    // Send emails with rate limiting (max 10 per second for Brevo)
    for (const recipient of recipients) {
      try {
        // Personalize email content
        const personalizedHtml = campaign.body_html
          .replace(/\{\{surgery_name\}\}/g, recipient.surgery_name || 'there')
          .replace(/\{\{client_name\}\}/g, recipient.surgery_name || 'there');

        const personalizedText = campaign.body_text
          ? campaign.body_text
              .replace(/\{\{surgery_name\}\}/g, recipient.surgery_name || 'there')
              .replace(/\{\{client_name\}\}/g, recipient.surgery_name || 'there')
          : undefined;

        // Build Brevo payload
        const brevoPayload: {
          sender: { email: string; name: string };
          to: { email: string; name?: string }[];
          subject: string;
          htmlContent: string;
          textContent?: string;
          attachment?: BrevoAttachment[];
        } = {
          sender: { email: senderEmail, name: senderName },
          to: [{ email: recipient.client_email, name: recipient.surgery_name }],
          subject: campaign.subject,
          htmlContent: personalizedHtml,
        };

        if (personalizedText) {
          brevoPayload.textContent = personalizedText;
        }

        if (cvAttachment) {
          brevoPayload.attachment = [cvAttachment];
        }

        // Send via Brevo
        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify(brevoPayload),
        });

        if (brevoResponse.ok) {
          const result = await brevoResponse.json();

          // Update recipient status
          await supabase
            .from('client_campaign_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              brevo_message_id: result.messageId,
            })
            .eq('id', recipient.id);

          sentCount++;
        } else {
          const errorData = await brevoResponse.json().catch(() => ({}));
          throw new Error(errorData.message || brevoResponse.statusText);
        }

        // Rate limiting: small delay between emails
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (sendError) {
        const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error';

        // Update recipient status to failed
        await supabase
          .from('client_campaign_recipients')
          .update({
            status: 'failed',
            error_message: errorMessage,
          })
          .eq('id', recipient.id);

        failedCount++;
        errors.push({ email: recipient.client_email, error: errorMessage });
      }
    }

    // Update campaign status
    const finalStatus = failedCount === recipients.length ? 'failed' : 'completed';
    await supabase
      .from('client_email_campaigns')
      .update({
        status: finalStatus,
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({
      success: true,
      campaignId: id,
      status: finalStatus,
      sent: sentCount,
      failed: failedCount,
      total: recipients.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Send campaign error:', error);

    // Try to update campaign status to failed
    try {
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

      const { id } = await params;
      await supabase
        .from('client_email_campaigns')
        .update({ status: 'failed' })
        .eq('id', id);
    } catch (updateError) {
      console.error('Failed to update campaign status:', updateError);
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send campaign',
      },
      { status: 500 }
    );
  }
}

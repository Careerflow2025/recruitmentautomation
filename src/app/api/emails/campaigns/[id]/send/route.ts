import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface CampaignRecipient {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

/**
 * POST /api/emails/campaigns/[id]/send
 * Send a campaign to all recipients via Brevo
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;

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

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check campaign status
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      return NextResponse.json(
        { success: false, error: `Cannot send campaign with status: ${campaign.status}` },
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

    // Get sender email from environment
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@locummeds.co.uk';
    const senderName = process.env.BREVO_SENDER_NAME || 'Locum Meds Recruitment';

    // Get candidates with emails
    const { data: candidates, error: candidatesError } = await supabase
      .from('candidates')
      .select('id, email, first_name, last_name')
      .eq('user_id', user.id)
      .in('id', campaign.selected_candidate_ids || []);

    if (candidatesError) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch candidates' },
        { status: 500 }
      );
    }

    // Filter candidates with valid emails
    const recipients: CampaignRecipient[] = (candidates || [])
      .filter(c => c.email)
      .map(c => ({
        id: c.id,
        email: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
      }));

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No recipients have email addresses' },
        { status: 400 }
      );
    }

    // Check for unsubscribes
    const { data: unsubscribes } = await supabase
      .from('email_unsubscribes')
      .select('email')
      .eq('user_id', user.id);

    const unsubscribedEmails = new Set((unsubscribes || []).map(u => u.email.toLowerCase()));
    const activeRecipients = recipients.filter(r => !unsubscribedEmails.has(r.email.toLowerCase()));

    // Update campaign status to sending
    await supabase
      .from('email_campaigns')
      .update({
        status: 'sending',
        started_at: new Date().toISOString(),
        total_recipients: activeRecipients.length,
      })
      .eq('id', campaignId);

    // Send emails in batches
    const results = {
      sent: 0,
      failed: 0,
      skipped: recipients.length - activeRecipients.length,
      errors: [] as string[],
    };

    // Create campaign recipients records
    const recipientRecords = activeRecipients.map(r => ({
      campaign_id: campaignId,
      candidate_id: r.id,
      email: r.email,
      name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || null,
      status: 'pending',
    }));

    await supabase.from('campaign_recipients').insert(recipientRecords);

    // Send emails via Brevo (batch of 10 at a time)
    const batchSize = 10;
    for (let i = 0; i < activeRecipients.length; i += batchSize) {
      const batch = activeRecipients.slice(i, i + batchSize);

      const sendPromises = batch.map(async (recipient) => {
        try {
          // Personalize email body with variables
          const personalizedBody = campaign.body_html
            .replace(/\{\{candidate_name\}\}/gi, `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim())
            .replace(/\{\{first_name\}\}/gi, recipient.first_name || '')
            .replace(/\{\{last_name\}\}/gi, recipient.last_name || '');

          const personalizedSubject = campaign.subject
            .replace(/\{\{candidate_name\}\}/gi, `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim())
            .replace(/\{\{first_name\}\}/gi, recipient.first_name || '')
            .replace(/\{\{last_name\}\}/gi, recipient.last_name || '');

          // Send via Brevo
          const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'api-key': brevoApiKey,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              sender: { email: senderEmail, name: senderName },
              to: [{ email: recipient.email, name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || recipient.email }],
              subject: personalizedSubject,
              htmlContent: personalizedBody,
            }),
          });

          const brevoResult = await brevoResponse.json();

          if (brevoResponse.ok) {
            // Update recipient status
            await supabase
              .from('campaign_recipients')
              .update({
                status: 'sent',
                brevo_message_id: brevoResult.messageId || null,
                sent_at: new Date().toISOString(),
              })
              .eq('campaign_id', campaignId)
              .eq('candidate_id', recipient.id);

            // Log to email_sends
            await supabase.from('email_sends').insert({
              user_id: user.id,
              campaign_id: campaignId,
              candidate_id: recipient.id,
              recipient_email: recipient.email,
              recipient_name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || null,
              email_type: 'campaign',
              subject: personalizedSubject,
              body_html: personalizedBody,
              brevo_message_id: brevoResult.messageId || null,
              status: 'sent',
              sent_at: new Date().toISOString(),
            });

            results.sent++;
          } else {
            // Update recipient with error
            await supabase
              .from('campaign_recipients')
              .update({
                status: 'failed',
                error_message: brevoResult.message || 'Send failed',
              })
              .eq('campaign_id', campaignId)
              .eq('candidate_id', recipient.id);

            results.failed++;
            results.errors.push(`${recipient.email}: ${brevoResult.message}`);
          }
        } catch (err) {
          results.failed++;
          results.errors.push(`${recipient.email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      });

      // Wait for batch to complete
      await Promise.all(sendPromises);
    }

    // Update campaign with final stats
    const finalStatus = results.failed === activeRecipients.length ? 'cancelled' : 'completed';
    await supabase
      .from('email_campaigns')
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        sent_count: results.sent,
      })
      .eq('id', campaignId);

    return NextResponse.json({
      success: true,
      campaignId,
      results: {
        totalRecipients: recipients.length,
        activeRecipients: activeRecipients.length,
        sent: results.sent,
        failed: results.failed,
        skippedUnsubscribed: results.skipped,
        errors: results.errors.slice(0, 10), // Limit error details
      },
    });
  } catch (error) {
    console.error('Campaign send error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send campaign',
      },
      { status: 500 }
    );
  }
}

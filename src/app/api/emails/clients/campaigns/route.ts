import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface CreateCampaignRequest {
  name: string;
  client_ids: string[];
  subject: string;
  body_html: string;
  body_text?: string;
  candidate_id?: string;  // For CV attachment
  attach_redacted_cv?: boolean;
  schedule_at?: string;  // ISO date string for scheduled sending
}

interface Campaign {
  id: string;
  user_id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';
  subject: string;
  body_html: string;
  body_text?: string;
  candidate_id?: string;
  attach_cv: boolean;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

/**
 * POST /api/emails/clients/campaigns
 * Create a new bulk email campaign for clients
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateCampaignRequest = await request.json();
    const {
      name,
      client_ids,
      subject,
      body_html,
      body_text,
      candidate_id,
      attach_redacted_cv = false,
      schedule_at,
    } = body;

    // Validation
    if (!name || name.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'Campaign name is required (at least 3 characters)' },
        { status: 400 }
      );
    }

    if (!client_ids || client_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one client must be selected' },
        { status: 400 }
      );
    }

    if (!subject || !body_html) {
      return NextResponse.json(
        { success: false, error: 'Subject and email body are required' },
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

    // Verify all clients exist and have emails
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, surgery, client_email')
      .in('id', client_ids)
      .eq('user_id', user.id);

    if (clientsError || !clients) {
      return NextResponse.json(
        { success: false, error: 'Failed to verify clients' },
        { status: 500 }
      );
    }

    // Filter to only clients with emails
    const validClients = clients.filter(c => c.client_email);
    if (validClients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No selected clients have email addresses' },
        { status: 400 }
      );
    }

    // Create the campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('client_email_campaigns')
      .insert({
        user_id: user.id,
        name: name.trim(),
        status: schedule_at ? 'scheduled' : 'draft',
        subject: subject,
        body_html: body_html,
        body_text: body_text || null,
        candidate_id: candidate_id || null,
        attach_cv: attach_redacted_cv,
        total_recipients: validClients.length,
        sent_count: 0,
        failed_count: 0,
        scheduled_at: schedule_at || null,
      })
      .select()
      .single();

    if (campaignError || !campaign) {
      console.error('Failed to create campaign:', campaignError);
      return NextResponse.json(
        { success: false, error: 'Failed to create campaign' },
        { status: 500 }
      );
    }

    // Create campaign recipients
    const recipients = validClients.map(client => ({
      campaign_id: campaign.id,
      client_id: client.id,
      client_email: client.client_email,
      surgery_name: client.surgery,
      status: 'pending',
    }));

    const { error: recipientsError } = await supabase
      .from('client_campaign_recipients')
      .insert(recipients);

    if (recipientsError) {
      console.error('Failed to create campaign recipients:', recipientsError);
      // Rollback campaign creation
      await supabase.from('client_email_campaigns').delete().eq('id', campaign.id);
      return NextResponse.json(
        { success: false, error: 'Failed to add campaign recipients' },
        { status: 500 }
      );
    }

    const skippedCount = client_ids.length - validClients.length;

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalRecipients: validClients.length,
        skippedNoEmail: skippedCount,
      },
      message: skippedCount > 0
        ? `Campaign created. ${skippedCount} client(s) skipped (no email address).`
        : 'Campaign created successfully.',
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create campaign',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/emails/clients/campaigns
 * List all campaigns for the user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

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
      .from('client_email_campaigns')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: campaigns, error: campaignsError, count } = await query;

    if (campaignsError) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch campaigns' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      campaigns: campaigns || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('List campaigns error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list campaigns',
      },
      { status: 500 }
    );
  }
}

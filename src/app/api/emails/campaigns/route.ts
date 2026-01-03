import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface CreateCampaignRequest {
  name: string;
  template_id?: string;
  subject: string;
  body_html: string;
  candidate_ids: string[];
  target_criteria?: Record<string, unknown>;
  scheduled_at?: string;
}

/**
 * POST /api/emails/campaigns
 * Create a new email campaign
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateCampaignRequest = await request.json();
    const { name, template_id, subject, body_html, candidate_ids, target_criteria, scheduled_at } = body;

    // Validate required fields
    if (!name || !subject || !body_html) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, subject, body_html' },
        { status: 400 }
      );
    }

    if (!candidate_ids || candidate_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one candidate must be selected' },
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

    // Get candidate emails for validation
    const { data: candidates, error: candidatesError } = await supabase
      .from('candidates')
      .select('id, email, first_name, last_name')
      .eq('user_id', user.id)
      .in('id', candidate_ids);

    if (candidatesError) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch candidates' },
        { status: 500 }
      );
    }

    // Filter candidates with valid emails
    const validCandidates = candidates?.filter(c => c.email) || [];
    if (validCandidates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No selected candidates have email addresses' },
        { status: 400 }
      );
    }

    // Create campaign
    const campaignData = {
      user_id: user.id,
      name,
      status: scheduled_at ? 'scheduled' : 'draft',
      template_id: template_id || null,
      subject,
      body_html,
      target_criteria: target_criteria || null,
      selected_candidate_ids: candidate_ids,
      total_recipients: validCandidates.length,
      scheduled_at: scheduled_at || null,
      sent_count: 0,
      delivered_count: 0,
      opened_count: 0,
      clicked_count: 0,
      bounced_count: 0,
      unsubscribed_count: 0,
    };

    const { data: campaign, error: createError } = await supabase
      .from('email_campaigns')
      .insert(campaignData)
      .select()
      .single();

    if (createError) {
      console.error('Failed to create campaign:', createError);
      return NextResponse.json(
        { success: false, error: 'Failed to create campaign' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      campaign,
      validRecipients: validCandidates.length,
      skippedNoEmail: candidate_ids.length - validCandidates.length,
    });
  } catch (error) {
    console.error('Campaign creation error:', error);
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
 * GET /api/emails/campaigns
 * List all campaigns for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
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
      .from('email_campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: campaigns?.length || 0,
      campaigns,
    });
  } catch (error) {
    console.error('Campaign list error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch campaigns',
      },
      { status: 500 }
    );
  }
}

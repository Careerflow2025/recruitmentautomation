import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/locummeds/matches
 * Get matching clients for a candidate or candidates for a client
 *
 * Query params:
 * - candidate_id: Find matching clients for this candidate
 * - client_id: Find matching candidates for this client
 * - max_commute: Maximum commute time in minutes (default 60)
 * - limit: Max results (default 10)
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

    const candidateId = searchParams.get('candidate_id');
    const clientId = searchParams.get('client_id');
    const maxCommute = parseInt(searchParams.get('max_commute') || '60');
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!candidateId && !clientId) {
      return NextResponse.json({
        error: 'Either candidate_id or client_id required'
      }, { status: 400 });
    }

    // Get existing matches from matches table
    let query = supabase
      .from('matches')
      .select(`
        *,
        candidate:candidates!matches_candidate_id_fkey(
          id, first_name, last_name, role, postcode, phone, email
        ),
        client:clients!matches_client_id_fkey(
          id, surgery, client_name, role, postcode, client_phone, client_email
        )
      `)
      .eq('user_id', userId)
      .lte('commute_minutes', maxCommute)
      .limit(limit);

    if (candidateId) {
      query = query.eq('candidate_id', candidateId);
    }
    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data: matches, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: matches?.length || 0,
      matches,
    });

  } catch (error) {
    console.error('Matches GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/locummeds/matches
 * Create a match and update pipeline
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
      candidate_id,
      client_id,
      commute_minutes,
    } = body;

    if (!pipeline_id || !candidate_id || !client_id) {
      return NextResponse.json({
        error: 'pipeline_id, candidate_id, and client_id are required'
      }, { status: 400 });
    }

    // Get current pipeline status
    const { data: pipeline } = await supabase
      .from('locummeds_pipeline')
      .select('status')
      .eq('id', pipeline_id)
      .eq('user_id', userId)
      .single();

    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    const previousStatus = pipeline.status;

    // Update pipeline with client match
    const { data, error } = await supabase
      .from('locummeds_pipeline')
      .update({
        client_id,
        status: 'matched',
        status_updated_at: new Date().toISOString(),
        commute_minutes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pipeline_id)
      .select(`
        *,
        candidate:candidates!locummeds_pipeline_candidate_id_fkey(*),
        client:clients!locummeds_pipeline_client_id_fkey(*)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log event
    await supabase.from('locummeds_pipeline_events').insert({
      pipeline_id,
      event_type: 'candidate_matched',
      from_status: previousStatus,
      to_status: 'matched',
      event_data: {
        candidate_id,
        client_id,
        commute_minutes,
      },
      triggered_by: 'api',
    });

    return NextResponse.json({
      success: true,
      pipeline: data,
    });

  } catch (error) {
    console.error('Matches POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create match' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/locummeds/matches/find
 * Find potential matches for an available candidate
 * Uses role matching and postcode proximity
 */
export async function PUT(request: NextRequest) {
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
      candidate_id,
      max_commute = 60,
      limit = 10,
    } = body;

    if (!candidate_id) {
      return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });
    }

    // Get candidate details
    const { data: candidate } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', candidate_id)
      .eq('user_id', userId)
      .single();

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Find clients with matching role
    const { data: potentialClients } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .ilike('role', `%${candidate.role}%`);

    if (!potentialClients || potentialClients.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        matches: [],
        message: 'No clients found with matching role requirements',
      });
    }

    // Check existing matches for commute times
    const { data: existingMatches } = await supabase
      .from('matches')
      .select('client_id, commute_minutes')
      .eq('candidate_id', candidate_id)
      .eq('user_id', userId)
      .lte('commute_minutes', max_commute);

    const matchedClientIds = new Set(
      existingMatches?.map(m => m.client_id) || []
    );

    // Filter and sort potential clients by existing commute data
    const rankedClients = potentialClients
      .map(client => {
        const existing = existingMatches?.find(m => m.client_id === client.id);
        return {
          ...client,
          commute_minutes: existing?.commute_minutes || null,
          has_existing_match: matchedClientIds.has(client.id),
        };
      })
      .filter(c => c.has_existing_match || c.commute_minutes === null)
      .sort((a, b) => {
        if (a.commute_minutes !== null && b.commute_minutes !== null) {
          return a.commute_minutes - b.commute_minutes;
        }
        if (a.commute_minutes !== null) return -1;
        if (b.commute_minutes !== null) return 1;
        return 0;
      })
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      count: rankedClients.length,
      candidate: {
        id: candidate.id,
        name: `${candidate.first_name} ${candidate.last_name}`,
        role: candidate.role,
        postcode: candidate.postcode,
      },
      potential_matches: rankedClients.map(c => ({
        client_id: c.id,
        surgery: c.surgery,
        client_name: c.client_name,
        role: c.role,
        postcode: c.postcode,
        commute_minutes: c.commute_minutes,
        needs_commute_calculation: c.commute_minutes === null,
      })),
    });

  } catch (error) {
    console.error('Find matches error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to find matches' },
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

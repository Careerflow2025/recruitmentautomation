import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/locummeds/clients
 * Get all clients (surgeries) with their active job requirements
 *
 * Query params:
 * - role: Filter by role needed
 * - postcode: Filter by postcode prefix
 * - limit: Max results (default 100)
 * - offset: Pagination offset
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

    // Build query
    let query = supabase
      .from('clients')
      .select(`
        *,
        pipeline:locummeds_pipeline(
          id,
          candidate_id,
          status,
          interview_scheduled_at
        )
      `)
      .eq('user_id', userId);

    // Apply filters
    const role = searchParams.get('role');
    const postcode = searchParams.get('postcode');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (role) {
      query = query.ilike('role', `%${role}%`);
    }
    if (postcode) {
      query = query.ilike('postcode', `${postcode}%`);
    }

    query = query.order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: clients, error } = await query;

    if (error) {
      console.error('Error fetching clients:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: clients?.length || 0,
      clients,
    });

  } catch (error) {
    console.error('Clients API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/locummeds/clients/[id]
 * Get single client with full details
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

    const { client_id } = body;

    if (!client_id) {
      return NextResponse.json({ error: 'client_id required' }, { status: 400 });
    }

    // Get client with all related data
    const { data: client, error } = await supabase
      .from('clients')
      .select(`
        *,
        pipeline:locummeds_pipeline(
          *,
          candidate:candidates!locummeds_pipeline_candidate_id_fkey(
            id, first_name, last_name, role, postcode
          ),
          events:locummeds_pipeline_events(*)
        )
      `)
      .eq('id', client_id)
      .eq('user_id', userId)
      .single();

    if (error || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      client,
    });

  } catch (error) {
    console.error('Get client error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get client' },
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

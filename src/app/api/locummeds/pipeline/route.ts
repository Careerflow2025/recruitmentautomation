import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/locummeds/pipeline
 * Get pipeline entries with filters
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

    const status = searchParams.get('status');
    const candidateId = searchParams.get('candidate_id');
    const limit = parseInt(searchParams.get('limit') || '100');

    let query = supabase
      .from('locummeds_pipeline')
      .select(`
        *,
        candidate:candidates!locummeds_pipeline_candidate_id_fkey(
          id, first_name, last_name, phone, email, role, postcode
        ),
        client:clients!locummeds_pipeline_client_id_fkey(
          id, surgery, client_name, client_phone, client_email, role, postcode
        ),
        scheduled_calls:locummeds_scheduled_calls(
          id, call_type, scheduled_for, status, attempts
        ),
        events:locummeds_pipeline_events(
          id, event_type, from_status, to_status, created_at
        )
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }
    if (candidateId) {
      query = query.eq('candidate_id', candidateId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      pipeline: data,
    });

  } catch (error) {
    console.error('Pipeline GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch pipeline' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/locummeds/pipeline
 * Create new pipeline entry for a candidate
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

    const { candidate_id, status = 'new', ...rest } = body;

    if (!candidate_id) {
      return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });
    }

    // Check if pipeline entry already exists
    const { data: existing } = await supabase
      .from('locummeds_pipeline')
      .select('id')
      .eq('user_id', userId)
      .eq('candidate_id', candidate_id)
      .is('client_id', null)
      .single();

    if (existing) {
      return NextResponse.json({
        success: true,
        message: 'Pipeline entry already exists',
        pipeline_id: existing.id,
      });
    }

    // Create new pipeline entry
    const { data, error } = await supabase
      .from('locummeds_pipeline')
      .insert({
        user_id: userId,
        candidate_id,
        status,
        ...rest,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log event
    await supabase.from('locummeds_pipeline_events').insert({
      pipeline_id: data.id,
      event_type: 'pipeline_created',
      to_status: status,
      triggered_by: 'api',
      event_data: { candidate_id },
    });

    return NextResponse.json({
      success: true,
      pipeline: data,
    });

  } catch (error) {
    console.error('Pipeline POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create pipeline' },
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
    // Update last used
    await supabase
      .from('locummeds_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash);
  }

  return keyData?.user_id || null;
}

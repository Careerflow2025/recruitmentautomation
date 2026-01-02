import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/locummeds/candidates
 * Get all candidates with their pipeline status
 *
 * Query params:
 * - status: Filter by pipeline status
 * - role: Filter by role
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

    // Verify API key and get user_id
    const { data: keyData, error: keyError } = await supabase
      .from('locummeds_api_keys')
      .select('user_id')
      .eq('key_hash', await hashApiKey(apiKey))
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const userId = keyData.user_id;

    // Build query
    let query = supabase
      .from('candidates')
      .select(`
        *,
        pipeline:locummeds_pipeline(
          id,
          status,
          status_updated_at,
          right_to_work,
          dbs_valid,
          registration_type,
          registration_number,
          registration_verified,
          available_days,
          expected_hourly_rate,
          callback_scheduled_at
        )
      `)
      .eq('user_id', userId);

    // Apply filters
    const status = searchParams.get('status');
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

    query = query.order('added_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: candidates, error } = await query;

    if (error) {
      console.error('Error fetching candidates:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by pipeline status if specified
    let filteredCandidates = candidates;
    if (status) {
      filteredCandidates = candidates?.filter((c: any) => {
        if (status === 'new') {
          return !c.pipeline || c.pipeline.length === 0;
        }
        return c.pipeline?.some((p: any) => p.status === status);
      });
    }

    // Update last used timestamp for API key
    await supabase
      .from('locummeds_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', await hashApiKey(apiKey));

    return NextResponse.json({
      success: true,
      count: filteredCandidates?.length || 0,
      candidates: filteredCandidates,
    });

  } catch (error) {
    console.error('Candidates API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch candidates' },
      { status: 500 }
    );
  }
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

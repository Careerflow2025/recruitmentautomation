import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/locummeds/candidates/[id]
 * Get single candidate with full details and pipeline history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Verify API key
    const { data: keyData } = await supabase
      .from('locummeds_api_keys')
      .select('user_id')
      .eq('key_hash', await hashApiKey(apiKey))
      .eq('is_active', true)
      .single();

    if (!keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Get candidate with all related data
    const { data: candidate, error } = await supabase
      .from('candidates')
      .select(`
        *,
        pipeline:locummeds_pipeline(*),
        cv:candidate_cvs(*),
        notes:candidate_notes(*)
      `)
      .eq('id', id)
      .eq('user_id', keyData.user_id)
      .single();

    if (error || !candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Get role salary info for fee calculation
    const { data: salaryData } = await supabase
      .from('uk_role_salaries')
      .select('*')
      .ilike('role', `%${candidate.role}%`)
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      candidate: {
        ...candidate,
        salary_info: salaryData,
      },
    });

  } catch (error) {
    console.error('Get candidate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get candidate' },
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

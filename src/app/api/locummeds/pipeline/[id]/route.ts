import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['calling'],
  calling: ['available', 'no_answer', 'not_interested', 'callback_scheduled'],
  no_answer: ['calling', 'available', 'not_interested'],
  callback_scheduled: ['calling', 'available', 'not_interested'],
  available: ['matched', 'not_now'],
  not_now: ['calling', 'available'],
  matched: ['cv_sent'],
  cv_sent: ['client_approved', 'rejected'],
  client_approved: ['terms_sent_client'],
  terms_sent_client: ['terms_accepted_client', 'rejected'],
  terms_accepted_client: ['terms_sent_candidate'],
  terms_sent_candidate: ['terms_accepted_candidate', 'rejected'],
  terms_accepted_candidate: ['interview_scheduling'],
  interview_scheduling: ['interview_scheduled', 'rejected'],
  interview_scheduled: ['interview_confirmed', 'cancelled'],
  interview_confirmed: ['interview_completed', 'cancelled'],
  interview_completed: ['placed', 'rejected'],
  placed: [],
  rejected: [],
  cancelled: [],
};

/**
 * GET /api/locummeds/pipeline/[id]
 * Get single pipeline entry with full details
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
    const userId = await verifyApiKey(supabase, apiKey);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const { data: pipeline, error } = await supabase
      .from('locummeds_pipeline')
      .select(`
        *,
        candidate:candidates!locummeds_pipeline_candidate_id_fkey(*),
        client:clients!locummeds_pipeline_client_id_fkey(*),
        cv:candidate_cvs(*),
        scheduled_calls:locummeds_scheduled_calls(*),
        call_logs:locummeds_call_logs(*),
        email_logs:locummeds_email_logs(*),
        events:locummeds_pipeline_events(*)
      `)
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Get valid next statuses
    const currentStatus = pipeline.status;
    const validNextStatuses = VALID_TRANSITIONS[currentStatus] || [];

    return NextResponse.json({
      success: true,
      pipeline,
      valid_transitions: validNextStatuses,
    });

  } catch (error) {
    console.error('Pipeline GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get pipeline' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/locummeds/pipeline/[id]
 * Update pipeline status and fields
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Get current pipeline
    const { data: existing } = await supabase
      .from('locummeds_pipeline')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    const { status: newStatus, ...otherFields } = body;
    const updates: any = {
      ...otherFields,
      updated_at: new Date().toISOString(),
    };

    // Validate status transition if status is being changed
    if (newStatus && newStatus !== existing.status) {
      const validTransitions = VALID_TRANSITIONS[existing.status] || [];

      if (!validTransitions.includes(newStatus)) {
        return NextResponse.json({
          error: `Invalid status transition from '${existing.status}' to '${newStatus}'`,
          valid_transitions: validTransitions,
        }, { status: 400 });
      }

      updates.status = newStatus;
      updates.status_updated_at = new Date().toISOString();

      // Auto-set timestamps based on status
      switch (newStatus) {
        case 'cv_sent':
          updates.cv_sent_at = new Date().toISOString();
          break;
        case 'client_approved':
          updates.client_approved_at = new Date().toISOString();
          break;
        case 'terms_sent_client':
          updates.client_terms_sent_at = new Date().toISOString();
          break;
        case 'terms_accepted_client':
          updates.client_terms_accepted_at = new Date().toISOString();
          break;
        case 'terms_sent_candidate':
          updates.candidate_terms_sent_at = new Date().toISOString();
          break;
        case 'terms_accepted_candidate':
          updates.candidate_terms_accepted_at = new Date().toISOString();
          break;
        case 'interview_completed':
          updates.interview_completed_at = new Date().toISOString();
          break;
      }
    }

    const { data, error } = await supabase
      .from('locummeds_pipeline')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        candidate:candidates!locummeds_pipeline_candidate_id_fkey(*),
        client:clients!locummeds_pipeline_client_id_fkey(*)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log status change event
    if (newStatus && newStatus !== existing.status) {
      await supabase.from('locummeds_pipeline_events').insert({
        pipeline_id: id,
        event_type: 'status_change',
        from_status: existing.status,
        to_status: newStatus,
        event_data: otherFields,
        triggered_by: 'api',
      });
    }

    return NextResponse.json({
      success: true,
      pipeline: data,
      previous_status: existing.status,
      new_status: data.status,
    });

  } catch (error) {
    console.error('Pipeline PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update pipeline' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/locummeds/pipeline/[id]
 * Soft delete / cancel pipeline entry
 */
export async function DELETE(
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
    const userId = await verifyApiKey(supabase, apiKey);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Get current pipeline
    const { data: existing } = await supabase
      .from('locummeds_pipeline')
      .select('status')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Update to cancelled status
    const { data, error } = await supabase
      .from('locummeds_pipeline')
      .update({
        status: 'cancelled',
        status_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Cancel any pending calls
    await supabase
      .from('locummeds_scheduled_calls')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('pipeline_id', id)
      .eq('status', 'pending');

    // Log event
    await supabase.from('locummeds_pipeline_events').insert({
      pipeline_id: id,
      event_type: 'pipeline_cancelled',
      from_status: existing.status,
      to_status: 'cancelled',
      triggered_by: 'api',
    });

    return NextResponse.json({
      success: true,
      message: 'Pipeline cancelled',
      pipeline: data,
    });

  } catch (error) {
    console.error('Pipeline DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel pipeline' },
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

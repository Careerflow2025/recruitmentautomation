import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/locummeds/calls
 * Get scheduled calls with filters
 *
 * Query params:
 * - status: 'pending', 'in_progress', 'completed', 'failed'
 * - call_type: Filter by call type
 * - limit: Max results (default 50)
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
    const callType = searchParams.get('call_type');
    const limit = parseInt(searchParams.get('limit') || '50');
    const pendingOnly = searchParams.get('pending_only') === 'true';

    let query = supabase
      .from('locummeds_scheduled_calls')
      .select(`
        *,
        pipeline:locummeds_pipeline(
          id,
          candidate_id,
          client_id,
          status,
          candidate:candidates!locummeds_pipeline_candidate_id_fkey(
            id, first_name, last_name, phone, role
          ),
          client:clients!locummeds_pipeline_client_id_fkey(
            id, surgery, client_name, client_phone
          )
        )
      `)
      .eq('user_id', userId)
      .order('priority', { ascending: true })
      .order('scheduled_for', { ascending: true })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }
    if (callType) {
      query = query.eq('call_type', callType);
    }
    if (pendingOnly) {
      query = query.eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString());
    }

    const { data: calls, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: calls?.length || 0,
      calls,
    });

  } catch (error) {
    console.error('Calls GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch calls' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/locummeds/calls
 * Schedule a new call
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
      call_type,
      phone_number,
      contact_name,
      is_candidate = true,
      scheduled_for,
      priority = 5,
      script_type,
      script_variables = {},
    } = body;

    if (!pipeline_id || !call_type || !phone_number || !script_type) {
      return NextResponse.json({
        error: 'pipeline_id, call_type, phone_number, and script_type are required'
      }, { status: 400 });
    }

    // Create scheduled call
    const { data, error } = await supabase
      .from('locummeds_scheduled_calls')
      .insert({
        user_id: userId,
        pipeline_id,
        call_type,
        phone_number,
        contact_name,
        is_candidate,
        scheduled_for: scheduled_for || new Date().toISOString(),
        priority,
        script_type,
        script_variables,
        status: 'pending',
        attempts: 0,
        max_attempts: 24, // 12 hours at 30min intervals
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log event
    await supabase.from('locummeds_pipeline_events').insert({
      pipeline_id,
      event_type: 'call_scheduled',
      event_data: {
        call_id: data.id,
        call_type,
        scheduled_for: data.scheduled_for,
      },
      triggered_by: 'api',
    });

    return NextResponse.json({
      success: true,
      call: data,
    });

  } catch (error) {
    console.error('Calls POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to schedule call' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/locummeds/calls
 * Update call status/result
 */
export async function PATCH(request: NextRequest) {
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
      call_id,
      status,
      outcome,
      twilio_call_sid,
      recording_url,
      transcript,
      extracted_data,
      call_duration_seconds,
    } = body;

    if (!call_id) {
      return NextResponse.json({ error: 'call_id required' }, { status: 400 });
    }

    // Get current call
    const { data: existingCall } = await supabase
      .from('locummeds_scheduled_calls')
      .select('*, pipeline:locummeds_pipeline(id, status)')
      .eq('id', call_id)
      .eq('user_id', userId)
      .single();

    if (!existingCall) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (status) updates.status = status;
    if (outcome) updates.outcome = outcome;
    if (twilio_call_sid) updates.twilio_call_sid = twilio_call_sid;
    if (recording_url) updates.recording_url = recording_url;
    if (transcript) updates.transcript = transcript;
    if (extracted_data) updates.extracted_data = extracted_data;
    if (call_duration_seconds) updates.call_duration_seconds = call_duration_seconds;

    // Handle no answer - schedule retry
    if (outcome === 'no_answer' && existingCall.attempts < existingCall.max_attempts) {
      updates.attempts = existingCall.attempts + 1;
      updates.last_attempt_at = new Date().toISOString();
      updates.status = 'pending';

      // Schedule retry in 30 minutes (within 9am-9pm)
      const nextRetry = calculateNextRetry();
      updates.next_retry_at = nextRetry.toISOString();
    }

    if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('locummeds_scheduled_calls')
      .update(updates)
      .eq('id', call_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log call attempt
    await supabase.from('locummeds_call_logs').insert({
      scheduled_call_id: call_id,
      pipeline_id: existingCall.pipeline_id,
      twilio_call_sid,
      phone_number: existingCall.phone_number,
      duration_seconds: call_duration_seconds,
      recording_url,
      transcript,
      outcome: outcome || 'unknown',
      extracted_data,
    });

    // Log event
    await supabase.from('locummeds_pipeline_events').insert({
      pipeline_id: existingCall.pipeline_id,
      event_type: 'call_completed',
      event_data: {
        call_id,
        outcome,
        duration: call_duration_seconds,
        attempt: updates.attempts || existingCall.attempts,
      },
      triggered_by: 'api',
    });

    return NextResponse.json({
      success: true,
      call: data,
    });

  } catch (error) {
    console.error('Calls PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update call' },
      { status: 500 }
    );
  }
}

/**
 * Calculate next retry time (within 9am-9pm London time)
 */
function calculateNextRetry(): Date {
  const now = new Date();
  const londonTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));

  // Add 30 minutes
  let nextRetry = new Date(now.getTime() + 30 * 60 * 1000);
  const nextLondon = new Date(nextRetry.toLocaleString('en-US', { timeZone: 'Europe/London' }));

  const hour = nextLondon.getHours();

  // If before 9am, set to 9am
  if (hour < 9) {
    nextLondon.setHours(9, 0, 0, 0);
    nextRetry = new Date(nextLondon.toLocaleString('en-US', { timeZone: 'UTC' }));
  }
  // If after 9pm, set to next day 9am
  else if (hour >= 21) {
    nextLondon.setDate(nextLondon.getDate() + 1);
    nextLondon.setHours(9, 0, 0, 0);
    nextRetry = new Date(nextLondon.toLocaleString('en-US', { timeZone: 'UTC' }));
  }

  return nextRetry;
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

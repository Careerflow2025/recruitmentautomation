import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * NETLIFY BACKGROUND FUNCTION TRIGGER
 *
 * This endpoint:
 * 1. Authenticates user
 * 2. Fetches candidates/clients
 * 3. Triggers Netlify background function (runs up to 15 minutes!)
 * 4. Returns immediately
 *
 * The background function handles all the heavy processing.
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const forceParam = url.searchParams.get('force');
    const forceFullRegeneration = forceParam === 'true';

    console.log('🚀 [NETLIFY API] Starting match regeneration...');
    console.log(`🔧 Mode: ${forceFullRegeneration ? 'FULL REGENERATION' : 'INCREMENTAL'}`);

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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.log(`✅ User authenticated: ${user.email}`);

    // Fetch candidates and clients
    const [candidatesResult, clientsResult] = await Promise.all([
      supabase.from('candidates').select('id, postcode, role').eq('user_id', user.id),
      supabase.from('clients').select('id, postcode, role').eq('user_id', user.id)
    ]);

    if (candidatesResult.error) throw candidatesResult.error;
    if (clientsResult.error) throw clientsResult.error;

    const candidates = candidatesResult.data || [];
    const clients = clientsResult.data || [];

    if (candidates.length === 0 || clients.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Need both candidates and clients'
      }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Google Maps API key not configured'
      }, { status: 500 });
    }

    console.log(`📊 Processing: ${candidates.length} × ${clients.length} = ${candidates.length * clients.length} pairs`);

    // Initialize progress
    await supabase.from('match_generation_status').upsert({
      user_id: user.id,
      status: 'processing',
      started_at: new Date().toISOString(),
      matches_found: 0,
      percent_complete: 0,
      method_used: 'netlify_background',
    });

    // ⚡ NETLIFY BACKGROUND FUNCTION: Trigger via fetch with -background suffix
    // This tells Netlify to run it in the background (15-minute timeout)
    const backgroundUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://dental-matcher.netlify.app'}/.netlify/functions/process-matches-background`;

    console.log(`🚀 Triggering background function: ${backgroundUrl}`);

    fetch(backgroundUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'netlify-background': 'true', // Netlify magic header
      },
      body: JSON.stringify({
        userId: user.id,
        candidates,
        clients,
        apiKey,
        forceFullRegeneration,
      }),
    }).catch(err => {
      console.error('❌ Background function trigger error (non-blocking):', err);
    });

    console.log('✅ Background function triggered!');

    // Return immediately
    return NextResponse.json({
      success: true,
      message: forceFullRegeneration
        ? 'Full match regeneration started in background - check status for progress'
        : 'Incremental match generation started in background - check status for progress',
      processing: true,
      completed: false,
      mode: forceFullRegeneration ? 'full' : 'incremental',
      stats: {
        candidates: candidates.length,
        clients: clients.length,
        total_pairs: candidates.length * clients.length,
      }
    });

  } catch (error: any) {
    console.error('❌ API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

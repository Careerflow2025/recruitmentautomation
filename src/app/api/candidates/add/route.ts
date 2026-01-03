import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Add Single Candidate
 * POST /api/candidates/add
 *
 * Uses atomic ID generation to prevent duplicate candidate IDs
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📤 Adding single candidate...');

    const candidate = await request.json();

    // Validate required fields
    if (!candidate.postcode || String(candidate.postcode).trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Postcode is required' },
        { status: 400 }
      );
    }

    // Create Supabase client with auth
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'You must be logged in to add candidates' },
        { status: 401 }
      );
    }

    // Generate atomic ID using database function (prevents race conditions)
    let candidateId = candidate.id;
    let needsNewId = !candidateId;

    // Check if provided ID already exists (duplicate detection)
    if (candidateId) {
      const { data: existing } = await supabase
        .from('candidates')
        .select('id')
        .eq('id', candidateId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        console.log(`⚠️ ID ${candidateId} already exists, generating new ID atomically`);
        needsNewId = true;
      }
    }

    // Generate new atomic ID if needed
    if (needsNewId) {
      const { data: newId, error: rpcError } = await supabase
        .rpc('generate_next_candidate_id', { p_user_id: user.id });

      if (rpcError) {
        console.error('Failed to generate candidate ID:', rpcError);
        return NextResponse.json(
          { success: false, error: 'Failed to generate unique candidate ID' },
          { status: 500 }
        );
      }

      candidateId = newId;
      console.log(`🔢 Generated atomic ID: ${candidateId}`);
    }

    // Prepare candidate with verified unique ID
    const candidateWithUser = {
      ...candidate,
      id: candidateId,
      user_id: user.id,
    };

    // Insert candidate
    const { data, error } = await supabase
      .from('candidates')
      .insert([candidateWithUser])
      .select();

    if (error) {
      // Handle duplicate key error (extra safety)
      if (error.code === '23505') {
        console.error('Duplicate key error despite atomic ID:', error);
        return NextResponse.json(
          { success: false, error: 'Candidate ID conflict. Please try again.' },
          { status: 409 }
        );
      }

      console.error('Database error:', error);
      return NextResponse.json(
        { success: false, error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`✅ Successfully added candidate: ${candidateId}`);

    return NextResponse.json({
      success: true,
      message: `Successfully added candidate ${candidateId}`,
      data: data[0],
      generatedId: needsNewId ? candidateId : undefined,
    });

  } catch (error) {
    console.error('Add candidate error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add candidate'
      },
      { status: 500 }
    );
  }
}

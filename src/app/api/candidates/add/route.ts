import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Add Single Candidate
 * POST /api/candidates/add
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

    // Add user_id to candidate
    const candidateWithUser = {
      ...candidate,
      user_id: user.id,
    };

    // Insert candidate
    const { data, error } = await supabase
      .from('candidates')
      .insert([candidateWithUser])
      .select();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { success: false, error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`✅ Successfully added candidate: ${candidate.id}`);

    return NextResponse.json({
      success: true,
      message: `Successfully added candidate ${candidate.id}`,
      data: data[0],
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

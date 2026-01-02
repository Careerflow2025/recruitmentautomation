import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Link CV to Candidate
 * POST /api/cvs/link
 *
 * Associates a CV with a specific candidate (manual or auto-confirmed)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cv_id, candidate_id, match_method = 'manual' } = body;

    if (!cv_id || !candidate_id) {
      return NextResponse.json(
        { success: false, error: 'cv_id and candidate_id are required' },
        { status: 400 }
      );
    }

    console.log(`🔗 Linking CV ${cv_id} to candidate ${candidate_id}`);

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
        { success: false, error: 'You must be logged in' },
        { status: 401 }
      );
    }

    // Verify CV exists and belongs to user
    const { data: cvRecord, error: cvError } = await supabase
      .from('candidate_cvs')
      .select('id, candidate_id')
      .eq('id', cv_id)
      .eq('user_id', user.id)
      .single();

    if (cvError || !cvRecord) {
      return NextResponse.json(
        { success: false, error: 'CV not found' },
        { status: 404 }
      );
    }

    // Verify candidate exists and belongs to user
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .select('id, first_name, last_name')
      .eq('id', candidate_id)
      .eq('user_id', user.id)
      .single();

    if (candidateError || !candidate) {
      return NextResponse.json(
        { success: false, error: 'Candidate not found' },
        { status: 404 }
      );
    }

    // Check if candidate already has a CV linked
    const { data: existingCV } = await supabase
      .from('candidate_cvs')
      .select('id, cv_filename')
      .eq('candidate_id', candidate_id)
      .eq('user_id', user.id)
      .neq('id', cv_id)
      .single();

    // Update CV record with candidate link
    const { error: updateError } = await supabase
      .from('candidate_cvs')
      .update({
        candidate_id,
        match_method,
        match_confidence: match_method === 'manual' ? 1.0 : null,
        status: 'linked',
        updated_at: new Date().toISOString(),
      })
      .eq('id', cv_id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    const candidateName = [candidate.first_name, candidate.last_name]
      .filter(Boolean)
      .join(' ') || candidate_id;

    console.log(`✅ CV linked to ${candidateName}`);

    return NextResponse.json({
      success: true,
      cv_id,
      candidate_id,
      candidate_name: candidateName,
      match_method,
      replaced_cv: existingCV ? existingCV.cv_filename : null,
      message: `CV successfully linked to ${candidateName}`,
    });
  } catch (error) {
    console.error('CV link error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to link CV',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cvs/link
 * Unlink a CV from a candidate
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cv_id = searchParams.get('cv_id');

    if (!cv_id) {
      return NextResponse.json(
        { success: false, error: 'cv_id is required' },
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
        { success: false, error: 'You must be logged in' },
        { status: 401 }
      );
    }

    // Unlink CV
    const { error: updateError } = await supabase
      .from('candidate_cvs')
      .update({
        candidate_id: null,
        match_method: null,
        match_confidence: null,
        status: 'parsed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', cv_id)
      .eq('user_id', user.id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      cv_id,
      message: 'CV unlinked from candidate',
    });
  } catch (error) {
    console.error('CV unlink error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to unlink CV',
      },
      { status: 500 }
    );
  }
}

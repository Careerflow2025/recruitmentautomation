import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Get CV by ID
 * GET /api/cvs/[id]
 *
 * Returns CV details including a signed URL for viewing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Get CV record
    const { data: cvRecord, error: cvError } = await supabase
      .from('candidate_cvs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (cvError || !cvRecord) {
      return NextResponse.json(
        { success: false, error: 'CV not found' },
        { status: 404 }
      );
    }

    // Generate signed URL for viewing (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('cvs')
      .createSignedUrl(cvRecord.cv_storage_path, 3600);

    if (signedUrlError) {
      console.error('Signed URL error:', signedUrlError);
    }

    // Get linked candidate info if exists
    let candidate = null;
    if (cvRecord.candidate_id) {
      const { data: candidateData } = await supabase
        .from('candidates')
        .select('id, first_name, last_name, email, phone, role, postcode')
        .eq('id', cvRecord.candidate_id)
        .single();

      candidate = candidateData;
    }

    return NextResponse.json({
      success: true,
      cv: {
        ...cvRecord,
        storage_url: signedUrlData?.signedUrl || null,
      },
      candidate,
    });
  } catch (error) {
    console.error('CV get error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get CV',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cvs/[id]
 * Delete a CV and its storage file
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Get CV record to get storage path
    const { data: cvRecord, error: cvError } = await supabase
      .from('candidate_cvs')
      .select('cv_storage_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (cvError || !cvRecord) {
      return NextResponse.json(
        { success: false, error: 'CV not found' },
        { status: 404 }
      );
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('cvs')
      .remove([cvRecord.cv_storage_path]);

    if (storageError) {
      console.error('Storage delete error:', storageError);
    }

    // Delete database record
    const { error: deleteError } = await supabase
      .from('candidate_cvs')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'CV deleted successfully',
    });
  } catch (error) {
    console.error('CV delete error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete CV',
      },
      { status: 500 }
    );
  }
}

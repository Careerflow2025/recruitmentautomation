import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Delete Individual Candidate Note
 * DELETE /api/notes/candidates/[candidateId]/[noteId] - Delete a specific note
 */

export async function DELETE(
  request: NextRequest,
  { params }: { params: { candidateId: string; noteId: string } }
) {
  try {
    const { candidateId, noteId } = params;

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
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Delete the note (only if it belongs to this user and candidate)
    const { error } = await supabase
      .from('candidate_notes')
      .delete()
      .eq('id', noteId)
      .eq('candidate_id', candidateId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting candidate note:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Note deleted successfully',
    });
  } catch (error) {
    console.error('Candidate note deletion error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete note',
      },
      { status: 500 }
    );
  }
}

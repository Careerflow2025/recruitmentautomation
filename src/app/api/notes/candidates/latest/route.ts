import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Get Latest Candidate Notes
 * GET /api/notes/candidates/latest - Fetch latest note for each candidate (for current user)
 */

export async function GET(request: NextRequest) {
  try {
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

    // Get latest note for each candidate (using DISTINCT ON)
    // This query gets the most recent note for each candidate_id
    const { data: latestNotes, error } = await supabase
      .from('candidate_notes')
      .select('candidate_id, content, created_at')
      .eq('user_id', user.id)
      .order('candidate_id')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching latest candidate notes:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Group by candidate_id and keep only the latest (first) one for each
    const latestByCandidate: Record<string, { content: string; created_at: string }> = {};

    if (latestNotes) {
      latestNotes.forEach(note => {
        // Only keep the first note we see for each candidate (which is the latest due to our ordering)
        if (!latestByCandidate[note.candidate_id]) {
          latestByCandidate[note.candidate_id] = {
            content: note.content,
            created_at: note.created_at,
          };
        }
      });
    }

    return NextResponse.json({
      success: true,
      latestNotes: latestByCandidate,
    });
  } catch (error) {
    console.error('Latest candidate notes fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch latest notes',
      },
      { status: 500 }
    );
  }
}

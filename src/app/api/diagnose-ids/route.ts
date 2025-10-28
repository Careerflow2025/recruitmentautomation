import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Diagnose ID Issues
 * GET /api/diagnose-ids
 *
 * Shows raw ID data to help diagnose duplicate issues
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Diagnosing ID issues...');

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

    // Get all candidates
    const { data: candidates, error: candidatesError } = await supabase
      .from('candidates')
      .select('id, first_name, last_name, added_at')
      .eq('user_id', user.id)
      .order('id', { ascending: true });

    if (candidatesError) {
      throw new Error(`Failed to fetch candidates: ${candidatesError.message}`);
    }

    // Get all clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, surgery, added_at')
      .eq('user_id', user.id)
      .order('id', { ascending: true });

    if (clientsError) {
      throw new Error(`Failed to fetch clients: ${clientsError.message}`);
    }

    // Analyze candidate IDs
    const candidateIdAnalysis = new Map<string, any[]>();
    const rawCandidateIds: any[] = [];

    for (const candidate of candidates || []) {
      const rawId = candidate.id;
      const normalizedId = (rawId || '').toString().toUpperCase().trim();

      // Store raw data for inspection
      rawCandidateIds.push({
        raw: rawId,
        normalized: normalizedId,
        length: rawId ? rawId.length : 0,
        charCodes: rawId ? Array.from(rawId).map(c => c.charCodeAt(0)) : [],
        name: `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || 'No name',
        added_at: candidate.added_at,
      });

      // Group by normalized ID
      if (!candidateIdAnalysis.has(normalizedId)) {
        candidateIdAnalysis.set(normalizedId, []);
      }
      candidateIdAnalysis.get(normalizedId)!.push({
        ...candidate,
        rawId,
        normalizedId,
      });
    }

    // Find candidate duplicates
    const candidateDuplicates: any[] = [];
    candidateIdAnalysis.forEach((group, id) => {
      if (group.length > 1) {
        candidateDuplicates.push({
          id,
          count: group.length,
          records: group.map(c => ({
            rawId: c.rawId,
            name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'No name',
            added_at: c.added_at,
          })),
        });
      }
    });

    // Analyze client IDs
    const clientIdAnalysis = new Map<string, any[]>();
    const rawClientIds: any[] = [];

    for (const client of clients || []) {
      const rawId = client.id;
      const normalizedId = (rawId || '').toString().toUpperCase().trim();

      // Store raw data for inspection
      rawClientIds.push({
        raw: rawId,
        normalized: normalizedId,
        length: rawId ? rawId.length : 0,
        charCodes: rawId ? Array.from(rawId).map(c => c.charCodeAt(0)) : [],
        surgery: client.surgery || 'No surgery name',
        added_at: client.added_at,
      });

      // Group by normalized ID
      if (!clientIdAnalysis.has(normalizedId)) {
        clientIdAnalysis.set(normalizedId, []);
      }
      clientIdAnalysis.get(normalizedId)!.push({
        ...client,
        rawId,
        normalizedId,
      });
    }

    // Find client duplicates
    const clientDuplicates: any[] = [];
    clientIdAnalysis.forEach((group, id) => {
      if (group.length > 1) {
        clientDuplicates.push({
          id,
          count: group.length,
          records: group.map(c => ({
            rawId: c.rawId,
            surgery: c.surgery || 'No surgery name',
            added_at: c.added_at,
          })),
        });
      }
    });

    // Create frequency maps
    const candidateIdFrequency: Record<string, number> = {};
    rawCandidateIds.forEach(item => {
      const id = item.normalized;
      candidateIdFrequency[id] = (candidateIdFrequency[id] || 0) + 1;
    });

    const clientIdFrequency: Record<string, number> = {};
    rawClientIds.forEach(item => {
      const id = item.normalized;
      clientIdFrequency[id] = (clientIdFrequency[id] || 0) + 1;
    });

    const result = {
      success: true,
      summary: {
        totalCandidates: candidates?.length || 0,
        totalClients: clients?.length || 0,
        candidateDuplicateGroups: candidateDuplicates.length,
        clientDuplicateGroups: clientDuplicates.length,
        totalCandidateDuplicates: candidateDuplicates.reduce((sum, g) => sum + g.count - 1, 0),
        totalClientDuplicates: clientDuplicates.reduce((sum, g) => sum + g.count - 1, 0),
      },
      candidateDuplicates,
      clientDuplicates,
      candidateIdFrequency: Object.entries(candidateIdFrequency)
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1]),
      clientIdFrequency: Object.entries(clientIdFrequency)
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1]),
      rawSamples: {
        candidates: rawCandidateIds.slice(0, 10),
        clients: rawClientIds.slice(0, 10),
      },
    };

    console.log('📊 Diagnosis Summary:', result.summary);
    console.log('🔍 Candidate Duplicates:', candidateDuplicates);
    console.log('🔍 Client Duplicates:', clientDuplicates);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Diagnosis error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to diagnose IDs'
      },
      { status: 500 }
    );
  }
}
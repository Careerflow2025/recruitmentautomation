import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Fix Duplicate IDs
 * POST /api/deduplicate-ids
 *
 * Finds and fixes any duplicate candidate or client IDs
 * Keeps the first occurrence and assigns new sequential IDs to duplicates
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔧 Starting ID deduplication process...');

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

    // Process candidates
    console.log('📋 Processing candidates...');
    const candidateResults = await deduplicateCandidates(supabase, user.id);

    // Process clients
    console.log('📋 Processing clients...');
    const clientResults = await deduplicateClients(supabase, user.id);

    const summary = {
      success: true,
      candidates: candidateResults,
      clients: clientResults,
      totalFixed: candidateResults.fixed + clientResults.fixed,
      message: candidateResults.fixed > 0 || clientResults.fixed > 0
        ? 'Duplicates fixed! Note: Matches for duplicate IDs were deleted. Please regenerate matches.'
        : 'No duplicates were fixed.',
    };

    console.log('✅ Deduplication complete:', summary);
    return NextResponse.json(summary);

  } catch (error) {
    console.error('Deduplication error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deduplicate IDs'
      },
      { status: 500 }
    );
  }
}

async function deduplicateCandidates(supabase: any, userId: string) {
  // Get all candidates for this user
  const { data: candidates, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: true }); // Keep oldest first

  if (error) {
    throw new Error(`Failed to fetch candidates: ${error.message}`);
  }

  if (!candidates || candidates.length === 0) {
    return { total: 0, duplicates: 0, fixed: 0 };
  }

  console.log(`📊 Total candidates fetched: ${candidates.length}`);
  console.log('Sample IDs:', candidates.slice(0, 10).map(c => c.id));

  // Group by ID (case-insensitive and removing U3_ prefix) to find duplicates
  const idGroups = new Map<string, any[]>();
  for (const candidate of candidates) {
    let id = (candidate.id || '').toUpperCase().trim(); // Normalize ID to uppercase

    // Remove U3_ prefix if it exists to find duplicates like U3_CAN7 and CAN7
    if (id.startsWith('U3_')) {
      id = id.substring(3);
    }

    if (!idGroups.has(id)) {
      idGroups.set(id, []);
    }
    idGroups.get(id)!.push(candidate);
  }

  // Log all ID groups for debugging
  console.log('ID Groups:');
  idGroups.forEach((group, id) => {
    if (group.length > 1) {
      console.log(`  ID "${id}": ${group.length} occurrences`);
    }
  });

  // Find duplicate groups
  const duplicateGroups = Array.from(idGroups.entries()).filter(
    ([_, group]) => group.length > 1
  );

  console.log(`Found ${duplicateGroups.length} candidate ID groups with duplicates`);

  // Fix duplicates
  let fixed = 0;
  let nextIdNum = getHighestCandidateNumber(candidates) + 1;

  for (const [normalizedId, group] of duplicateGroups) {
    console.log(`  Fixing duplicate group: ${normalizedId} (${group.length} items)`);

    // Sort by added_at to keep the oldest
    group.sort((a, b) => {
      const dateA = new Date(a.added_at || a.created_at || 0).getTime();
      const dateB = new Date(b.added_at || b.created_at || 0).getTime();
      return dateA - dateB;
    });

    // Keep the first one, update the rest
    for (let i = 1; i < group.length; i++) {
      const duplicate = group[i];

      // Preserve the U3_ prefix if it exists
      let newId: string;
      if (duplicate.id && duplicate.id.startsWith('U3_')) {
        newId = `U3_CAN${nextIdNum}`;
      } else if (duplicate.id && duplicate.id.startsWith('u3_')) {
        newId = `u3_can${nextIdNum}`;
      } else {
        newId = `CAN${nextIdNum}`;
      }

      console.log(`    Changing ${duplicate.id} → ${newId} for candidate: ${duplicate.first_name} ${duplicate.last_name} (added_at: ${duplicate.added_at})`);

      // FIRST: Delete any matches that reference this candidate ID
      // This prevents foreign key constraint violations
      const { error: deleteMatchesError } = await supabase
        .from('matches')
        .delete()
        .eq('candidate_id', duplicate.id);

      if (deleteMatchesError) {
        console.log(`    Warning: Could not delete matches for ${duplicate.id}: ${deleteMatchesError.message}`);
      } else {
        console.log(`    Deleted matches for ${duplicate.id} to prevent constraint violation`);
      }

      // NOW: Update the candidate ID
      const { data: updatedData, error: updateError } = await supabase
        .from('candidates')
        .update({ id: newId })
        .eq('user_id', userId)
        .eq('id', duplicate.id)
        .eq('added_at', duplicate.added_at)
        .select()
        .single();

      if (updateError) {
        // If single() fails, try without it (for multiple matches)
        console.log(`    Retrying without .single() for ${duplicate.id}`);
        const { data: retryData, error: retryError } = await supabase
          .from('candidates')
          .update({ id: newId })
          .eq('user_id', userId)
          .eq('id', duplicate.id)
          .eq('first_name', duplicate.first_name || '')
          .eq('last_name', duplicate.last_name || '')
          .limit(1)
          .select();

        if (retryError) {
          console.error(`    ❌ Failed to update: ${retryError.message}`);
          console.error(`    Duplicate details:`, duplicate);
        } else {
          console.log(`    ✅ Successfully updated to ${newId} (retry worked)`);
          fixed++;
          nextIdNum++;
        }
      } else {
        console.log(`    ✅ Successfully updated to ${newId}`);
        fixed++;
        nextIdNum++;
      }
    }
  }

  return {
    total: candidates.length,
    duplicates: duplicateGroups.reduce((sum, [_, group]) => sum + group.length - 1, 0),
    fixed,
    duplicateGroups: duplicateGroups.map(([id, group]) => ({
      id,
      count: group.length,
      items: group.map(c => ({
        name: `${c.first_name} ${c.last_name}`,
        added_at: c.added_at,
      })),
    })),
  };
}

async function deduplicateClients(supabase: any, userId: string) {
  // Get all clients for this user
  const { data: clients, error } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: true }); // Keep oldest first

  if (error) {
    throw new Error(`Failed to fetch clients: ${error.message}`);
  }

  if (!clients || clients.length === 0) {
    return { total: 0, duplicates: 0, fixed: 0 };
  }

  console.log(`📊 Total clients fetched: ${clients.length}`);
  console.log('Sample IDs:', clients.slice(0, 10).map(c => c.id));

  // Group by ID (case-insensitive and removing U3_ prefix) to find duplicates
  const idGroups = new Map<string, any[]>();
  for (const client of clients) {
    let id = (client.id || '').toUpperCase().trim(); // Normalize ID to uppercase

    // Remove U3_ prefix if it exists to find duplicates like U3_CL7 and CL7
    if (id.startsWith('U3_')) {
      id = id.substring(3);
    }

    if (!idGroups.has(id)) {
      idGroups.set(id, []);
    }
    idGroups.get(id)!.push(client);
  }

  // Log all ID groups for debugging
  console.log('ID Groups:');
  idGroups.forEach((group, id) => {
    if (group.length > 1) {
      console.log(`  ID "${id}": ${group.length} occurrences`);
    }
  });

  // Find duplicate groups
  const duplicateGroups = Array.from(idGroups.entries()).filter(
    ([_, group]) => group.length > 1
  );

  console.log(`Found ${duplicateGroups.length} client ID groups with duplicates`);

  // Fix duplicates
  let fixed = 0;
  let nextIdNum = getHighestClientNumber(clients) + 1;

  for (const [normalizedId, group] of duplicateGroups) {
    console.log(`  Fixing duplicate group: ${normalizedId} (${group.length} items)`);

    // Sort by added_at to keep the oldest
    group.sort((a, b) => {
      const dateA = new Date(a.added_at || a.created_at || 0).getTime();
      const dateB = new Date(b.added_at || b.created_at || 0).getTime();
      return dateA - dateB;
    });

    // Keep the first one, update the rest
    for (let i = 1; i < group.length; i++) {
      const duplicate = group[i];

      // Preserve the U3_ prefix if it exists
      let newId: string;
      if (duplicate.id && duplicate.id.startsWith('U3_')) {
        newId = `U3_CL${nextIdNum}`;
      } else if (duplicate.id && duplicate.id.startsWith('u3_')) {
        newId = `u3_cl${nextIdNum}`;
      } else {
        newId = `CL${nextIdNum}`;
      }

      console.log(`    Changing ${duplicate.id} → ${newId} for client: ${duplicate.surgery} (added_at: ${duplicate.added_at})`);

      // FIRST: Delete any matches that reference this client ID
      // This prevents foreign key constraint violations
      const { error: deleteMatchesError } = await supabase
        .from('matches')
        .delete()
        .eq('client_id', duplicate.id);

      if (deleteMatchesError) {
        console.log(`    Warning: Could not delete matches for ${duplicate.id}: ${deleteMatchesError.message}`);
      } else {
        console.log(`    Deleted matches for ${duplicate.id} to prevent constraint violation`);
      }

      // NOW: Update the client ID
      const { data: updatedData, error: updateError } = await supabase
        .from('clients')
        .update({ id: newId })
        .eq('user_id', userId)
        .eq('id', duplicate.id)
        .eq('added_at', duplicate.added_at)
        .select()
        .single();

      if (updateError) {
        // If single() fails, try without it (for multiple matches)
        console.log(`    Retrying without .single() for ${duplicate.id}`);
        const { data: retryData, error: retryError } = await supabase
          .from('clients')
          .update({ id: newId })
          .eq('user_id', userId)
          .eq('id', duplicate.id)
          .eq('surgery', duplicate.surgery || '')
          .limit(1)
          .select();

        if (retryError) {
          console.error(`    ❌ Failed to update: ${retryError.message}`);
          console.error(`    Duplicate details:`, duplicate);
        } else {
          console.log(`    ✅ Successfully updated to ${newId} (retry worked)`);
          fixed++;
          nextIdNum++;
        }
      } else {
        console.log(`    ✅ Successfully updated to ${newId}`);
        fixed++;
        nextIdNum++;
      }
    }
  }

  return {
    total: clients.length,
    duplicates: duplicateGroups.reduce((sum, [_, group]) => sum + group.length - 1, 0),
    fixed,
    duplicateGroups: duplicateGroups.map(([id, group]) => ({
      id,
      count: group.length,
      items: group.map(c => ({
        surgery: c.surgery,
        added_at: c.added_at,
      })),
    })),
  };
}

function getHighestCandidateNumber(candidates: any[]): number {
  let maxNum = 0;
  const prefix = 'CAN';

  for (const candidate of candidates) {
    const id = candidate.id || '';

    // Handle prefixed IDs like "u3_can8"
    if (id.includes('_')) {
      const parts = id.split('_');
      const lastPart = parts[parts.length - 1];
      if (lastPart.toLowerCase().startsWith('can')) {
        const numPart = lastPart.substring(3);
        const parsed = parseInt(numPart, 10);
        if (!isNaN(parsed) && parsed > 0) {
          maxNum = Math.max(maxNum, parsed);
        }
      }
    }

    // Handle standard IDs like "CAN8"
    if (id.toUpperCase().startsWith(prefix)) {
      const numPart = id.substring(prefix.length);
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed) && parsed > 0) {
        maxNum = Math.max(maxNum, parsed);
      }
    }
  }

  return maxNum;
}

function getHighestClientNumber(clients: any[]): number {
  let maxNum = 0;
  const prefix = 'CL';

  for (const client of clients) {
    const id = client.id || '';

    // Handle prefixed IDs like "u3_cl8"
    if (id.includes('_')) {
      const parts = id.split('_');
      const lastPart = parts[parts.length - 1];
      if (lastPart.toLowerCase().startsWith('cl')) {
        const numPart = lastPart.substring(2);
        const parsed = parseInt(numPart, 10);
        if (!isNaN(parsed) && parsed > 0) {
          maxNum = Math.max(maxNum, parsed);
        }
      }
    }

    // Handle standard IDs like "CL8"
    if (id.toUpperCase().startsWith(prefix)) {
      const numPart = id.substring(prefix.length);
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed) && parsed > 0) {
        maxNum = Math.max(maxNum, parsed);
      }
    }
  }

  return maxNum;
}
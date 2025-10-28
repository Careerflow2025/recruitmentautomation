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
      const newId = `CAN${nextIdNum}`;

      console.log(`    Changing ${duplicate.id} → ${newId} for candidate: ${duplicate.first_name} ${duplicate.last_name} (added_at: ${duplicate.added_at})`);

      // Update in database using multiple conditions to uniquely identify the record
      // We need to be very specific to avoid updating the wrong record
      const updateQuery = supabase
        .from('candidates')
        .update({ id: newId })
        .eq('user_id', userId);

      // Add all available unique identifiers
      if (duplicate.id) updateQuery.eq('id', duplicate.id);
      if (duplicate.first_name) updateQuery.eq('first_name', duplicate.first_name);
      if (duplicate.last_name) updateQuery.eq('last_name', duplicate.last_name);
      if (duplicate.email) updateQuery.eq('email', duplicate.email);
      if (duplicate.phone) updateQuery.eq('phone', duplicate.phone);

      // Limit to 1 to ensure we only update one record
      const { data: updatedData, error: updateError } = await updateQuery.single();

      if (updateError) {
        console.error(`    Failed to update: ${updateError.message}`);
        console.error(`    Duplicate details:`, duplicate);
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
      const newId = `CL${nextIdNum}`;

      console.log(`    Changing ${duplicate.id} → ${newId} for client: ${duplicate.surgery} (added_at: ${duplicate.added_at})`);

      // Update in database using multiple conditions to uniquely identify the record
      const updateQuery = supabase
        .from('clients')
        .update({ id: newId })
        .eq('user_id', userId);

      // Add all available unique identifiers
      if (duplicate.id) updateQuery.eq('id', duplicate.id);
      if (duplicate.surgery) updateQuery.eq('surgery', duplicate.surgery);
      if (duplicate.client_name) updateQuery.eq('client_name', duplicate.client_name);
      if (duplicate.client_email) updateQuery.eq('client_email', duplicate.client_email);
      if (duplicate.client_phone) updateQuery.eq('client_phone', duplicate.client_phone);

      // Limit to 1 to ensure we only update one record
      const { data: updatedData, error: updateError } = await updateQuery.single();

      if (updateError) {
        console.error(`    Failed to update: ${updateError.message}`);
        console.error(`    Duplicate details:`, duplicate);
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
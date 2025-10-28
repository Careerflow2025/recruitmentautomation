import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Get Next Available Candidate ID
 * GET /api/candidates/next-id
 *
 * Returns the next sequential ID for candidates in format: CAN1, CAN2, CAN10, CAN100
 * NO zero-padding - just sequential numbers
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔢 Getting next available candidate ID...');

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

    // Get all existing candidate IDs for this user
    const { data: candidates, error: fetchError } = await supabase
      .from('candidates')
      .select('id')
      .eq('user_id', user.id)
      .order('id', { ascending: false });

    if (fetchError) {
      console.error('Database error:', fetchError);
      return NextResponse.json(
        { success: false, error: `Database error: ${fetchError.message}` },
        { status: 500 }
      );
    }

    // Find the highest ID number
    let maxNum = 0;
    const prefix = 'CAN';

    if (candidates && candidates.length > 0) {
      console.log(`📊 Found ${candidates.length} existing candidates`);
      console.log('Sample IDs:', candidates.slice(0, 5).map(c => c.id));

      // Extract all numeric parts and find the maximum
      // Handle both formats: "CAN8" and "u3_can8" (or any prefix_can8)
      const numbers = candidates
        .map(candidate => {
          const id = candidate.id || '';

          // Handle prefixed IDs like "u3_can8", "u1_can15", etc.
          if (id.includes('_')) {
            const parts = id.split('_');
            const lastPart = parts[parts.length - 1];

            // Check if last part starts with 'can' (case insensitive)
            if (lastPart.toLowerCase().startsWith('can')) {
              const numPart = lastPart.substring(3); // Remove 'can'
              const parsed = parseInt(numPart, 10);
              if (!isNaN(parsed) && parsed > 0) {
                console.log(`  📍 Parsed prefixed ID: ${id} → ${lastPart} → number: ${parsed}`);
                return parsed;
              }
            }
          }

          // Handle standard IDs like "CAN8"
          if (id.toUpperCase().startsWith(prefix)) {
            const numPart = id.substring(prefix.length);
            const parsed = parseInt(numPart, 10);
            if (!isNaN(parsed) && parsed > 0) {
              console.log(`  📍 Parsed standard ID: ${id} → number: ${parsed}`);
              return parsed;
            }
          }

          return 0;
        })
        .filter(num => num > 0);

      console.log(`  📊 All parsed numbers: [${numbers.join(', ')}]`);

      if (numbers.length > 0) {
        maxNum = Math.max(...numbers);
        console.log(`  📈 Highest number found: ${maxNum}`);
      }
    }

    // Generate next ID
    const nextId = `${prefix}${maxNum + 1}`;
    console.log(`✅ Next available ID: ${nextId}`);

    return NextResponse.json({
      success: true,
      nextId: nextId,
      currentMax: maxNum > 0 ? `${prefix}${maxNum}` : null,
      totalCandidates: candidates?.length || 0,
    });

  } catch (error) {
    console.error('Get next ID error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get next ID'
      },
      { status: 500 }
    );
  }
}
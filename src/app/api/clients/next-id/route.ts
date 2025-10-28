import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Get Next Available Client ID
 * GET /api/clients/next-id
 *
 * Returns the next sequential ID for clients in format: CL1, CL2, CL10, CL100
 * NO zero-padding - just sequential numbers
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔢 Getting next available client ID...');

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

    // Get all existing client IDs for this user
    const { data: clients, error: fetchError } = await supabase
      .from('clients')
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
    const prefix = 'CL';

    if (clients && clients.length > 0) {
      console.log(`📊 Found ${clients.length} existing clients`);

      // Extract all numeric parts and find the maximum
      const numbers = clients
        .map(client => {
          const id = client.id || '';
          if (id.startsWith(prefix)) {
            const numPart = id.substring(prefix.length);
            const parsed = parseInt(numPart, 10);
            if (!isNaN(parsed) && parsed > 0) {
              console.log(`  📍 Parsed ID: ${id} → number: ${parsed}`);
              return parsed;
            }
          }
          return 0;
        })
        .filter(num => num > 0);

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
      totalClients: clients?.length || 0,
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
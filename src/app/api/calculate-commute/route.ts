import { NextRequest, NextResponse } from 'next/server';
import { calculateCommute } from '@/lib/google-maps';

/**
 * API Route: Calculate Commute Time
 * POST /api/calculate-commute
 *
 * Uses Google Maps Distance Matrix API (RULE 3)
 * Enforces 80-minute maximum (RULE 2)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origin, destination } = body;

    if (!origin || !destination) {
      return NextResponse.json(
        { error: 'Both origin and destination postcodes are required' },
        { status: 400 }
      );
    }

    // Calculate commute using Google Maps API
    const result = await calculateCommute(origin, destination);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Commute calculation error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a RULE 2 violation (over 80 minutes)
    if (errorMessage.includes('exceeds maximum of 80 minutes')) {
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          excluded: true, // Match should be excluded
        },
        { status: 200 } // Not a server error, just excluded by business rules
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for testing
 * GET /api/calculate-commute?origin=SW1A1AA&destination=EC2A3LT
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const origin = searchParams.get('origin');
    const destination = searchParams.get('destination');

    if (!origin || !destination) {
      return NextResponse.json(
        { error: 'Both origin and destination query parameters are required' },
        { status: 400 }
      );
    }

    const result = await calculateCommute(origin, destination);

    return NextResponse.json({
      success: true,
      data: result,
      api_used: 'Google Maps Distance Matrix API',
      rule_3_compliance: true,
    });
  } catch (error) {
    console.error('Commute calculation error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('exceeds maximum of 80 minutes')) {
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          excluded: true,
          rule_2_violation: true,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

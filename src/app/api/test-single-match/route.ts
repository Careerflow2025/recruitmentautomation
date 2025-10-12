import { NextRequest, NextResponse } from 'next/server';

/**
 * TEST ENDPOINT: Calculate a single commute to verify the system works
 * GET /api/test-single-match
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🧪 TEST: Starting single match test...');

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Google Maps API key not configured'
      }, { status: 500 });
    }

    // Test with two simple postcodes
    const origin = 'SW1A 1AA'; // Buckingham Palace
    const destination = 'E1 6AN'; // Tower of London

    console.log(`🧪 TEST: Calculating route from ${origin} to ${destination}`);

    // Import and use the Google Maps function
    const { calculateCommute } = await import('@/lib/google-maps');

    const result = await calculateCommute(origin, destination, 'test-user');

    console.log('✅ TEST: Success!', result);

    return NextResponse.json({
      success: true,
      message: 'Single match calculation successful',
      test_route: {
        origin,
        destination,
        result
      }
    });

  } catch (error) {
    console.error('❌ TEST: Failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

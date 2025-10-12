import { NextRequest, NextResponse } from 'next/server';

/**
 * TEST: Direct Google Maps call WITHOUT rate limiter
 * This bypasses the rate limiter to test if Google Maps works at all
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🧪 TEST: Direct Google Maps call (no rate limiter)');

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'No API key' }, { status: 500 });
    }

    const origin = 'SW1A 1AA';
    const destination = 'E1 6AN';

    const params = new URLSearchParams({
      origins: origin,
      destinations: destination,
      mode: 'driving',
      units: 'imperial',
      key: apiKey,
    });

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

    console.log('🌐 Calling Google Maps directly...');
    console.log(`   Origin: ${origin}`);
    console.log(`   Destination: ${destination}`);

    const startTime = Date.now();

    // Add timeout using AbortController
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.log('⏱️ Timeout triggered after 10 seconds');
      controller.abort();
    }, 10000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const elapsed = Date.now() - startTime;
      console.log(`⏱️ Request completed in ${elapsed}ms`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP Error:', response.status, errorText);
        return NextResponse.json({
          success: false,
          error: `HTTP ${response.status}`,
          body: errorText
        }, { status: 500 });
      }

      const data = await response.json();

      console.log('📊 Response:', JSON.stringify(data, null, 2));

      return NextResponse.json({
        success: true,
        elapsed_ms: elapsed,
        data
      });

    } catch (fetchError: any) {
      clearTimeout(timeout);

      if (fetchError.name === 'AbortError') {
        console.error('❌ Request timed out after 10 seconds');
        return NextResponse.json({
          success: false,
          error: 'Request timed out after 10 seconds'
        }, { status: 500 });
      }

      throw fetchError;
    }

  } catch (error: any) {
    console.error('❌ Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

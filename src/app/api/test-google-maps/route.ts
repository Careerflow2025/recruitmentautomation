import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Test Google Maps API Configuration
 * GET /api/test-google-maps
 * 
 * Tests the Google Maps API with sample UK postcodes to diagnose authentication issues
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing Google Maps API configuration...');

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
        { 
          success: false, 
          message: 'Authentication required for testing',
          error: 'Authentication required' 
        },
        { status: 401 }
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    const testResults = {
      user: {
        id: user.id,
        email: user.email,
      },
      api_key: {
        configured: !!apiKey,
        length: apiKey?.length || 0,
        prefix: apiKey?.substring(0, 8) + '...',
      },
      tests: [] as any[],
    };

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        message: 'Google Maps API key not configured',
        results: testResults,
      });
    }

    // Test 1: Simple UK postcode pair
    const testPairs = [
      { origin: 'SW1A1AA', destination: 'EC2A3LT', description: 'London to London City' },
      { origin: 'M1 1AA', destination: 'B1 1AA', description: 'Manchester to Birmingham' },
    ];

    for (const testPair of testPairs) {
      console.log(`🧪 Testing: ${testPair.description} (${testPair.origin} -> ${testPair.destination})`);
      
      const params = new URLSearchParams({
        origins: testPair.origin,
        destinations: testPair.destination,
        mode: 'driving',
        units: 'imperial',
        key: apiKey,
      });

      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Netlify-Function/1.0',
            'Referer': process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || 'https://localhost:8888'
          }
        });

        const responseData = await response.json();

        const testResult = {
          ...testPair,
          success: response.ok && responseData.status === 'OK',
          http_status: response.status,
          api_status: responseData.status,
          error_message: responseData.error_message,
          has_results: !!(responseData.rows?.[0]?.elements?.[0]),
          element_status: responseData.rows?.[0]?.elements?.[0]?.status,
          duration: responseData.rows?.[0]?.elements?.[0]?.duration,
          raw_response: responseData,
        };

        testResults.tests.push(testResult);

        if (testResult.success) {
          console.log(`✅ Test passed: ${testPair.description}`);
        } else {
          console.log(`❌ Test failed: ${testPair.description} - ${testResult.error_message || testResult.api_status}`);
        }

      } catch (error) {
        console.error(`❌ Test error: ${testPair.description}`, error);
        testResults.tests.push({
          ...testPair,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successfulTests = testResults.tests.filter(t => t.success).length;
    const allTestsPassed = successfulTests === testResults.tests.length;

    return NextResponse.json({
      success: allTestsPassed,
      message: allTestsPassed 
        ? 'All Google Maps API tests passed! ✅'
        : `${successfulTests}/${testResults.tests.length} tests passed. Check API key restrictions and billing.`,
      results: testResults,
    });

  } catch (error) {
    console.error('Google Maps API test error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      {
        success: false,
        message: `Google Maps API test failed: ${errorMessage}`,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
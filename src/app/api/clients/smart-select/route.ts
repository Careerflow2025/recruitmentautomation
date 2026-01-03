import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';

interface SmartSelectRequest {
  query: string;  // Natural language query like "Find clinics in SW London looking for nurses"
  limit?: number;
  include_no_email?: boolean;
}

interface Client {
  id: string;
  surgery: string;
  role: string;
  postcode: string;
  pay: string;
  days: string;
  client_email?: string;
  requirements?: string;
  notes?: string;
}

interface FilterCriteria {
  locations: string[];
  roles: string[];
  pay_min?: number;
  pay_max?: number;
  days?: string[];
  keywords: string[];
  exclude_keywords: string[];
}

/**
 * POST /api/clients/smart-select
 * AI-powered client filtering based on natural language query
 */
export async function POST(request: NextRequest) {
  try {
    const body: SmartSelectRequest = await request.json();
    const {
      query,
      limit = 50,
      include_no_email = false,
    } = body;

    if (!query || query.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'Search query is required (at least 3 characters)' },
        { status: 400 }
      );
    }

    // Create Supabase client
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check for Anthropic API key
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { success: false, error: 'AI service not configured. Please add ANTHROPIC_API_KEY.' },
        { status: 500 }
      );
    }

    // First, get all clients to provide context to Claude
    const { data: allClients, error: clientsError } = await supabase
      .from('clients')
      .select('id, surgery, role, postcode, pay, days, client_email, requirements, notes')
      .eq('user_id', user.id)
      .order('surgery', { ascending: true });

    if (clientsError) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch clients' },
        { status: 500 }
      );
    }

    if (!allClients || allClients.length === 0) {
      return NextResponse.json({
        success: true,
        clients: [],
        totalMatched: 0,
        query: query,
        interpretation: 'No clients in database to filter',
      });
    }

    // Use Claude to interpret the query and filter clients
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });

    // Create a summary of available data for Claude
    const uniqueLocations = [...new Set(allClients.map(c => extractArea(c.postcode)).filter(Boolean))];
    const uniqueRoles = [...new Set(allClients.map(c => c.role).filter(Boolean))];

    const prompt = `You are a dental recruitment assistant helping to filter a list of dental practices (clients) based on a natural language query.

USER'S QUERY: "${query}"

AVAILABLE CLIENTS DATA:
Total clients: ${allClients.length}
Unique locations (postcode areas): ${uniqueLocations.join(', ')}
Unique roles needed: ${uniqueRoles.join(', ')}

CLIENT LIST (JSON):
${JSON.stringify(allClients.slice(0, 100).map(c => ({
  id: c.id,
  surgery: c.surgery,
  role: c.role,
  postcode: c.postcode,
  pay: c.pay,
  days: c.days,
  has_email: !!c.client_email,
})), null, 2)}

YOUR TASK:
1. Interpret the user's query to understand what clients they're looking for
2. Return a JSON response with:
   - "matched_ids": array of client IDs that match the query
   - "interpretation": brief explanation of how you interpreted the query
   - "filters_applied": object describing what filters you applied

Location matching hints:
- SW, SE, NW, NE, N, E, W = London areas
- CR = Croydon, BR = Bromley, KT = Kingston, TW = Twickenham
- Full city names should match postcodes in that area

Role matching hints:
- "nurse" or "DN" = Dental Nurse
- "receptionist" or "RCP" = Dental Receptionist
- "hygienist" = Dental Hygienist
- "dentist" or "DT" = Dentist

RESPOND ONLY WITH VALID JSON, no other text:
{
  "matched_ids": ["id1", "id2", ...],
  "interpretation": "Looking for...",
  "filters_applied": {
    "locations": ["SW", "SE"],
    "roles": ["Dental Nurse"],
    "other_criteria": "..."
  }
}`;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract the response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse Claude's response
    let parsedResponse;
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response:', responseText);
      // Fallback: return all clients
      return NextResponse.json({
        success: true,
        clients: allClients.slice(0, limit),
        totalMatched: allClients.length,
        query: query,
        interpretation: 'Unable to parse AI response, showing all clients',
        filters_applied: {},
      });
    }

    // Filter clients based on Claude's matched IDs
    const matchedIds = new Set(parsedResponse.matched_ids || []);
    let matchedClients = allClients.filter(c => matchedIds.has(c.id));

    // Apply email filter if needed
    if (!include_no_email) {
      matchedClients = matchedClients.filter(c => !!c.client_email);
    }

    // Apply limit
    const limitedClients = matchedClients.slice(0, limit);

    return NextResponse.json({
      success: true,
      clients: limitedClients,
      totalMatched: matchedClients.length,
      totalBeforeEmailFilter: parsedResponse.matched_ids?.length || 0,
      query: query,
      interpretation: parsedResponse.interpretation,
      filters_applied: parsedResponse.filters_applied,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error('Smart select error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process query',
      },
      { status: 500 }
    );
  }
}

/**
 * Extract area code from UK postcode
 */
function extractArea(postcode: string): string {
  if (!postcode) return '';
  const match = postcode.match(/^([A-Z]{1,2})\d/i);
  return match ? match[1].toUpperCase() : '';
}

/**
 * GET /api/clients/smart-select
 * Get available filter options for smart select UI
 */
export async function GET(request: NextRequest) {
  try {
    // Create Supabase client
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get unique values for filter options
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('role, postcode')
      .eq('user_id', user.id);

    if (clientsError) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch client data' },
        { status: 500 }
      );
    }

    // Extract unique values
    const roles = [...new Set(clients?.map(c => c.role).filter(Boolean))].sort();
    const areas = [...new Set(clients?.map(c => extractArea(c.postcode)).filter(Boolean))].sort();

    // Map area codes to readable names
    const areaNames: Record<string, string> = {
      'SW': 'South West London',
      'SE': 'South East London',
      'NW': 'North West London',
      'NE': 'North East London',
      'N': 'North London',
      'E': 'East London',
      'W': 'West London',
      'EC': 'Central London (EC)',
      'WC': 'Central London (WC)',
      'CR': 'Croydon',
      'BR': 'Bromley',
      'KT': 'Kingston',
      'TW': 'Twickenham',
      'HA': 'Harrow',
      'UB': 'Uxbridge',
      'EN': 'Enfield',
      'IG': 'Ilford',
      'RM': 'Romford',
      'DA': 'Dartford',
      'SM': 'Sutton',
      'WD': 'Watford',
    };

    const areasWithNames = areas.map(code => ({
      code,
      name: areaNames[code] || code,
    }));

    return NextResponse.json({
      success: true,
      totalClients: clients?.length || 0,
      filterOptions: {
        roles,
        areas: areasWithNames,
      },
      exampleQueries: [
        'Find all clinics in South London',
        'Practices looking for dental nurses in SW or SE',
        'Clinics in Croydon area',
        'All practices needing receptionists',
        'Dental surgeries with weekday availability',
      ],
    });
  } catch (error) {
    console.error('Smart select options error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get filter options',
      },
      { status: 500 }
    );
  }
}

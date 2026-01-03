import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';

interface SmartSelectRequest {
  criteria: string;
  limit?: number;
}

interface ParsedCriteria {
  role?: string;
  postcode_prefix?: string;
  has_email: boolean;
  availability?: string;
  min_salary?: number;
  max_salary?: number;
  experience_keywords?: string[];
}

/**
 * POST /api/candidates/smart-select
 * AI-powered candidate selection based on natural language criteria
 */
export async function POST(request: NextRequest) {
  try {
    const body: SmartSelectRequest = await request.json();
    const { criteria, limit = 20 } = body;

    if (!criteria || criteria.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Selection criteria is required' },
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

    // Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    // Use Claude to parse the natural language criteria
    const parsePrompt = `You are a dental recruitment assistant. Parse the following candidate selection criteria into structured filters.

USER CRITERIA: "${criteria}"

AVAILABLE FILTERS:
- role: Dental role (Dentist, Dental Nurse, Dental Hygienist, Dental Receptionist, Treatment Coordinator, Practice Manager, Trainee Dental Nurse)
- postcode_prefix: UK postcode prefix like "SW", "E", "NW", "CR" for location filtering
- has_email: Whether candidate must have an email (always true for email campaigns)
- availability: Days/pattern like "Mon-Fri", "Weekends", "Part-time"
- experience_keywords: Keywords to look for in notes/experience

Return ONLY a valid JSON object with these fields. Example:
{
  "role": "Dental Nurse",
  "postcode_prefix": "SW",
  "has_email": true,
  "availability": "Mon-Fri",
  "experience_keywords": ["experienced", "5 years"]
}

If a filter is not mentioned, omit it from the response. Always set has_email: true for email campaigns.`;

    const parseMessage = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{ role: 'user', content: parsePrompt }],
    });

    // Extract JSON from response
    const parseContent = parseMessage.content[0].type === 'text' ? parseMessage.content[0].text : '';
    let parsedCriteria: ParsedCriteria;

    try {
      // Try to extract JSON from the response
      const jsonMatch = parseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedCriteria = JSON.parse(jsonMatch[0]);
      } else {
        parsedCriteria = { has_email: true };
      }
    } catch {
      parsedCriteria = { has_email: true };
    }

    // Ensure has_email is always true for email campaigns
    parsedCriteria.has_email = true;

    // Build database query
    let query = supabase
      .from('candidates')
      .select('id, first_name, last_name, email, phone, role, postcode, salary, days, notes, added_at')
      .eq('user_id', user.id);

    // Apply filters
    if (parsedCriteria.has_email) {
      query = query.not('email', 'is', null);
    }

    if (parsedCriteria.role) {
      query = query.ilike('role', `%${parsedCriteria.role}%`);
    }

    if (parsedCriteria.postcode_prefix) {
      query = query.ilike('postcode', `${parsedCriteria.postcode_prefix}%`);
    }

    if (parsedCriteria.availability) {
      query = query.ilike('days', `%${parsedCriteria.availability}%`);
    }

    // Apply limit and order
    query = query.order('added_at', { ascending: false }).limit(limit * 2); // Get extra for filtering

    const { data: candidates, error: queryError } = await query;

    if (queryError) {
      return NextResponse.json(
        { success: false, error: 'Failed to query candidates' },
        { status: 500 }
      );
    }

    // Further filter by experience keywords if provided
    let filteredCandidates = candidates || [];
    if (parsedCriteria.experience_keywords && parsedCriteria.experience_keywords.length > 0) {
      filteredCandidates = filteredCandidates.filter(c => {
        const searchText = `${c.notes || ''} ${c.role || ''}`.toLowerCase();
        return parsedCriteria.experience_keywords!.some(kw =>
          searchText.includes(kw.toLowerCase())
        );
      });
    }

    // Limit results
    const results = filteredCandidates.slice(0, limit);

    // Use Claude to rank and explain matches
    let rankedResults = results;
    if (results.length > 0) {
      const rankPrompt = `Given these candidates and the criteria "${criteria}", rate each candidate's match quality (1-100) and provide a brief reason.

CANDIDATES:
${results.map((c, i) => `${i + 1}. ${c.first_name} ${c.last_name} - ${c.role} - ${c.postcode} - ${c.days || 'N/A'}`).join('\n')}

Return a JSON array with objects: [{"index": 1, "score": 85, "reason": "Matches role and location"}]
Only return the JSON array, nothing else.`;

      try {
        const rankMessage = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1000,
          messages: [{ role: 'user', content: rankPrompt }],
        });

        const rankContent = rankMessage.content[0].type === 'text' ? rankMessage.content[0].text : '';
        const jsonMatch = rankContent.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
          const rankings = JSON.parse(jsonMatch[0]);
          rankedResults = results.map((candidate, i) => {
            const ranking = rankings.find((r: { index: number }) => r.index === i + 1);
            return {
              ...candidate,
              match_score: ranking?.score || 70,
              match_reason: ranking?.reason || 'Matches basic criteria',
            };
          });

          // Sort by score descending
          rankedResults.sort((a: any, b: any) => (b.match_score || 0) - (a.match_score || 0));
        }
      } catch (rankError) {
        // If ranking fails, just add default scores
        rankedResults = results.map(c => ({
          ...c,
          match_score: 70,
          match_reason: 'Matches search criteria',
        }));
      }
    }

    return NextResponse.json({
      success: true,
      parsedCriteria,
      count: rankedResults.length,
      candidates: rankedResults,
      usage: {
        parseTokens: parseMessage.usage.input_tokens + parseMessage.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error('Smart select error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process selection',
      },
      { status: 500 }
    );
  }
}

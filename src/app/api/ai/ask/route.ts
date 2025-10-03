import { NextResponse } from 'next/server';
import { askAssistant } from '@/lib/ai-service';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const { question } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured. Please add it to .env.local' },
        { status: 500 }
      );
    }

    // Fetch data from Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Get all candidates
    const { data: candidates, error: candidatesError } = await supabase
      .from('candidates')
      .select('*')
      .order('added_at', { ascending: false });

    if (candidatesError) {
      console.error('Error fetching candidates:', candidatesError);
    }

    // Get all clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .order('added_at', { ascending: false });

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
    }

    // Get all matches (if match_statuses table exists)
    const { data: matches, error: matchesError } = await supabase
      .from('match_statuses')
      .select('*');

    if (matchesError) {
      console.warn('Match statuses not available:', matchesError);
    }

    // Prepare context for AI
    const context = {
      candidates: candidates || [],
      clients: clients || [],
      matches: matches || [],
      stats: {
        totalCandidates: candidates?.length || 0,
        totalClients: clients?.length || 0,
        totalMatches: matches?.length || 0,
      }
    };

    // Ask Claude AI
    const answer = await askAssistant(question, context);

    return NextResponse.json({
      success: true,
      question,
      answer,
      dataUsed: {
        candidates: context.candidates.length,
        clients: context.clients.length,
        matches: context.matches.length,
      }
    });

  } catch (error: any) {
    console.error('Ask AI API error:', error);

    // Provide more detailed error information
    let errorMessage = 'Failed to get answer from AI';
    let errorDetails = error.message || 'Unknown error';

    // Check for specific error types
    if (error.message?.includes('ANTHROPIC_API_KEY')) {
      errorMessage = 'API Key Error';
      errorDetails = error.message;
    } else if (error.status === 401) {
      errorMessage = 'Invalid API Key';
      errorDetails = 'Your Anthropic API key appears to be invalid. Please check .env.local';
    } else if (error.status === 429) {
      errorMessage = 'Rate Limit Exceeded';
      errorDetails = 'Too many requests. Please try again in a moment.';
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
        fullError: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}

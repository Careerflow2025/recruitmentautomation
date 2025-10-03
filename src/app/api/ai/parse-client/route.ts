import { NextResponse } from 'next/server';
import { parseClients } from '@/lib/ai-service';

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text input is required' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured. Please add it to .env.local' },
        { status: 500 }
      );
    }

    // Parse clients using Claude AI
    const clients = await parseClients(text);

    return NextResponse.json({
      success: true,
      clients,
      count: clients.length
    });

  } catch (error: any) {
    console.error('Parse client API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse clients',
        details: error.message
      },
      { status: 500 }
    );
  }
}

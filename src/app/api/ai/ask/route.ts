import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'You must be logged in to use AI assistant' },
        { status: 401 }
      );
    }

    // Get all candidates for current user
    const { data: candidates } = await supabase
      .from('candidates')
      .select('*')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false });

    // Get all clients for current user
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false });

    // Initialize Anthropic
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Create AI assistant with tools for database operations
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      tools: [
        {
          name: 'add_candidate',
          description: 'Add a new candidate to the database. Use this when the user asks to add/create/insert a candidate.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Candidate ID (e.g., CAN001)' },
              role: { type: 'string', description: 'Job role (e.g., Dental Nurse, Dentist)' },
              postcode: { type: 'string', description: 'UK postcode' },
              salary: { type: 'string', description: 'Salary expectation (e.g., £15-£17)' },
              days: { type: 'string', description: 'Working days (e.g., Mon-Wed)' },
              phone: { type: 'string', description: 'Phone number (optional)' },
              notes: { type: 'string', description: 'Additional notes (optional)' },
            },
            required: ['id', 'role', 'postcode', 'salary', 'days'],
          },
        },
        {
          name: 'add_client',
          description: 'Add a new client/surgery to the database. Use this when the user asks to add/create/insert a client or surgery.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Client ID (e.g., CL001)' },
              surgery: { type: 'string', description: 'Surgery/practice name' },
              role: { type: 'string', description: 'Role needed' },
              postcode: { type: 'string', description: 'UK postcode' },
              pay: { type: 'string', description: 'Pay offered (e.g., £16-£18)' },
              days: { type: 'string', description: 'Days needed (e.g., Mon-Fri)' },
            },
            required: ['id', 'surgery', 'role', 'postcode', 'pay', 'days'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `You are an AI assistant for a dental recruitment system. You can view and analyze data, AND you can add new candidates and clients to the database.

Current data:
- Candidates: ${candidates?.length || 0}
- Clients: ${clients?.length || 0}

Candidates data:
${JSON.stringify(candidates || [], null, 2)}

Clients data:
${JSON.stringify(clients || [], null, 2)}

User question: ${question}

If the user asks you to add/create/insert a candidate or client, use the appropriate tool. Extract all information from their message and call the tool with the data.`,
        },
      ],
    });

    let finalAnswer = '';
    const toolResults = [];

    // Process AI response and execute tool calls
    for (const block of response.content) {
      if (block.type === 'text') {
        finalAnswer += block.text;
      } else if (block.type === 'tool_use') {
        const toolName = block.name;
        const toolInput = block.input as Record<string, string>;

        if (toolName === 'add_candidate') {
          // Add candidate to database
          const { error } = await supabase.from('candidates').insert({
            ...toolInput,
            user_id: user.id,
            added_at: new Date().toISOString(),
          });

          if (error) {
            toolResults.push(`Error adding candidate: ${error.message}`);
          } else {
            toolResults.push(`✅ Successfully added candidate ${toolInput.id}`);
          }
        } else if (toolName === 'add_client') {
          // Add client to database
          const { error } = await supabase.from('clients').insert({
            ...toolInput,
            user_id: user.id,
            added_at: new Date().toISOString(),
          });

          if (error) {
            toolResults.push(`Error adding client: ${error.message}`);
          } else {
            toolResults.push(`✅ Successfully added client ${toolInput.id}`);
          }
        }
      }
    }

    // Combine answer with tool results
    const combinedAnswer = toolResults.length > 0
      ? `${finalAnswer}\n\n${toolResults.join('\n')}`
      : finalAnswer;

    return NextResponse.json({
      success: true,
      question,
      answer: combinedAnswer,
      toolsUsed: toolResults.length,
      dataUsed: {
        candidates: candidates?.length || 0,
        clients: clients?.length || 0,
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

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
      model: 'claude-sonnet-4-20250514',
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
        {
          name: 'update_candidate',
          description: 'Update an existing candidate in the database. Use this when the user asks to edit/update/modify a candidate.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Candidate ID to update (e.g., CAN001)' },
              role: { type: 'string', description: 'Job role (optional)' },
              postcode: { type: 'string', description: 'UK postcode (optional)' },
              salary: { type: 'string', description: 'Salary expectation (optional)' },
              days: { type: 'string', description: 'Working days (optional)' },
              phone: { type: 'string', description: 'Phone number (optional)' },
              notes: { type: 'string', description: 'Additional notes (optional)' },
            },
            required: ['id'],
          },
        },
        {
          name: 'update_client',
          description: 'Update an existing client in the database. Use this when the user asks to edit/update/modify a client.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Client ID to update (e.g., CL001)' },
              surgery: { type: 'string', description: 'Surgery/practice name (optional)' },
              role: { type: 'string', description: 'Role needed (optional)' },
              postcode: { type: 'string', description: 'UK postcode (optional)' },
              pay: { type: 'string', description: 'Pay offered (optional)' },
              days: { type: 'string', description: 'Days needed (optional)' },
            },
            required: ['id'],
          },
        },
        {
          name: 'delete_candidate',
          description: 'Delete a candidate from the database. Use this when the user asks to delete/remove a candidate.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Candidate ID to delete (e.g., CAN001)' },
            },
            required: ['id'],
          },
        },
        {
          name: 'delete_client',
          description: 'Delete a client from the database. Use this when the user asks to delete/remove a client.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Client ID to delete (e.g., CL001)' },
            },
            required: ['id'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `You are an AI assistant for a dental recruitment system. You can view and analyze data, AND you can add, update, or delete candidates and clients in the database.

Current data:
- Candidates: ${candidates?.length || 0}
- Clients: ${clients?.length || 0}

Candidates data:
${JSON.stringify(candidates || [], null, 2)}

Clients data:
${JSON.stringify(clients || [], null, 2)}

User question: ${question}

Available operations:
- ADD: If the user asks to add/create/insert a candidate or client, use add_candidate or add_client
- UPDATE: If the user asks to edit/update/modify a candidate or client, use update_candidate or update_client
- DELETE: If the user asks to delete/remove a candidate or client, use delete_candidate or delete_client

Extract all information from their message and call the appropriate tool with the data.`,
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
        } else if (toolName === 'update_candidate') {
          // Update candidate in database
          const { id, ...updateData } = toolInput;
          const { error } = await supabase
            .from('candidates')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', user.id);

          if (error) {
            toolResults.push(`Error updating candidate: ${error.message}`);
          } else {
            toolResults.push(`✅ Successfully updated candidate ${id}`);
          }
        } else if (toolName === 'update_client') {
          // Update client in database
          const { id, ...updateData } = toolInput;
          const { error } = await supabase
            .from('clients')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', user.id);

          if (error) {
            toolResults.push(`Error updating client: ${error.message}`);
          } else {
            toolResults.push(`✅ Successfully updated client ${id}`);
          }
        } else if (toolName === 'delete_candidate') {
          // Delete candidate from database
          const { error } = await supabase
            .from('candidates')
            .delete()
            .eq('id', toolInput.id)
            .eq('user_id', user.id);

          if (error) {
            toolResults.push(`Error deleting candidate: ${error.message}`);
          } else {
            toolResults.push(`✅ Successfully deleted candidate ${toolInput.id}`);
          }
        } else if (toolName === 'delete_client') {
          // Delete client from database
          const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', toolInput.id)
            .eq('user_id', user.id);

          if (error) {
            toolResults.push(`Error deleting client: ${error.message}`);
          } else {
            toolResults.push(`✅ Successfully deleted client ${toolInput.id}`);
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

import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple test endpoint to verify RunPod vLLM connection
 * Visit: /api/ai/test
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log('🧪 Testing RunPod vLLM connection...');
    console.log(`📍 VPS_AI_URL: ${process.env.VPS_AI_URL}`);
    console.log(`🔑 VPS_AI_SECRET: ${process.env.VPS_AI_SECRET ? '✅ Set' : '❌ Missing'}`);

    if (!process.env.VPS_AI_URL || !process.env.VPS_AI_SECRET) {
      return NextResponse.json({
        success: false,
        error: 'Configuration Error',
        details: 'VPS_AI_URL or VPS_AI_SECRET not set in environment variables',
        envCheck: {
          VPS_AI_URL: !!process.env.VPS_AI_URL,
          VPS_AI_SECRET: !!process.env.VPS_AI_SECRET
        }
      }, { status: 500 });
    }

    // Minimal test prompt
    const testPrompt = 'Say hello in 5 words';

    console.log(`📤 Sending test request to vLLM...`);

    const response = await fetch(`${process.env.VPS_AI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VPS_AI_SECRET}`
      },
      body: JSON.stringify({
        model: '/workspace/models/mistral-7b-instruct',
        messages: [
          { role: 'user', content: testPrompt }
        ],
        max_tokens: 50,
        temperature: 0.7,
        stream: false
      }),
      signal: AbortSignal.timeout(30000) // 30 second timeout for test
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ vLLM returned error ${response.status}:`, errorText);

      return NextResponse.json({
        success: false,
        error: `vLLM Server Error ${response.status}`,
        details: errorText,
        responseTime: `${responseTime}ms`,
        endpoint: process.env.VPS_AI_URL,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || 'No response';

    console.log(`✅ vLLM test successful! Response: "${aiResponse}"`);

    return NextResponse.json({
      success: true,
      message: 'RunPod vLLM connection working!',
      testPrompt,
      aiResponse,
      responseTime: `${responseTime}ms`,
      endpoint: process.env.VPS_AI_URL,
      model: data.model || '/workspace/models/mistral-7b-instruct',
      usage: data.usage || null,
      timestamp: new Date().toISOString(),
      fullResponse: data
    });

  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    console.error('❌ Test failed:', error);

    return NextResponse.json({
      success: false,
      error: error.message,
      errorType: error.constructor.name,
      responseTime: `${responseTime}ms`,
      endpoint: process.env.VPS_AI_URL,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

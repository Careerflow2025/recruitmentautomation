import { NextResponse } from 'next/server';
import { initializeKnowledgeBase } from '@/lib/rag';

/**
 * Initialize knowledge base with embeddings
 * Run once to generate embeddings for all knowledge base entries
 *
 * GET /api/ai/init-knowledge
 */
export async function GET(request: Request) {
  try {
    console.log('📚 Starting knowledge base initialization...');

    await initializeKnowledgeBase();

    return NextResponse.json({
      success: true,
      message: 'Knowledge base initialized successfully'
    });
  } catch (error: any) {
    console.error('Error initializing knowledge base:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to initialize knowledge base'
      },
      { status: 500 }
    );
  }
}

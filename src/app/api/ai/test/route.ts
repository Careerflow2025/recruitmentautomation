import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    keyPreview: process.env.ANTHROPIC_API_KEY ?
      `${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...` :
      'NOT FOUND',
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('ANTHROPIC'))
  });
}

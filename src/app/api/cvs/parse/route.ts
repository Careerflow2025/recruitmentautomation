import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { extractTextFromCV, cleanExtractedText } from '@/lib/cv/extractText';
import { parseWithAI } from '@/lib/cv/parseWithAI';
import { findMatchingCandidates, getMatchMethod } from '@/lib/cv/matchCandidate';

/**
 * API Route: Parse CV with AI
 * POST /api/cvs/parse
 *
 * Downloads CV from storage, extracts text, parses with AI,
 * and finds matching candidates
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cv_id } = body;

    if (!cv_id) {
      return NextResponse.json(
        { success: false, error: 'cv_id is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Parsing CV: ${cv_id}`);

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
        { success: false, error: 'You must be logged in' },
        { status: 401 }
      );
    }

    // Get CV record
    const { data: cvRecord, error: cvError } = await supabase
      .from('candidate_cvs')
      .select('*')
      .eq('id', cv_id)
      .eq('user_id', user.id)
      .single();

    if (cvError || !cvRecord) {
      return NextResponse.json(
        { success: false, error: 'CV not found' },
        { status: 404 }
      );
    }

    // Update status to parsing
    await supabase
      .from('candidate_cvs')
      .update({ status: 'parsing' })
      .eq('id', cv_id);

    try {
      // Download CV from storage
      console.log(`📥 Downloading CV: ${cvRecord.cv_storage_path}`);
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('cvs')
        .download(cvRecord.cv_storage_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download CV: ${downloadError?.message || 'No data'}`);
      }

      // Convert blob to buffer
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extract text from CV
      console.log(`📄 Extracting text from ${cvRecord.cv_mime_type}`);
      const rawText = await extractTextFromCV(buffer, cvRecord.cv_mime_type);
      const cleanedText = cleanExtractedText(rawText);

      console.log(`✅ Extracted ${cleanedText.length} characters`);

      // Parse with AI
      console.log('🤖 Parsing with AI...');
      const parsedData = await parseWithAI(cleanedText);

      console.log('✅ Parsed data:', {
        name: parsedData.extracted_name,
        email: parsedData.extracted_email,
        phone: parsedData.extracted_phone,
        skills: parsedData.skills?.length || 0,
      });

      // Get all candidates for matching
      const { data: candidates } = await supabase
        .from('candidates')
        .select('id, first_name, last_name, email, phone')
        .eq('user_id', user.id);

      // Find matching candidates
      const suggestedMatches = findMatchingCandidates(parsedData, candidates || []);
      console.log(`🔍 Found ${suggestedMatches.length} potential matches`);

      // Auto-link if high confidence match found
      let autoLinked = false;
      let linkedCandidateId: string | null = null;
      let matchMethod: string | null = null;

      if (suggestedMatches.length > 0 && suggestedMatches[0].confidence >= 0.9) {
        const bestMatch = suggestedMatches[0];
        linkedCandidateId = bestMatch.candidate_id;
        matchMethod = getMatchMethod(bestMatch.match_reasons);
        autoLinked = true;
        console.log(`🔗 Auto-linking to candidate ${linkedCandidateId} (confidence: ${bestMatch.confidence})`);
      }

      // Update CV record with parsed data
      const updateData: any = {
        cv_text_content: cleanedText.slice(0, 50000), // Limit text storage
        cv_parsed_data: parsedData,
        status: autoLinked ? 'linked' : 'parsed',
        updated_at: new Date().toISOString(),
      };

      if (autoLinked && linkedCandidateId) {
        updateData.candidate_id = linkedCandidateId;
        updateData.match_confidence = suggestedMatches[0].confidence;
        updateData.match_method = matchMethod;
      }

      await supabase
        .from('candidate_cvs')
        .update(updateData)
        .eq('id', cv_id);

      return NextResponse.json({
        success: true,
        cv_id,
        parsed_data: parsedData,
        text_length: cleanedText.length,
        suggested_matches: suggestedMatches.slice(0, 5), // Top 5 matches
        auto_linked: autoLinked,
        linked_candidate_id: linkedCandidateId,
        match_method: matchMethod,
      });
    } catch (parseError) {
      // Update status to error
      await supabase
        .from('candidate_cvs')
        .update({
          status: 'error',
          error_message: parseError instanceof Error ? parseError.message : 'Parse failed',
        })
        .eq('id', cv_id);

      throw parseError;
    }
  } catch (error) {
    console.error('CV parse error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse CV',
      },
      { status: 500 }
    );
  }
}

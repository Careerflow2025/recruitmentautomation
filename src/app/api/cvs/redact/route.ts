import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { detectContacts, getRedactionStats } from '@/lib/cv/detectContacts';
import { redactCV, generateRedactionSummary, createRedactedContent, generateAnonymousReference } from '@/lib/cv/redactContent';

interface RedactRequest {
  cvId: string;
  config?: {
    redactEmails?: boolean;
    redactPhones?: boolean;
    redactAddresses?: boolean;
    redactPostcodes?: boolean;
    redactLinkedIn?: boolean;
    redactSocialMedia?: boolean;
    redactWebsites?: boolean;
  };
  generatePDF?: boolean;
}

/**
 * POST /api/cvs/redact
 * Redact contact information from a CV
 */
export async function POST(request: NextRequest) {
  try {
    const body: RedactRequest = await request.json();
    const { cvId, config = {} } = body;

    if (!cvId) {
      return NextResponse.json(
        { success: false, error: 'CV ID is required' },
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

    // Fetch the CV
    const { data: cv, error: cvError } = await supabase
      .from('candidate_cvs')
      .select('*')
      .eq('id', cvId)
      .eq('user_id', user.id)
      .single();

    if (cvError || !cv) {
      return NextResponse.json(
        { success: false, error: 'CV not found' },
        { status: 404 }
      );
    }

    // Check if CV has parsed content
    const parsedContent = cv.parsed_content;
    if (!parsedContent || !parsedContent.raw_text) {
      return NextResponse.json(
        { success: false, error: 'CV has not been parsed yet. Please parse the CV first.' },
        { status: 400 }
      );
    }

    // Detect contacts first
    const detectionResult = detectContacts(parsedContent.raw_text);
    const stats = getRedactionStats(detectionResult);

    // Perform redaction
    const anonymousRef = generateAnonymousReference();
    const redactionResult = redactCV(parsedContent.raw_text, {
      ...config,
      anonymousReference: anonymousRef,
    });

    // Create structured redacted content
    const redactedContent = createRedactedContent(
      {
        full_name: parsedContent.full_name,
        role: parsedContent.role || parsedContent.desired_role,
        location: parsedContent.location,
        summary: parsedContent.summary,
        skills: parsedContent.skills,
        experience: parsedContent.experience,
        education: parsedContent.education,
        qualifications: parsedContent.qualifications,
      },
      anonymousRef
    );

    const redactionSummary = generateRedactionSummary(redactionResult);

    // Update CV record with redaction information
    const { error: updateError } = await supabase
      .from('candidate_cvs')
      .update({
        redaction_status: 'completed',
        redaction_timestamp: new Date().toISOString(),
        detected_contacts: detectionResult.contacts,
        redacted_content: {
          anonymousReference: anonymousRef,
          redactedText: redactionResult.redactedText,
          structuredContent: redactedContent,
          redactionCount: redactionResult.redactionCount,
          redactionSummary,
        },
      })
      .eq('id', cvId);

    if (updateError) {
      console.error('Failed to update CV with redaction:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to save redaction results' },
        { status: 500 }
      );
    }

    // Log the redaction
    await supabase.from('cv_redaction_log').insert({
      user_id: user.id,
      cv_id: cvId,
      anonymous_reference: anonymousRef,
      items_redacted: redactionResult.redactionCount,
      detected_emails: detectionResult.contacts.emails.length,
      detected_phones: detectionResult.contacts.phones.length,
      detected_addresses: detectionResult.contacts.addresses.length,
      detected_linkedin: detectionResult.contacts.linkedIn.length,
      config_used: config,
    });

    return NextResponse.json({
      success: true,
      cvId,
      anonymousReference: anonymousRef,
      detection: {
        totalFound: detectionResult.totalFound,
        confidence: detectionResult.confidence,
        summary: stats.summary,
        details: stats.details,
      },
      redaction: {
        count: redactionResult.redactionCount,
        summary: redactionSummary,
      },
      redactedContent: {
        text: redactionResult.redactedText.substring(0, 500) + '...', // Preview only
        structured: redactedContent,
      },
    });
  } catch (error) {
    console.error('CV redaction error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to redact CV',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cvs/redact?cvId=xxx
 * Get redaction status and results for a CV
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cvId = searchParams.get('cvId');

    if (!cvId) {
      return NextResponse.json(
        { success: false, error: 'CV ID is required' },
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

    // Fetch CV with redaction data
    const { data: cv, error: cvError } = await supabase
      .from('candidate_cvs')
      .select('id, cv_filename, redaction_status, redaction_timestamp, detected_contacts, redacted_content')
      .eq('id', cvId)
      .eq('user_id', user.id)
      .single();

    if (cvError || !cv) {
      return NextResponse.json(
        { success: false, error: 'CV not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      cv: {
        id: cv.id,
        filename: cv.cv_filename,
        redactionStatus: cv.redaction_status || 'pending',
        redactionTimestamp: cv.redaction_timestamp,
        hasDetectedContacts: !!cv.detected_contacts,
        hasRedactedContent: !!cv.redacted_content,
        detectedContacts: cv.detected_contacts,
        redactedContent: cv.redacted_content,
      },
    });
  } catch (error) {
    console.error('CV redaction status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get redaction status',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cvs/redact?cvId=xxx
 * Clear redaction data from a CV (revert to unredacted)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cvId = searchParams.get('cvId');

    if (!cvId) {
      return NextResponse.json(
        { success: false, error: 'CV ID is required' },
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

    // Clear redaction data
    const { error: updateError } = await supabase
      .from('candidate_cvs')
      .update({
        redaction_status: 'pending',
        redaction_timestamp: null,
        detected_contacts: null,
        redacted_content: null,
        redacted_cv_path: null,
        redacted_cv_filename: null,
      })
      .eq('id', cvId)
      .eq('user_id', user.id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: 'Failed to clear redaction data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Redaction data cleared successfully',
    });
  } catch (error) {
    console.error('CV redaction clear error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear redaction',
      },
      { status: 500 }
    );
  }
}

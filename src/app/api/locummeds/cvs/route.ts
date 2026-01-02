import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/locummeds/cvs
 * Get CV records for candidates
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const userId = await verifyApiKey(supabase, apiKey);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const candidateId = searchParams.get('candidate_id');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('candidate_cvs')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (candidateId) {
      query = query.eq('candidate_id', candidateId);
    }

    const { data: cvs, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: cvs?.length || 0,
      cvs,
    });

  } catch (error) {
    console.error('CVs GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch CVs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/locummeds/cvs
 * Create or update a CV record
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const body = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const userId = await verifyApiKey(supabase, apiKey);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const {
      candidate_id,
      cv_filename,
      cv_storage_path,
      cv_text_content,
      cv_parsed_data,
      anonymized_cv_path,
    } = body;

    if (!candidate_id) {
      return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });
    }

    // Check if CV already exists for this candidate
    const { data: existing } = await supabase
      .from('candidate_cvs')
      .select('id')
      .eq('user_id', userId)
      .eq('candidate_id', candidate_id)
      .single();

    let cv;
    let error;

    if (existing) {
      // Update existing CV
      const result = await supabase
        .from('candidate_cvs')
        .update({
          cv_filename,
          cv_storage_path,
          cv_text_content,
          cv_parsed_data,
          anonymized_cv_path,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      cv = result.data;
      error = result.error;
    } else {
      // Create new CV record
      const result = await supabase
        .from('candidate_cvs')
        .insert({
          user_id: userId,
          candidate_id,
          cv_filename,
          cv_storage_path,
          cv_text_content,
          cv_parsed_data,
          anonymized_cv_path,
        })
        .select()
        .single();

      cv = result.data;
      error = result.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      cv,
      is_new: !existing,
    });

  } catch (error) {
    console.error('CVs POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save CV' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/locummeds/cvs/anonymize
 * Generate an anonymized version of a CV
 */
export async function PUT(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const body = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const userId = await verifyApiKey(supabase, apiKey);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const { candidate_id } = body;

    if (!candidate_id) {
      return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });
    }

    // Get candidate details
    const { data: candidate } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', candidate_id)
      .eq('user_id', userId)
      .single();

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Get CV record
    const { data: cvRecord } = await supabase
      .from('candidate_cvs')
      .select('*')
      .eq('candidate_id', candidate_id)
      .eq('user_id', userId)
      .single();

    // Get pipeline data for additional info
    const { data: pipeline } = await supabase
      .from('locummeds_pipeline')
      .select('*')
      .eq('candidate_id', candidate_id)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Generate anonymized CV data
    const anonymizedData = {
      // Keep postcode for location matching
      postcode: candidate.postcode,

      // Role and professional info
      role: candidate.role,
      years_experience: extractYearsExperience(cvRecord?.cv_parsed_data),

      // Registration (verified through pipeline)
      registration_type: pipeline?.registration_type,
      registration_verified: pipeline?.registration_verified,

      // Compliance
      right_to_work: pipeline?.right_to_work,
      dbs_valid: pipeline?.dbs_valid,

      // Availability
      available_days: pipeline?.available_days,
      available_start_date: pipeline?.available_start_date,
      expected_hourly_rate: pipeline?.expected_hourly_rate,

      // Skills and qualifications (from CV parsing)
      skills: cvRecord?.cv_parsed_data?.skills || [],
      qualifications: cvRecord?.cv_parsed_data?.qualifications || [],
      specializations: cvRecord?.cv_parsed_data?.specializations || [],

      // Work history (anonymized)
      work_history: anonymizeWorkHistory(cvRecord?.cv_parsed_data?.work_history),

      // Generated timestamp
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      candidate_id,
      anonymized_cv: anonymizedData,
      message: 'CV anonymized - name, email, phone, and identifying details removed. Postcode retained for location matching.',
    });

  } catch (error) {
    console.error('CV anonymize error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to anonymize CV' },
      { status: 500 }
    );
  }
}

/**
 * Extract years of experience from parsed CV data
 */
function extractYearsExperience(parsedData: any): number | null {
  if (!parsedData?.work_history) return null;

  try {
    const workHistory = parsedData.work_history;
    if (!Array.isArray(workHistory) || workHistory.length === 0) return null;

    // Find earliest start date
    let earliestYear = new Date().getFullYear();
    for (const job of workHistory) {
      if (job.start_year && job.start_year < earliestYear) {
        earliestYear = job.start_year;
      }
    }

    return new Date().getFullYear() - earliestYear;
  } catch {
    return null;
  }
}

/**
 * Anonymize work history by removing company names
 */
function anonymizeWorkHistory(workHistory: any[]): any[] {
  if (!workHistory || !Array.isArray(workHistory)) return [];

  return workHistory.map((job, index) => ({
    position: index + 1,
    role: job.role || job.title,
    type: job.type || 'Unknown', // 'NHS', 'Private Practice', 'Hospital', etc.
    duration_months: job.duration_months,
    start_year: job.start_year,
    end_year: job.end_year,
    responsibilities: job.responsibilities?.slice(0, 3) || [], // Keep first 3 responsibilities
  }));
}

async function verifyApiKey(supabase: any, apiKey: string): Promise<string | null> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const { data: keyData } = await supabase
    .from('locummeds_api_keys')
    .select('user_id')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (keyData) {
    await supabase
      .from('locummeds_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash);
  }

  return keyData?.user_id || null;
}

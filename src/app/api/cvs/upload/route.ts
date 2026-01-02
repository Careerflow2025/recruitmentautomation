import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { CV_UPLOAD_LIMITS, ACCEPTED_CV_TYPES } from '@/lib/constants';

/**
 * API Route: Upload CVs to Supabase Storage
 * POST /api/cvs/upload
 *
 * Accepts multiple CV files (PDF, DOC, DOCX) and uploads them to Supabase Storage
 * Creates candidate_cvs records with 'uploaded' status
 *
 * Features:
 * - Max 50 CVs per batch
 * - Duplicate detection (by filename)
 * - File type and size validation
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📤 Starting CV upload...');

    // Get form data with files
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files uploaded' },
        { status: 400 }
      );
    }

    // Enforce batch size limit (server-side validation)
    if (files.length > CV_UPLOAD_LIMITS.MAX_BATCH_SIZE) {
      console.log(`⚠️ Batch limit exceeded: ${files.length} files (max ${CV_UPLOAD_LIMITS.MAX_BATCH_SIZE})`);
      return NextResponse.json(
        {
          success: false,
          error: `Batch upload limit exceeded. Maximum ${CV_UPLOAD_LIMITS.MAX_BATCH_SIZE} files per upload. You submitted ${files.length} files.`,
          limit: CV_UPLOAD_LIMITS.MAX_BATCH_SIZE,
          submitted: files.length,
        },
        { status: 400 }
      );
    }

    console.log(`📄 Processing ${files.length} CV file(s) (limit: ${CV_UPLOAD_LIMITS.MAX_BATCH_SIZE})`);

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
        { success: false, error: 'You must be logged in to upload CVs' },
        { status: 401 }
      );
    }

    console.log(`✅ Authenticated user: ${user.email}`);

    // ============================================
    // DUPLICATE DETECTION
    // ============================================

    // Get existing CVs for this user to check for duplicates
    const { data: existingCVs } = await supabase
      .from('candidate_cvs')
      .select('cv_filename')
      .eq('user_id', user.id);

    const existingFilenames = new Set(
      existingCVs?.map(cv => cv.cv_filename.toLowerCase()) || []
    );

    // Track duplicates and files to process
    const duplicates: Array<{ filename: string; reason: string }> = [];
    const seenInBatch = new Set<string>();
    const filesToProcess: File[] = [];

    // Check each file for duplicates
    for (const file of files) {
      const normalizedName = file.name.toLowerCase();

      if (existingFilenames.has(normalizedName)) {
        duplicates.push({ filename: file.name, reason: 'Already uploaded' });
        console.log(`⚠️ Duplicate skipped (already uploaded): ${file.name}`);
        continue;
      }

      if (seenInBatch.has(normalizedName)) {
        duplicates.push({ filename: file.name, reason: 'Duplicate in batch' });
        console.log(`⚠️ Duplicate skipped (duplicate in batch): ${file.name}`);
        continue;
      }

      seenInBatch.add(normalizedName);
      filesToProcess.push(file);
    }

    console.log(`📊 Duplicate check: ${duplicates.length} duplicates found, ${filesToProcess.length} files to process`);

    // ============================================
    // FILE PROCESSING
    // ============================================

    const uploaded: Array<{
      filename: string;
      storage_path: string;
      cv_id: string;
      status: string;
    }> = [];
    const errors: Array<{ filename: string; error: string }> = [];

    // Process each non-duplicate file
    for (const file of filesToProcess) {
      try {
        // Validate file type using constants
        if (!ACCEPTED_CV_TYPES.MIME_TYPES.includes(file.type as any)) {
          errors.push({
            filename: file.name,
            error: `Invalid file type: ${file.type}. Only PDF, DOC, and DOCX files are allowed.`,
          });
          continue;
        }

        // Validate file size using constants
        if (file.size > CV_UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES) {
          errors.push({
            filename: file.name,
            error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is ${CV_UPLOAD_LIMITS.MAX_FILE_SIZE_MB}MB.`,
          });
          continue;
        }

        console.log(`📄 Uploading: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);

        // Generate unique filename
        const fileId = uuidv4();
        const fileExtension = file.name.split('.').pop() || 'pdf';
        const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${user.id}/${fileId}_${sanitizedFilename}`;

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const fileBuffer = new Uint8Array(arrayBuffer);

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('cvs')
          .upload(storagePath, fileBuffer, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          console.error(`❌ Storage upload error for ${file.name}:`, uploadError);
          errors.push({
            filename: file.name,
            error: `Upload failed: ${uploadError.message}`,
          });
          continue;
        }

        console.log(`✅ File uploaded to storage: ${storagePath}`);

        // Create candidate_cvs record
        const { data: cvRecord, error: dbError } = await supabase
          .from('candidate_cvs')
          .insert({
            user_id: user.id,
            cv_filename: file.name,
            cv_storage_path: storagePath,
            cv_file_size: file.size,
            cv_mime_type: file.type,
            status: 'uploaded',
          })
          .select()
          .single();

        if (dbError) {
          console.error(`❌ Database error for ${file.name}:`, dbError);
          // Try to clean up the uploaded file
          await supabase.storage.from('cvs').remove([storagePath]);
          errors.push({
            filename: file.name,
            error: `Database error: ${dbError.message}`,
          });
          continue;
        }

        console.log(`✅ CV record created: ${cvRecord.id}`);

        uploaded.push({
          filename: file.name,
          storage_path: storagePath,
          cv_id: cvRecord.id,
          status: 'uploaded',
        });
      } catch (fileError) {
        console.error(`❌ Error processing ${file.name}:`, fileError);
        errors.push({
          filename: file.name,
          error: fileError instanceof Error ? fileError.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: uploaded.length > 0 || duplicates.length > 0,
      message:
        uploaded.length > 0
          ? `Successfully uploaded ${uploaded.length} CV(s)${duplicates.length > 0 ? `, ${duplicates.length} duplicate(s) skipped` : ''}`
          : duplicates.length > 0
          ? `All ${duplicates.length} file(s) were duplicates and skipped`
          : 'No CVs were uploaded',
      uploaded,
      duplicates: duplicates.length > 0 ? duplicates : undefined,
      errors: errors.length > 0 ? errors : undefined,
      stats: {
        total: files.length,
        successful: uploaded.length,
        duplicates: duplicates.length,
        failed: errors.length,
      },
    });
  } catch (error) {
    console.error('CV upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload CVs',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cvs/upload
 * Get all CVs for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const candidateId = searchParams.get('candidate_id');

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

    // Build query
    let query = supabase
      .from('candidate_cvs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (candidateId) {
      query = query.eq('candidate_id', candidateId);
    }

    const { data: cvs, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: cvs?.length || 0,
      cvs,
    });
  } catch (error) {
    console.error('CV list error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list CVs',
      },
      { status: 500 }
    );
  }
}

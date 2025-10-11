import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { intelligentlyMapRow } from '@/lib/utils/intelligentColumnMapper';
import { aiParseCandidate } from '@/lib/utils/aiExcelParser';

/**
 * API Route: Upload Candidates from Excel (Mistral AI-Powered)
 * POST /api/upload/candidates
 *
 * Accepts an Excel file and imports candidates into the database
 * Uses Mistral 7B AI model to intelligently parse and map data to correct fields
 * Falls back to regex-based parsing if AI is unavailable
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📤 Starting candidate bulk upload...');

    // Get form data with file
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    console.log(`📄 Processing file: ${file.name} (${file.size} bytes)`);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse Excel or CSV file
    // xlsx library handles both .xlsx, .xls, and .csv files
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Found ${jsonData.length} rows in Excel file`);

    if (jsonData.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Excel file is empty' },
        { status: 400 }
      );
    }

    // Debug: Log the first row to see what columns exist
    if (jsonData.length > 0) {
      console.log('📋 First row columns:', Object.keys(jsonData[0]));
      console.log('📋 First row data:', jsonData[0]);
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'You must be logged in to upload candidates' },
        { status: 401 }
      );
    }

    console.log(`✅ Authenticated user: ${user.email}`);

    // Validate and transform data using Mistral AI (with fallback)
    const candidates = [];
    const errors = [];

    // Check if AI is available
    const useAI = process.env.VPS_AI_URL && process.env.VPS_AI_SECRET;

    console.log(`🤖 Using ${useAI ? 'Mistral 7B AI' : 'Regex-based'} intelligent parsing...`);

    for (let i = 0; i < jsonData.length; i++) {
      const row: any = jsonData[i];
      const rowNum = i + 2; // Excel row number (1-indexed + header)

      try {
        // Check if row is completely empty
        const hasAnyData = Object.values(row).some(val => val !== null && val !== undefined && String(val).trim() !== '');
        if (!hasAnyData) {
          continue; // Skip empty rows silently
        }

        console.log(`\n📋 Processing row ${rowNum}:`, row);

        let mapped;

        // Try AI parsing first if available
        if (useAI) {
          try {
            console.log('🤖 Using Mistral AI for parsing...');
            mapped = await aiParseCandidate(row);
          } catch (aiError) {
            console.warn('⚠️ AI parsing failed, falling back to regex:', aiError);
            mapped = intelligentlyMapRow(row);
          }
        } else {
          // Fallback to regex-based parsing
          console.log('🔧 Using regex-based parsing...');
          mapped = intelligentlyMapRow(row);
        }

        console.log(`✨ Parsed result:`, mapped);

        // Validate that we at least have a postcode (required for matching)
        if (!mapped.postcode || mapped.postcode.trim() === '') {
          errors.push(`Row ${rowNum}: Missing Postcode (required for matching). AI could not detect a valid UK postcode in this row.`);
          continue;
        }

        // Generate ID if not provided
        const id = mapped.id && mapped.id.trim() !== ''
          ? mapped.id.trim()
          : `CAN${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Use generic role if not provided
        const role = mapped.role && mapped.role.trim() !== ''
          ? mapped.role.trim()
          : 'General';

        // Create candidate object from AI-mapped data
        const candidate = {
          id: id,
          first_name: mapped.first_name || null,
          last_name: mapped.last_name || null,
          email: mapped.email || null,
          phone: mapped.phone || null,
          role: role,
          postcode: mapped.postcode.toUpperCase(),
          salary: mapped.salary || null,
          days: mapped.days || null,
          experience: mapped.experience || null,
          notes: mapped.notes || null,
          user_id: user.id,
          added_at: new Date().toISOString()
        };

        console.log(`✅ Final candidate object:`, candidate);

        candidates.push(candidate);
      } catch (error) {
        console.error(`❌ Error processing row ${rowNum}:`, error);
        errors.push(`Row ${rowNum}: ${error instanceof Error ? error.message : 'Invalid data'}`);
      }
    }

    console.log(`✅ Validated ${candidates.length} candidates`);
    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} validation errors`);
    }

    // Insert candidates into database
    if (candidates.length > 0) {
      const { data, error } = await supabase
        .from('candidates')
        .upsert(candidates, { onConflict: 'id' })
        .select();

      if (error) {
        console.error('Database insertion error:', error);
        return NextResponse.json(
          {
            success: false,
            error: `Database error: ${error.message}`,
            validationErrors: errors
          },
          { status: 500 }
        );
      }

      console.log(`✅ Successfully inserted ${candidates.length} candidates`);
    }

    // Always return validation errors if they exist, even if some succeeded
    const response: any = {
      success: candidates.length > 0,
      message: candidates.length > 0
        ? `Successfully uploaded ${candidates.length} candidates`
        : 'No valid candidates found. Please check the errors below.',
      stats: {
        total_rows: jsonData.length,
        successful: candidates.length,
        errors: errors.length
      }
    };

    if (errors.length > 0) {
      response.validationErrors = errors;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Candidate upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload candidates'
      },
      { status: 500 }
    );
  }
}

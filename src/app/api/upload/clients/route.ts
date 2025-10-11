import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { intelligentlyMapRow } from '@/lib/utils/intelligentColumnMapper';

/**
 * API Route: Upload Clients from Excel (AI-Powered)
 * POST /api/upload/clients
 *
 * Accepts an Excel file and imports clients into the database
 * Uses AI-powered column detection to automatically map data to correct fields
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📤 Starting client bulk upload...');

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
        { success: false, error: 'You must be logged in to upload clients' },
        { status: 401 }
      );
    }

    console.log(`✅ Authenticated user: ${user.email}`);

    // Validate and transform data using AI-powered mapping
    const clients = [];
    const errors = [];

    console.log('🤖 Using AI-powered intelligent column detection...');

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

        // Use AI-powered intelligent mapping
        const mapped = intelligentlyMapRow(row);

        console.log(`✨ AI-mapped result:`, mapped);

        // Validate that we at least have a postcode (required for matching)
        if (!mapped.postcode || mapped.postcode.trim() === '') {
          errors.push(`Row ${rowNum}: Missing Postcode (required for matching). AI could not detect a valid UK postcode in this row.`);
          continue;
        }

        // Generate ID if not provided
        const id = mapped.id && mapped.id.trim() !== ''
          ? mapped.id.trim()
          : `CL${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Use generic role if not provided
        const role = mapped.role && mapped.role.trim() !== ''
          ? mapped.role.trim()
          : 'General';

        // For clients, we need surgery name - use a reasonable default
        // Check if first_name or last_name could be surgery name
        let surgery = 'Unnamed Practice';
        if (mapped.first_name && !mapped.last_name) {
          // Single name field might be surgery name
          surgery = mapped.first_name;
        } else if (mapped.first_name && mapped.last_name) {
          // Both names provided - combine as surgery name
          surgery = `${mapped.first_name} ${mapped.last_name}`;
        }

        // Create client object from AI-mapped data
        const client = {
          id: id,
          surgery: surgery,
          role: role,
          postcode: mapped.postcode.toUpperCase(),
          budget: mapped.salary || null,  // For clients, salary field becomes budget
          requirement: mapped.days || null,  // Days field becomes requirement
          notes: mapped.notes || null,
          system: mapped.experience || null,  // Experience field becomes system info
          user_id: user.id,
          added_at: new Date().toISOString()
        };

        console.log(`✅ Final client object:`, client);

        clients.push(client);
      } catch (error) {
        console.error(`❌ Error processing row ${rowNum}:`, error);
        errors.push(`Row ${rowNum}: ${error instanceof Error ? error.message : 'Invalid data'}`);
      }
    }

    console.log(`✅ Validated ${clients.length} clients`);
    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} validation errors`);
    }

    // Insert clients into database
    if (clients.length > 0) {
      const { data, error } = await supabase
        .from('clients')
        .upsert(clients, { onConflict: 'id' })
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

      console.log(`✅ Successfully inserted ${clients.length} clients`);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded ${clients.length} clients`,
      stats: {
        total_rows: jsonData.length,
        successful: clients.length,
        errors: errors.length
      },
      validationErrors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Client upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload clients'
      },
      { status: 500 }
    );
  }
}

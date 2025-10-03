import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';

/**
 * API Route: Upload Clients from Excel
 * POST /api/upload/clients
 *
 * Accepts an Excel file and imports clients into the database
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

    // Validate and transform data
    const clients = [];
    const errors = [];

    for (let i = 0; i < jsonData.length; i++) {
      const row: any = jsonData[i];
      const rowNum = i + 2; // Excel row number (1-indexed + header)

      try {
        // Check if row is completely empty
        const hasAnyData = Object.values(row).some(val => val !== null && val !== undefined && String(val).trim() !== '');
        if (!hasAnyData) {
          continue; // Skip empty rows silently
        }

        // Only validate that Postcode exists (most critical field for matching)
        if (!row.Postcode || String(row.Postcode).trim() === '') {
          errors.push(`Row ${rowNum}: Missing Postcode (required for matching)`);
          continue;
        }

        // Generate ID if not provided
        const id = row.ID && String(row.ID).trim() !== ''
          ? String(row.ID).trim()
          : `CL${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Use generic values if not provided
        const surgery = row.Surgery && String(row.Surgery).trim() !== ''
          ? String(row.Surgery).trim()
          : 'Unnamed Practice';

        const role = row.Role && String(row.Role).trim() !== ''
          ? String(row.Role).trim()
          : 'General';

        // Transform to database format - accept ANY data in most fields
        const client = {
          id: id,
          surgery: surgery,
          role: role,
          postcode: String(row.Postcode).trim().toUpperCase(),
          pay: row.Pay ? String(row.Pay).trim() : null,
          days: row.Days ? String(row.Days).trim() : null,
          requirement: row.Requirement ? String(row.Requirement).trim() : null,
          notes: row.Notes ? String(row.Notes).trim() : null,
          system: row.System ? String(row.System).trim() : null,
          user_id: user.id,  // Add current user's ID
          added_at: new Date().toISOString()
        };

        clients.push(client);
      } catch (error) {
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

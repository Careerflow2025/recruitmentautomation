import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

/**
 * API Route: Download Candidate Excel Template
 * GET /api/templates/candidates
 *
 * Returns an Excel file with pre-filled headers and sample data
 */
export async function GET() {
  try {
    // Define the template structure with headers and ONE sample row
    const templateData = [
      {
        'ID': 'CAN001',
        'First Name': 'John',
        'Last Name': 'Doe',
        'Email': 'john.doe@example.com',
        'Phone': '07700900001',
        'Role': 'Dentist',
        'Postcode': 'SW1A 1AA',
        'Salary': '£80k-£100k',
        'Days': '4-5',
        'Experience': '5 years',
        'Notes': 'Sample notes'
      }
    ];

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 10 },  // ID
      { wch: 15 },  // First Name
      { wch: 15 },  // Last Name
      { wch: 25 },  // Email
      { wch: 15 },  // Phone
      { wch: 20 },  // Role
      { wch: 12 },  // Postcode
      { wch: 15 },  // Salary
      { wch: 10 },  // Days
      { wch: 20 },  // Experience
      { wch: 30 }   // Notes
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Candidates');

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return as downloadable file
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="candidates_template.xlsx"'
      }
    });

  } catch (error) {
    console.error('Template generation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate template'
      },
      { status: 500 }
    );
  }
}

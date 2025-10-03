import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

/**
 * API Route: Download Client Excel Template
 * GET /api/templates/clients
 *
 * Returns an Excel file with pre-filled headers and sample data
 */
export async function GET() {
  try {
    // Define the template structure with headers and ONE sample row
    const templateData = [
      {
        'ID': 'CL001',
        'Surgery': 'Sample Dental Practice',
        'Role': 'Dentist',
        'Postcode': 'SW1A 1AA',
        'Pay': '£500/day',
        'Days': '3-5',
        'Requirement': 'GDC registered',
        'Notes': 'Sample notes'
      }
    ];

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 10 },  // ID
      { wch: 30 },  // Surgery
      { wch: 20 },  // Role
      { wch: 12 },  // Postcode
      { wch: 15 },  // Pay
      { wch: 10 },  // Days
      { wch: 25 },  // Requirement
      { wch: 30 }   // Notes
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return as downloadable file
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="clients_template.xlsx"'
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

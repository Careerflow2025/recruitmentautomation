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
    // ID removed - system auto-generates IDs
    // Fields ordered by priority: Postcode (required) → Role → Surgery → Details
    const templateData = [
      {
        'Postcode': 'SW1A 1AA',
        'Role': 'Dentist',
        'Surgery': 'Sample Dental Practice',
        'Pay': '£500/day',
        'Days': 'Mon-Fri',
        'Requirement': 'GDC registered',
        'System': 'R4',
        'Notes': 'Sample notes'
      }
    ];

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 12 },  // Postcode (REQUIRED - first)
      { wch: 20 },  // Role
      { wch: 30 },  // Surgery
      { wch: 15 },  // Pay
      { wch: 12 },  // Days
      { wch: 25 },  // Requirement
      { wch: 15 },  // System
      { wch: 35 }   // Notes
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

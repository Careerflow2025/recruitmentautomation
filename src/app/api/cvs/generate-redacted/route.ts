import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';

interface GenerateRedactedRequest {
  candidate_id: string;
  cv_id?: string;
}

// Type for parsed CV data
interface ParsedCVData {
  extracted_name?: string;
  extracted_email?: string;
  extracted_phone?: string;
  skills?: string[];
  qualifications?: string[];
  experience_years?: number;
  work_history?: Array<{
    role?: string;
    employer?: string;
    duration?: string;
    description?: string;
  }>;
  education?: Array<{
    qualification?: string;
    institution?: string;
    year?: number | string;
  }>;
  summary?: string;
  role?: string;
  desired_role?: string;
  location?: string;
}

/**
 * POST /api/cvs/generate-redacted
 * Generate a beautifully formatted redacted CV PDF
 * - Uses cv_parsed_data for proper section structure
 * - Only anonymizes MOST RECENT employer
 * - Professional design with visual hierarchy
 */
export async function POST(request: NextRequest) {
  try {
    const body: GenerateRedactedRequest = await request.json();
    const { candidate_id, cv_id } = body;

    if (!candidate_id) {
      return NextResponse.json(
        { success: false, error: 'Candidate ID is required' },
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

    // Get candidate info
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .select('id, first_name, last_name, role, postcode, email, phone, days, notes')
      .eq('id', candidate_id)
      .eq('user_id', user.id)
      .single();

    if (candidateError || !candidate) {
      return NextResponse.json(
        { success: false, error: 'Candidate not found' },
        { status: 404 }
      );
    }

    // Get CV with parsed data
    let cvQuery = supabase
      .from('candidate_cvs')
      .select('*')
      .eq('candidate_id', candidate_id)
      .eq('user_id', user.id);

    if (cv_id) {
      cvQuery = cvQuery.eq('id', cv_id);
    }

    const { data: cv } = await cvQuery.order('created_at', { ascending: false }).limit(1).single();

    // Generate anonymous reference
    const candidateReference = `DN-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Get parsed data (structured sections)
    const parsedData: ParsedCVData = cv?.cv_parsed_data || {};

    // Generate beautiful PDF
    const pdfBytes = await generateBeautifulPDF(parsedData, candidate, candidateReference);

    // Convert to base64 for response
    const base64Pdf = Buffer.from(pdfBytes).toString('base64');

    // Store in Supabase storage temporarily
    const filename = `redacted_cv_${candidateReference}_${Date.now()}.pdf`;
    const storagePath = `redacted-cvs/${user.id}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('cvs')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    let publicUrl = null;
    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from('cvs')
        .getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
    }

    return NextResponse.json({
      success: true,
      candidateId: candidate_id,
      anonymousReference: candidateReference,
      filename,
      contentType: 'application/pdf',
      base64: base64Pdf,
      publicUrl,
      size: pdfBytes.length,
    });

  } catch (error) {
    console.error('Generate redacted CV error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate redacted CV',
      },
      { status: 500 }
    );
  }
}

/**
 * Generate a beautifully formatted PDF from parsed CV data
 */
async function generateBeautifulPDF(
  parsedData: ParsedCVData,
  candidate: {
    first_name?: string;
    last_name?: string;
    role?: string;
    postcode?: string;
    days?: string;
    notes?: string;
  },
  reference: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595, 842]); // A4 size

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Colors
  const brandColor = rgb(0.1, 0.3, 0.5);      // Deep blue
  const textColor = rgb(0.15, 0.15, 0.15);    // Near black
  const grayColor = rgb(0.4, 0.4, 0.4);       // Medium gray
  const lightGray = rgb(0.8, 0.8, 0.8);       // Light gray
  const lightBlue = rgb(0.95, 0.97, 1);       // Very light blue

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;
  let yPos = pageHeight - margin;

  // Helper to check if we need a new page
  const checkNewPage = (neededSpace: number): void => {
    if (yPos < margin + neededSpace) {
      // Add footer to current page
      drawFooter(page, font, margin, grayColor, lightGray);
      // Create new page
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPos = pageHeight - margin;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // 1. HEADER BAR (Full width at top)
  // ═══════════════════════════════════════════════════════════════
  page.drawRectangle({
    x: 0,
    y: pageHeight - 40,
    width: pageWidth,
    height: 40,
    color: brandColor,
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. TITLE - "CANDIDATE PROFILE"
  // ═══════════════════════════════════════════════════════════════
  yPos = pageHeight - 75;
  page.drawText('CANDIDATE PROFILE', {
    x: margin,
    y: yPos,
    size: 24,
    font: boldFont,
    color: brandColor,
  });
  yPos -= 28;

  // ═══════════════════════════════════════════════════════════════
  // 3. REFERENCE NUMBER
  // ═══════════════════════════════════════════════════════════════
  page.drawText(`Reference: ${reference}`, {
    x: margin,
    y: yPos,
    size: 11,
    font: boldFont,
    color: grayColor,
  });
  yPos -= 18;

  // Divider line
  page.drawLine({
    start: { x: margin, y: yPos },
    end: { x: pageWidth - margin, y: yPos },
    thickness: 1,
    color: lightGray,
  });
  yPos -= 25;

  // ═══════════════════════════════════════════════════════════════
  // 4. QUICK INFO BOX (Role | Location | Availability)
  // ═══════════════════════════════════════════════════════════════
  const role = parsedData.role || parsedData.desired_role || candidate.role || 'Dental Professional';
  const location = generalizeLocation(parsedData.location || candidate.postcode || '');
  const availability = candidate.days || '';

  const quickInfoParts = [role, location, availability].filter(Boolean);
  const quickInfo = quickInfoParts.join('  |  ');

  // Box background
  page.drawRectangle({
    x: margin,
    y: yPos - 8,
    width: contentWidth,
    height: 30,
    color: lightBlue,
    borderColor: brandColor,
    borderWidth: 0.5,
  });

  // Quick info text
  page.drawText(quickInfo, {
    x: margin + 15,
    y: yPos + 2,
    size: 11,
    font: boldFont,
    color: brandColor,
  });
  yPos -= 50;

  // ═══════════════════════════════════════════════════════════════
  // 5. PROFESSIONAL SUMMARY
  // ═══════════════════════════════════════════════════════════════
  const summary = parsedData.summary || candidate.notes || '';
  if (summary) {
    checkNewPage(80);
    yPos = drawSectionHeader(page, 'PROFESSIONAL SUMMARY', margin, yPos, boldFont, brandColor);
    yPos = drawWrappedText(page, summary, margin, yPos, font, textColor, contentWidth, 10, 14);
    yPos -= 20;
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. EMPLOYMENT HISTORY
  // ═══════════════════════════════════════════════════════════════
  if (parsedData.work_history && parsedData.work_history.length > 0) {
    checkNewPage(60);
    yPos = drawSectionHeader(page, 'EMPLOYMENT HISTORY', margin, yPos, boldFont, brandColor);

    for (let i = 0; i < parsedData.work_history.length; i++) {
      const job = parsedData.work_history[i];
      const isFirstJob = i === 0;

      // Anonymize only the MOST RECENT employer
      const employerName = isFirstJob
        ? anonymizeMostRecentEmployer(job.employer || '')
        : (job.employer || 'Healthcare Practice');

      checkNewPage(60);

      // Job role (bold with marker)
      const roleText = job.role || 'Position';
      page.drawText('>', {
        x: margin,
        y: yPos,
        size: 11,
        font: boldFont,
        color: brandColor,
      });
      page.drawText(roleText, {
        x: margin + 15,
        y: yPos,
        size: 11,
        font: boldFont,
        color: textColor,
      });
      yPos -= 16;

      // Employer name
      page.drawText(employerName, {
        x: margin + 15,
        y: yPos,
        size: 10,
        font: font,
        color: textColor,
      });
      yPos -= 14;

      // Duration (gray)
      if (job.duration) {
        page.drawText(job.duration, {
          x: margin + 15,
          y: yPos,
          size: 9,
          font: font,
          color: grayColor,
        });
        yPos -= 14;
      }

      // Description bullets (if available)
      if (job.description) {
        const bullets = job.description
          .split(/[•\-\n]/)
          .map(b => b.trim())
          .filter(b => b.length > 0)
          .slice(0, 5); // Max 5 bullets

        for (const bullet of bullets) {
          checkNewPage(15);
          page.drawText(`-  ${bullet}`, {
            x: margin + 20,
            y: yPos,
            size: 9,
            font: font,
            color: textColor,
          });
          yPos -= 12;
        }
      }

      yPos -= 12; // Space between jobs
    }
    yPos -= 8;
  }

  // ═══════════════════════════════════════════════════════════════
  // 7. EDUCATION & QUALIFICATIONS
  // ═══════════════════════════════════════════════════════════════
  if (parsedData.education && parsedData.education.length > 0) {
    checkNewPage(50);
    yPos = drawSectionHeader(page, 'EDUCATION & QUALIFICATIONS', margin, yPos, boldFont, brandColor);

    for (const edu of parsedData.education) {
      checkNewPage(35);

      // Qualification (bold with arrow)
      const qualText = edu.qualification || 'Qualification';
      page.drawText('>', {
        x: margin,
        y: yPos,
        size: 10,
        font: boldFont,
        color: brandColor,
      });
      page.drawText(qualText, {
        x: margin + 15,
        y: yPos,
        size: 10,
        font: boldFont,
        color: textColor,
      });
      yPos -= 14;

      // Institution and year
      const instYear = [edu.institution, edu.year].filter(Boolean).join(', ');
      if (instYear) {
        page.drawText(instYear, {
          x: margin + 15,
          y: yPos,
          size: 9,
          font: font,
          color: grayColor,
        });
        yPos -= 14;
      }
      yPos -= 6;
    }
    yPos -= 10;
  }

  // ═══════════════════════════════════════════════════════════════
  // 8. PROFESSIONAL TRAINING (from qualifications array)
  // ═══════════════════════════════════════════════════════════════
  if (parsedData.qualifications && parsedData.qualifications.length > 0) {
    checkNewPage(50);
    yPos = drawSectionHeader(page, 'PROFESSIONAL TRAINING & CERTIFICATIONS', margin, yPos, boldFont, brandColor);

    for (const qual of parsedData.qualifications) {
      checkNewPage(15);
      page.drawText(`-  ${qual}`, {
        x: margin,
        y: yPos,
        size: 10,
        font: font,
        color: textColor,
      });
      yPos -= 14;
    }
    yPos -= 15;
  }

  // ═══════════════════════════════════════════════════════════════
  // 9. CLINICAL SKILLS
  // ═══════════════════════════════════════════════════════════════
  if (parsedData.skills && parsedData.skills.length > 0) {
    checkNewPage(50);
    yPos = drawSectionHeader(page, 'CLINICAL SKILLS', margin, yPos, boldFont, brandColor);

    // Display skills as flowing text with separators
    const skillsText = parsedData.skills.join('  |  ');
    yPos = drawWrappedText(page, skillsText, margin, yPos, font, textColor, contentWidth, 10, 14);
    yPos -= 15;
  }

  // ═══════════════════════════════════════════════════════════════
  // 10. EXPERIENCE SUMMARY (if available)
  // ═══════════════════════════════════════════════════════════════
  if (parsedData.experience_years && parsedData.experience_years > 0) {
    checkNewPage(30);
    page.drawText(`Total Experience: ${parsedData.experience_years} years`, {
      x: margin,
      y: yPos,
      size: 10,
      font: boldFont,
      color: grayColor,
    });
    yPos -= 20;
  }

  // ═══════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════
  drawFooter(page, font, margin, grayColor, lightGray);

  return await pdfDoc.save();
}

/**
 * Draw section header with underline
 */
function drawSectionHeader(
  page: PDFPage,
  title: string,
  x: number,
  y: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>
): number {
  // Section title
  page.drawText(title, {
    x: x,
    y: y,
    size: 13,
    font: font,
    color: color,
  });

  // Underline
  const underlineWidth = Math.min(title.length * 7.5, 300);
  page.drawLine({
    start: { x: x, y: y - 4 },
    end: { x: x + underlineWidth, y: y - 4 },
    thickness: 2,
    color: color,
  });

  return y - 22; // Return new Y position
}

/**
 * Draw wrapped text that flows across multiple lines
 */
function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  startY: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  maxWidth: number,
  fontSize: number,
  lineHeight: number
): number {
  if (!text) return startY;

  const words = text.split(' ');
  let currentLine = '';
  let y = startY;
  const charWidth = fontSize * 0.5; // Approximate character width

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const testWidth = testLine.length * charWidth;

    if (testWidth > maxWidth && currentLine) {
      page.drawText(currentLine, { x, y, size: fontSize, font, color });
      y -= lineHeight;
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  // Draw remaining text
  if (currentLine) {
    page.drawText(currentLine, { x, y, size: fontSize, font, color });
    y -= lineHeight;
  }

  return y;
}

/**
 * Draw footer on page
 */
function drawFooter(
  page: PDFPage,
  font: PDFFont,
  margin: number,
  grayColor: ReturnType<typeof rgb>,
  lightGray: ReturnType<typeof rgb>
): void {
  const pageWidth = 595;

  // Footer divider line
  page.drawLine({
    start: { x: margin, y: 55 },
    end: { x: pageWidth - margin, y: 55 },
    thickness: 0.5,
    color: lightGray,
  });

  // Left text
  page.drawText('Contact details available upon successful placement', {
    x: margin,
    y: 40,
    size: 8,
    font: font,
    color: grayColor,
  });

  // Right text - date
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  page.drawText(`Generated: ${dateStr}`, {
    x: pageWidth - margin - 90,
    y: 40,
    size: 8,
    font: font,
    color: grayColor,
  });
}

/**
 * Anonymize employer name based on type (for most recent employer only)
 */
function anonymizeMostRecentEmployer(employer: string): string {
  if (!employer) return 'A Healthcare Practice';

  const lower = employer.toLowerCase();

  if (lower.includes('dental') || lower.includes('dentist') || lower.includes('orthodont')) {
    return 'A Dental Practice';
  }
  if (lower.includes('gp') || lower.includes('surgery') || lower.includes('medical') || lower.includes('doctor')) {
    return 'A GP Practice';
  }
  if (lower.includes('hospital') || lower.includes('nhs') || lower.includes('trust')) {
    return 'An NHS Trust';
  }
  if (lower.includes('clinic') || lower.includes('health') || lower.includes('centre') || lower.includes('center')) {
    return 'A Healthcare Clinic';
  }
  if (lower.includes('pharmacy') || lower.includes('chemist')) {
    return 'A Pharmacy';
  }

  return 'A Healthcare Practice';
}

/**
 * Generalize location to area name
 */
function generalizeLocation(postcode: string): string {
  if (!postcode) return '';

  const areaMap: Record<string, string> = {
    'SW': 'South West London',
    'SE': 'South East London',
    'NW': 'North West London',
    'NE': 'North East London',
    'N': 'North London',
    'S': 'South London',
    'E': 'East London',
    'W': 'West London',
    'EC': 'Central London',
    'WC': 'Central London',
    'CR': 'Croydon area',
    'BR': 'Bromley area',
    'DA': 'Dartford area',
    'KT': 'Kingston area',
    'TW': 'Twickenham area',
    'HA': 'Harrow area',
    'UB': 'Uxbridge area',
    'EN': 'Enfield area',
    'IG': 'Ilford area',
    'RM': 'Romford area',
    'SM': 'Sutton area',
    'WD': 'Watford area',
    'AL': 'St Albans area',
    'HP': 'Hemel Hempstead area',
    'LU': 'Luton area',
    'MK': 'Milton Keynes area',
    'SL': 'Slough area',
    'RG': 'Reading area',
    'GU': 'Guildford area',
    'B': 'Birmingham area',
    'M': 'Manchester area',
    'L': 'Liverpool area',
    'LS': 'Leeds area',
    'BS': 'Bristol area',
    'G': 'Glasgow area',
    'EH': 'Edinburgh area',
    'CF': 'Cardiff area',
  };

  // Extract postcode prefix
  const match = postcode.toUpperCase().match(/^([A-Z]{1,2})\d/);
  if (match) {
    const prefix = match[1];
    if (areaMap[prefix]) {
      return areaMap[prefix];
    }
  }

  // If we have a full postcode, show first part + "area"
  const fullMatch = postcode.toUpperCase().match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
  if (fullMatch) {
    return `${fullMatch[1]} area`;
  }

  return postcode; // Return as-is if no pattern matches
}

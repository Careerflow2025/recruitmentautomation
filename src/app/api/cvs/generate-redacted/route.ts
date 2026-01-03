import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface GenerateRedactedRequest {
  candidate_id: string;
  cv_id?: string;
}

/**
 * POST /api/cvs/generate-redacted
 * Generate a redacted CV PDF that preserves FULL content
 * Only removes: name, email, phone, address, LinkedIn
 * Only anonymizes: MOST RECENT employer
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

    // Get CV with full text content
    let cvQuery = supabase
      .from('candidate_cvs')
      .select('*')
      .eq('candidate_id', candidate_id)
      .eq('user_id', user.id);

    if (cv_id) {
      cvQuery = cvQuery.eq('id', cv_id);
    }

    const { data: cv, error: cvError } = await cvQuery.order('created_at', { ascending: false }).limit(1).single();

    // Generate anonymous reference
    const candidateReference = `DN-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Get full CV text
    const fullCvText = cv?.cv_text_content;

    // Get parsed data for employer info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsedData: any = cv?.cv_parsed_data;
    const mostRecentEmployer = parsedData?.work_history?.[0]?.employer;

    let pdfBytes: Uint8Array;

    if (fullCvText) {
      // FULL CV TEXT AVAILABLE - Use it!
      console.log('Using full CV text for PDF generation');

      // Redact contacts from full text
      const redactedText = redactContactsFromText(fullCvText, {
        candidateName: `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim(),
        firstName: candidate.first_name,
        lastName: candidate.last_name,
        mostRecentEmployer: mostRecentEmployer,
      });

      // Generate PDF from full redacted text
      pdfBytes = await generateFullTextPDF(redactedText, candidateReference);
    } else {
      // NO FULL TEXT - Fallback to parsed data (summarized version)
      console.log('No full CV text, falling back to parsed data');

      const candidateLocation = parsedData?.location || candidate.postcode || '';

      const redactedContent = {
        candidateReference,
        role: parsedData?.role || parsedData?.desired_role || candidate.role || 'Dental Professional',
        generalArea: generalizeLocation(candidateLocation),
        summary: parsedData?.summary || candidate.notes || 'Experienced dental professional seeking new opportunities.',
        skills: parsedData?.skills || [],
        experience: (parsedData?.work_history || []).map((exp: { role?: string; employer?: string; duration?: string; description?: string }, index: number) => ({
          title: exp.role || 'Position',
          company: index === 0 ? anonymizeMostRecentEmployer(exp.employer || '') : (exp.employer || 'Healthcare Practice'),
          duration: exp.duration || '',
          description: exp.description || '',
        })),
        education: (parsedData?.education || []).map((edu: { qualification?: string; institution?: string; year?: number | string }) => ({
          qualification: edu.qualification || '',
          institution: edu.institution || '',
          year: edu.year?.toString() || '',
        })),
        qualifications: parsedData?.qualifications || [],
      };

      pdfBytes = await generateStructuredPDF(redactedContent, candidate);
    }

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
      usedFullText: !!fullCvText,
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
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Redact contact information from full CV text
 * Preserves ALL other content exactly as-is
 */
function redactContactsFromText(
  text: string,
  options: {
    candidateName?: string;
    firstName?: string;
    lastName?: string;
    mostRecentEmployer?: string;
  }
): string {
  let redacted = text;

  // 1. Remove candidate full name (case-insensitive)
  if (options.candidateName && options.candidateName.trim()) {
    const nameRegex = new RegExp(escapeRegex(options.candidateName), 'gi');
    redacted = redacted.replace(nameRegex, '[Candidate]');
  }

  // 2. Remove first name separately (but be careful with common words)
  if (options.firstName && options.firstName.trim().length > 2) {
    // Only replace if it looks like a standalone name (word boundary)
    const firstNameRegex = new RegExp(`\\b${escapeRegex(options.firstName)}\\b`, 'gi');
    redacted = redacted.replace(firstNameRegex, '[Candidate]');
  }

  // 3. Remove last name separately
  if (options.lastName && options.lastName.trim().length > 2) {
    const lastNameRegex = new RegExp(`\\b${escapeRegex(options.lastName)}\\b`, 'gi');
    redacted = redacted.replace(lastNameRegex, '[Candidate]');
  }

  // 4. Remove email addresses
  redacted = redacted.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[Email on request]'
  );

  // 5. Remove UK phone numbers (various formats)
  // Mobile: 07xxx, Landline: 01xxx/02xxx, International: +44
  redacted = redacted.replace(
    /(\+44\s?|0)(\d{4}[\s-]?\d{6}|\d{3}[\s-]?\d{4}[\s-]?\d{4}|\d{2}[\s-]?\d{4}[\s-]?\d{4}|\d{10,11})/g,
    '[Phone on request]'
  );

  // 6. Remove addresses (house number + street name)
  redacted = redacted.replace(
    /\d+[a-zA-Z]?\s+[\w\s]+(Street|Road|Lane|Avenue|Drive|Close|Way|Court|Gardens|Place|Crescent|Terrace|Grove|Mews|Row|Square|Hill|Park|Rise|Walk|Gate|Parade)\b[^,\n]*/gi,
    '[Address on request]'
  );

  // 7. Generalize full postcodes (keep area prefix, remove specific code)
  // E.g., "NW10 5AB" → "NW10 area"
  redacted = redacted.replace(
    /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*\d[A-Z]{2}\b/gi,
    '$1 area'
  );

  // 8. Remove LinkedIn URLs
  redacted = redacted.replace(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[^\s,)\]]+/gi,
    '[LinkedIn on request]'
  );

  // 9. Remove other social media URLs
  redacted = redacted.replace(
    /(?:https?:\/\/)?(?:www\.)?(twitter|x|facebook|instagram)\.com\/[^\s,)\]]+/gi,
    '[Social media on request]'
  );

  // 10. Anonymize ONLY the most recent employer
  if (options.mostRecentEmployer && options.mostRecentEmployer.trim()) {
    const employerRegex = new RegExp(escapeRegex(options.mostRecentEmployer), 'gi');
    const anonymizedName = anonymizeMostRecentEmployer(options.mostRecentEmployer);
    redacted = redacted.replace(employerRegex, anonymizedName);
  }

  return redacted;
}

/**
 * Anonymize employer name based on type
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
 * Generate PDF from FULL redacted text (preserves original structure)
 */
async function generateFullTextPDF(
  redactedText: string,
  reference: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595, 842]); // A4

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { height } = page.getSize();
  const margin = 50;
  const lineHeight = 12;
  const fontSize = 9;
  const maxWidth = 595 - margin * 2;
  let yPos = height - margin;

  // Header with reference
  page.drawText('CANDIDATE PROFILE', {
    x: margin,
    y: yPos,
    size: 14,
    font: boldFont,
    color: rgb(0.2, 0.4, 0.6),
  });
  yPos -= 20;

  page.drawText(`Reference: ${reference}`, {
    x: margin,
    y: yPos,
    size: 9,
    font: boldFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPos -= 10;

  // Divider
  page.drawLine({
    start: { x: margin, y: yPos },
    end: { x: 595 - margin, y: yPos },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  yPos -= 20;

  // Process full CV text line by line
  const lines = redactedText.split('\n');

  for (const line of lines) {
    // Skip very short empty lines but keep some spacing
    if (line.trim() === '') {
      yPos -= lineHeight * 0.5;
      continue;
    }

    // Check if we need a new page
    if (yPos < margin + 40) {
      // Add footer to current page
      page.drawText('Contact details available upon successful placement', {
        x: margin,
        y: 25,
        size: 7,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Create new page
      page = pdfDoc.addPage([595, 842]);
      yPos = height - margin;
    }

    // Word wrap the line
    const wrappedLines = wrapText(line, font, fontSize, maxWidth);

    for (const wrappedLine of wrappedLines) {
      // Check again if need new page after wrapping
      if (yPos < margin + 40) {
        page.drawText('Contact details available upon successful placement', {
          x: margin,
          y: 25,
          size: 7,
          font,
          color: rgb(0.5, 0.5, 0.5),
        });

        page = pdfDoc.addPage([595, 842]);
        yPos = height - margin;
      }

      // Detect if line looks like a header (ALL CAPS or short and bold-looking)
      const isHeader = wrappedLine === wrappedLine.toUpperCase() &&
                       wrappedLine.length > 3 &&
                       wrappedLine.length < 50 &&
                       !wrappedLine.includes('[');

      if (isHeader) {
        yPos -= 5; // Extra space before headers
        page.drawText(wrappedLine, {
          x: margin,
          y: yPos,
          size: 10,
          font: boldFont,
          color: rgb(0.2, 0.4, 0.6),
        });
        yPos -= lineHeight + 3;
      } else {
        page.drawText(wrappedLine, {
          x: margin,
          y: yPos,
          size: fontSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        yPos -= lineHeight;
      }
    }
  }

  // Footer on last page
  page.drawText('Contact details available upon successful placement', {
    x: margin,
    y: 25,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText(`Generated: ${new Date().toLocaleDateString('en-GB')}`, {
    x: 595 - margin - 80,
    y: 25,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return await pdfDoc.save();
}

/**
 * Word wrap text to fit within maxWidth
 */
function wrapText(
  text: string,
  font: Awaited<ReturnType<typeof StandardFonts.Helvetica extends infer T ? T : never>>,
  fontSize: number,
  maxWidth: number
): string[] {
  if (!text.trim()) return [''];

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    // Approximate width calculation (pdf-lib font method)
    const testWidth = testLine.length * fontSize * 0.5; // Rough estimate

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Generalize location to area name (fallback for structured data)
 */
function generalizeLocation(postcode: string): string {
  if (!postcode) return 'UK';

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
    'B': 'Birmingham area',
    'M': 'Manchester area',
    'L': 'Liverpool area',
    'LS': 'Leeds area',
    'BS': 'Bristol area',
    'G': 'Glasgow area',
    'EH': 'Edinburgh area',
    'CF': 'Cardiff area',
  };

  const match = postcode.match(/^([A-Z]{1,2})\d/i);
  if (match) {
    const prefix = match[1].toUpperCase();
    if (areaMap[prefix]) {
      return areaMap[prefix];
    }
  }

  return 'UK';
}

/**
 * Generate structured PDF (fallback when no full text available)
 */
async function generateStructuredPDF(
  content: {
    candidateReference: string;
    role: string;
    generalArea: string;
    summary: string;
    skills: string[];
    experience: Array<{
      title: string;
      company: string;
      duration: string;
      description: string;
    }>;
    education: Array<{
      qualification: string;
      institution: string;
      year: string;
    }>;
    qualifications: string[];
  },
  candidate: {
    first_name?: string;
    last_name?: string;
    role?: string;
    days?: string;
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 50;
  let yPos = height - margin;

  const primaryColor = rgb(0.2, 0.4, 0.6);
  const textColor = rgb(0.1, 0.1, 0.1);
  const lightGray = rgb(0.6, 0.6, 0.6);

  // Header
  page.drawText('CANDIDATE PROFILE', {
    x: margin,
    y: yPos,
    size: 20,
    font: boldFont,
    color: primaryColor,
  });
  yPos -= 30;

  page.drawText(`Reference: ${content.candidateReference}`, {
    x: margin,
    y: yPos,
    size: 12,
    font: boldFont,
    color: textColor,
  });
  yPos -= 25;

  page.drawText(content.role, {
    x: margin,
    y: yPos,
    size: 14,
    font: boldFont,
    color: textColor,
  });
  yPos -= 20;

  page.drawText(`Location: ${content.generalArea}`, {
    x: margin,
    y: yPos,
    size: 11,
    font: font,
    color: lightGray,
  });
  yPos -= 15;

  if (candidate.days) {
    page.drawText(`Availability: ${candidate.days}`, {
      x: margin,
      y: yPos,
      size: 11,
      font: font,
      color: lightGray,
    });
    yPos -= 15;
  }

  yPos -= 10;
  page.drawLine({
    start: { x: margin, y: yPos },
    end: { x: width - margin, y: yPos },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  yPos -= 20;

  // Summary
  if (content.summary) {
    page.drawText('PROFESSIONAL SUMMARY', {
      x: margin,
      y: yPos,
      size: 12,
      font: boldFont,
      color: primaryColor,
    });
    yPos -= 18;

    const summaryLines = wrapText(content.summary, font, 10, width - margin * 2);
    for (const line of summaryLines) {
      page.drawText(line, { x: margin, y: yPos, size: 10, font, color: textColor });
      yPos -= 15;
    }
    yPos -= 10;
  }

  // Skills
  if (content.skills && content.skills.length > 0) {
    page.drawText('SKILLS', {
      x: margin,
      y: yPos,
      size: 12,
      font: boldFont,
      color: primaryColor,
    });
    yPos -= 18;

    const skillsText = content.skills.join(' • ');
    const skillLines = wrapText(skillsText, font, 10, width - margin * 2);
    for (const line of skillLines) {
      page.drawText(line, { x: margin, y: yPos, size: 10, font, color: textColor });
      yPos -= 15;
    }
    yPos -= 10;
  }

  // Experience
  if (content.experience && content.experience.length > 0) {
    page.drawText('PROFESSIONAL EXPERIENCE', {
      x: margin,
      y: yPos,
      size: 12,
      font: boldFont,
      color: primaryColor,
    });
    yPos -= 18;

    for (const exp of content.experience) {
      page.drawText(exp.title, {
        x: margin,
        y: yPos,
        size: 11,
        font: boldFont,
        color: textColor,
      });
      yPos -= 15;

      page.drawText(`${exp.company} | ${exp.duration}`, {
        x: margin,
        y: yPos,
        size: 10,
        font: font,
        color: lightGray,
      });
      yPos -= 15;

      if (exp.description) {
        const descLines = wrapText(exp.description, font, 10, width - margin * 2);
        for (const line of descLines) {
          page.drawText(line, { x: margin, y: yPos, size: 10, font, color: textColor });
          yPos -= 15;
        }
      }
      yPos -= 10;
    }
  }

  // Education
  if (content.education && content.education.length > 0) {
    page.drawText('EDUCATION', {
      x: margin,
      y: yPos,
      size: 12,
      font: boldFont,
      color: primaryColor,
    });
    yPos -= 18;

    for (const edu of content.education) {
      page.drawText(edu.qualification, {
        x: margin,
        y: yPos,
        size: 11,
        font: boldFont,
        color: textColor,
      });
      yPos -= 15;

      page.drawText(`${edu.institution} | ${edu.year}`, {
        x: margin,
        y: yPos,
        size: 10,
        font: font,
        color: lightGray,
      });
      yPos -= 15;
    }
    yPos -= 5;
  }

  // Qualifications
  if (content.qualifications && content.qualifications.length > 0) {
    page.drawText('QUALIFICATIONS & CERTIFICATIONS', {
      x: margin,
      y: yPos,
      size: 12,
      font: boldFont,
      color: primaryColor,
    });
    yPos -= 18;

    for (const qual of content.qualifications) {
      page.drawText(`• ${qual}`, {
        x: margin,
        y: yPos,
        size: 10,
        font: font,
        color: textColor,
      });
      yPos -= 15;
    }
  }

  // Footer
  const footerY = 40;
  page.drawLine({
    start: { x: margin, y: footerY + 15 },
    end: { x: width - margin, y: footerY + 15 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  page.drawText('Contact details available upon successful placement', {
    x: margin,
    y: footerY,
    size: 9,
    font: font,
    color: lightGray,
  });

  page.drawText(`Generated: ${new Date().toLocaleDateString('en-GB')}`, {
    x: width - margin - 100,
    y: footerY,
    size: 9,
    font: font,
    color: lightGray,
  });

  return await pdfDoc.save();
}

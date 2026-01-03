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
 * Generate a professional redacted CV PDF for email attachment
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

    // Get CV with redacted content
    let cvQuery = supabase
      .from('candidate_cvs')
      .select('*')
      .eq('candidate_id', candidate_id)
      .eq('user_id', user.id);

    if (cv_id) {
      cvQuery = cvQuery.eq('id', cv_id);
    }

    const { data: cv, error: cvError } = await cvQuery.order('uploaded_at', { ascending: false }).limit(1).single();

    if (cvError || !cv) {
      // If no CV exists, generate a simple profile PDF
      console.log('No CV found, generating profile PDF from candidate data only');
    }

    // Get parsed CV data (rich content from AI parsing)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsedData: any = cv?.cv_parsed_data;
    const candidateLocation = parsedData?.location || candidate.postcode || '';

    // Generate anonymous reference
    const candidateReference = `DN-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Build redacted content from parsed CV data
    const redactedContent = {
      candidateReference,
      role: parsedData?.role || parsedData?.desired_role || candidate.role || 'Dental Professional',
      generalArea: generalizeLocation(candidateLocation),
      summary: parsedData?.summary || candidate.notes || 'Experienced dental professional seeking new opportunities.',
      skills: parsedData?.skills || [],
      experience: (parsedData?.work_history || []).map((exp: { role?: string; employer?: string; duration?: string; description?: string }, index: number) => ({
        title: exp.role || 'Position',
        company: anonymizeEmployer(exp.employer || '', candidateLocation, index === 0),
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

    // Generate PDF
    const pdfBytes = await generateRedactedPDF(redactedContent, candidate);

    // Convert to base64 for response
    const base64Pdf = Buffer.from(pdfBytes).toString('base64');

    // Store in Supabase storage temporarily (optional - for email attachment)
    const filename = `redacted_cv_${redactedContent.candidateReference}_${Date.now()}.pdf`;
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
      anonymousReference: redactedContent.candidateReference,
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
 * Generate a professional PDF from redacted content
 */
async function generateRedactedPDF(
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
  const page = pdfDoc.addPage([595, 842]); // A4 size

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 50;
  let yPos = height - margin;

  // Colors
  const primaryColor = rgb(0.2, 0.4, 0.6);
  const textColor = rgb(0.1, 0.1, 0.1);
  const lightGray = rgb(0.6, 0.6, 0.6);

  // Helper function to draw text and move position
  const drawText = (text: string, options: {
    size?: number;
    font?: typeof font;
    color?: ReturnType<typeof rgb>;
    lineHeight?: number;
    maxWidth?: number;
  } = {}) => {
    const {
      size = 11,
      font: textFont = font,
      color = textColor,
      lineHeight = size * 1.5,
      maxWidth = width - margin * 2,
    } = options;

    // Word wrap
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];

    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const testWidth = textFont.widthOfTextAtSize(testLine, size);
      if (testWidth > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      if (yPos < margin + 20) {
        // Add new page
        const newPage = pdfDoc.addPage([595, 842]);
        yPos = height - margin;
        page.drawText(l, { x: margin, y: yPos, size, font: textFont, color });
        yPos -= lineHeight;
      } else {
        page.drawText(l, { x: margin, y: yPos, size, font: textFont, color });
        yPos -= lineHeight;
      }
    }
  };

  // Header - Candidate Reference
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

  // Role and Location
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

  // Divider line
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

    drawText(content.summary, { size: 10 });
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
    drawText(skillsText, { size: 10 });
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
        drawText(exp.description, { size: 10 });
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

/**
 * Anonymize employer name - especially for most recent position
 * "Village GP" → "A GP Practice in North London"
 * "Smile Dental Croydon" → "A Dental Practice in Croydon area"
 */
function anonymizeEmployer(employer: string, location: string, isMostRecent: boolean): string {
  if (!employer) return 'Healthcare Practice';

  // Always anonymize the most recent employer (index 0 = most recent)
  if (isMostRecent) {
    const area = generalizeLocation(location);
    const lowerEmployer = employer.toLowerCase();

    // Detect type of practice
    if (lowerEmployer.includes('gp') || lowerEmployer.includes('surgery') || lowerEmployer.includes('medical') || lowerEmployer.includes('doctor')) {
      return `A GP Practice in ${area}`;
    }
    if (lowerEmployer.includes('dental') || lowerEmployer.includes('dentist') || lowerEmployer.includes('orthodont')) {
      return `A Dental Practice in ${area}`;
    }
    if (lowerEmployer.includes('hospital') || lowerEmployer.includes('nhs') || lowerEmployer.includes('trust')) {
      return `An NHS Trust in ${area}`;
    }
    if (lowerEmployer.includes('clinic') || lowerEmployer.includes('health')) {
      return `A Healthcare Clinic in ${area}`;
    }
    return `A Healthcare Practice in ${area}`;
  }

  // For older positions, keep the employer name (less sensitive)
  return employer;
}

/**
 * Generalize location to area name
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

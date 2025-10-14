import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole, CANONICAL_ROLES } from '@/lib/utils/roleNormalizer';

/**
 * BULK PARSER API - Intelligently parse messy text data into candidates/clients
 *
 * Handles:
 * - Unstructured text (copy-pasted emails, notes, etc.)
 * - Table formats (CSV-like, tab-separated)
 * - Mixed formats
 * - Large datasets (processes in batches to avoid context/rate limits)
 *
 * Smart features:
 * - Auto-detects format
 * - Extracts all relevant fields
 * - Puts unclear/extra info in notes
 * - Validates UK postcodes (strict format check)
 * - Validates and normalizes roles (using canonical role list)
 * - ALWAYS generates IDs automatically (ignores user-provided IDs)
 * - Processes in chunks to avoid API limits
 */

/**
 * Validate UK postcode format
 * Accepts formats like: SW1A 1AA, SW1A1AA, CR0 1PB, E1 6AN, etc.
 */
function isValidUKPostcode(postcode: string): boolean {
  if (!postcode || typeof postcode !== 'string') return false;

  // UK postcode regex - comprehensive pattern
  // Matches: A9 9AA, A99 9AA, AA9 9AA, AA99 9AA, A9A 9AA, AA9A 9AA
  const postcodeRegex = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;

  const cleaned = postcode.trim().toUpperCase();
  return postcodeRegex.test(cleaned);
}

/**
 * Validate and normalize role
 * Returns normalized canonical role or null if invalid
 */
function validateAndNormalizeRole(role: string): string | null {
  if (!role || typeof role !== 'string') return null;

  const normalized = normalizeRole(role);

  // Check if it's a valid canonical role
  if (CANONICAL_ROLES.includes(normalized as any)) {
    return normalized;
  }

  return null;
}

interface ParseResult {
  success: boolean;
  message: string;
  added: number;
  failed: number;
  errors: string[];
  items?: any[];
}

/**
 * Get the highest ID from existing items
 * Returns format: CAN1, CAN2, CAN10, CAN100 (NO zero-padding)
 */
function getHighestId(items: any[], prefix: string): string {
  if (!items || items.length === 0) return prefix + '1'; // ✅ Start from 1, not 001

  const numbers = items
    .map(item => {
      const id = item.id || '';
      if (id.startsWith(prefix)) {
        const numPart = id.substring(prefix.length);
        return parseInt(numPart, 10); // This handles both CAN1 and CAN100
      }
      return 0;
    })
    .filter(num => !isNaN(num) && num > 0);

  if (numbers.length === 0) return prefix + '1'; // ✅ Start from 1, not 001

  const maxNum = Math.max(...numbers);
  return prefix + String(maxNum + 1); // ✅ NO padding - CAN1, CAN2, CAN10, CAN100
}

/**
 * Smart parser for candidates
 * IMPORTANT: Ignores user-provided IDs - system auto-generates them
 */
function parseCandidates(text: string): any[] {
  const candidates: any[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let currentCandidate: any = {};
  let currentNotes: string[] = [];
  let validationWarnings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is a new candidate (phone or name indicators)
    // ❌ DO NOT use ID as delimiter - IDs are auto-generated
    const hasPhone = /^[07]\d{9,10}/.test(line);
    const hasName = /^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(line);

    if (hasPhone || hasName || (i === 0)) {
      // Save previous candidate if exists
      if (Object.keys(currentCandidate).length > 0) {
        // Add validation warnings to notes
        if (validationWarnings.length > 0) {
          currentNotes.unshift(...validationWarnings);
        }
        if (currentNotes.length > 0) {
          currentCandidate.notes = currentNotes.join('\n');
        }
        candidates.push(currentCandidate);
        currentCandidate = {};
        currentNotes = [];
        validationWarnings = [];
      }
    }

    // ❌ DO NOT EXTRACT ID - System auto-generates sequential IDs
    // If user provides ID like "CAN123", we completely ignore it
    const userProvidedId = line.match(/CAN\s*(\d{3,6})/i) || line.match(/^\d{3,6}/);
    if (userProvidedId) {
      validationWarnings.push(`⚠️ Ignored user-provided ID - system auto-generates IDs`);
    }

    // Extract phone (UK format)
    const phoneMatch = line.match(/0?7\d{9,10}|0\d{10}/);
    if (phoneMatch && !currentCandidate.phone) {
      currentCandidate.phone = phoneMatch[0].replace(/\s/g, '');
    }

    // Extract and VALIDATE postcode (UK format)
    const postcodeMatch = line.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})\b/i);
    if (postcodeMatch && !currentCandidate.postcode) {
      const extractedPostcode = `${postcodeMatch[1]} ${postcodeMatch[2]}`.toUpperCase();

      // ✅ VALIDATE postcode format
      if (isValidUKPostcode(extractedPostcode)) {
        currentCandidate.postcode = extractedPostcode;
      } else {
        validationWarnings.push(`⚠️ Invalid UK postcode format: "${extractedPostcode}"`);
      }
    }

    // Extract and VALIDATE + NORMALIZE role
    const roleMatch = line.match(/\b(Dental\s+Nurse|Trainee\s+Dental\s+Nurse|Dentist|Receptionist|Hygienist|Dental\s+Hygienist|Therapist|Dental\s+Therapist|Treatment\s+Coordinator|Practice\s+Manager|TCO|TC|PM|DN|TDN|DH|TH|RCP|RCPN)\b/i);
    if (roleMatch && !currentCandidate.role) {
      const extractedRole = roleMatch[0];

      // ✅ VALIDATE and NORMALIZE role
      const normalizedRole = validateAndNormalizeRole(extractedRole);
      if (normalizedRole) {
        currentCandidate.role = normalizedRole; // Use normalized canonical role
      } else {
        validationWarnings.push(`⚠️ Invalid role: "${extractedRole}" - not a recognized dental role`);
      }
    }

    // Extract experience (years)
    const expMatch = line.match(/(\d+)\s*(yrs?|years?)\s*(experience)?/i);
    if (expMatch && !currentCandidate.experience) {
      currentCandidate.experience = `${expMatch[1]} years`;
    }

    // Extract salary/pay expectation
    const salaryMatch = line.match(/£\s*(\d+)(?:\s*-\s*£?\s*(\d+))?(?:\s*\/?\s*hr)?/i);
    if (salaryMatch && !currentCandidate.salary) {
      currentCandidate.salary = salaryMatch[2]
        ? `£${salaryMatch[1]}–£${salaryMatch[2]}`
        : `£${salaryMatch[1]}`;
    }

    // Extract days/availability
    const daysMatch = line.match(/\b(Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?|Full-time|Part-time|FT|PT|Flexible)\b/gi);
    if (daysMatch && !currentCandidate.days) {
      currentCandidate.days = Array.from(new Set(daysMatch)).join(', ');
    }

    // Extract email
    const emailMatch = line.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch && !currentCandidate.email) {
      currentCandidate.email = emailMatch[0];
    }

    // Extract name (if at start of line before role/phone)
    if (i === 0 || !currentCandidate.first_name) {
      const nameMatch = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
      if (nameMatch && !phoneMatch && !userProvidedId) {
        const fullName = nameMatch[1].trim().split(' ');
        currentCandidate.first_name = fullName[0];
        if (fullName.length > 1) {
          currentCandidate.last_name = fullName.slice(1).join(' ');
        }
      }
    }

    // Collect any extra info as notes (skip ID-related lines since we ignore IDs)
    // Be VERY PERMISSIVE - capture anything that looks like human-readable text
    const isDataLine = phoneMatch || postcodeMatch || roleMatch ||
                       expMatch || salaryMatch || daysMatch || emailMatch ||
                       (nameMatch && i === 0); // Don't capture names as notes

    // Capture notes AGGRESSIVELY - anything that's not a recognized data field
    // Examples: "Looking permanent, ASAP", "Not driving", "Available immediately"
    const isHeaderOrJunk = line.match(/^(CAN\d+|Number|Postcode|Role|Experience|Pay|Status|Candidate|Phone|Email|Days|Salary)$/i);

    if (!isDataLine && !isHeaderOrJunk && line.length > 3 && !userProvidedId) {
      currentNotes.push(line);
      console.log(`  📝 Captured note: "${line}"`);
    }
  }

  // Save last candidate
  if (Object.keys(currentCandidate).length > 0) {
    // Add validation warnings to notes
    if (validationWarnings.length > 0) {
      currentNotes.unshift(...validationWarnings);
    }
    if (currentNotes.length > 0) {
      currentCandidate.notes = currentNotes.join('\n');
    }
    candidates.push(currentCandidate);
  }

  return candidates.filter(c => c.phone || c.postcode || c.role); // Must have at least one key field
}

/**
 * Smart parser for clients
 * IMPORTANT: Ignores user-provided IDs - system auto-generates them
 */
function parseClients(text: string): any[] {
  const clients: any[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let currentClient: any = {};
  let currentNotes: string[] = [];
  let validationWarnings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is a new client (has surgery name)
    // ❌ DO NOT use ID as delimiter - IDs are auto-generated
    const hasSurgeryName = /^[A-Z][a-z]+.*\s+(Dental|Surgery|Clinic|Practice)/i.test(line);

    if (hasSurgeryName || (i === 0 && !currentClient.surgery)) {
      // Save previous client if exists
      if (Object.keys(currentClient).length > 0) {
        // Add validation warnings to notes
        if (validationWarnings.length > 0) {
          currentNotes.unshift(...validationWarnings);
        }
        if (currentNotes.length > 0) {
          currentClient.notes = currentNotes.join('\n');
        }
        clients.push(currentClient);
        currentClient = {};
        currentNotes = [];
        validationWarnings = [];
      }

      // Extract surgery name from first line
      if (hasSurgeryName && !currentClient.surgery) {
        const surgeryMatch = line.match(/^([A-Za-z\s&'-]+(?:Dental|Surgery|Clinic|Practice)[A-Za-z\s&'-]*)/i);
        if (surgeryMatch) {
          currentClient.surgery = surgeryMatch[1].trim();
        }
      }
    }

    // ❌ DO NOT EXTRACT ID - System auto-generates sequential IDs
    // If user provides ID like "CL123", we completely ignore it
    const userProvidedId = line.match(/CL\s*(\d{3,6})/i) || line.match(/^\d{3,6}/);
    if (userProvidedId) {
      validationWarnings.push(`⚠️ Ignored user-provided ID - system auto-generates IDs`);
    }

    // Extract and VALIDATE postcode (UK format)
    const postcodeMatch = line.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})\b/i);
    if (postcodeMatch && !currentClient.postcode) {
      const extractedPostcode = `${postcodeMatch[1]} ${postcodeMatch[2]}`.toUpperCase();

      // ✅ VALIDATE postcode format
      if (isValidUKPostcode(extractedPostcode)) {
        currentClient.postcode = extractedPostcode;
      } else {
        validationWarnings.push(`⚠️ Invalid UK postcode format: "${extractedPostcode}"`);
      }
    }

    // Extract and VALIDATE + NORMALIZE role needed
    const roleMatch = line.match(/\b(Dental\s+Nurse|Trainee\s+Dental\s+Nurse|Dentist|Receptionist|Hygienist|Dental\s+Hygienist|Therapist|Dental\s+Therapist|Treatment\s+Coordinator|Practice\s+Manager|TCO|TC|PM|DN|TDN|DH|TH|RCP|RCPN)\b/i);
    if (roleMatch && !currentClient.role) {
      const extractedRole = roleMatch[0];

      // ✅ VALIDATE and NORMALIZE role
      const normalizedRole = validateAndNormalizeRole(extractedRole);
      if (normalizedRole) {
        currentClient.role = normalizedRole; // Use normalized canonical role
      } else {
        validationWarnings.push(`⚠️ Invalid role: "${extractedRole}" - not a recognized dental role`);
      }
    }

    // Extract budget/pay
    const budgetMatch = line.match(/£\s*(\d+(?:\.\d{2})?)(?:\s*-\s*£?\s*(\d+(?:\.\d{2})?))?(?:\s*\/?\s*hr)?/i);
    if (budgetMatch && !currentClient.budget) {
      currentClient.budget = budgetMatch[2]
        ? `£${budgetMatch[1]}–£${budgetMatch[2]}`
        : `£${budgetMatch[1]}`;
    }

    // Extract days/requirement
    const daysMatch = line.match(/\b(Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?|Full-time|Part-time|FT|PT|Flexible)\b/gi);
    if (daysMatch && !currentClient.requirement) {
      currentClient.requirement = Array.from(new Set(daysMatch)).join(', ');
    }

    // Extract email
    const emailMatch = line.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch && !currentClient.client_email) {
      currentClient.client_email = emailMatch[0];
    }

    // Extract phone
    const phoneMatch = line.match(/0\d{10}|0\d{3}\s\d{3}\s\d{4}/);
    if (phoneMatch && !currentClient.client_phone) {
      currentClient.client_phone = phoneMatch[0].replace(/\s/g, '');
    }

    // Extract system
    const systemMatch = line.match(/\b(SOE|R4|Dentally|Exact|Pearl|iSmile|Software\s*:\s*([A-Za-z0-9\s]+))/i);
    if (systemMatch && !currentClient.system) {
      currentClient.system = systemMatch[2] || systemMatch[1];
    }

    // Extract contact name
    const contactMatch = line.match(/(?:Dr|Mr|Mrs|Ms|Miss)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (contactMatch && !currentClient.client_name) {
      currentClient.client_name = contactMatch[0];
    }

    // Collect extra info as notes (skip ID-related lines since we ignore IDs)
    // Be VERY PERMISSIVE - capture anything that looks like human-readable text
    const isDataLine = postcodeMatch || roleMatch || budgetMatch ||
                       daysMatch || emailMatch || phoneMatch || systemMatch ||
                       contactMatch || hasSurgeryName;

    // Capture notes AGGRESSIVELY - anything that's not a recognized data field
    // Examples: "Urgent hire needed", "Prefer experienced", "ASAP start"
    const isHeaderOrJunk = line.match(/^(CL\d+|Surgery|Postcode|Role|Budget|Status|Days|System|Client|Phone|Email)$/i);

    if (!isDataLine && !isHeaderOrJunk && line.length > 3 && !userProvidedId) {
      currentNotes.push(line);
      console.log(`  📝 Captured note: "${line}"`);
    }
  }

  // Save last client
  if (Object.keys(currentClient).length > 0) {
    // Add validation warnings to notes
    if (validationWarnings.length > 0) {
      currentNotes.unshift(...validationWarnings);
    }
    if (currentNotes.length > 0) {
      currentClient.notes = currentNotes.join('\n');
    }
    clients.push(currentClient);
  }

  return clients.filter(c => c.surgery || c.postcode || c.role); // Must have at least one key field
}

export async function POST(request: Request) {
  try {
    const { text, type } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text data is required' },
        { status: 400 }
      );
    }

    if (type !== 'candidates' && type !== 'clients') {
      return NextResponse.json(
        { error: 'Type must be "candidates" or "clients"' },
        { status: 400 }
      );
    }

    // Create user client
    const userClient = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (!user || authError) {
      return NextResponse.json(
        { error: 'You must be logged in' },
        { status: 401 }
      );
    }

    console.log(`📝 Bulk parse request from user ${user.id.substring(0, 8)}... for ${type}`);
    console.log(`📊 Text length: ${text.length} characters`);

    // Parse the text based on type
    const parsed = type === 'candidates' ? parseCandidates(text) : parseClients(text);

    console.log(`✅ Parsed ${parsed.length} ${type}`);

    if (parsed.length === 0) {
      return NextResponse.json({
        success: false,
        message: `Could not extract any ${type} from the text. Please check the format.`,
        added: 0,
        failed: 0,
        errors: ['No valid data found'],
        items: []
      });
    }

    // Get existing data to find highest ID
    const tableName = type === 'candidates' ? 'candidates' : 'clients';
    const { data: existing } = await userClient
      .from(tableName)
      .select('id')
      .eq('user_id', user.id)
      .order('id', { ascending: false });

    const existingItems = existing || [];

    // 🔢 PRE-ASSIGN ALL IDs SEQUENTIALLY (before any database inserts)
    // This ensures: If last ID is CAN22, next ones are CAN23, CAN24, CAN25, etc.
    // Format: CAN1, CAN2, CAN10, CAN100 (NO zero-padding)
    const prefix = type === 'candidates' ? 'CAN' : 'CL';
    const startingId = getHighestId(existingItems, prefix);
    let currentIdNum = parseInt(startingId.substring(prefix.length), 10);

    console.log(`🔢 Starting ID assignment from: ${startingId} (continuing from highest existing ID)`);

    for (const item of parsed) {
      item.id = `${prefix}${String(currentIdNum)}`; // ✅ NO padding - CAN1, CAN2, CAN10, CAN100
      console.log(`  ✅ Assigned ID: ${item.id} | Name: ${item.first_name || item.surgery || 'Unknown'} | Notes: ${item.notes ? 'YES' : 'NO'}`);
      currentIdNum++;
    }

    console.log(`🔢 All IDs pre-assigned: ${parsed[0]?.id} to ${parsed[parsed.length - 1]?.id}`);

    // Process in chunks of 50 to avoid overwhelming the database
    const CHUNK_SIZE = 50;
    const chunks = Math.ceil(parsed.length / CHUNK_SIZE);

    let totalAdded = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    console.log(`🔄 Processing ${parsed.length} items in ${chunks} chunk(s)...`);

    for (let i = 0; i < chunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, parsed.length);
      const chunk = parsed.slice(start, end);

      console.log(`📦 Processing chunk ${i + 1}/${chunks} (${chunk.length} items)...`);

      for (const item of chunk) {
        try {
          // ID already pre-assigned above
          const dataToInsert = {
            ...item,
            user_id: user.id,
            added_at: new Date().toISOString(),
          };

          // 📝 Log notes to verify they're being inserted
          if (dataToInsert.notes) {
            console.log(`  📝 ${item.id} has notes: "${dataToInsert.notes.substring(0, 50)}..."`);
          } else {
            console.log(`  ⚠️ ${item.id} has NO notes`);
          }

          const { error } = await userClient.from(tableName).insert(dataToInsert);

          if (error) {
            totalFailed++;
            errors.push(`${item.id || 'Unknown'}: ${error.message}`);
            console.error(`❌ Error adding ${item.id}:`, error.message);
          } else {
            totalAdded++;
            console.log(`  ✅ Successfully inserted ${item.id} (notes: ${dataToInsert.notes ? 'YES' : 'NO'})`);
          }
        } catch (itemError: any) {
          totalFailed++;
          errors.push(`${item.id || 'Unknown'}: ${itemError.message}`);
        }
      }

      console.log(`✅ Chunk ${i + 1}/${chunks} complete: ${totalAdded} added so far`);
    }

    const result: ParseResult = {
      success: totalAdded > 0,
      message: `Successfully added ${totalAdded} ${type}${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`,
      added: totalAdded,
      failed: totalFailed,
      errors: errors.slice(0, 10), // Only return first 10 errors
      items: parsed
    };

    console.log(`✅ Bulk parse complete: ${totalAdded}/${parsed.length} ${type} added`);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Bulk parse error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to parse and add data',
        error: error.message,
        added: 0,
        failed: 0,
        errors: [error.message]
      },
      { status: 500 }
    );
  }
}

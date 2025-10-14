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
 * ✅ CRITICAL: Must find the TRUE maximum number, not rely on database ordering
 */
function getHighestId(items: any[], prefix: string): string {
  console.log(`🔍 getHighestId called with ${items.length} items, prefix: ${prefix}`);

  if (!items || items.length === 0) {
    console.log(`  ℹ️ No existing items, starting from ${prefix}1`);
    return prefix + '1'; // ✅ Start from 1, not 001
  }

  // Extract all numeric parts and find the maximum
  const numbers = items
    .map(item => {
      const id = item.id || '';
      if (id.startsWith(prefix)) {
        const numPart = id.substring(prefix.length);
        const parsed = parseInt(numPart, 10); // This handles both CAN1 and CAN100
        console.log(`  📍 Parsed ID: ${id} → number: ${parsed}`);
        return parsed;
      }
      return 0;
    })
    .filter(num => !isNaN(num) && num > 0);

  console.log(`  📊 Valid numbers found: [${numbers.join(', ')}]`);

  if (numbers.length === 0) {
    console.log(`  ℹ️ No valid numbers, starting from ${prefix}1`);
    return prefix + '1'; // ✅ Start from 1, not 001
  }

  const maxNum = Math.max(...numbers);
  const nextId = prefix + String(maxNum + 1);
  console.log(`  ✅ Maximum found: ${maxNum} → Next ID will be: ${nextId}`);
  return nextId; // ✅ NO padding - CAN1, CAN2, CAN10, CAN100
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
    console.log(`  📄 Line ${i + 1}: "${line}"`);

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
          console.log(`  💾 Saving candidate with notes: "${currentCandidate.notes}"`);
        } else {
          console.log(`  ⚠️ Saving candidate with NO notes`);
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
    let nameMatch = null; // Declare outside if block for later use
    if (i === 0 || !currentCandidate.first_name) {
      nameMatch = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
      if (nameMatch && !phoneMatch && !userProvidedId) {
        const fullName = nameMatch[1].trim().split(' ');
        currentCandidate.first_name = fullName[0];
        if (fullName.length > 1) {
          currentCandidate.last_name = fullName.slice(1).join(' ');
        }
      }
    }

    // ✅ AGGRESSIVE NOTES CAPTURE
    // Capture ANYTHING that doesn't match a recognized data pattern
    // Examples: "available asap, not driving", "fluent english", "good experience"

    const hasRecognizedData = phoneMatch || postcodeMatch || roleMatch ||
                               expMatch || salaryMatch || daysMatch || emailMatch ||
                               (nameMatch && i === 0);

    const isObviousHeader = line.match(/^(CAN\d+|Number|Postcode|Role|Experience|Pay|Status|Candidate|Phone|Email|Days|Salary)$/i);
    const isJustNumbers = /^\d+$/.test(line.trim());

    // If line contains SOME recognized data but ALSO extra text, extract the extra text as notes
    // Example: "Tue Thu available asap, not driving" → "available asap, not driving" goes to notes
    if (hasRecognizedData && line.length > 20) {
      // Remove recognized patterns and see if there's leftover text
      let remainingText = line;

      if (phoneMatch) remainingText = remainingText.replace(phoneMatch[0], '');
      if (postcodeMatch) remainingText = remainingText.replace(postcodeMatch[0], '');
      if (roleMatch) remainingText = remainingText.replace(roleMatch[0], '');
      if (salaryMatch) remainingText = remainingText.replace(salaryMatch[0], '');
      if (daysMatch) daysMatch.forEach(day => remainingText = remainingText.replace(day, ''));
      if (emailMatch) remainingText = remainingText.replace(emailMatch[0], '');

      remainingText = remainingText.replace(/[,\s]+/g, ' ').trim();

      if (remainingText.length > 5) {
        currentNotes.push(remainingText);
        console.log(`  ✅ Captured MIXED LINE note: "${remainingText}"`);
      }
    }

    // Also capture lines that are PURELY notes (no recognized data at all)
    if (!hasRecognizedData && !isObviousHeader && !isJustNumbers && !userProvidedId && line.length > 2) {
      currentNotes.push(line);
      console.log(`  ✅ Captured PURE note: "${line}"`);
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
      console.log(`  💾 Saving LAST candidate with notes: "${currentCandidate.notes}"`);
    } else {
      console.log(`  ⚠️ Saving LAST candidate with NO notes`);
    }
    candidates.push(currentCandidate);
  }

  console.log(`✅ Parsed ${candidates.length} candidates total`);

  // ⚠️ CRITICAL: Role is REQUIRED by database
  // Filter out candidates without role AND postcode (minimum required fields)
  const validCandidates = candidates.filter(c => {
    if (!c.role) {
      console.log(`⚠️ SKIPPING candidate (no role): ${c.first_name || 'Unknown'} - ${c.postcode || 'No postcode'}`);
      return false;
    }
    if (!c.postcode) {
      console.log(`⚠️ SKIPPING candidate (no postcode): ${c.first_name || 'Unknown'} - ${c.role}`);
      return false;
    }
    return true;
  });

  console.log(`✅ ${validCandidates.length} valid candidates (with role + postcode), ${candidates.length - validCandidates.length} skipped`);
  return validCandidates;
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
        message: type === 'candidates'
          ? `Could not extract any valid candidates. Candidates MUST have both a ROLE (e.g., "Dental Nurse", "Dentist") and a POSTCODE. Please add role information to your data.`
          : `Could not extract any valid clients. Clients MUST have both a ROLE and a POSTCODE.`,
        added: 0,
        failed: 0,
        errors: [
          type === 'candidates'
            ? 'No valid candidates found - missing ROLE or POSTCODE. Each candidate needs a dental role like "Dental Nurse", "Dentist", "Receptionist", etc.'
            : 'No valid clients found - missing ROLE or POSTCODE'
        ],
        items: []
      });
    }

    // 🔢 CRITICAL: Fetch ALL existing IDs to find the TRUE maximum
    // This is the ONLY way to avoid duplicate IDs
    const tableName = type === 'candidates' ? 'candidates' : 'clients';
    const prefix = type === 'candidates' ? 'CAN' : 'CL';

    console.log(`🔍 STEP 1: Fetching ALL existing ${type} IDs from database...`);
    console.log(`   📋 Table: "${tableName}"`);
    console.log(`   👤 User ID: "${user.id}"`);
    console.log(`   🔍 Query: SELECT id FROM ${tableName} WHERE user_id = '${user.id}'`);

    const { data: existing, error: fetchError } = await userClient
      .from(tableName)
      .select('id')
      .eq('user_id', user.id);

    console.log(`   📊 Raw database response:`, JSON.stringify({ data: existing, error: fetchError }, null, 2));

    // ⚠️ CRITICAL ERROR CHECKING
    if (fetchError) {
      console.error(`❌ DATABASE ERROR fetching existing IDs:`, fetchError);
      return NextResponse.json({
        success: false,
        message: `Database error: ${fetchError.message}`,
        added: 0,
        failed: 0,
        errors: [fetchError.message]
      }, { status: 500 });
    }

    const existingItems = existing || [];
    console.log(`📊 STEP 2: Found ${existingItems.length} existing ${type} in database`);

    if (existingItems.length > 0) {
      console.log(`📋 ALL existing IDs: ${existingItems.map(item => item.id).join(', ')}`);
    } else {
      console.log(`⚠️ WARNING: No existing ${type} found - starting from ${prefix}1`);
    }

    // 🔢 STEP 3: Extract numeric parts and find MAXIMUM
    console.log(`🔍 STEP 3: Extracting numeric parts to find maximum...`);

    const numericIds = existingItems
      .map(item => {
        const id = item.id || '';

        // ⚡ CRITICAL FIX: IDs in database have user prefix like "U3_CAN1"
        // Extract the actual ID part after the underscore
        const idParts = id.split('_');
        const actualId = idParts.length > 1 ? idParts[idParts.length - 1] : id;

        if (actualId.startsWith(prefix)) {
          const numPart = actualId.substring(prefix.length);
          const num = parseInt(numPart, 10);
          console.log(`  📍 ${id} → actualId: ${actualId} → ${num}`);
          return num;
        }
        console.log(`  ⚠️ ${id} doesn't match prefix ${prefix}`);
        return 0;
      })
      .filter(num => !isNaN(num) && num > 0);

    console.log(`📊 Valid numbers extracted: [${numericIds.join(', ')}]`);

    // 🔢 STEP 4: Find maximum and calculate next ID
    let nextIdNumber = 1; // Default if no existing items

    if (numericIds.length > 0) {
      const maxId = Math.max(...numericIds);
      nextIdNumber = maxId + 1;
      console.log(`✅ STEP 4: ⭐ MAX ID FOUND: ${prefix}${maxId} → Next ID will be: ${prefix}${nextIdNumber}`);
      console.log(`   📊 Summary: ${numericIds.length} existing ${type}, highest is ${prefix}${maxId}, continuing from ${prefix}${nextIdNumber}`);
    } else {
      console.log(`✅ STEP 4: No existing IDs found → Starting from: ${prefix}1`);
      console.log(`   ⚠️ This means either: (1) first time adding ${type}, OR (2) database query returned empty`);
    }

    // 🔢 STEP 5: Pre-assign ALL IDs sequentially
    console.log(`🔢 STEP 5: Pre-assigning IDs to ${parsed.length} new ${type}...`);

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      item.id = `${prefix}${nextIdNumber}`; // ✅ NO padding - CAN1, CAN2, CAN10, CAN100
      console.log(`  ✅ Item ${i + 1}: Assigned ID: ${item.id} | Name: ${item.first_name || item.surgery || 'Unknown'} | Notes: ${item.notes ? 'YES' : 'NO'}`);
      nextIdNumber++; // Increment for next item
    }

    console.log(`✅ STEP 5 COMPLETE: IDs assigned from ${parsed[0]?.id} to ${parsed[parsed.length - 1]?.id}`);

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

          // 📝 Log EXACTLY what's being inserted (including notes)
          console.log(`  📦 ${item.id} - Inserting data:`, JSON.stringify({
            id: dataToInsert.id,
            first_name: dataToInsert.first_name,
            last_name: dataToInsert.last_name,
            notes: dataToInsert.notes || '(NO NOTES)',
            has_notes: !!dataToInsert.notes,
            notes_length: dataToInsert.notes?.length || 0
          }, null, 2));

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

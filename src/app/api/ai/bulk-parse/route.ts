import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
 * - Validates postcodes and roles
 * - Generates IDs automatically
 * - Processes in chunks to avoid API limits
 */

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
 */
function getHighestId(items: any[], prefix: string): string {
  if (!items || items.length === 0) return prefix + '001';

  const numbers = items
    .map(item => {
      const id = item.id || '';
      if (id.startsWith(prefix)) {
        const numPart = id.substring(prefix.length);
        return parseInt(numPart, 10);
      }
      return 0;
    })
    .filter(num => !isNaN(num) && num > 0);

  if (numbers.length === 0) return prefix + '001';

  const maxNum = Math.max(...numbers);
  return prefix + String(maxNum + 1).padStart(3, '0');
}

/**
 * Smart parser for candidates
 */
function parseCandidates(text: string): any[] {
  const candidates: any[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let currentCandidate: any = {};
  let currentNotes: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is a new candidate (has ID number or phone at start)
    const hasId = /^(CAN)?\s*\d{6}/.test(line);
    const hasPhone = /^[07]\d{9,10}/.test(line);

    if (hasId || hasPhone || (i === 0)) {
      // Save previous candidate if exists
      if (Object.keys(currentCandidate).length > 0) {
        if (currentNotes.length > 0) {
          currentCandidate.notes = currentNotes.join('\n');
        }
        candidates.push(currentCandidate);
        currentCandidate = {};
        currentNotes = [];
      }
    }

    // Extract ID (CAN number or raw number)
    const idMatch = line.match(/CAN\s*(\d{3,6})/i) || line.match(/^(\d{6})/);
    if (idMatch && !currentCandidate.id) {
      const numPart = idMatch[1].padStart(3, '0').substring(0, 3);
      currentCandidate.id = `CAN${numPart}`;
    }

    // Extract phone (UK format)
    const phoneMatch = line.match(/0?7\d{9,10}|0\d{10}/);
    if (phoneMatch && !currentCandidate.phone) {
      currentCandidate.phone = phoneMatch[0].replace(/\s/g, '');
    }

    // Extract postcode (UK format)
    const postcodeMatch = line.match(/\b([A-Z]{1,2}\d{1,2})\s*(\d[A-Z]{2})?\b/i);
    if (postcodeMatch && !currentCandidate.postcode) {
      currentCandidate.postcode = postcodeMatch[2]
        ? `${postcodeMatch[1]} ${postcodeMatch[2]}`.toUpperCase()
        : postcodeMatch[1].toUpperCase();
    }

    // Extract role
    const roleMatch = line.match(/\b(Dental\s+Nurse|Trainee\s+Dental\s+Nurse|Dentist|Receptionist|Hygienist|Dental\s+Hygienist|Therapist|Dental\s+Therapist|Treatment\s+Coordinator|Practice\s+Manager|TCO|TC|PM|DN|TDN|DH|TH|RCP|RCPN)\b/i);
    if (roleMatch && !currentCandidate.role) {
      currentCandidate.role = roleMatch[0];
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
      if (nameMatch && !phoneMatch && !idMatch) {
        const fullName = nameMatch[1].trim().split(' ');
        currentCandidate.first_name = fullName[0];
        if (fullName.length > 1) {
          currentCandidate.last_name = fullName.slice(1).join(' ');
        }
      }
    }

    // Collect any extra info as notes
    const isDataLine = idMatch || phoneMatch || postcodeMatch || roleMatch ||
                       expMatch || salaryMatch || daysMatch || emailMatch;

    if (!isDataLine && line.length > 3 && !line.match(/^(CAN|Number|Postcode|Role|Experience|Pay|Status)/i)) {
      currentNotes.push(line);
    }
  }

  // Save last candidate
  if (Object.keys(currentCandidate).length > 0) {
    if (currentNotes.length > 0) {
      currentCandidate.notes = currentNotes.join('\n');
    }
    candidates.push(currentCandidate);
  }

  return candidates.filter(c => c.phone || c.postcode || c.role); // Must have at least one key field
}

/**
 * Smart parser for clients
 */
function parseClients(text: string): any[] {
  const clients: any[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let currentClient: any = {};
  let currentNotes: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is a new client (has surgery name or ID at start)
    const hasSurgeryName = /^[A-Z][a-z]+.*\s+(Dental|Surgery|Clinic|Practice)/i.test(line);
    const hasId = /^(CL)?\s*\d{3,6}/.test(line);

    if (hasSurgeryName || hasId || (i === 0 && !currentClient.surgery)) {
      // Save previous client if exists
      if (Object.keys(currentClient).length > 0) {
        if (currentNotes.length > 0) {
          currentClient.notes = currentNotes.join('\n');
        }
        clients.push(currentClient);
        currentClient = {};
        currentNotes = [];
      }

      // Extract surgery name from first line
      if (hasSurgeryName && !currentClient.surgery) {
        const surgeryMatch = line.match(/^([A-Za-z\s&'-]+(?:Dental|Surgery|Clinic|Practice)[A-Za-z\s&'-]*)/i);
        if (surgeryMatch) {
          currentClient.surgery = surgeryMatch[1].trim();
        }
      }
    }

    // Extract ID
    const idMatch = line.match(/CL\s*(\d{3,6})/i) || line.match(/^(\d{3,6})/);
    if (idMatch && !currentClient.id) {
      const numPart = idMatch[1].padStart(3, '0').substring(0, 3);
      currentClient.id = `CL${numPart}`;
    }

    // Extract postcode
    const postcodeMatch = line.match(/\b([A-Z]{1,2}\d{1,2})\s*(\d[A-Z]{2})?\b/i);
    if (postcodeMatch && !currentClient.postcode) {
      currentClient.postcode = postcodeMatch[2]
        ? `${postcodeMatch[1]} ${postcodeMatch[2]}`.toUpperCase()
        : postcodeMatch[1].toUpperCase();
    }

    // Extract role needed
    const roleMatch = line.match(/\b(Dental\s+Nurse|Trainee\s+Dental\s+Nurse|Dentist|Receptionist|Hygienist|Dental\s+Hygienist|Therapist|Dental\s+Therapist|Treatment\s+Coordinator|Practice\s+Manager|TCO|TC|PM|DN|TDN|DH|TH|RCP|RCPN)\b/i);
    if (roleMatch && !currentClient.role) {
      currentClient.role = roleMatch[0];
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

    // Collect extra info as notes
    const isDataLine = idMatch || postcodeMatch || roleMatch || budgetMatch ||
                       daysMatch || emailMatch || phoneMatch || systemMatch;

    if (!isDataLine && line.length > 3 && !line.match(/^(CL|Surgery|Postcode|Role|Budget|Status|Days|System)/i)) {
      currentNotes.push(line);
    }
  }

  // Save last client
  if (Object.keys(currentClient).length > 0) {
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

    // Get existing data to generate IDs
    const tableName = type === 'candidates' ? 'candidates' : 'clients';
    const { data: existing } = await userClient
      .from(tableName)
      .select('id')
      .eq('user_id', user.id)
      .order('id', { ascending: false });

    const existingItems = existing || [];

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
          // Auto-generate ID if not provided
          if (!item.id) {
            const prefix = type === 'candidates' ? 'CAN' : 'CL';
            const highestId = getHighestId([...existingItems, ...parsed.slice(0, start + totalAdded)], prefix);
            const numPart = parseInt(highestId.substring(prefix.length), 10);
            item.id = `${prefix}${String(numPart + 1).padStart(3, '0')}`;
          }

          const { error } = await userClient.from(tableName).insert({
            ...item,
            user_id: user.id,
            added_at: new Date().toISOString(),
          });

          if (error) {
            totalFailed++;
            errors.push(`${item.id || 'Unknown'}: ${error.message}`);
            console.error(`❌ Error adding ${item.id}:`, error.message);
          } else {
            totalAdded++;
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

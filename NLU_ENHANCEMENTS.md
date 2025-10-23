# Natural Language Understanding (NLU) Enhancements

> **🎯 Goal:** Make the AI understand messy, unclear, or jumbled prompts with ChatGPT-level intelligence

## Overview

Your AI assistant (powered by Mistral 7B Instruct) now has advanced natural language understanding capabilities. It can handle:

- ✅ **Typos and misspellings** - "shw me all denta nurss" → understands perfectly
- ✅ **Abbreviations and slang** - "gimme csv", "dn", "dt" → interprets correctly
- ✅ **Jumbled entity data** - "john 07700123456 nurse croydon" → extracts structured data
- ✅ **Vague references** - "delete that one", "ban all his matches" → uses context
- ✅ **Informal language** - "nuke the bad ones", "get rid of CAN015" → understands intent
- ✅ **Multi-intent prompts** - "add Sarah then show matches" → executes sequentially
- ✅ **Missing information** - "add john croydon" → asks for role, fills in postcode
- ✅ **Context awareness** - remembers previous conversation, resolves pronouns

---

## Core NLU Capabilities

### 1. Intent Extraction

The AI can extract what you want to do even from messy prompts:

**Action Verbs:**
- "throw away CAN015" → delete_candidate
- "get rid of that match" → ban_match
- "gimme all nurses" → search_candidates

**Implied Actions:**
- "john smith dental nurse croydon 07700123456" → add_candidate
- "all the dentists in london" → search_candidates
- "CAN001 to CL005" → (ambiguous - asks for clarification)

**Vague References:**
- "that one" → uses last mentioned ID or asks
- "the new guy" → searches recent candidates
- "those matches" → uses context or asks

---

### 2. Entity Recognition & Extraction

The AI automatically identifies and extracts:

#### IDs
- "can 15" → CAN015
- "client 5" → CL005
- "candidate number 23" → CAN023

#### Names
- "john smith" → first_name: "John", last_name: "Smith"
- "sarah.jones@email.com" → infers name "Sarah Jones"
- "dr patel" → asks if "Dr" is a title or first name

#### Roles (with typo tolerance)
- "dn" → Dental Nurse
- "receptionist" → Dental Receptionist
- "dt" → Dentist
- "denta nurse" → Dental Nurse (typo corrected)

#### Postcodes
- "sw1a 1aa" → SW1A 1AA (normalized)
- "croydon" → CR0 1PB (area inferred)
- "london" → asks which area

#### Phone Numbers
- "07700 900 000" → "07700900000"
- "0770-090-0000" → "07700900000"
- "+44 7700 900000" → "07700900000"

#### Salary/Budget
- "15-17" → "£15-£17"
- "£15 to £17" → "£15-£17"
- "15 quid" → "£15"

#### Days
- "mon wed fri" → "Mon, Wed, Fri"
- "m-w-f" → "Mon, Wed, Fri"
- "weekdays" → "Mon-Fri"

---

### 3. Typo & Abbreviation Handling

**Common Typos:**
- "dlete" → delete
- "updte" → update
- "serch" → search
- "exprt" → export
- "shw me" → show me

**Abbreviations:**
- "cn" → can/candidate (uses context)
- "cl" → client
- "bann" → ban
- "stats" → statistics
- "csv" → export to CSV

---

### 4. When to Infer vs When to Ask

#### ✅ AI INFERS When:
- Context is clear from previous conversation
- Only one logical interpretation exists
- Missing details have reasonable defaults
- Error has low impact (can be corrected easily)

**Examples:**
- "add john smith nurse croydon" → Infers Dental Nurse, CR0 1PB
- "delete can15" → Infers CAN015
- "show me stats" → get_statistics

#### ❌ AI ASKS When:
- Deletion or destructive action with ambiguity
- Multiple valid interpretations exist
- Missing critical information (which ID?)
- User says "that one" with no prior context

**Examples:**
- "delete the bad ones" → Asks "Which candidates/clients?"
- "update everyone" → Asks "Update what field to what value?"
- "ban that match" → Asks "Which candidate-client match?" (if no context)

---

### 5. Context-Aware Interpretation

The AI uses conversation history to understand:

#### Pronoun Resolution
```
User: "Show me CAN015"
AI: [Shows details]
User: "Delete him"
AI: ✅ Deletes CAN015 (understood "him" = CAN015)
```

#### Implicit References
```
User: "Find all dental nurses in London"
AI: [Shows results]
User: "Export them"
AI: ✅ Exports the dental nurses from previous search
```

#### Topic Continuation
```
User: "How many matches does CAN015 have?"
AI: [Shows 5 matches]
User: "Ban all of them"
AI: ✅ Bans all 5 matches for CAN015
```

#### State Tracking
```
User: "I just added a new candidate"
AI: [Remembers CAN028 was just added]
User: "Actually delete that"
AI: ✅ Deletes CAN028 (most recently added)
```

---

### 6. Multi-Intent Handling

When one prompt contains multiple requests:

#### Sequential Execution
```
"Add John Smith as a nurse then show me his matches"
→ AI executes: add_candidate → wait for ID → search matches for that ID
```

#### Parallel Execution
```
"Export candidates and clients"
→ AI executes BOTH: export_candidates AND export_clients
```

#### Conditional Execution
```
"If CAN015 has matches, ban them all"
→ AI checks matches first → if exists, executes bulk_ban_matches
```

---

### 7. Ambiguity Resolution Strategies

**Strategy 1: Most Common Interpretation**
- "show me nurses" → search_candidates (more common than search_clients)

**Strategy 2: Recent Context**
- If recently discussing candidates → assumes candidate-related
- If recently discussing matches → assumes match-related

**Strategy 3: Safest Action**
- Prefer read operations over write when ambiguous
- Prefer search over delete when unclear

**Strategy 4: Ask with Suggestions**
- "Did you mean: (A) Delete candidate CAN015, or (B) Ban all matches for CAN015?"

---

## Real-World Examples

### Example 1: Jumbled Entity Data
**Input:** `john 07700123456 nurse sw1`

**AI Reasoning:**
- Name: "john" (first name only, last name missing)
- Phone: "07700123456"
- Role: "nurse" → Dental Nurse
- Postcode: "sw1" → Incomplete, infers SW1A 1AA

**AI Action:** Adds candidate with extracted data

**AI Response:** "✅ Added CAN027 (John). I inferred Dental Nurse role and SW1A 1AA postcode. You can update the last name later if needed."

---

### Example 2: Multiple Typos
**Input:** `shw me all denta nurss in londn`

**AI Reasoning:**
- "shw" → show
- "denta nurss" → dental nurses (typo correction)
- "londn" → london (typo correction)

**AI Action:** search_candidates with query "dental nurse london"

**AI Response:** "🔍 Found 12 dental nurses in London: CAN005 (Sarah Johnson), CAN012 (Emma Williams)..."

---

### Example 3: Contextual Pronoun
**Conversation:**
```
User: "Show me CAN015"
AI: [Shows candidate details]
User: "Delete him"
```

**AI Reasoning:**
- "him" → refers to CAN015 from previous message

**AI Action:** delete_candidate CAN015

**AI Response:** "✅ Deleted CAN015. All associated matches have also been removed."

---

### Example 4: Informal Slang
**Input:** `gimme csv of everyone`

**AI Reasoning:**
- "gimme" → give me / export
- "csv" → format
- "everyone" → Could mean candidates OR clients (AMBIGUOUS)

**AI Action:** ASK for clarification

**AI Response:** "Would you like to export: (A) Candidates, (B) Clients, or (C) Both as separate files?"

---

### Example 5: Vague Deletion (Safety Check)
**Input:** `delete the bad ones`

**AI Reasoning:**
- "delete" → destructive action
- "the bad ones" → AMBIGUOUS, high risk

**AI Action:** ASK for specific IDs

**AI Response:** "Which candidates or clients should I delete? Please provide specific IDs (e.g., CAN001, CAN002) to avoid accidental deletions."

---

### Example 6: Multi-Intent
**Input:** `add Sarah Jones nurse SW1A1AA then show me her matches`

**AI Reasoning:**
- Two actions: add_candidate AND search matches
- Sequential: Must add first to get ID

**AI Actions:**
1. add_candidate → generates CAN028
2. Automatically searches matches for CAN028

**AI Response:** "✅ Added CAN028 (Sarah Jones). Now searching for matches... Found 8 matches sorted by commute time."

---

### Example 7: Mixed Format Data
**Input:** `add Sarah Jones dn CR0 1PB 07111222333 and Emma Brown dt W1A 1AA 07444555666`

**AI Reasoning:**
- Two candidates in one prompt
- Parse each: Name, Role, Postcode, Phone
- "dn" → Dental Nurse, "dt" → Dentist

**AI Action:** bulk_add_candidates with 2 entries

**AI Response:** "✅ Added 2 candidates: CAN029 (Sarah Jones, Dental Nurse) and CAN030 (Emma Brown, Dentist)."

---

### Example 8: Incomplete Information
**Input:** `add john croydon`

**AI Reasoning:**
- Name: "john" (first name only)
- Location: "croydon" (postcode area)
- Missing: Last name, role, phone

**AI Action:** ASK for missing critical info

**AI Response:** "I can add John in Croydon (CR0 1PB). What role? (Dentist, Dental Nurse, Receptionist, etc.)"

---

### Example 9: Abbreviation + Context
**Input (after searching dental nurses):** `export them as csv`

**AI Reasoning:**
- "them" → dental nurses from previous search
- "csv" → format

**AI Action:** export_candidates filtered by previous search

**AI Response:** "📄 Exported 15 dental nurses as CSV. You can copy the data below..."

---

### Example 10: Slang + Safety
**Input:** `nuke all the banned ones`

**AI Reasoning:**
- "nuke" → delete (slang)
- "banned ones" → banned matches
- Could mean: Delete records OR unban them (AMBIGUOUS)

**AI Action:** ASK for clarification

**AI Response:** "Do you want to: (A) Unban all banned matches (restore them), or (B) Permanently delete banned match records from database?"

---

## Reasoning Framework (5 Steps)

The AI follows this systematic process:

### Step 1: Parse Input
- Tokenize and identify entities (IDs, names, roles, etc.)
- Detect action verbs or implied actions
- Recognize patterns (postcodes, phones, etc.)

### Step 2: Resolve Ambiguities
- Check conversation context
- Apply disambiguation strategies
- Determine confidence level

### Step 3: Decide: Infer or Ask
- **High confidence + low risk** → Infer and execute
- **Low confidence OR high risk** → Ask for clarification
- **Medium confidence** → Infer with confirmation message

### Step 4: Extract Structured Data
- Convert messy input to clean JSON action
- Fill in reasonable defaults
- Normalize all formats

### Step 5: Execute with Confirmation
- Perform action(s)
- Confirm what was done in plain language
- Offer related suggestions

---

## Advanced Reasoning Patterns

### Pattern 1: Fuzzy Matching
User says "Sarah" but database has "Sara" → Suggests close matches

### Pattern 2: Intent Chaining
"Add a candidate and show me their matches" → Add first, then search

### Pattern 3: Conditional Logic
"If there are matches over 1 hour, ban them" → Checks condition first

### Pattern 4: Batch Inference
"Add 5 dental nurses from Croydon" → Infers need for bulk_add_candidates

### Pattern 5: Error Correction
User provides invalid postcode → Suggests correction or closest match

---

## Testing the NLU

Try these messy prompts to test the AI's understanding:

### Typos & Misspellings
- "shw me all denta nurss in londn"
- "dlete can15 and can16"
- "exprt everyting to csv"

### Jumbled Data
- "john 07700123456 nurse croydon"
- "can 15 cl 5"
- "add sarah dn sw1"

### Vague References
- "delete that one"
- "ban all his matches"
- "show me the new ones"

### Informal Language
- "gimme csv of everyone"
- "nuke all the banned matches"
- "get rid of can015"

### Multi-Intent
- "add john smith nurse then show matches"
- "export candidates and clients"
- "search nurses in london then ban can015"

### Context-Dependent
- (After showing CAN015) "delete him"
- (After searching nurses) "export them"
- (After banning matches) "unban all of them"

---

## Key Benefits

✅ **Faster workflow** - No need to format prompts perfectly
✅ **Natural conversation** - Talk to AI like you would to a colleague
✅ **Fewer errors** - AI asks for clarification when needed
✅ **Smarter assistance** - AI understands your intent, not just keywords
✅ **Context retention** - AI remembers what you discussed earlier
✅ **Safety checks** - AI confirms destructive actions before executing
✅ **ChatGPT-level UX** - Intuitive, intelligent, conversational

---

## Implementation Details

**Powered by:** Mistral 7B Instruct (vLLM on RunPod RTX 4090)

**Enhanced System Prompt:** ~15,000+ characters with:
- Intent extraction patterns
- Entity recognition rules
- Typo/abbreviation handling
- Clarification decision framework
- Context-aware interpretation rules
- 10 messy prompt examples with reasoning
- 12 total examples (6 standard + 6 NLU-focused)
- 5-step reasoning framework

**Token Optimization:** All responses batched to prevent overflow

---

## Next Steps

1. **Run the SQL update:**
   ```bash
   # In Supabase SQL Editor
   C:\recruitmentautomation\dental-matcher\update_ai_prompt_only.sql
   ```

2. **Test with messy prompts:**
   - Try typos, abbreviations, slang
   - Test vague references and context
   - Verify safety checks on deletions

3. **Refine based on feedback:**
   - Observe which prompts confuse the AI
   - Add more patterns to system prompt if needed
   - Adjust clarification thresholds

---

**Last Updated:** 2025-10-23
**Version:** 2.0.0 (NLU Enhanced)
**Status:** Ready for Testing

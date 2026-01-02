# Recruitment Automation System - Comprehensive A-to-Z Documentation

**Generated:** 2025-12-18
**Project:** Dental Recruitment Matcher
**Version:** v1.0.0-matching-phase
**Status:** Active Development - Phase 1 Complete

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Project Architecture](#3-project-architecture)
4. [Database Schema](#4-database-schema)
5. [Frontend Components](#5-frontend-components)
6. [API Endpoints](#6-api-endpoints)
7. [Business Logic & Three Strict Rules](#7-business-logic--three-strict-rules)
8. [Utility Functions](#8-utility-functions)
9. [Type Definitions](#9-type-definitions)
10. [Configuration & Environment](#10-configuration--environment)
11. [Deployment](#11-deployment)
12. [Data Flow Diagrams](#12-data-flow-diagrams)
13. [Security Considerations](#13-security-considerations)
14. [Known Issues & Technical Debt](#14-known-issues--technical-debt)
15. [Quick Reference](#15-quick-reference)

---

## 1. Executive Summary

The **Recruitment Automation System** is a full-stack web application designed for UK dental recruitment agencies. It matches dental professionals (candidates) to dental surgeries (clients) based on role compatibility and commute time.

### Core Value Proposition
- **Automated Matching**: Pairs candidates with clients based on role and location
- **Commute Calculation**: Uses Google Maps API for real driving times
- **Multi-Tenant**: Each user sees only their own data
- **AI-Powered**: Mistral 7B for parsing Excel uploads and natural language queries

### Key Metrics
| Metric | Value |
|--------|-------|
| TypeScript Lines | ~4,149 |
| API Routes | 45+ |
| React Components | ~30 |
| Database Tables | 15+ |
| Custom Hooks | 2 |
| Utility Functions | 60+ |

---

## 2. Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.5.4 | React framework with App Router |
| React | 19.1.0 | UI library |
| TypeScript | ^5 | Static type safety |
| Tailwind CSS | ^4 | Utility-first styling |
| react-data-grid | 7.0.0-beta.47 | Advanced data tables |
| xlsx | 0.18.5 | Excel file parsing |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Supabase | Managed | PostgreSQL + Auth + Storage |
| @supabase/supabase-js | 2.58.0 | JavaScript client |
| @supabase/ssr | 0.7.0 | Server-side rendering support |
| pg | 8.16.3 | Direct PostgreSQL driver |

### AI & External Services
| Service | Purpose |
|---------|---------|
| Google Maps Distance Matrix API | Commute time calculation |
| Mistral 7B (Self-hosted vLLM) | Data parsing, natural language |
| Anthropic Claude API | Backup AI parsing |
| Bottleneck | API rate limiting |

### Build & Deploy
| Tool | Purpose |
|------|---------|
| Turbopack | Fast bundling (Next.js) |
| Netlify | Production deployment |
| ESLint 9 | Code linting |

---

## 3. Project Architecture

### Directory Structure
```
dental-matcher/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # 45+ API routes
│   │   ├── candidates/        # Candidates page
│   │   ├── clients/           # Clients page
│   │   ├── matches/           # Matches page
│   │   ├── dashboard/         # Dashboard
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Landing page
│   │   └── globals.css        # Global styles
│   │
│   ├── components/
│   │   ├── ai/                # AIChat component
│   │   ├── auth/              # LogoutButton, UserEmail
│   │   ├── forms/             # AddCandidateModal, AddClientModal
│   │   ├── grid/              # CandidatesDataGrid, ClientsDataGrid
│   │   ├── layout/            # Navbar
│   │   ├── matches/           # MatchesTable, MatchFilters
│   │   └── ui/                # CommuteBadge, RoleMatchBadge
│   │
│   ├── hooks/
│   │   ├── useSupabaseGridSync.ts
│   │   └── useColumnPreferences.ts
│   │
│   ├── lib/
│   │   ├── supabase/          # Supabase clients
│   │   ├── utils/             # Business logic utilities
│   │   ├── rate-limiter.ts
│   │   ├── ai-service.ts
│   │   └── google-maps.ts
│   │
│   ├── types/
│   │   └── index.ts           # TypeScript interfaces
│   │
│   └── styles/
│       └── data-grid-custom.css
│
├── supabase/
│   └── migrations/            # 10+ SQL migration files
│
├── public/                    # Static assets
├── package.json
├── next.config.ts
├── tsconfig.json
├── netlify.toml
└── .env.local
```

### Architecture Pattern
```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Candidates   │  │   Clients    │  │   Matches    │       │
│  │    Page      │  │    Page      │  │    Page      │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │         Reusable Components (Grid, Forms, UI)           ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                             ↓ (HTTP)
┌─────────────────────────────────────────────────────────────┐
│                      API LAYER (45+ routes)                  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │   AI   │ │ Auth   │ │ CRUD   │ │ Match  │ │ Notes  │    │
│  │Service │ │ Routes │ │ Routes │ │ Routes │ │ Routes │    │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │
└─────────────────────────────────────────────────────────────┘
                             ↓ (Supabase Client)
┌─────────────────────────────────────────────────────────────┐
│              DATA LAYER (Supabase PostgreSQL)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │Candidates│  │ Clients  │  │ Matches  │  │  Notes   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
                             ↓ (External APIs)
              ┌──────────────────┬──────────────────┐
              │ Google Maps API  │  Mistral 7B AI   │
              └──────────────────┴──────────────────┘
```

---

## 4. Database Schema

### Core Tables

#### candidates
```sql
id TEXT PRIMARY KEY,              -- CAN001, CAN002, etc.
user_id UUID NOT NULL,            -- Multi-tenant isolation
role TEXT NOT NULL,               -- Normalized role
postcode TEXT NOT NULL,           -- UK postcode
salary TEXT,                      -- £15-£17 format
days TEXT,                        -- Mon-Fri format
first_name TEXT,
last_name TEXT,
email TEXT,
phone TEXT,
experience TEXT,
notes TEXT,
travel_flexibility TEXT,
added_at TIMESTAMPTZ,             -- For new marker
created_at TIMESTAMPTZ,
updated_at TIMESTAMPTZ
```

#### clients
```sql
id TEXT PRIMARY KEY,              -- CL001, CL002, etc.
user_id UUID NOT NULL,
surgery TEXT NOT NULL,            -- Practice name
role TEXT NOT NULL,
postcode TEXT NOT NULL,
budget TEXT,                      -- Pay rate
requirement TEXT,                 -- Days needed
client_name TEXT,
client_phone TEXT,
client_email TEXT,
system TEXT,                      -- Practice software
notes TEXT,
added_at TIMESTAMPTZ,
created_at TIMESTAMPTZ,
updated_at TIMESTAMPTZ
```

#### matches
```sql
id UUID PRIMARY KEY,
user_id UUID NOT NULL,
candidate_id TEXT NOT NULL,
client_id TEXT NOT NULL,
commute_minutes INTEGER,          -- From Google Maps
commute_display TEXT,             -- "🟢🟢 15m" format
commute_band TEXT,                -- Band emoji
role_match BOOLEAN,               -- Exact role match
role_match_display TEXT,          -- "✅ Role Match" / "❌ Location-Only"
match_status TEXT DEFAULT 'new',
notes TEXT,
created_at TIMESTAMPTZ,
UNIQUE (user_id, candidate_id, client_id)
```

### Support Tables
- `candidate_notes` - Notes per candidate
- `client_notes` - Notes per client
- `match_statuses` - Match tracking (placed/in-progress/rejected)
- `match_notes` - Notes per match
- `commute_cache` - Google Maps result caching (30 min TTL)
- `conversation_sessions` - AI conversation sessions
- `conversation_messages` - AI conversation history
- `conversation_embeddings` - Vector embeddings for RAG
- `knowledge_base` - RAG documentation
- `ai_system_prompts` - Dynamic AI prompts
- `custom_columns` - User-defined fields
- `candidate_custom_data` - Custom field values
- `client_custom_data` - Custom field values

### Row Level Security (RLS)
All tables have RLS enabled with policies:
```sql
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```

### Key Database Functions
| Function | Purpose |
|----------|---------|
| `normalize_role(text)` | Maps synonyms to canonical roles |
| `get_commute_band(int)` | Returns emoji band for minutes |
| `format_commute_time(int)` | Returns display string |
| `is_new_item(timestamptz)` | Checks if within 48 hours |

---

## 5. Frontend Components

### Page Components
| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `page.tsx` | Landing/login page (470 lines) |
| `/dashboard` | `dashboard/page.tsx` | Analytics dashboard |
| `/candidates` | `candidates/page.tsx` | Candidate management |
| `/clients` | `clients/page.tsx` | Client management |
| `/matches` | `matches/page.tsx` | Match viewing/filtering |

### Key Components
| Component | Lines | Purpose |
|-----------|-------|---------|
| `CandidatesDataGrid.tsx` | 700+ | Advanced candidate table with editing |
| `ClientsDataGrid.tsx` | 600+ | Advanced client table with editing |
| `MatchesTable.tsx` | 800+ | Match display with modals |
| `AIChat.tsx` | 400+ | AI assistant interface |
| `Navbar.tsx` | 150+ | Navigation with auth state |
| `CommuteBadge.tsx` | 50 | Time band visualization |
| `RoleMatchBadge.tsx` | 30 | Role match indicator |

### Custom Hooks
```typescript
// useSupabaseGridSync.ts - Real-time data sync
const { data, loading, insertRow, updateRow, deleteRow, refresh } =
  useSupabaseGridSync({ tableName, filters });

// useColumnPreferences.ts - Column order persistence
const { columns, setColumns, resetColumns } =
  useColumnPreferences(tableName);
```

### State Management
- **React Hooks**: useState, useEffect, useCallback, useMemo
- **Supabase Realtime**: WebSocket subscriptions for live updates
- **Local Storage**: Column preferences, filter states
- **No external library**: No Redux/Zustand/etc.

---

## 6. API Endpoints

### CRUD Operations
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/candidates/add` | Add candidate |
| GET | `/api/candidates/next-id` | Get next CAN ID |
| POST | `/api/clients/add` | Add client |
| GET | `/api/clients/next-id` | Get next CL ID |
| POST | `/api/upload/candidates` | Bulk upload (Excel) |
| POST | `/api/upload/clients` | Bulk upload (Excel) |
| GET | `/api/templates/candidates` | Download Excel template |
| GET | `/api/templates/clients` | Download Excel template |

### Matching & Commute
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/calculate-commute` | Calculate single commute |
| POST | `/api/regenerate-pro` | Generate all matches (Google Maps) |
| GET | `/api/match-status` | Check generation progress |
| POST | `/api/regenerate-batch` | Batch match generation |

### Notes
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/notes/candidates/latest` | Latest notes per candidate |
| GET/POST | `/api/notes/candidates/[id]` | CRUD for candidate notes |
| GET | `/api/notes/clients/latest` | Latest notes per client |
| GET/POST | `/api/notes/clients/[id]` | CRUD for client notes |

### AI Integration
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/ai/ask` | Main AI chat (1957 lines) |
| POST | `/api/ai/parse-candidate` | Parse candidate text |
| POST | `/api/ai/parse-client` | Parse client text |
| POST | `/api/ai/batch` | Batch AI processing |
| GET | `/api/ai/test` | Test vLLM connection |
| POST | `/api/validate-field` | AI field validation |

### Authentication
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | User authentication |

---

## 7. Business Logic & Three Strict Rules

### THREE STRICT RULES (Non-Negotiable)

#### RULE 1: Sort by Commute Time Ascending
**Enforcement Points:**
- Database: `ORDER BY commute_minutes ASC`
- API: `.order('commute_minutes', { ascending: true })`
- Frontend: Pre-sorted data from API

**Implementation:**
```typescript
// In matches/page.tsx
const { data: matchesData } = await supabase
  .from('matches')
  .select('*')
  .order('commute_minutes', { ascending: true });
```

#### RULE 2: Exclude Matches Over 80 Minutes
**Enforcement Points:**
1. **Match Generation** - Skip insert if >80 minutes
2. **Utility Function** - Return null if >80 minutes
3. **Frontend Filter** - Filter out >80 minutes

**Implementation:**
```typescript
// In regenerate-batch/route.ts
if (minutes > 80) {
  excludedCount++;
  continue;  // Never insert to database
}

// In commuteCalculator.ts
const MAX_COMMUTE_MINUTES = 80;
if (minutes > MAX_COMMUTE_MINUTES) {
  return null;
}
```

#### RULE 3: Google Maps API Only
**Enforcement:**
- Only Google Maps Distance Matrix API used
- No Haversine formula anywhere in codebase
- No alternative distance calculation methods
- If API fails, request fails (no fallback)

**Implementation:**
```typescript
// In rate-limiter.ts
const gmapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?
  origins=${encodeURIComponent(origin)}&
  destinations=${encodeURIComponent(destination)}&
  mode=driving&
  traffic_model=best_guess&
  key=${apiKey}`;
```

### Role Normalization

#### 7 Canonical Roles
1. Dentist
2. Dental Nurse
3. Dental Receptionist
4. Dental Hygienist
5. Treatment Coordinator
6. Practice Manager
7. Trainee Dental Nurse

#### Synonym Mapping (44+ variants)
```typescript
ROLE_SYNONYMS = {
  'dt': 'Dentist', 'dds': 'Dentist', 'bds': 'Dentist',
  'dn': 'Dental Nurse', 'nurse': 'Dental Nurse',
  'receptionist': 'Dental Receptionist', 'foh': 'Dental Receptionist',
  'hygienist': 'Dental Hygienist',
  'tco': 'Treatment Coordinator', 'tc': 'Treatment Coordinator',
  'pm': 'Practice Manager', 'mgr': 'Practice Manager',
  'tdn': 'Trainee Dental Nurse',
  // ... 30+ more mappings
};
```

### Commute Time Bands
| Band | Time Range | Display |
|------|------------|---------|
| 🟢🟢🟢 | 0-20 min | Excellent |
| 🟢🟢 | 21-40 min | Good |
| 🟢 | 41-55 min | Acceptable |
| 🟡 | 56-80 min | Maximum |
| ❌ | 81+ min | EXCLUDED |

---

## 8. Utility Functions

### Role Normalization (`roleNormalizer.ts`)
```typescript
normalizeRole(input: string): string
  // Maps "dn" → "Dental Nurse"

rolesMatch(role1: string, role2: string): boolean
  // Handles multi-role like "DN/ANP/PN"

splitMultiRole(role: string): string[]
  // Splits "DN/ANP/PN" → ["DN", "ANP", "PN"]
```

### Salary Formatting (`salaryFormatter.ts`)
```typescript
formatSalary(input: string): string
  // "15-17" → "£15–£17" (en-dash, not hyphen)

parseSalary(salary: string): { min: number; max: number }
  // "£15–£17" → { min: 15, max: 17 }
```

### Commute Calculation (`commuteCalculator.ts`)
```typescript
calculateCommute(postcodeA: string, postcodeB: string): CommuteResult | null
  // Returns null if >80 minutes (RULE 2)

getCommuteBand(minutes: number): CommuteBand
  // 15 → '🟢🟢🟢'

formatCommuteTime(minutes: number): string
  // 75 → "🟡 1h 15m"
```

### Postcode Handling (`postcodeInference.ts`)
```typescript
inferPostcode(input: string): string
  // "Croydon" → "CR0 1PB"

isValidPostcode(postcode: string): boolean
  // Validates UK postcode format
```

### Date Utilities (`dateHelpers.ts`)
```typescript
isNewItem(addedAt: Date): boolean
  // true if added within 48 hours

formatIdWithMarker(id: string, addedAt: Date): string
  // "🟨 CAN001" if new
```

### AI Excel Parser (`aiExcelParser.ts`)
```typescript
aiParseCandidate(row: object): Promise<ParsedCandidate>
  // Uses Mistral 7B for intelligent parsing

aiBatchParseRows(rows: object[], type: string): Promise<ParsedRow[]>
  // Batch parsing with error handling
```

### Intelligent Column Mapper (`intelligentColumnMapper.ts`)
```typescript
intelligentlyMapRow(row: object): MappedCandidate
  // Auto-detects field types from values

detectFieldFromValue(value: string): FieldDetectionResult
  // Pattern matching for postcodes, emails, phones, etc.
```

### Rate Limiter (`rate-limiter.ts`)
```typescript
class GoogleMapsRateLimiter
  // 1 request/second, exponential backoff
  // Max 1000 requests/user/minute

rateLimitedGoogleMapsRequest(userId, origins, destinations, apiKey)
  // Queued, rate-limited Google Maps calls
```

---

## 9. Type Definitions

### Core Types (`types/index.ts`)
```typescript
type CanonicalRole =
  | 'Dentist'
  | 'Dental Nurse'
  | 'Dental Receptionist'
  | 'Dental Hygienist'
  | 'Treatment Coordinator'
  | 'Practice Manager'
  | 'Trainee Dental Nurse';

type CommuteBand = '🟢🟢🟢' | '🟢🟢' | '🟢' | '🟡';

interface Candidate {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role: string;
  postcode: string;
  salary: string;
  days: string;
  added_at: Date;
  notes?: string;
  experience?: string;
  travel_flexibility?: string;
}

interface Client {
  id: string;
  surgery: string;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  role: string;
  postcode: string;
  budget?: string;
  requirement?: string;
  system?: string;
  notes?: string;
  added_at: Date;
}

interface Match {
  candidate: Candidate;
  client: Client;
  commute_minutes: number;
  commute_display: string;
  commute_band: CommuteBand;
  role_match: boolean;
  role_match_display: string;
}

interface CommuteResult {
  minutes: number;
  display: string;
  band: CommuteBand;
}
```

---

## 10. Configuration & Environment

### Environment Variables
| Variable | Type | Required | Purpose |
|----------|------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | String | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT | Yes | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT | Yes | Supabase admin key (private) |
| `DATABASE_URL` | URI | Yes | PostgreSQL connection |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | String | Yes | Google Maps API |
| `VPS_AI_URL` | String | No | Custom AI server URL |
| `VPS_AI_SECRET` | String | No | Custom AI server secret |
| `ANTHROPIC_API_KEY` | String | No | Claude API key |

### Next.js Config (`next.config.ts`)
```typescript
const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,  // Skip linting in build
  },
  typescript: {
    ignoreBuildErrors: true,   // Skip type checking in build
  },
};
```

### TypeScript Config
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "strict": true,
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### Package Scripts
```json
{
  "dev": "next dev --turbopack",
  "build": "next build --turbopack",
  "start": "next start",
  "lint": "eslint"
}
```

---

## 11. Deployment

### Netlify Configuration (`netlify.toml`)
```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "20"
  NPM_FLAGS = "--legacy-peer-deps"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

### Deployment Checklist
- [x] Node 20 specified
- [x] Turbopack build enabled
- [x] Next.js plugin configured
- [ ] Environment variables in Netlify dashboard
- [ ] Service role key in secrets (not env)

---

## 12. Data Flow Diagrams

### Match Generation Flow
```
User clicks "Generate Matches"
         ↓
POST /api/regenerate-pro
         ↓
Fetch all candidates for user
         ↓
Fetch all clients for user
         ↓
Clear existing matches
         ↓
For each candidate × client pair:
    ↓
    Call Google Maps API (rate-limited)
         ↓
    Check minutes <= 80 (RULE 2)
         ├─ >80: Skip (excluded)
         └─ <=80: Calculate role match
                   ↓
              Insert to matches table
         ↓
Sort by commute_minutes ASC (RULE 1)
         ↓
Return to frontend
```

### Excel Upload Flow
```
User uploads Excel file
         ↓
POST /api/upload/candidates
         ↓
Parse with XLSX library
         ↓
For each row:
    ↓
    Try AI parsing (Mistral 7B)
         ├─ Success: Use AI result
         └─ Failure: Fall back to regex
                   ↓
              intelligentlyMapRow()
                   ↓
              detectFieldFromValue()
         ↓
    normalizeRole()
         ↓
    formatSalary()
         ↓
    Insert to database
         ↓
    Create initial note
         ↓
Return stats (success/error counts)
```

### AI Chat Flow
```
User sends question
         ↓
POST /api/ai/ask
         ↓
Acquire conversation lock
         ↓
Load conversation history (RAG)
         ↓
Fetch user data (candidates, clients, matches)
         ↓
Detect question type
         ↓
Apply intelligent batching
         ↓
Call Mistral 7B (vLLM)
         ↓
Extract JSON actions from response
         ↓
Execute actions (CRUD, search, etc.)
         ↓
Save conversation to history
         ↓
Release lock
         ↓
Return response
```

---

## 13. Security Considerations

### Current Strengths
- [x] Row Level Security (RLS) on all tables
- [x] Multi-tenant isolation via user_id
- [x] Supabase JWT authentication
- [x] Rate limiting on API calls
- [x] Conversation locking (prevents race conditions)

### Areas for Improvement
- [ ] .env.local committed with real credentials
- [ ] Service role key exposed in development
- [ ] TypeScript/ESLint checks disabled in build
- [ ] No input sanitization on some API routes
- [ ] No CORS configuration

### Recommendations
1. Move `.env.local` to `.gitignore`
2. Use Netlify secrets for service keys
3. Enable TypeScript checks in production build
4. Add input validation middleware
5. Configure CORS headers

---

## 14. Known Issues & Technical Debt

### High Priority
| Issue | Impact | Location |
|-------|--------|----------|
| Build checks disabled | Type errors not caught | next.config.ts |
| Credentials in Git | Security risk | .env.local |
| Beta data grid | Potential instability | react-data-grid |

### Medium Priority
| Issue | Impact | Location |
|-------|--------|----------|
| 60+ state variables | Performance | CandidatesDataGrid |
| No test files | Quality risk | Entire project |
| Edge Functions missing | Match gen incomplete | supabase/functions |

### Low Priority
| Issue | Impact | Location |
|-------|--------|----------|
| Postcode inference limited | 40 areas only | postcodeInference.ts |
| Role normalization not cached | Repeated computation | roleNormalizer.ts |
| Substring search | Slow for large data | matches/page.tsx |

---

## 15. Quick Reference

### File Locations
| Need | File |
|------|------|
| Database schema | `supabase/migrations/*.sql` |
| Type definitions | `src/types/index.ts` |
| API routes | `src/app/api/*/route.ts` |
| Components | `src/components/*/` |
| Utilities | `src/lib/utils/*.ts` |
| Hooks | `src/hooks/*.ts` |
| Configuration | `next.config.ts`, `tsconfig.json` |

### Key Constants
| Constant | Value | Location |
|----------|-------|----------|
| Max Commute | 80 minutes | commuteCalculator.ts |
| New Item Window | 48 hours | dateHelpers.ts |
| Rate Limit | 1 req/sec | rate-limiter.ts |
| Commute Cache TTL | 30 minutes | commute_cache table |

### Common Commands
```bash
# Development
npm run dev        # Start with Turbopack

# Production
npm run build      # Build for production
npm start          # Run production server

# Database
npx supabase db push    # Push migrations
npx supabase db reset   # Reset database
```

### API Quick Reference
```bash
# Add candidate
POST /api/candidates/add
Body: { postcode, role, ... }

# Generate matches
POST /api/regenerate-pro

# Check match status
GET /api/match-status

# AI chat
POST /api/ai/ask
Body: { question, sessionId? }
```

---

## Appendix: File Sizes & Complexity

### Largest Files
| File | Lines | Purpose |
|------|-------|---------|
| `/api/ai/ask/route.ts` | 1957 | AI chat system |
| `MatchesTable.tsx` | 800+ | Match display |
| `CandidatesDataGrid.tsx` | 700+ | Candidate grid |
| `data-grid-custom.css` | 565 | Grid styling |
| `page.tsx` (root) | 470 | Landing page |

### Component Complexity
| Component | State Variables | Effects | Callbacks |
|-----------|-----------------|---------|-----------|
| CandidatesDataGrid | 60+ | 10+ | 20+ |
| MatchesTable | 30+ | 5+ | 15+ |
| AIChat | 20+ | 5+ | 10+ |

---

**Document Version:** 1.0
**Last Updated:** 2025-12-18
**Generated By:** Claude Code (Opus 4.5)

# Multi-Tenant AI Assistant - Candidate Addition Commands

The AI assistant is now fixed to handle multi-tenant candidate additions properly. Each user can add candidates with the same IDs without conflicts.

## How to Add All 11 Candidates

Copy and paste each command below into the AI assistant chat (one at a time):

### Command 1:
```
Add candidate 299047 - Dental Nurse in WA4 2GU, phone 07861850730, salary DOE, working Mon, Tue, Thu - ASAP start
```

### Command 2:
```
Add candidate 299026 - Receptionist in TF1 5DL, phone 07783723570, salary £13/hr, working Full-time, flexible - Already registered, waiting for DBS, start ASAP
```

### Command 3:
```
Add candidate 298956 - Dental Nurse in SN25 2PN, phone 07926416500, salary £14/hr, working Full-time, flexible with 4 yrs experience - Not driving, ready ASAP
```

### Command 4:
```
Add candidate 299051 - Receptionist in SO19 8AX, phone 07704255514, salary £14/hr, working PT Mon–Thu 9–5 with 7 yrs experience - Looking permanent, ASAP
```

### Command 5:
```
Add candidate 299030 - Dental Nurse in SE27 0QQ, phone 07428679800, salary DOE, working PT preferred with Not fully qualified experience - Poor reception, call back later
```

### Command 6:
```
Add candidate 298961 - Dental Nurse in L36 8FG, phone 07380580431, salary £12/hr, working Full-time, flexible with 1 yr experience - Not qualified (no exam), RFOR + other system, ASAP
```

### Command 7:
```
Add candidate 299092 - Trainee Dental Nurse in IP22 2JF, phone 07831808105, salary £13/hr, working FT/PT, start end Nov with 2 yrs experience - Will qualify in April, EXACT system
```

### Command 8:
```
Add candidate 298970 - Trainee Dental Nurse in WF12 0DS, phone 07367121011, salary £13–15/hr, working PT flexible with 3 yrs experience - Prefers Dewsbury/Batley, R4 & iSmile
```

### Command 9:
```
Add candidate 299115 - Dental Nurse in DA8 2EQ, phone 07879317513, salary £15/hr, working PT flexible, start in 2 weeks with 7 yrs experience - Systems: R4, SOE
```

### Command 10:
```
Add candidate 298976 - Dental Nurse in EN3 6QX, phone 07538359285, salary £13/hr, working PT flexible, ASAP with 1 yr 3 mo experience - Systems: SOE, PEARL
```

### Command 11:
```
Add candidate 299038 - Receptionist in BH12, phone 07591047672, salary £15/hr, working PT/FT with 5+ yrs experience - Systems: Dentally, R4, available in few weeks
```

## What Was Fixed

1. **Multi-Tenant ID Conflicts**: Added user-specific prefixes to candidate and client IDs to prevent conflicts between different users
2. **User Isolation**: Each user can now add candidates with the same numeric IDs without database constraint violations
3. **Backward Compatibility**: The system handles both prefixed and non-prefixed IDs for updates and deletions

## Technical Details

- User IDs are prefixed with the first 8 characters of the user's UUID
- Example: User `12345678-abcd-efgh` adding candidate `299047` creates ID `12345678_299047`
- All CRUD operations (Create, Read, Update, Delete) now handle these prefixed IDs automatically
- The AI assistant displays the original ID to users while using the prefixed version internally

The system now properly supports multiple users adding the same candidate data without conflicts!
# Bulk Upload Test Instructions

## Problem Identified:
The server logs show "Found 1 rows in Excel file" when you uploaded.
This means your Excel file only has 1 data row, not 10.

## How to Fix:

### Option 1: Download Fresh Template
1. Go to http://localhost:3005/candidates
2. Click "📥 Download Template"
3. Open the downloaded `candidates_template.xlsx`
4. You should see:
   - Row 1: Headers (ID, Role, Postcode, Salary, Days, Phone, Notes, Experience, Travel Flexibility)
   - Row 2: ONE sample row with data

5. Keep Row 1 (headers) AS IS
6. Delete Row 2 (sample data)
7. Add your 10 candidates starting from Row 2

Example structure:
```
Row 1: ID | Role | Postcode | Salary | Days | Phone | Notes | Experience | Travel Flexibility
Row 2: CAN001 | Dentist | SW1A 1AA | £80k | 5 | 07700... | ... | ... | ...
Row 3: CAN002 | Nurse | SW1A 2BB | £30k | 5 | 07700... | ... | ... | ...
Row 4: CAN003 | Hygienist | SW1A 3CC | £40k | 4 | 07700... | ... | ... | ...
...
Row 11: CAN010 | ... | ... | ... | ... | ... | ... | ... | ...
```

### Option 2: Check Your Current File
Open your Excel file and verify:
- Row 1 has the EXACT column names from the template
- Rows 2-11 have your 10 candidates
- All data is in the FIRST sheet (Sheet1)
- No merged cells
- No empty rows between data

### Critical Rules:
1. ✅ First row MUST be headers
2. ✅ All data in ONE sheet (the first sheet)
3. ✅ No gaps between rows
4. ✅ Postcode column must have values
5. ✅ Column names must match EXACTLY (case-sensitive)

### Test Upload:
After fixing your Excel:
1. Upload the file
2. You should see: "Successfully uploaded 10 candidates"
3. NOT "Successfully uploaded 1 candidates"

## If Still Not Working:
Send me a screenshot of your Excel file showing:
- The header row (Row 1)
- All 10 data rows (Rows 2-11)
- Make sure you're on Sheet1

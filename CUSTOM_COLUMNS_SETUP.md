# Custom Columns Feature Setup

## Database Migration Required

The custom columns feature requires a database migration to add three new tables to your Supabase database.

### Option 1: Using Supabase Dashboard (Recommended)

1. Log in to your Supabase project dashboard at https://supabase.com
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of `supabase/migrations/20250108000000_create_custom_columns.sql`
5. Paste it into the SQL editor
6. Click **Run** to execute the migration

### Option 2: Using Supabase CLI

If you have the Supabase CLI installed and configured:

```bash
cd dental-matcher
npx supabase db push
```

## What This Migration Does

The migration creates three new tables:

1. **custom_columns** - Stores custom column definitions
   - Tracks column name, label, type, and order
   - User-specific with RLS (Row Level Security)

2. **candidate_custom_data** - Stores custom column values for candidates
   - Links to candidates table
   - Stores values as text (typed in UI)

3. **client_custom_data** - Stores custom column values for clients
   - Links to clients table
   - Stores values as text (typed in UI)

## How to Use Custom Columns

### Adding a Column

1. Go to Candidates or Clients page
2. Click the **➕ Add Column** button in the toolbar
3. Enter a column name (e.g., "License Number")
4. Select a column type (text, number, date, email, phone, url)
5. Click **Add Column**

The new column will appear immediately with:
- Excel-style letter (L, M, N, etc.)
- Purple background to distinguish from standard columns
- Editable cells when in Edit mode

### Deleting a Column

1. Click **➕ Add Column** button to see the custom columns list
2. Each custom column shows a **🗑️ Delete** button
3. Click delete and confirm
4. The column and all its data will be removed

### Editing Custom Column Values

1. Click **✏️ Edit** to enter edit mode
2. Click on any custom column cell
3. Type the value (input type matches column type)
4. Click **✓ Done** or click outside the cell to save

## Column Types

- **text** - Any text value
- **number** - Numeric input
- **date** - Date picker
- **email** - Email validation
- **phone** - Phone number
- **url** - URL/link

## Features

✅ Excel-style column letters (continues after K: L, M, N, AA, AB, etc.)
✅ Purple background for easy identification
✅ Drag-resize support (coming soon)
✅ Per-user isolation (each user sees only their columns)
✅ Automatic persistence to database
✅ Works for both Candidates and Clients tables
✅ Delete functionality with confirmation
✅ Inline editing in Edit mode

## Notes

- Custom columns are **user-specific** - each user can create their own columns
- Column data is stored separately from the main candidates/clients tables
- Deleting a column will delete all data in that column (with confirmation)
- Column order is maintained automatically
- Values are stored as text but validated based on column type in UI

## Troubleshooting

### "User not authenticated" error
Make sure you're logged in to the application before adding columns.

### Custom columns not showing
1. Check that the migration was successfully applied
2. Refresh the page
3. Check browser console for errors

### Values not saving
1. Make sure you're in Edit mode (click ✏️ Edit)
2. Values are saved on blur (clicking outside the cell)
3. Check network tab for failed requests

## Technical Details

- Tables use UUID primary keys
- RLS policies ensure user-specific access
- Foreign keys cascade on delete
- Timestamps auto-update on changes
- EAV (Entity-Attribute-Value) pattern for flexible columns

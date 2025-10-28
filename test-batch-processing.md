# Testing the New Batch Processing System

## Summary of Changes

We've completely redesigned the match generation system to work within Netlify's 10-second serverless function timeout:

### The Problem
- Netlify free tier has a 10-second timeout for serverless functions
- Background processing (fire-and-forget) doesn't work on Netlify - the process gets killed when the function returns
- Previous system was only generating 1-2 matches instead of all 551 pairs

### The Solution: Batch Processing
- Created a new endpoint `/api/regenerate-batch` that processes matches in small batches
- Each batch completes within the 10-second timeout
- Frontend calls the API repeatedly, processing one batch at a time
- Shows real progress updates as each batch completes

### Key Files Changed:
1. **`/src/app/api/regenerate-batch/route.ts`** (NEW)
   - Processes matches in batches of 5 pairs at a time
   - Maintains state between calls using in-memory storage
   - Returns continuation token for next batch

2. **`/src/app/matches/page.tsx`** (UPDATED)
   - Updated `handleGenerateMatches` to use batch processing
   - Calls API repeatedly until all batches are complete
   - Shows progress: "Batch X/Y (Z% complete)"

## Testing Instructions

### Test 1: Full Regeneration
1. Open the Matches page
2. Click "Full Regen" button (orange/red button)
3. Confirm the warning dialog
4. Watch the progress display:
   - Should show "Processing X pairs in Y batches..."
   - Progress bar should gradually increase (not jump from 0% to 100%)
   - Should show "Batch 1/Y", then "Batch 2/Y", etc.
5. Verify all 551 pairs are processed (46 candidates × 12 clients)

### Test 2: Incremental Generation
1. After full regen is complete, add a new candidate or client
2. Click "Generate New" button (green button)
3. Should only process the new pairs
4. Progress should be much faster (fewer pairs to process)

### Test 3: Check Database
Run these queries in Supabase SQL editor:

```sql
-- Check total matches
SELECT COUNT(*) as total_matches FROM matches WHERE user_id = auth.uid();

-- Check match generation status
SELECT * FROM match_generation_status
WHERE user_id = auth.uid()
ORDER BY started_at DESC
LIMIT 1;

-- Verify batching worked correctly
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE commute_minutes <= 80) as under_80min,
  COUNT(*) FILTER (WHERE role_match = true) as role_matches
FROM matches
WHERE user_id = auth.uid();
```

## Expected Behavior

### Full Regeneration:
- Deletes all existing non-banned matches
- Processes all 551 pairs (46 × 12)
- Takes approximately 2-3 minutes total
- Shows incremental progress (not instant 100%)
- Creates ~200-300 matches (depends on Google Maps results)

### Incremental Generation:
- Only processes new pairs
- Skips existing matches
- Much faster (only new candidates/clients)
- Shows "Skipped existing" count

## Troubleshooting

If you still see only 1-2 matches:
1. Check browser console for errors
2. Check Netlify function logs
3. Verify Google Maps API key is working
4. Try clearing all matches and running Full Regen again

If progress jumps to 100% instantly:
1. Check if there are actually pairs to process
2. Verify candidates and clients exist
3. Check for JavaScript errors in console

## Technical Details

### Why Batch Size of 5?
- Google Maps Distance Matrix API can handle up to 25 origins × 25 destinations
- We use 5 pairs per batch to stay well within limits
- Each batch takes 2-5 seconds to process
- Leaves plenty of time within 10-second timeout

### State Management
- Uses in-memory Map to store processing state between calls
- State includes: candidates, clients, pairs to process, batch info
- State is cleared when processing completes

### Error Handling
- If a batch fails, it's counted as errors
- Processing continues with next batch
- Final stats show total errors

## Deployment Notes

After deploying these changes to Netlify:
1. Clear browser cache
2. Do a Full Regen to ensure clean state
3. Monitor Netlify function logs for any issues
4. Check that all batches complete successfully

## Success Criteria

✅ Full Regen processes ALL pairs (not just 1-2)
✅ Progress bar shows incremental updates
✅ Batch counter shows "Batch 1/Y", "Batch 2/Y", etc.
✅ Final count matches expected pairs
✅ No timeouts or 504 errors
✅ Generate New only processes new pairs (incremental)
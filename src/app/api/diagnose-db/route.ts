import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { testCandidateId, testClientId } = await request.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      triggers: {},
      testUpdate: {},
    };

    // Check if triggers still exist
    const { data: triggers, error: triggerError } = await supabase
      .rpc('check_triggers');

    if (triggerError) {
      diagnostics.triggers.error = triggerError.message;
      diagnostics.triggers.note = 'Could not check triggers - function may not exist';
    } else {
      diagnostics.triggers.found = triggers;
    }

    // If test candidate ID provided, test update
    if (testCandidateId) {
      // Get current data
      const { data: beforeData } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', testCandidateId)
        .single();

      diagnostics.testUpdate.before = beforeData;

      // Update with new postcode
      const testPostcode = `TEST-${Date.now()}`;
      const { data: updateResult, error: updateError } = await supabase
        .from('candidates')
        .update({ postcode: testPostcode })
        .eq('id', testCandidateId)
        .select();

      diagnostics.testUpdate.updateResult = updateResult;
      diagnostics.testUpdate.updateError = updateError?.message;

      // Wait a moment for any triggers to fire
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get data after update
      const { data: afterData } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', testCandidateId)
        .single();

      diagnostics.testUpdate.after = afterData;
      diagnostics.testUpdate.postcodeChanged = beforeData?.postcode !== afterData?.postcode;
      diagnostics.testUpdate.postcodeStuck = afterData?.postcode === testPostcode;

      // Check if matches were regenerated
      const { data: matchesBefore } = await supabase
        .from('matches')
        .select('id, commute_minutes')
        .eq('candidate_id', testCandidateId)
        .limit(5);

      diagnostics.testUpdate.matchesAfterUpdate = matchesBefore;
    }

    return NextResponse.json({
      success: true,
      diagnostics,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

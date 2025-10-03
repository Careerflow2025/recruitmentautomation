import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { candidates, clients } = await request.json();

    console.log('=== UPDATE API CALLED ===');
    console.log('Candidates to update:', candidates.length);
    console.log('Clients to update:', clients.length);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const results = {
      candidatesUpdated: 0,
      clientsUpdated: 0,
      errors: [] as string[],
      details: [] as any[],
    };

    // Update candidates
    for (const candidate of candidates) {
      console.log(`Updating candidate ${candidate.id} with postcode: ${candidate.postcode}`);

      // Get before state
      const { data: before } = await supabase
        .from('candidates')
        .select('postcode')
        .eq('id', candidate.id)
        .single();

      console.log(`  Before: ${before?.postcode}`);

      const { data: updateData, error } = await supabase
        .from('candidates')
        .update({
          role: candidate.role,
          postcode: candidate.postcode,
          salary: candidate.salary,
          days: candidate.days,
        })
        .eq('id', candidate.id)
        .select();

      console.log(`  Update result:`, updateData);

      // Wait briefly for any triggers
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get after state
      const { data: after } = await supabase
        .from('candidates')
        .select('postcode')
        .eq('id', candidate.id)
        .single();

      console.log(`  After (200ms later): ${after?.postcode}`);

      if (error) {
        results.errors.push(`Candidate ${candidate.id}: ${error.message}`);
      } else {
        results.candidatesUpdated++;
        results.details.push({
          type: 'candidate',
          id: candidate.id,
          before: before?.postcode,
          intended: candidate.postcode,
          after: after?.postcode,
          stuck: after?.postcode === candidate.postcode,
        });
      }
    }

    // Update clients
    for (const client of clients) {
      console.log(`Updating client ${client.id} with postcode: ${client.postcode}`);

      const { data: before } = await supabase
        .from('clients')
        .select('postcode')
        .eq('id', client.id)
        .single();

      console.log(`  Before: ${before?.postcode}`);

      const { data: updateData, error } = await supabase
        .from('clients')
        .update({
          surgery: client.surgery,
          role: client.role,
          postcode: client.postcode,
          pay: client.pay,
          days: client.days,
        })
        .eq('id', client.id)
        .select();

      console.log(`  Update result:`, updateData);

      await new Promise(resolve => setTimeout(resolve, 200));

      const { data: after } = await supabase
        .from('clients')
        .select('postcode')
        .eq('id', client.id)
        .single();

      console.log(`  After (200ms later): ${after?.postcode}`);

      if (error) {
        results.errors.push(`Client ${client.id}: ${error.message}`);
      } else {
        results.clientsUpdated++;
        results.details.push({
          type: 'client',
          id: client.id,
          before: before?.postcode,
          intended: client.postcode,
          after: after?.postcode,
          stuck: after?.postcode === client.postcode,
        });
      }
    }

    console.log('=== UPDATE API COMPLETE ===');
    console.log('Results:', results);

    return NextResponse.json({
      success: results.errors.length === 0,
      results,
    });
  } catch (error: any) {
    console.error('=== UPDATE API ERROR ===', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

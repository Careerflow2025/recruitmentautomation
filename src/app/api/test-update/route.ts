import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, postcode, type } = body; // type = 'candidate' or 'client'

    console.log('TEST UPDATE:', type, id, '-> New postcode:', postcode);

    const table = type === 'candidate' ? 'candidates' : 'clients';

    // Update
    const { data: updateData, error: updateError } = await supabase
      .from(table)
      .update({ postcode })
      .eq('id', id)
      .select();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Verify - read it back
    const { data: verifyData, error: verifyError } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (verifyError) {
      return NextResponse.json({ error: verifyError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updated: updateData,
      verified: verifyData,
      message: `Updated ${type} ${id} to ${postcode}. Verified: ${verifyData.postcode}`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/locummeds/fees
 * Calculate placement fee based on role, days worked, and rate
 *
 * Fee = 10% of annual equivalent
 * Annual equivalent = daily_rate × days_per_week × 52 weeks
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const body = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const userId = await verifyApiKey(supabase, apiKey);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const {
      role,
      days_per_week,
      hourly_rate,
      daily_rate,
      fee_percentage = 10.00,
    } = body;

    if (!role || !days_per_week) {
      return NextResponse.json({
        error: 'role and days_per_week are required'
      }, { status: 400 });
    }

    // Get UK salary data for the role
    const { data: salaryData } = await supabase
      .from('uk_role_salaries')
      .select('*')
      .ilike('role', `%${role}%`)
      .limit(1)
      .single();

    let calculatedDailyRate = daily_rate;
    let calculatedHourlyRate = hourly_rate;
    let rateSource = 'provided';

    // If no rate provided, use UK averages
    if (!calculatedDailyRate && !calculatedHourlyRate) {
      if (salaryData) {
        calculatedDailyRate = (salaryData.daily_rate_min + salaryData.daily_rate_max) / 2;
        calculatedHourlyRate = (salaryData.hourly_rate_min + salaryData.hourly_rate_max) / 2;
        rateSource = 'uk_average';
      } else {
        // Default fallback
        calculatedDailyRate = 150.00;
        calculatedHourlyRate = 18.75;
        rateSource = 'default';
      }
    } else if (calculatedHourlyRate && !calculatedDailyRate) {
      // Calculate daily from hourly (8 hour day)
      calculatedDailyRate = calculatedHourlyRate * 8;
      rateSource = 'calculated_from_hourly';
    } else if (calculatedDailyRate && !calculatedHourlyRate) {
      // Calculate hourly from daily
      calculatedHourlyRate = calculatedDailyRate / 8;
      rateSource = 'calculated_from_daily';
    }

    // Calculate annual equivalent
    const weeksPerYear = 52;
    const annualEquivalent = calculatedDailyRate * days_per_week * weeksPerYear;

    // Calculate fee
    const placementFee = annualEquivalent * (fee_percentage / 100);

    // Format breakdown
    const calculation = {
      role,
      days_per_week,
      daily_rate: calculatedDailyRate,
      hourly_rate: calculatedHourlyRate,
      rate_source: rateSource,
      weeks_per_year: weeksPerYear,
      annual_equivalent: annualEquivalent,
      fee_percentage,
      placement_fee: placementFee,
      formula: `£${calculatedDailyRate.toFixed(2)}/day × ${days_per_week} days/week × ${weeksPerYear} weeks × ${fee_percentage}%`,
      uk_salary_data: salaryData ? {
        annual_range: `£${salaryData.annual_salary_min?.toLocaleString()} - £${salaryData.annual_salary_max?.toLocaleString()}`,
        daily_range: `£${salaryData.daily_rate_min} - £${salaryData.daily_rate_max}`,
        hourly_range: `£${salaryData.hourly_rate_min} - £${salaryData.hourly_rate_max}`,
        registration_required: salaryData.registration_required,
        dbs_level: salaryData.dbs_level,
      } : null,
    };

    return NextResponse.json({
      success: true,
      calculation,
      summary: {
        annual_equivalent_formatted: `£${annualEquivalent.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
        placement_fee_formatted: `£${placementFee.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
      },
    });

  } catch (error) {
    console.error('Fee calculation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to calculate fee' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/locummeds/fees
 * Get UK role salary reference data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const userId = await verifyApiKey(supabase, apiKey);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const role = searchParams.get('role');

    let query = supabase
      .from('uk_role_salaries')
      .select('*')
      .order('role', { ascending: true });

    if (role) {
      query = query.ilike('role', `%${role}%`);
    }

    const { data: salaries, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: salaries?.length || 0,
      salaries,
    });

  } catch (error) {
    console.error('Fee GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch salary data' },
      { status: 500 }
    );
  }
}

async function verifyApiKey(supabase: any, apiKey: string): Promise<string | null> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const { data: keyData } = await supabase
    .from('locummeds_api_keys')
    .select('user_id')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (keyData) {
    await supabase
      .from('locummeds_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash);
  }

  return keyData?.user_id || null;
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/locummeds/api-keys
 * List all API keys for current user (requires auth session)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();

    // Check auth session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: keys, error } = await supabase
      .from('locummeds_api_keys')
      .select('id, key_prefix, name, permissions, last_used_at, expires_at, is_active, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: keys?.length || 0,
      keys,
    });

  } catch (error) {
    console.error('API Keys GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/locummeds/api-keys
 * Generate a new API key
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createServiceClient();

    // Check auth session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const {
      name,
      permissions = ['read', 'write'],
      expires_in_days,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Generate secure API key
    const apiKey = generateApiKey();
    const keyPrefix = apiKey.substring(0, 8);
    const keyHash = await hashApiKey(apiKey);

    // Calculate expiry if provided
    let expiresAt = null;
    if (expires_in_days) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + expires_in_days);
      expiresAt = expiry.toISOString();
    }

    const { data, error } = await supabase
      .from('locummeds_api_keys')
      .insert({
        user_id: user.id,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name,
        permissions,
        expires_at: expiresAt,
        is_active: true,
      })
      .select('id, key_prefix, name, permissions, expires_at, is_active, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return the API key only once - it won't be shown again
    return NextResponse.json({
      success: true,
      message: 'API key created. Save this key - it will not be shown again.',
      api_key: apiKey,
      key_details: data,
    });

  } catch (error) {
    console.error('API Keys POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create API key' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/locummeds/api-keys
 * Revoke an API key
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('key_id');

    if (!keyId) {
      return NextResponse.json({ error: 'key_id required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Check auth session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Deactivate the key (soft delete)
    const { data, error } = await supabase
      .from('locummeds_api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('user_id', user.id)
      .select('id, key_prefix, name, is_active')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'API key revoked',
      key: data,
    });

  } catch (error) {
    console.error('API Keys DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to revoke API key' },
      { status: 500 }
    );
  }
}

/**
 * Generate a secure random API key
 */
function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const prefix = 'lm_'; // LocumMeds prefix
  let key = prefix;

  const array = new Uint8Array(32);
  crypto.getRandomValues(array);

  for (let i = 0; i < 32; i++) {
    key += chars[array[i] % chars.length];
  }

  return key;
}

/**
 * Hash API key using SHA-256
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

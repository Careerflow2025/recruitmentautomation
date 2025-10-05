import { supabase } from './supabase/browser';

export interface UserPreference {
  id?: string;
  user_id: string;
  preference_key: string;
  preference_value: any;
  created_at?: string;
  updated_at?: string;
}

/**
 * Save a user preference to the database
 * Uses upsert (INSERT ... ON CONFLICT DO UPDATE) to handle both create and update
 */
export async function saveUserPreference(key: string, value: any): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Upsert preference (insert or update if exists)
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: session.user.id,
        preference_key: key,
        preference_value: value
      }, {
        onConflict: 'user_id,preference_key'
      });

    if (error) {
      console.error('Error saving user preference:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error saving user preference:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Load a user preference from the database
 */
export async function loadUserPreference(key: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // Get current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Fetch preference
    const { data, error } = await supabase
      .from('user_preferences')
      .select('preference_value')
      .eq('user_id', session.user.id)
      .eq('preference_key', key)
      .single();

    if (error) {
      // If no preference found, return null (not an error)
      if (error.code === 'PGRST116') {
        return { success: true, data: null };
      }
      console.error('Error loading user preference:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data?.preference_value };
  } catch (error: any) {
    console.error('Error loading user preference:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a user preference from the database
 */
export async function deleteUserPreference(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Delete preference
    const { error } = await supabase
      .from('user_preferences')
      .delete()
      .eq('user_id', session.user.id)
      .eq('preference_key', key);

    if (error) {
      console.error('Error deleting user preference:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting user preference:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Load all user preferences for the current user
 */
export async function loadAllUserPreferences(): Promise<{ success: boolean; data?: Record<string, any>; error?: string }> {
  try {
    // Get current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Fetch all preferences
    const { data, error } = await supabase
      .from('user_preferences')
      .select('preference_key, preference_value')
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Error loading user preferences:', error);
      return { success: false, error: error.message };
    }

    // Convert array to object for easy access
    const preferences: Record<string, any> = {};
    if (data) {
      data.forEach(item => {
        preferences[item.preference_key] = item.preference_value;
      });
    }

    return { success: true, data: preferences };
  } catch (error: any) {
    console.error('Error loading user preferences:', error);
    return { success: false, error: error.message };
  }
}

// Specific helper functions for column preferences
export const PREFERENCE_KEYS = {
  CANDIDATES_COLUMN_WIDTHS: 'candidates-table-column-widths',
  CANDIDATES_COLUMN_LOCKED: 'candidates-table-column-locked',
  CLIENTS_COLUMN_WIDTHS: 'clients-table-column-widths',
  CLIENTS_COLUMN_LOCKED: 'clients-table-column-locked',
} as const;

/**
 * Save column layout preferences for a specific table
 */
export async function saveColumnPreferences(
  tableType: 'candidates' | 'clients',
  columnWidths: Record<string, number>,
  isLocked: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const widthsKey = tableType === 'candidates' 
      ? PREFERENCE_KEYS.CANDIDATES_COLUMN_WIDTHS 
      : PREFERENCE_KEYS.CLIENTS_COLUMN_WIDTHS;
    
    const lockedKey = tableType === 'candidates'
      ? PREFERENCE_KEYS.CANDIDATES_COLUMN_LOCKED
      : PREFERENCE_KEYS.CLIENTS_COLUMN_LOCKED;

    // Save both width and lock preferences
    const [widthsResult, lockedResult] = await Promise.all([
      saveUserPreference(widthsKey, columnWidths),
      saveUserPreference(lockedKey, isLocked)
    ]);

    if (!widthsResult.success) {
      return { success: false, error: widthsResult.error };
    }

    if (!lockedResult.success) {
      return { success: false, error: lockedResult.error };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error saving column preferences:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Load column layout preferences for a specific table
 */
export async function loadColumnPreferences(
  tableType: 'candidates' | 'clients'
): Promise<{ 
  success: boolean; 
  columnWidths?: Record<string, number>; 
  isLocked?: boolean; 
  error?: string 
}> {
  try {
    const widthsKey = tableType === 'candidates' 
      ? PREFERENCE_KEYS.CANDIDATES_COLUMN_WIDTHS 
      : PREFERENCE_KEYS.CLIENTS_COLUMN_WIDTHS;
    
    const lockedKey = tableType === 'candidates'
      ? PREFERENCE_KEYS.CANDIDATES_COLUMN_LOCKED
      : PREFERENCE_KEYS.CLIENTS_COLUMN_LOCKED;

    // Load both preferences
    const [widthsResult, lockedResult] = await Promise.all([
      loadUserPreference(widthsKey),
      loadUserPreference(lockedKey)
    ]);

    if (!widthsResult.success) {
      return { success: false, error: widthsResult.error };
    }

    if (!lockedResult.success) {
      return { success: false, error: lockedResult.error };
    }

    return {
      success: true,
      columnWidths: widthsResult.data,
      isLocked: lockedResult.data
    };
  } catch (error: any) {
    console.error('Error loading column preferences:', error);
    return { success: false, error: error.message };
  }
}
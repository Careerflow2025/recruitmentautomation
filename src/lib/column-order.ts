import { supabase } from './supabase/browser';

export type ColumnOrderItem = {
  id: string;      // Column identifier (e.g., 'id', 'first_name', 'custom_license_number')
  label: string;   // Display label (e.g., 'ID', 'First Name', 'License Number')
  type: 'standard' | 'custom';
  visible: boolean;
};

// Default column order for candidates
export const DEFAULT_CANDIDATES_COLUMNS: ColumnOrderItem[] = [
  { id: 'id', label: 'ID', type: 'standard', visible: true },
  { id: 'first_name', label: 'First Name', type: 'standard', visible: true },
  { id: 'last_name', label: 'Last Name', type: 'standard', visible: true },
  { id: 'email', label: 'Email', type: 'standard', visible: true },
  { id: 'phone', label: 'Phone', type: 'standard', visible: true },
  { id: 'role', label: 'Role', type: 'standard', visible: true },
  { id: 'postcode', label: 'Postcode', type: 'standard', visible: true },
  { id: 'salary', label: 'Salary', type: 'standard', visible: true },
  { id: 'days', label: 'Availability', type: 'standard', visible: true },
  { id: 'experience', label: 'Experience', type: 'standard', visible: true },
  { id: 'notes', label: 'Notes', type: 'standard', visible: true },
];

// Default column order for clients
export const DEFAULT_CLIENTS_COLUMNS: ColumnOrderItem[] = [
  { id: 'id', label: 'ID', type: 'standard', visible: true },
  { id: 'surgery', label: 'Surgery', type: 'standard', visible: true },
  { id: 'client_name', label: 'Client Name', type: 'standard', visible: true },
  { id: 'client_phone', label: 'Client Phone', type: 'standard', visible: true },
  { id: 'client_email', label: 'Client Email', type: 'standard', visible: true },
  { id: 'role', label: 'Role', type: 'standard', visible: true },
  { id: 'postcode', label: 'Postcode', type: 'standard', visible: true },
  { id: 'budget', label: 'Budget', type: 'standard', visible: true },
  { id: 'requirement', label: 'Requirement', type: 'standard', visible: true },
  { id: 'system', label: 'System', type: 'standard', visible: true },
  { id: 'notes', label: 'Notes', type: 'standard', visible: true },
];

export async function getColumnOrder(tableName: 'candidates' | 'clients'): Promise<ColumnOrderItem[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('column_order_preferences')
      .select('column_order')
      .eq('user_id', user.id)
      .eq('table_name', tableName)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }

    if (data && data.column_order) {
      return data.column_order as ColumnOrderItem[];
    }

    // Return default order if no preference saved
    return tableName === 'candidates' ? DEFAULT_CANDIDATES_COLUMNS : DEFAULT_CLIENTS_COLUMNS;
  } catch (err) {
    console.error('Error fetching column order:', err);
    return tableName === 'candidates' ? DEFAULT_CANDIDATES_COLUMNS : DEFAULT_CLIENTS_COLUMNS;
  }
}

export async function saveColumnOrder(
  tableName: 'candidates' | 'clients',
  columnOrder: ColumnOrderItem[]
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('column_order_preferences')
      .upsert({
        user_id: user.id,
        table_name: tableName,
        column_order: columnOrder
      }, {
        onConflict: 'user_id,table_name'
      });

    if (error) throw error;
  } catch (err) {
    console.error('Error saving column order:', err);
    throw err;
  }
}

export async function resetColumnOrder(tableName: 'candidates' | 'clients'): Promise<ColumnOrderItem[]> {
  const defaultOrder = tableName === 'candidates' ? DEFAULT_CANDIDATES_COLUMNS : DEFAULT_CLIENTS_COLUMNS;
  await saveColumnOrder(tableName, defaultOrder);
  return defaultOrder;
}

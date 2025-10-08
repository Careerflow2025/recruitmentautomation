import { supabase } from './supabase/browser';

export interface CustomColumn {
  id: string;
  user_id: string;
  table_name: 'candidates' | 'clients';
  column_name: string;
  column_label: string;
  column_type: 'text' | 'number' | 'date' | 'email' | 'phone' | 'url';
  column_order: number;
  created_at: string;
  updated_at: string;
}

export interface CustomColumnData {
  id: string;
  user_id: string;
  candidate_id?: string;
  client_id?: string;
  column_name: string;
  value: string | null;
  created_at: string;
  updated_at: string;
}

// Get all custom columns for a table
export async function getCustomColumns(tableName: 'candidates' | 'clients'): Promise<CustomColumn[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('custom_columns')
    .select('*')
    .eq('user_id', user.id)
    .eq('table_name', tableName)
    .order('column_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Add a new custom column
export async function addCustomColumn(
  tableName: 'candidates' | 'clients',
  columnLabel: string,
  columnType: 'text' | 'number' | 'date' | 'email' | 'phone' | 'url' = 'text'
): Promise<CustomColumn> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Generate column name from label (lowercase, replace spaces with underscores)
  const columnName = `custom_${columnLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

  // Get current max order
  const { data: existingColumns } = await supabase
    .from('custom_columns')
    .select('column_order')
    .eq('user_id', user.id)
    .eq('table_name', tableName)
    .order('column_order', { ascending: false })
    .limit(1);

  const nextOrder = existingColumns && existingColumns.length > 0
    ? existingColumns[0].column_order + 1
    : 0;

  const { data, error } = await supabase
    .from('custom_columns')
    .insert({
      user_id: user.id,
      table_name: tableName,
      column_name: columnName,
      column_label: columnLabel,
      column_type: columnType,
      column_order: nextOrder
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Delete a custom column
export async function deleteCustomColumn(columnId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { error } = await supabase
    .from('custom_columns')
    .delete()
    .eq('id', columnId)
    .eq('user_id', user.id);

  if (error) throw error;
}

// Get custom column data for a specific record
export async function getCustomColumnData(
  tableName: 'candidates' | 'clients',
  recordId: string
): Promise<Record<string, string | null>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const dataTable = tableName === 'candidates' ? 'candidate_custom_data' : 'client_custom_data';
  const idField = tableName === 'candidates' ? 'candidate_id' : 'client_id';

  const { data, error } = await supabase
    .from(dataTable)
    .select('column_name, value')
    .eq('user_id', user.id)
    .eq(idField, recordId);

  if (error) throw error;

  const result: Record<string, string | null> = {};
  data?.forEach(item => {
    result[item.column_name] = item.value;
  });

  return result;
}

// Set custom column value for a record
export async function setCustomColumnValue(
  tableName: 'candidates' | 'clients',
  recordId: string,
  columnName: string,
  value: string | null
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const dataTable = tableName === 'candidates' ? 'candidate_custom_data' : 'client_custom_data';
  const idField = tableName === 'candidates' ? 'candidate_id' : 'client_id';

  const { error } = await supabase
    .from(dataTable)
    .upsert({
      user_id: user.id,
      [idField]: recordId,
      column_name: columnName,
      value: value
    }, {
      onConflict: `user_id,${idField},column_name`
    });

  if (error) throw error;
}

// Generate Excel-style column letter (A, B, C, ... Z, AA, AB, ...)
export function getColumnLetter(index: number): string {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode(65 + (index % 26)) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create a Supabase client configured for browser use
export const supabase = createBrowserClient(
  supabaseUrl,
  supabaseAnonKey
);

// Helper function to get the current user
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Helper function to get the session
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
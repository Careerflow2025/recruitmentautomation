import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lfoapqybmhxctqdqxxoa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmb2FwcXlibWh4Y3RxZHF4eG9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyODQ1MDIsImV4cCI6MjA3NDg2MDUwMn0.TOVqF_SqyXNzEPOhdey9E3kTHM8m2tOnQ2HwVmbUXX0';

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

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

// Set session from token
export async function setSessionFromToken(token: string) {
  const { data, error } = await supabase.auth.setSession({
    access_token: token,
    refresh_token: token, // This is not ideal but works for now
  });
  return { data, error };
}
'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useState } from 'react';

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    setLoading(true);
    try {
      console.log('🚪 Signing out...');

      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('❌ Sign out error:', error);
        throw error;
      }

      console.log('✅ Signed out successfully');

      // Clear local storage
      localStorage.clear();

      // Force redirect with full page reload to clear all state
      window.location.href = '/login';
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Failed to sign out. Please try again.');
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
        loading
          ? 'bg-white/10 text-white/50 cursor-not-allowed'
          : 'bg-red-600 text-white hover:bg-red-700 shadow-md hover:shadow-lg'
      }`}
      title="Sign out"
    >
      {loading ? (
        <>
          <span className="md:hidden">⏳</span>
          <span className="hidden md:inline">⏳ Signing out...</span>
        </>
      ) : (
        <>
          <span className="md:hidden">🚪</span>
          <span className="hidden md:inline">🚪 Sign Out</span>
        </>
      )}
    </button>
  );
}

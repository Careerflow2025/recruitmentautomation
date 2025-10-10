'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/browser';
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

      // Force redirect with full page reload to homepage (landing page)
      window.location.href = '/';
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
      className={`
        px-4 py-2 rounded-lg text-sm font-semibold
        transition-all duration-200
        flex items-center gap-2
        ${loading
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'text-gray-700 hover:text-red-600 hover:bg-red-50 border border-gray-200 hover:border-red-200'
        }
      `}
      title="Sign out"
    >
      {loading ? (
        <>
          <span className="animate-spin">⏳</span>
          <span className="hidden md:inline">Signing out...</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden md:inline">Sign Out</span>
        </>
      )}
    </button>
  );
}

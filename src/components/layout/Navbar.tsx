'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { supabase } from '@/lib/supabase/client';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check authentication status
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
      setLoading(false);
    }

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Don't show navbar on public homepage (it has its own auth UI)
  if (pathname === '/') {
    return null;
  }

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/candidates', label: 'Candidates', icon: '👥' },
    { href: '/clients', label: 'Clients', icon: '🏥' },
    { href: '/matches', label: 'Matches', icon: '🎯' },
  ];

  return (
    <nav className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Dashboard Link */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-bold text-xl hover:opacity-90 transition-opacity"
          >
            <span className="text-2xl">⚡</span>
            <span className="hidden sm:inline">AI Laser Recruiter</span>
            <span className="sm:hidden">AIR</span>
          </Link>

          {/* Navigation Links and Auth Buttons */}
          <div className="flex items-center gap-1 md:gap-2">
            {/* Only show nav links when authenticated */}
            {isAuthenticated && (
              <>
                {navLinks.slice(1).map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 rounded-lg font-medium transition-all text-sm ${
                      pathname === link.href
                        ? 'bg-white/20'
                        : 'hover:bg-white/10'
                    }`}
                  >
                    <span className="md:hidden">{link.icon}</span>
                    <span className="hidden md:inline">{link.icon} {link.label}</span>
                  </Link>
                ))}

                {/* Divider */}
                <div className="hidden md:block w-px h-8 bg-white/30 mx-2"></div>

                {/* Logout Button */}
                <LogoutButton />
              </>
            )}

            {/* Show Login/Signup buttons when NOT authenticated */}
            {!isAuthenticated && !loading && (
              <>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Login button clicked');
                    router.push('/login');
                  }}
                  type="button"
                  className="px-4 py-2 rounded-lg font-bold transition-all text-sm bg-white text-blue-600 hover:bg-blue-50 shadow-lg cursor-pointer"
                >
                  🔐 Login
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Signup button clicked');
                    router.push('/signup');
                  }}
                  type="button"
                  className="px-4 py-2 rounded-lg font-bold transition-all text-sm bg-green-600 text-white hover:bg-green-700 shadow-lg cursor-pointer"
                >
                  ✨ Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

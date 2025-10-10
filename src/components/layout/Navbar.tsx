'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { supabase } from '@/lib/supabase/browser';

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
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/candidates', label: 'Candidates', icon: '👥' },
    { href: '/clients', label: 'Clients', icon: '🏥' },
    { href: '/matches', label: 'Matches', icon: '✨' },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50 backdrop-blur-lg bg-white/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Brand */}
          <Link
            href="/dashboard"
            className="flex items-center gap-3 group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
              <span className="text-xl">⚡</span>
            </div>
            <div className="flex flex-col">
              <span className="hidden sm:block font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                AI Matcher
              </span>
              <span className="hidden sm:block text-xs text-gray-500 font-medium -mt-1">
                Recruitment Platform
              </span>
            </div>
          </Link>

          {/* Navigation Links and Auth */}
          <div className="flex items-center gap-2">
            {/* Navigation Links - Only when authenticated */}
            {isAuthenticated && (
              <div className="hidden md:flex items-center gap-1 mr-2">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`
                        relative px-4 py-2 rounded-lg font-medium text-sm
                        transition-all duration-200 flex items-center gap-2
                        ${isActive
                          ? 'text-blue-600 bg-blue-50'
                          : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                        }
                      `}
                    >
                      <span className="text-base">{link.icon}</span>
                      <span>{link.label}</span>
                      {isActive && (
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full" />
                      )}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Mobile Navigation - Only when authenticated */}
            {isAuthenticated && (
              <div className="flex md:hidden items-center gap-1 mr-2">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`
                        p-2 rounded-lg text-xl transition-all duration-200
                        ${isActive
                          ? 'bg-blue-50'
                          : 'hover:bg-gray-50'
                        }
                      `}
                      title={link.label}
                    >
                      {link.icon}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Auth Buttons */}
            {isAuthenticated && <LogoutButton />}

            {/* Show Login/Signup when NOT authenticated */}
            {!isAuthenticated && !loading && (
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push('/login');
                  }}
                  type="button"
                  className="px-4 py-2 rounded-lg font-semibold text-sm text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-all duration-200"
                >
                  Login
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push('/signup');
                  }}
                  type="button"
                  className="px-5 py-2 rounded-lg font-semibold text-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

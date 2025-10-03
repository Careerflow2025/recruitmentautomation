'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/components/auth/LogoutButton';

export function Navbar() {
  const pathname = usePathname();

  // Don't show navbar on login/signup pages
  if (pathname === '/login' || pathname === '/signup') {
    return null;
  }

  const navLinks = [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/candidates', label: 'Candidates', icon: '👥' },
    { href: '/clients', label: 'Clients', icon: '🏥' },
    { href: '/matches', label: 'Matches', icon: '🎯' },
  ];

  return (
    <nav className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Home Link */}
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-xl hover:opacity-90 transition-opacity"
          >
            <span className="text-2xl">⚡</span>
            <span className="hidden sm:inline">AI Laser Recruiter</span>
            <span className="sm:hidden">AIR</span>
          </Link>

          {/* Navigation Links - Skip Home link since logo already links to home */}
          <div className="flex items-center gap-1 md:gap-2">
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
          </div>
        </div>
      </div>
    </nav>
  );
}

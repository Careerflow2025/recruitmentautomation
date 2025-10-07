'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/browser';

export default function Home() {
  const [stats, setStats] = useState({
    total: 0,
    roleMatches: 0,
    locationOnly: 0,
    under20Minutes: 0,
    under40Minutes: 0,
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchStats() {
      try {
        // Get current user from session
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Redirect to homepage (landing page with login) if not authenticated
          router.push('/');
          return;
        }

        // Fetch only current user's matches
        const { data: matches, error } = await supabase
          .from('matches')
          .select('*')
          .eq('user_id', session.user.id);

        if (error) throw error;

        const total = matches.length;
        const roleMatches = matches.filter(m => m.role_match).length;
        const under20 = matches.filter(m => m.commute_minutes <= 20).length;
        const under40 = matches.filter(m => m.commute_minutes <= 40).length;

        setStats({
          total,
          roleMatches,
          locationOnly: total - roleMatches,
          under20Minutes: under20,
          under40Minutes: under40,
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            🤖 AI Matcher Recruitment
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Fast. Precise. Powerful. AI-driven matching based on role compatibility and commute time.
            Match the perfect candidates with AI precision.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Total Matches</h3>
              <span className="text-3xl">🔗</span>
            </div>
            {loading ? (
              <div className="animate-pulse bg-gray-200 h-10 w-20 rounded"></div>
            ) : (
              <>
                <p className="text-4xl font-bold text-blue-600">{stats.total}</p>
                <p className="text-sm text-gray-500 mt-2">
                  {stats.roleMatches} role matches, {stats.locationOnly} location-only
                </p>
              </>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Quick Matches</h3>
              <span className="text-3xl">🟢🟢🟢</span>
            </div>
            {loading ? (
              <div className="animate-pulse bg-gray-200 h-10 w-20 rounded"></div>
            ) : (
              <>
                <p className="text-4xl font-bold text-green-600">{stats.under20Minutes}</p>
                <p className="text-sm text-gray-500 mt-2">Under 20 minutes commute</p>
              </>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Good Matches</h3>
              <span className="text-3xl">🟢🟢</span>
            </div>
            {loading ? (
              <div className="animate-pulse bg-gray-200 h-10 w-20 rounded"></div>
            ) : (
              <>
                <p className="text-4xl font-bold text-purple-600">{stats.under40Minutes}</p>
                <p className="text-sm text-gray-500 mt-2">Under 40 minutes commute</p>
              </>
            )}
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Link
            href="/matches"
            className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-8 text-white hover:shadow-xl transition-shadow group"
          >
            <h3 className="text-2xl font-bold mb-2 group-hover:scale-105 transition-transform">
              View Matches
            </h3>
            <p className="text-blue-100">
              See all candidate-client matches with filters
            </p>
            <div className="mt-4 text-sm font-medium">
              → Explore Matches
            </div>
          </Link>

          <Link
            href="/candidates"
            className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-8 text-white hover:shadow-xl transition-shadow group"
          >
            <h3 className="text-2xl font-bold mb-2 group-hover:scale-105 transition-transform">
              Candidates
            </h3>
            <p className="text-green-100">
              View professionals seeking positions
            </p>
            <div className="mt-4 text-sm font-medium">
              → View Candidates
            </div>
          </Link>

          <Link
            href="/clients"
            className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-8 text-white hover:shadow-xl transition-shadow group"
          >
            <h3 className="text-2xl font-bold mb-2 group-hover:scale-105 transition-transform">
              Clients
            </h3>
            <p className="text-purple-100">
              View businesses with open positions
            </p>
            <div className="mt-4 text-sm font-medium">
              → View Clients
            </div>
          </Link>
        </div>

        {/* Three Strict Rules */}
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6">
          <h3 className="text-lg font-bold text-yellow-900 mb-4">
            ⚡ THREE STRICT RULES (Non-Negotiable)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-yellow-200">
              <div className="font-bold text-yellow-900 mb-2">1. Sort by Time</div>
              <p className="text-sm text-yellow-800">
                All matches ALWAYS sorted by commute time ascending (shortest first)
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-yellow-200">
              <div className="font-bold text-yellow-900 mb-2">2. Max 80 Minutes</div>
              <p className="text-sm text-yellow-800">
                Exclude ALL matches over 1h 20m (80 minutes) - never shown
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-yellow-200">
              <div className="font-bold text-yellow-900 mb-2">3. Google Maps Only</div>
              <p className="text-sm text-yellow-800">
                ONLY Google Maps Distance Matrix API - no alternative methods
              </p>
            </div>
          </div>
        </div>

        {/* Phase Notice */}
        <div className="mt-6 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-4 text-center">
          <p className="text-sm text-purple-900 font-medium">
            <strong>✅ AI Matcher Recruiter:</strong> Multi-user authentication enabled!
            <br />
            <strong>⚡ AI Features:</strong> Smart Paste, AI Chat, and Voice Input ready to use!
          </p>
        </div>
      </div>
    </div>
  );
}

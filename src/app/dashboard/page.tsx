'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/browser';

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    roleMatches: 0,
    locationOnly: 0,
    under20Minutes: 0,
    under40Minutes: 0,
    candidatesCount: 0,
    clientsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('User');
  const router = useRouter();

  useEffect(() => {
    async function fetchStats() {
      try {
        // Get current user from session
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          router.push('/');
          return;
        }

        // Extract name from email
        const email = session.user.email || '';
        const name = email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);
        setUserName(name);

        // Fetch matches
        const { data: matches, error: matchError } = await supabase
          .from('matches')
          .select('*')
          .eq('user_id', session.user.id);

        if (matchError) throw matchError;

        // Fetch candidates count
        const { count: candidatesCount, error: candError } = await supabase
          .from('candidates')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.user.id);

        if (candError) throw candError;

        // Fetch clients count
        const { count: clientsCount, error: clientError } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.user.id);

        if (clientError) throw clientError;

        const total = matches?.length || 0;
        const roleMatches = matches?.filter(m => m.role_match).length || 0;
        const under20 = matches?.filter(m => m.commute_minutes <= 20).length || 0;
        const under40 = matches?.filter(m => m.commute_minutes <= 40).length || 0;

        setStats({
          total,
          roleMatches,
          locationOnly: total - roleMatches,
          under20Minutes: under20,
          under40Minutes: under40,
          candidatesCount: candidatesCount || 0,
          clientsCount: clientsCount || 0,
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [router]);

  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good Morning' : currentHour < 18 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-200 to-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-gradient-to-r from-purple-200 to-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-gradient-to-r from-indigo-200 to-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Hero Section with Welcome */}
        <div className="mb-8">
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl shadow-2xl p-8 md:p-12 text-white overflow-hidden relative">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-6xl animate-bounce">👋</div>
                <div>
                  <h1 className="text-4xl md:text-5xl font-black">
                    {greeting}, {userName}!
                  </h1>
                  <p className="text-blue-100 text-lg md:text-xl mt-2">
                    Welcome to your AI-powered recruitment command center
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center transform hover:scale-105 transition-all">
                  <div className="text-3xl font-bold">{loading ? '...' : stats.total}</div>
                  <div className="text-sm text-blue-100 mt-1">Total Matches</div>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center transform hover:scale-105 transition-all">
                  <div className="text-3xl font-bold">{loading ? '...' : stats.roleMatches}</div>
                  <div className="text-sm text-blue-100 mt-1">Role Matches</div>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center transform hover:scale-105 transition-all">
                  <div className="text-3xl font-bold">{loading ? '...' : stats.candidatesCount}</div>
                  <div className="text-sm text-blue-100 mt-1">Candidates</div>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center transform hover:scale-105 transition-all">
                  <div className="text-3xl font-bold">{loading ? '...' : stats.clientsCount}</div>
                  <div className="text-sm text-blue-100 mt-1">Clients</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Matches Card */}
          <div className="group bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-2xl transform group-hover:scale-110 group-hover:rotate-3 transition-all">
                🔗
              </div>
              <div className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                ACTIVE
              </div>
            </div>
            <div className="mb-2">
              {loading ? (
                <div className="animate-pulse bg-gray-200 h-10 w-24 rounded"></div>
              ) : (
                <div className="text-4xl font-black text-gray-900">{stats.total}</div>
              )}
            </div>
            <div className="text-sm font-semibold text-gray-600">Total Matches</div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-600 font-bold">✅ {stats.roleMatches} Role</span>
                <span className="text-orange-600 font-bold">📍 {stats.locationOnly} Location</span>
              </div>
            </div>
          </div>

          {/* Quick Matches Card */}
          <div className="group bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center text-2xl transform group-hover:scale-110 group-hover:rotate-3 transition-all">
                ⚡
              </div>
              <div className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full">
                FAST
              </div>
            </div>
            <div className="mb-2">
              {loading ? (
                <div className="animate-pulse bg-gray-200 h-10 w-24 rounded"></div>
              ) : (
                <div className="text-4xl font-black text-gray-900">{stats.under20Minutes}</div>
              )}
            </div>
            <div className="text-sm font-semibold text-gray-600">Quick Matches</div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 text-xs text-green-600 font-bold">
                <span>🟢🟢🟢</span>
                <span>Under 20 minutes</span>
              </div>
            </div>
          </div>

          {/* Good Matches Card */}
          <div className="group bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center text-2xl transform group-hover:scale-110 group-hover:rotate-3 transition-all">
                🎯
              </div>
              <div className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                GOOD
              </div>
            </div>
            <div className="mb-2">
              {loading ? (
                <div className="animate-pulse bg-gray-200 h-10 w-24 rounded"></div>
              ) : (
                <div className="text-4xl font-black text-gray-900">{stats.under40Minutes}</div>
              )}
            </div>
            <div className="text-sm font-semibold text-gray-600">Good Matches</div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 text-xs text-purple-600 font-bold">
                <span>🟢🟢</span>
                <span>Under 40 minutes</span>
              </div>
            </div>
          </div>

          {/* Match Rate Card */}
          <div className="group bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-xl flex items-center justify-center text-2xl transform group-hover:scale-110 group-hover:rotate-3 transition-all">
                📊
              </div>
              <div className="text-xs font-bold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full">
                RATE
              </div>
            </div>
            <div className="mb-2">
              {loading ? (
                <div className="animate-pulse bg-gray-200 h-10 w-24 rounded"></div>
              ) : (
                <div className="text-4xl font-black text-gray-900">
                  {stats.total > 0 ? Math.round((stats.roleMatches / stats.total) * 100) : 0}%
                </div>
              )}
            </div>
            <div className="text-sm font-semibold text-gray-600">Match Success</div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                Role compatibility rate
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-black text-gray-900 mb-4 flex items-center gap-2">
            <span>🚀</span>
            <span>Quick Actions</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* View Matches */}
            <Link
              href="/matches"
              className="group bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-8 text-white hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative z-10">
                <div className="text-5xl mb-4 transform group-hover:scale-110 group-hover:rotate-12 transition-all">
                  🎯
                </div>
                <h3 className="text-2xl font-black mb-2">
                  View All Matches
                </h3>
                <p className="text-blue-100 mb-4">
                  Explore candidate-client matches with smart filters
                </p>
                <div className="inline-flex items-center gap-2 text-sm font-bold bg-white/20 px-4 py-2 rounded-full">
                  <span>Open Matches</span>
                  <span className="text-lg">→</span>
                </div>
              </div>
            </Link>

            {/* Manage Candidates */}
            <Link
              href="/candidates"
              className="group bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg p-8 text-white hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative z-10">
                <div className="text-5xl mb-4 transform group-hover:scale-110 group-hover:rotate-12 transition-all">
                  👥
                </div>
                <h3 className="text-2xl font-black mb-2">
                  Manage Candidates
                </h3>
                <p className="text-green-100 mb-4">
                  View and manage job seekers in your pipeline
                </p>
                <div className="inline-flex items-center gap-2 text-sm font-bold bg-white/20 px-4 py-2 rounded-full">
                  <span>Open Candidates</span>
                  <span className="text-lg">→</span>
                </div>
              </div>
            </Link>

            {/* Manage Clients */}
            <Link
              href="/clients"
              className="group bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-lg p-8 text-white hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative z-10">
                <div className="text-5xl mb-4 transform group-hover:scale-110 group-hover:rotate-12 transition-all">
                  🏢
                </div>
                <h3 className="text-2xl font-black mb-2">
                  Manage Clients
                </h3>
                <p className="text-purple-100 mb-4">
                  Oversee businesses with open positions
                </p>
                <div className="inline-flex items-center gap-2 text-sm font-bold bg-white/20 px-4 py-2 rounded-full">
                  <span>Open Clients</span>
                  <span className="text-lg">→</span>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* System Rules & Features Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

          {/* Three Strict Rules */}
          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl">⚡</div>
              <h3 className="text-xl font-black text-yellow-900">
                Three Strict Rules
              </h3>
            </div>
            <div className="space-y-3">
              <div className="bg-white rounded-xl p-4 border-l-4 border-yellow-500">
                <div className="font-bold text-yellow-900 mb-1 flex items-center gap-2">
                  <span className="text-lg">1️⃣</span>
                  <span>Sort by Commute Time</span>
                </div>
                <p className="text-sm text-yellow-800">
                  Always sorted ascending (shortest first)
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 border-l-4 border-orange-500">
                <div className="font-bold text-orange-900 mb-1 flex items-center gap-2">
                  <span className="text-lg">2️⃣</span>
                  <span>Max 80 Minutes</span>
                </div>
                <p className="text-sm text-orange-800">
                  Exclude all matches over 1h 20m
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 border-l-4 border-red-500">
                <div className="font-bold text-red-900 mb-1 flex items-center gap-2">
                  <span className="text-lg">3️⃣</span>
                  <span>Google Maps Only</span>
                </div>
                <p className="text-sm text-red-800">
                  Only Distance Matrix API, no alternatives
                </p>
              </div>
            </div>
          </div>

          {/* AI Features */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-300 rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl">🤖</div>
              <h3 className="text-xl font-black text-purple-900">
                AI-Powered Features
              </h3>
            </div>
            <div className="space-y-3">
              <div className="bg-white rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="text-2xl">✨</div>
                <div>
                  <div className="font-bold text-purple-900">Smart Paste</div>
                  <p className="text-sm text-purple-700">Instant data extraction</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="text-2xl">💬</div>
                <div>
                  <div className="font-bold text-indigo-900">AI Chat</div>
                  <p className="text-sm text-indigo-700">Natural language queries</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="text-2xl">🎤</div>
                <div>
                  <div className="font-bold text-blue-900">Voice Input</div>
                  <p className="text-sm text-blue-700">Hands-free data entry</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
            <span>📈</span>
            <span>System Overview</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl">
              <div className="text-2xl font-black text-blue-600">{loading ? '...' : stats.total}</div>
              <div className="text-xs text-gray-600 font-semibold mt-1">Active Matches</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl">
              <div className="text-2xl font-black text-green-600">{loading ? '...' : stats.roleMatches}</div>
              <div className="text-xs text-gray-600 font-semibold mt-1">Role Matches</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl">
              <div className="text-2xl font-black text-purple-600">{loading ? '...' : stats.candidatesCount}</div>
              <div className="text-xs text-gray-600 font-semibold mt-1">Total Candidates</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-xl">
              <div className="text-2xl font-black text-orange-600">{loading ? '...' : stats.clientsCount}</div>
              <div className="text-xs text-gray-600 font-semibold mt-1">Total Clients</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl">
              <div className="text-2xl font-black text-indigo-600">
                {loading ? '...' : stats.under20Minutes}
              </div>
              <div className="text-xs text-gray-600 font-semibold mt-1">Quick Matches</div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-full shadow-lg">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span className="font-bold text-sm">AI System Active • Multi-User Enabled • Real-time Matching</span>
          </div>
        </div>

      </div>
    </div>
  );
}

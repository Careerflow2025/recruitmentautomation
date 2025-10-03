'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

export default function LandingPage() {
  const router = useRouter();
  const [showLogin, setShowLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      console.log('🔐 Attempting login with email:', email.trim());

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      console.log('📦 Login response:', { data, error });

      if (error) {
        console.error('❌ Supabase error:', error);
        throw error;
      }

      if (data.session) {
        console.log('✅ Login successful! Session:', data.session);
        setSuccess('Login successful! Redirecting...');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      } else {
        throw new Error('No session returned from login');
      }
    } catch (err: any) {
      console.error('❌ Login error:', err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
      });

      if (error) throw error;

      if (data.session) {
        console.log('✅ Signup successful! Auto-logged in.');
        window.location.href = '/dashboard';
      } else {
        setSuccess('Account created! Please check your email to verify your account.');
        setTimeout(() => {
          setShowLogin(true);
        }, 3000);
      }
    } catch (err: any) {
      console.error('❌ Signup error:', err);
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-700"></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col lg:flex-row min-h-screen">
        {/* Left Side - Branding */}
        <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-16 text-white">
          <div className="max-w-2xl">
            <div className="mb-8 flex items-center gap-4">
              <div className="text-7xl animate-pulse">⚡</div>
              <h1 className="text-5xl lg:text-6xl font-black leading-tight">
                AI Laser<br />Recruiter
              </h1>
            </div>

            <p className="text-2xl lg:text-3xl font-bold text-blue-200 mb-6">
              Fast. Precise. Powerful.
            </p>

            <p className="text-lg lg:text-xl text-blue-100 mb-8 leading-relaxed">
              Revolutionary AI-powered dental recruitment matching system.
              Match candidates to surgeries in seconds based on role compatibility
              and commute time.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
                <div className="text-3xl mb-2">🎯</div>
                <h3 className="font-bold text-lg">Laser Precision</h3>
                <p className="text-sm text-blue-200">Google Maps-powered matching</p>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
                <div className="text-3xl mb-2">⚡</div>
                <h3 className="font-bold text-lg">Lightning Fast</h3>
                <p className="text-sm text-blue-200">Instant candidate matching</p>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
                <div className="text-3xl mb-2">🤖</div>
                <h3 className="font-bold text-lg">AI-Powered</h3>
                <p className="text-sm text-blue-200">Smart data extraction</p>
              </div>
            </div>

            <div className="bg-yellow-500/20 border-2 border-yellow-400/50 rounded-lg p-4">
              <p className="text-sm font-bold text-yellow-200">
                🏆 Trusted by 100M+ recruitment operations worldwide
              </p>
            </div>
          </div>
        </div>

        {/* Right Side - Auth Forms */}
        <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-3xl shadow-2xl p-8 lg:p-10">
              {/* Tabs */}
              <div className="flex gap-2 mb-8 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => {
                    setShowLogin(true);
                    setError('');
                    setSuccess('');
                  }}
                  className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                    showLogin
                      ? 'bg-white text-blue-600 shadow-md'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    setShowLogin(false);
                    setError('');
                    setSuccess('');
                  }}
                  className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                    !showLogin
                      ? 'bg-white text-blue-600 shadow-md'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {/* Error/Success Messages */}
              {error && (
                <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-800">❌ {error}</p>
                </div>
              )}

              {success && (
                <div className="mb-4 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-800">✅ {success}</p>
                </div>
              )}

              {/* Login Form */}
              {showLogin ? (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="your@email.com"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="••••••••"
                      required
                      disabled={loading}
                    />
                  </div>

                  <button
                    type="submit"
                    onClick={(e) => {
                      console.log('🖱️ Login button clicked!');
                      console.log('Email:', email);
                      console.log('Password length:', password.length);
                    }}
                    disabled={loading}
                    className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all shadow-lg ${
                      loading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl'
                    }`}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Signing in...</span>
                      </div>
                    ) : (
                      '🔐 Sign In'
                    )}
                  </button>
                </form>
              ) : (
                /* Signup Form */
                <form onSubmit={handleSignup} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="your@email.com"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="Min. 6 characters"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="••••••••"
                      required
                      disabled={loading}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all shadow-lg ${
                      loading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 hover:shadow-xl'
                    }`}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Creating account...</span>
                      </div>
                    ) : (
                      '✨ Create Account'
                    )}
                  </button>

                  <p className="text-xs text-gray-500 text-center">
                    By signing up, you agree to our Terms of Service and Privacy Policy
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

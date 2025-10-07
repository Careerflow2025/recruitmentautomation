'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/browser';
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

      // Call API endpoint (same as old working form)
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password: password,
        }),
      });

      const data = await response.json();

      console.log('📦 Login response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.session) {
        console.log('✅ Login successful!');
        setSuccess('Login successful! Redirecting...');
        
        // Redirect to dashboard
        window.location.href = '/dashboard';
      } else {
        throw new Error('No session returned from login');
      }
    } catch (err: any) {
      console.error('❌ Login error:', err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 relative overflow-hidden">
      {/* Enhanced Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-400 to-cyan-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
        <div className="absolute top-3/4 right-1/4 w-80 h-80 bg-gradient-to-r from-purple-400 to-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float-delayed"></div>
        <div className="absolute bottom-1/4 left-1/2 w-72 h-72 bg-gradient-to-r from-indigo-400 to-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float-slow"></div>
        
        {/* AI Grid Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="w-full h-full" style={{
            backgroundImage: `
              linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
            animation: 'gridMove 20s linear infinite'
          }}></div>
        </div>

        {/* Floating Code Elements */}
        <div className="absolute top-20 left-10 text-blue-300/30 font-mono text-sm animate-pulse">
          {"{ ai: 'matching' }"}
        </div>
        <div className="absolute top-40 right-16 text-cyan-300/30 font-mono text-sm animate-pulse delay-1000">
          {"algorithm.match()"}
        </div>
        <div className="absolute bottom-32 left-20 text-purple-300/30 font-mono text-sm animate-pulse delay-500">
          {"<AI />"}
        </div>
      </div>

      {/* Custom Animations Styles */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-30px) rotate(120deg); }
          66% { transform: translateY(15px) rotate(240deg); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(20px) rotate(-90deg); }
          66% { transform: translateY(-25px) rotate(-180deg); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-20px) scale(1.05); }
        }
        @keyframes gridMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.5); }
          50% { box-shadow: 0 0 40px rgba(59, 130, 246, 0.8), 0 0 60px rgba(59, 130, 246, 0.4); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-float-delayed { animation: float-delayed 8s ease-in-out infinite; }
        .animate-float-slow { animation: float-slow 10s ease-in-out infinite; }
        .animate-glow { animation: glow 2s ease-in-out infinite; }
      `}</style>

      {/* Content */}
      <div className="relative z-10 flex flex-col lg:flex-row min-h-screen">
        {/* Left Side - Enhanced Branding */}
        <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-16 text-white">
          <div className="max-w-2xl">
            {/* AI Logo with enhanced animation */}
            <div className="mb-8 flex items-center gap-6">
              <div className="relative">
                <div className="text-8xl animate-glow">🤖</div>
                <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur-lg opacity-20 animate-ping"></div>
              </div>
              <h1 className="text-5xl lg:text-7xl font-black leading-tight bg-gradient-to-r from-blue-300 via-cyan-300 to-purple-300 bg-clip-text text-transparent">
                AI Matcher<br />Recruiter
              </h1>
            </div>

            <div className="mb-6">
              <p className="text-3xl lg:text-4xl font-bold text-cyan-300 mb-2 animate-pulse">
                Smart. Fast. Precise.
              </p>
              <div className="h-1 w-32 bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full animate-pulse"></div>
            </div>

            <p className="text-xl lg:text-2xl text-blue-100 mb-10 leading-relaxed">
              Revolutionary AI-powered recruitment matching system.
              Connect talent to opportunities in seconds using advanced 
              algorithms and real-time analysis.
            </p>

            {/* Enhanced Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="group bg-gradient-to-br from-blue-500/20 to-cyan-500/10 backdrop-blur-xl rounded-2xl p-6 border border-blue-300/30 hover:border-blue-300/60 transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">🎯</div>
                <h3 className="font-bold text-xl text-cyan-300 mb-2">Precision AI</h3>
                <p className="text-sm text-blue-200">Machine learning algorithms analyze compatibility patterns</p>
              </div>
              
              <div className="group bg-gradient-to-br from-purple-500/20 to-pink-500/10 backdrop-blur-xl rounded-2xl p-6 border border-purple-300/30 hover:border-purple-300/60 transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">⚡</div>
                <h3 className="font-bold text-xl text-purple-300 mb-2">Lightning Speed</h3>
                <p className="text-sm text-purple-200">Real-time matching with instant results and analytics</p>
              </div>
              
              <div className="group bg-gradient-to-br from-indigo-500/20 to-blue-500/10 backdrop-blur-xl rounded-2xl p-6 border border-indigo-300/30 hover:border-indigo-300/60 transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">🧠</div>
                <h3 className="font-bold text-xl text-indigo-300 mb-2">Neural Networks</h3>
                <p className="text-sm text-indigo-200">Deep learning for complex pattern recognition</p>
              </div>
            </div>

            {/* AI Stats Display */}
            <div className="bg-gradient-to-r from-slate-800/50 to-blue-900/50 border-2 border-cyan-400/50 rounded-2xl p-6 backdrop-blur-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <p className="text-sm font-bold text-cyan-300">AI SYSTEM STATUS: ACTIVE</p>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-white animate-pulse">99.7%</div>
                  <div className="text-xs text-cyan-200">Accuracy Rate</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white animate-pulse">&lt;2s</div>
                  <div className="text-xs text-cyan-200">Match Time</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white animate-pulse">24/7</div>
                  <div className="text-xs text-cyan-200">AI Processing</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Enhanced Auth Forms */}
        <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
          <div className="w-full max-w-md">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-10 border border-white/20">
              {/* Enhanced Header */}
              <div className="text-center mb-8">
                <div className="text-4xl mb-3">🚀</div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Access AI Platform</h2>
                <p className="text-sm text-slate-600">Join the future of recruitment</p>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-8 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => {
                    setShowLogin(true);
                    setError('');
                    setSuccess('');
                  }}
                  className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                    showLogin
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                      : 'text-slate-600 hover:text-slate-900'
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
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {/* Error/Success Messages */}
              {error && (
                <div className="mb-4 p-4 bg-red-50/90 border-2 border-red-200 rounded-xl backdrop-blur-sm">
                  <p className="text-sm font-medium text-red-800 flex items-center gap-2">
                    <span>❌</span> {error}
                  </p>
                </div>
              )}

              {success && (
                <div className="mb-4 p-4 bg-green-50/90 border-2 border-green-200 rounded-xl backdrop-blur-sm">
                  <p className="text-sm font-medium text-green-800 flex items-center gap-2">
                    <span>✅</span> {success}
                  </p>
                </div>
              )}

              {/* Login Form */}
              {showLogin ? (
                <form onSubmit={handleLogin} className="space-y-6">
                  <div className="group">
                    <label className="block text-sm font-bold text-slate-700 mb-3 group-focus-within:text-blue-600 transition-colors">
                      Email Address
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-4 border-2 border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all bg-white/50 backdrop-blur-sm"
                        placeholder="your@email.com"
                        required
                        disabled={loading}
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                        <span className="text-slate-400">📧</span>
                      </div>
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-sm font-bold text-slate-700 mb-3 group-focus-within:text-blue-600 transition-colors">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-4 border-2 border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all bg-white/50 backdrop-blur-sm"
                        placeholder="••••••••"
                        required
                        disabled={loading}
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                        <span className="text-slate-400">🔒</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    onClick={(e) => {
                      console.log('🖱️ Login button clicked!');
                      console.log('Email:', email);
                      console.log('Password length:', password.length);
                    }}
                    disabled={loading}
                    className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all shadow-lg hover:scale-[1.02] ${
                      loading
                        ? 'bg-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 hover:shadow-2xl'
                    }`}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Accessing AI System...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <span>🚀</span>
                        <span>Launch AI Platform</span>
                      </div>
                    )}
                  </button>
                </form>
              ) : (
                /* Enhanced Signup Form */
                <form onSubmit={handleSignup} className="space-y-6">
                  <div className="group">
                    <label className="block text-sm font-bold text-slate-700 mb-3 group-focus-within:text-green-600 transition-colors">
                      Email Address
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-4 border-2 border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all bg-white/50 backdrop-blur-sm"
                        placeholder="your@email.com"
                        required
                        disabled={loading}
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                        <span className="text-slate-400">📧</span>
                      </div>
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-sm font-bold text-slate-700 mb-3 group-focus-within:text-green-600 transition-colors">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-4 border-2 border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all bg-white/50 backdrop-blur-sm"
                        placeholder="Min. 6 characters"
                        required
                        disabled={loading}
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                        <span className="text-slate-400">🔒</span>
                      </div>
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-sm font-bold text-slate-700 mb-3 group-focus-within:text-green-600 transition-colors">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-4 border-2 border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all bg-white/50 backdrop-blur-sm"
                        placeholder="••••••••"
                        required
                        disabled={loading}
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                        <span className="text-slate-400">🔒</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all shadow-lg hover:scale-[1.02] ${
                      loading
                        ? 'bg-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 hover:from-green-700 hover:via-emerald-700 hover:to-teal-700 hover:shadow-2xl'
                    }`}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Creating AI Profile...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <span>✨</span>
                        <span>Join AI Revolution</span>
                      </div>
                    )}
                  </button>

                  <p className="text-xs text-slate-500 text-center leading-relaxed">
                    By signing up, you agree to our Terms of Service and Privacy Policy.<br/>
                    <span className="text-blue-600 font-medium">Powered by Advanced AI Technology</span>
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

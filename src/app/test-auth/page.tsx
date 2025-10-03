'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function TestAuth() {
  const [email, setEmail] = useState('admin@test.com');
  const [password, setPassword] = useState('Test123456!');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<any>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleLogin = async () => {
    setMessage('Attempting login...');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
      setUser(null);
    } else {
      setMessage('Login successful!');
      setUser(data.user);

      // Check session
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('Session:', sessionData);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage(`Logout error: ${error.message}`);
    } else {
      setMessage('Logged out successfully');
      setUser(null);
    }
  };

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setMessage('User is authenticated');
      setUser(user);
    } else {
      setMessage('No authenticated user');
      setUser(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-6">Authentication Test Page</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleLogin}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Test Login
            </button>

            <button
              onClick={handleLogout}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
            >
              Logout
            </button>

            <button
              onClick={checkUser}
              className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
            >
              Check User
            </button>
          </div>

          {message && (
            <div className={`p-3 rounded-md ${
              message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
              {message}
            </div>
          )}

          {user && (
            <div className="bg-blue-50 p-3 rounded-md">
              <p className="font-semibold">User Info:</p>
              <pre className="text-xs mt-2 overflow-auto">
                {JSON.stringify(user, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
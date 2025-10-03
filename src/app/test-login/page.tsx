'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function TestLoginPage() {
  const [result, setResult] = useState('');

  const testLogin = async () => {
    setResult('Testing login...');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'test@test.com',
        password: 'test123456',
      });

      if (error) {
        setResult(`Error: ${error.message}`);
      } else if (data.session) {
        setResult(`Success! User: ${data.user?.email}, Session exists: ${!!data.session}`);
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        setResult('No session returned');
      }
    } catch (err: any) {
      setResult(`Exception: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4">Test Login</h1>

        <button
          onClick={testLogin}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700"
        >
          Test Login with test@test.com
        </button>

        {result && (
          <div className="mt-4 p-4 bg-gray-100 rounded">
            <pre className="text-sm whitespace-pre-wrap">{result}</pre>
          </div>
        )}

        <div className="mt-4 text-sm text-gray-600">
          <p>This will try to login with:</p>
          <p>Email: test@test.com</p>
          <p>Password: test123456</p>
          <p className="mt-2 text-red-600">Create this user first in signup page!</p>
        </div>
      </div>
    </div>
  );
}

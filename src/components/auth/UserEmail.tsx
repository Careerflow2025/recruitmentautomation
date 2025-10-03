'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export function UserEmail() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setEmail(session.user.email || null);
      }
    };

    getUser();
  }, []);

  if (!email) return null;

  return (
    <span className="text-sm text-gray-600 font-medium">
      👤 {email}
    </span>
  );
}

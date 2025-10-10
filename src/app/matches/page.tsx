'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/browser';
import MatchesDataGrid from '@/components/grid/MatchesDataGrid';

export default function MatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{success: boolean; message: string; stats?: any} | null>(null);

  const fetchMatches = async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);

      // Get current user from session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/');
        return;
      }

      const user = session.user;

      const { data: matchesData, error: matchesError} = await supabase
        .from('matches')
        .select('*')
        .eq('user_id', user.id)
        .order('commute_minutes', { ascending: true });

      if (matchesError) {
        throw matchesError;
      }

      const { data: candidatesData, error: candidatesError } = await supabase
        .from('candidates')
        .select('*')
        .eq('user_id', user.id);

      if (candidatesError) throw candidatesError;

      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id);

      if (clientsError) throw clientsError;

      const candidatesMap = new Map(candidatesData.map(c => [c.id, c]));
      const clientsMap = new Map(clientsData.map(c => [c.id, c]));

      const transformedMatches = matchesData
        .map(m => {
          const candidate = candidatesMap.get(m.candidate_id);
          const client = clientsMap.get(m.client_id);

          if (!candidate || !client) return null;

          return {
            candidate: {
              ...candidate,
              added_at: new Date(candidate.added_at),
            },
            client: {
              ...client,
              added_at: new Date(client.added_at),
            },
            commute_minutes: m.commute_minutes,
            commute_display: m.commute_display,
            commute_band: m.commute_band,
            role_match: m.role_match,
            role_match_display: m.role_match_display,
          };
        })
        .filter(m => m !== null);

      setMatches(transformedMatches);
    } catch (err: any) {
      console.error('Error fetching matches:', err);
      setError(err.message || 'Failed to load matches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches(true);
  }, []);

  const handleGenerateMatches = async () => {
    setGenerating(true);
    setGenerateResult(null);

    try {
      const response = await fetch('/api/regenerate-matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      if (!responseText) {
        throw new Error('Empty response from server');
      }

      const result = JSON.parse(responseText);

      if (!result.success) {
        setGenerateResult(result);
        return;
      }

      if (result.processing) {
        setGenerateResult({
          success: true,
          message: result.message,
          processing: true,
          stats: result.stats
        });

        pollMatchStatus();
      } else {
        setGenerateResult(result);
        await fetchMatches(false);
      }
    } catch (err: any) {
      console.error('Error generating matches:', err);
      setGenerateResult({
        success: false,
        message: err.message || 'Failed to generate matches'
      });
      setGenerating(false);
    }
  };

  const pollMatchStatus = async () => {
    let attempts = 0;
    const maxAttempts = 120;

    const poll = async () => {
      try {
        attempts++;

        const response = await fetch('/api/match-status');
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }

        const status = await response.json();

        if (!status.success) {
          throw new Error(status.message || 'Status check failed');
        }

        setGenerateResult(prev => prev ? {
          ...prev,
          message: status.message,
          processing: status.processing,
          stats: {
            ...prev.stats,
            current_matches: status.stats.current_matches,
            completion_percentage: status.stats.completion_percentage
          }
        } : status);

        if (!status.processing || attempts >= maxAttempts) {
          setGenerating(false);
          await fetchMatches(false);

          if (attempts >= maxAttempts && status.processing) {
            setGenerateResult(prev => prev ? {
              ...prev,
              message: 'Match generation is taking longer than expected. Please refresh the page.',
              processing: false
            } : null);
          }
          return;
        }

        setTimeout(poll, 5000);

      } catch (err: any) {
        console.error('Error polling match status:', err);
        setGenerateResult(prev => prev ? {
          ...prev,
          message: `Status check failed: ${err.message}. Please refresh the page.`,
          processing: false
        } : null);
        setGenerating(false);
      }
    };

    setTimeout(poll, 2000);
  };

  if (loading) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-900 font-bold text-lg">Loading matches...</p>
          <p className="text-gray-500 text-sm mt-2">Please wait</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-8 max-w-md shadow-lg">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-red-900 font-bold text-2xl mb-3">Error Loading Data</h2>
          <p className="text-red-800 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
          >
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-gray-50">
      {/* Top Action Bar */}
      <div className="bg-white border-b-2 border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">🔗 Matches Dashboard</h1>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                {matches.length} Total
              </span>
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                {matches.filter(m => m.role_match).length} ✅ Role Match
              </span>
              <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-semibold">
                {matches.filter(m => m.commute_minutes <= 20).length} 🟢🟢🟢 Quick
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateMatches}
              disabled={generating}
              className={`px-6 py-2.5 rounded-lg font-bold text-white shadow-md transition-all ${
                generating
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 hover:shadow-lg'
              }`}
            >
              {generating ? '⏳ Generating...' : '🔄 Generate Matches'}
            </button>
          </div>
        </div>

        {/* Generate Result Message */}
        {generateResult && (
          <div className={`mt-4 p-4 rounded-lg text-sm border-2 ${
            generateResult.success
              ? 'bg-blue-50 border-blue-300 text-blue-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}>
            <div className="flex items-center gap-3">
              {generateResult.processing ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              ) : generateResult.success ? (
                <span className="text-xl">✅</span>
              ) : (
                <span className="text-xl">❌</span>
              )}
              <span className="font-bold">{generateResult.message}</span>
            </div>

            {generateResult.stats && (
              <div className="mt-3 text-xs space-y-2 pl-8">
                <div className="flex gap-6">
                  <span className="font-semibold">📋 Candidates: {generateResult.stats.candidates}</span>
                  <span className="font-semibold">🏥 Clients: {generateResult.stats.clients}</span>
                </div>

                {generateResult.processing && generateResult.stats.total_pairs_to_process && (
                  <div className="font-medium">
                    <span>🔄 Processing {generateResult.stats.total_pairs_to_process} pairs</span>
                    {generateResult.stats.estimated_time_seconds && (
                      <span className="ml-2 text-gray-600">
                        (Est: ~{Math.ceil(generateResult.stats.estimated_time_seconds / 60)} min)
                      </span>
                    )}
                  </div>
                )}

                {generateResult.stats.current_matches !== undefined && (
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">📊 Matches: {generateResult.stats.current_matches}</span>
                    {generateResult.stats.completion_percentage !== undefined && (
                      <>
                        <div className="w-32 bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(generateResult.stats.completion_percentage, 100)}%` }}
                          ></div>
                        </div>
                        <span className="font-bold">
                          {generateResult.stats.completion_percentage}%
                        </span>
                      </>
                    )}
                  </div>
                )}

                {!generateResult.processing && generateResult.stats.matches_created !== undefined && (
                  <div className="font-semibold">
                    <span>✅ Created: {generateResult.stats.matches_created}</span>
                    {generateResult.stats.excluded_over_80min > 0 && (
                      <span className="ml-4 text-orange-700">⊗ Excluded (&gt;80min): {generateResult.stats.excluded_over_80min}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Matches Grid */}
      <div className="flex-1 overflow-hidden">
        <MatchesDataGrid matches={matches} onRefresh={() => fetchMatches(true)} />
      </div>
    </div>
  );
}

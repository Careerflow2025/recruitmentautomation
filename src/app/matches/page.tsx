'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/browser';
import { normalizeRole } from '@/lib/utils/roleNormalizer';
import { MatchesTable } from '@/components/matches/MatchesTable';
import { MatchFilters } from '@/components/matches/MatchFilters';
import Link from 'next/link';
import { Match, Candidate, Client } from '@/types';

export default function MatchesPage() {
  const router = useRouter();
  const [roleMatchFilter, setRoleMatchFilter] = useState<'all' | 'match' | 'location'>('all');
  const [timeFilter, setTimeFilter] = useState<number>(80);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{success: boolean; message: string; stats?: any} | null>(null);
  const [showStats, setShowStats] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState({
    salary_budget: true,
    availability_requirement: true,
  });

  const handleColumnVisibilityChange = (column: string, visible: boolean) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: visible
    }));
  };

  const fetchMatches = async (showLoading = false) => {
      try {
        if (showLoading) {
          setLoading(true);
        }
        setError(null);

        // Get current user from session
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Redirect to login if not authenticated
          router.push('/login');
          return;
        }

        const user = session.user;
        console.log('🔍 Fetching matches for user:', user.id);

        const { data: matchesData, error: matchesError} = await supabase
          .from('matches')
          .select('*')
          .eq('user_id', user.id)
          .order('commute_minutes', { ascending: true });

        if (matchesError) {
          console.error('❌ Error fetching matches:', matchesError);
          throw matchesError;
        }

        console.log('✅ Matches found:', matchesData?.length || 0);
        console.log('📊 Matches data:', matchesData);

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

        console.log('👥 Candidates map size:', candidatesMap.size);
        console.log('🏥 Clients map size:', clientsMap.size);

        const transformedMatches: Match[] = matchesData
          .map(m => {
            const candidate = candidatesMap.get(m.candidate_id);
            const client = clientsMap.get(m.client_id);

            if (!candidate) {
              console.warn(`⚠️ Candidate not found for match: ${m.candidate_id}`);
              return null;
            }

            if (!client) {
              console.warn(`⚠️ Client not found for match: ${m.client_id}`);
              return null;
            }

            return {
              candidate: {
                ...candidate,
                added_at: new Date(candidate.added_at),
              } as Candidate,
              client: {
                ...client,
                added_at: new Date(client.added_at),
              } as Client,
              commute_minutes: m.commute_minutes,
              commute_display: m.commute_display,
              commute_band: m.commute_band as any,
              role_match: m.role_match,
              role_match_display: m.role_match_display,
            };
          })
          .filter(m => m !== null) as Match[];

        console.log('✅ Transformed matches:', transformedMatches.length);
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
      // Start the background match generation
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

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse JSON response:', responseText);
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }

      if (!result.success) {
        setGenerateResult(result);
        return;
      }

      // If processing started, begin polling for status
      if (result.processing) {
        console.log('✅ Match generation started, beginning status polling...');
        setGenerateResult({
          success: true,
          message: result.message,
          processing: true,
          stats: result.stats
        });

        // Start polling for completion
        pollMatchStatus();
      } else {
        // If not processing, it completed immediately
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
    const maxAttempts = 120; // Poll for up to 10 minutes (120 * 5 seconds)
    
    const poll = async () => {
      try {
        attempts++;
        console.log(`🔍 Polling match status (attempt ${attempts}/${maxAttempts})...`);

        const response = await fetch('/api/match-status');
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }

        const status = await response.json();
        
        if (!status.success) {
          throw new Error(status.message || 'Status check failed');
        }

        // Update the result with current status
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

        // If processing is complete or we've reached max attempts
        if (!status.processing || attempts >= maxAttempts) {
          console.log(status.processing ? '⏰ Polling timeout reached' : '✅ Match generation completed');
          setGenerating(false);
          
          // Refresh matches table
          await fetchMatches(false);
          
          // Final status message
          if (attempts >= maxAttempts && status.processing) {
            setGenerateResult(prev => prev ? {
              ...prev,
              message: 'Match generation is taking longer than expected. Please refresh the page to see current results.',
              processing: false
            } : null);
          }
          return;
        }

        // Continue polling after a delay
        setTimeout(poll, 5000); // Poll every 5 seconds

      } catch (err: any) {
        console.error('Error polling match status:', err);
        setGenerateResult(prev => prev ? {
          ...prev,
          message: `Status check failed: ${err.message}. Please refresh the page to see current results.`,
          processing: false
        } : null);
        setGenerating(false);
      }
    };

    // Start polling after a brief delay
    setTimeout(poll, 2000);
  };

  // Get unique roles from all matches (candidates and clients)
  const availableRoles = useMemo(() => {
    const rolesSet = new Set<string>();

    matches.forEach(match => {
      const candidateRole = normalizeRole(match.candidate.role);
      const clientRole = normalizeRole(match.client.role);

      if (candidateRole) rolesSet.add(candidateRole);
      if (clientRole) rolesSet.add(clientRole);
    });

    return Array.from(rolesSet).sort();
  }, [matches]);

  const filteredMatches = useMemo(() => {
    let filtered = [...matches];

    if (roleMatchFilter === 'match') {
      filtered = filtered.filter(m => m.role_match);
    } else if (roleMatchFilter === 'location') {
      filtered = filtered.filter(m => !m.role_match);
    }

    filtered = filtered.filter(m => m.commute_minutes <= timeFilter);

    if (roleFilter) {
      const normalizedFilter = normalizeRole(roleFilter);
      filtered = filtered.filter(m =>
        normalizeRole(m.candidate.role) === normalizedFilter ||
        normalizeRole(m.client.role) === normalizedFilter
      );
    }

    return filtered;
  }, [matches, roleMatchFilter, timeFilter, roleFilter]);

  if (loading) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-900 font-medium">Loading matches...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-900 font-bold text-lg mb-2">Error Loading Data</h2>
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Page Title */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">

        {/* Collapsible Stats */}
        {showStats && (
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-white border border-gray-300 rounded p-3">
            <div className="text-center">
              <p className="text-xs text-gray-600">Total Matches</p>
              <p className="text-xl font-bold text-blue-900">{matches.length}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">✅ Role Match</p>
              <p className="text-xl font-bold text-green-900">
                {matches.filter(m => m.role_match).length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">❌ Location-Only</p>
              <p className="text-xl font-bold text-orange-900">
                {matches.filter(m => !m.role_match).length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">🟢🟢🟢 Under 20min</p>
              <p className="text-xl font-bold text-purple-900">
                {matches.filter(m => m.commute_minutes <= 20).length}
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons - Excel Style */}
        <div className="mb-3 flex flex-wrap items-center gap-2 bg-white border border-gray-300 rounded p-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className="px-3 py-1.5 bg-gray-100 border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-gray-200"
            title={showStats ? "Hide Statistics" : "Show Statistics"}
          >
            👁️ Stats
          </button>

          <div className="border-l border-gray-300 h-6 mx-1"></div>

          <button
            onClick={handleGenerateMatches}
            disabled={generating}
            className={`px-3 py-1.5 border border-gray-400 rounded text-sm font-semibold text-gray-900 ${
              generating
                ? 'bg-gray-100 cursor-not-allowed'
                : 'bg-green-100 hover:bg-green-200'
            }`}
          >
            {generating ? '⏳ Generating...' : '🔄 Generate Matches'}
          </button>

          <div className="border-l border-gray-300 h-6 mx-1"></div>

          <Link
            href="/candidates"
            className="px-3 py-1.5 bg-white border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Candidates
          </Link>

          <Link
            href="/clients"
            className="px-3 py-1.5 bg-white border border-gray-400 rounded text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Clients
          </Link>
        </div>

        {/* Generate Result Message */}
        {generateResult && (
          <div className={`mb-3 p-3 rounded text-sm ${
            generateResult.success
              ? 'bg-blue-50 border border-blue-300 text-blue-900'
              : 'bg-red-50 border border-red-300 text-red-900'
          }`}>
            <div className="flex items-center gap-2">
              {generateResult.processing ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              ) : generateResult.success ? (
                <span>✅</span>
              ) : (
                <span>❌</span>
              )}
              <span className="font-medium">{generateResult.message}</span>
            </div>
            
            {generateResult.stats && (
              <div className="mt-2 text-xs space-y-1">
                <div className="flex gap-4">
                  <span>📋 Candidates: {generateResult.stats.candidates}</span>
                  <span>🏥 Clients: {generateResult.stats.clients}</span>
                </div>
                
                {generateResult.processing && generateResult.stats.total_pairs_to_process && (
                  <div>
                    <span>🔄 Processing {generateResult.stats.total_pairs_to_process} candidate-client pairs</span>
                    {generateResult.stats.estimated_time_seconds && (
                      <span className="ml-2 text-gray-600">
                        (Est. time: ~{Math.ceil(generateResult.stats.estimated_time_seconds / 60)} minutes)
                      </span>
                    )}
                  </div>
                )}
                
                {generateResult.stats.current_matches !== undefined && (
                  <div className="flex items-center gap-2">
                    <span>📊 Matches found: {generateResult.stats.current_matches}</span>
                    {generateResult.stats.completion_percentage !== undefined && (
                      <>
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${Math.min(generateResult.stats.completion_percentage, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-600">
                          {generateResult.stats.completion_percentage}%
                        </span>
                      </>
                    )}
                  </div>
                )}
                
                {!generateResult.processing && generateResult.stats.matches_created !== undefined && (
                  <div>
                    <span>✅ Total matches created: {generateResult.stats.matches_created}</span>
                    {generateResult.stats.excluded_over_80min > 0 && (
                      <span className="ml-3">⊗ Excluded (&gt;80min): {generateResult.stats.excluded_over_80min}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <MatchFilters
          roleMatchFilter={roleMatchFilter}
          timeFilter={timeFilter}
          roleFilter={roleFilter}
          availableRoles={availableRoles}
          onRoleMatchFilterChange={setRoleMatchFilter}
          onTimeFilterChange={setTimeFilter}
          onRoleFilterChange={setRoleFilter}
          visibleColumns={visibleColumns}
          onColumnVisibilityChange={handleColumnVisibilityChange}
        />

        {/* Table */}
        <MatchesTable matches={filteredMatches} visibleColumns={visibleColumns} />

        {/* Footer */}
        <div className="mt-2 text-sm text-gray-600">
          Showing {filteredMatches.length} of {matches.length} matches
        </div>
      </div>
    </div>
  );
}

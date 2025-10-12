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
  const [searchText, setSearchText] = useState<string>('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{success: boolean; message: string; stats?: any} | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
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
      // Start the WORKING background match generation
      const response = await fetch('/api/regenerate-working', {
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

    // Role match filter
    if (roleMatchFilter === 'match') {
      filtered = filtered.filter(m => m.role_match);
    } else if (roleMatchFilter === 'location') {
      filtered = filtered.filter(m => !m.role_match);
    }

    // Time filter
    filtered = filtered.filter(m => m.commute_minutes <= timeFilter);

    // Role type filter
    if (roleFilter) {
      const normalizedFilter = normalizeRole(roleFilter);
      filtered = filtered.filter(m =>
        normalizeRole(m.candidate.role) === normalizedFilter ||
        normalizeRole(m.client.role) === normalizedFilter
      );
    }

    // Universal text search - searches across ALL fields
    if (searchText) {
      const searchLower = searchText.toLowerCase().trim();

      filtered = filtered.filter(m => {
        const candidate = m.candidate;
        const client = m.client;

        // Search candidate fields
        const candidateMatches =
          candidate.id.toLowerCase().includes(searchLower) ||
          candidate.role.toLowerCase().includes(searchLower) ||
          candidate.postcode.toLowerCase().includes(searchLower) ||
          (candidate.first_name && candidate.first_name.toLowerCase().includes(searchLower)) ||
          (candidate.last_name && candidate.last_name.toLowerCase().includes(searchLower)) ||
          (candidate.email && candidate.email.toLowerCase().includes(searchLower)) ||
          (candidate.phone && candidate.phone.toLowerCase().includes(searchLower)) ||
          (candidate.salary && candidate.salary.toLowerCase().includes(searchLower)) ||
          (candidate.days && candidate.days.toLowerCase().includes(searchLower)) ||
          (candidate.notes && candidate.notes.toLowerCase().includes(searchLower)) ||
          (candidate.experience && candidate.experience.toLowerCase().includes(searchLower));

        // Search client fields
        const clientMatches =
          client.id.toLowerCase().includes(searchLower) ||
          client.surgery.toLowerCase().includes(searchLower) ||
          client.role.toLowerCase().includes(searchLower) ||
          client.postcode.toLowerCase().includes(searchLower) ||
          (client.client_name && client.client_name.toLowerCase().includes(searchLower)) ||
          (client.client_email && client.client_email.toLowerCase().includes(searchLower)) ||
          (client.client_phone && client.client_phone.toLowerCase().includes(searchLower)) ||
          (client.budget && client.budget.toLowerCase().includes(searchLower)) ||
          (client.requirement && client.requirement.toLowerCase().includes(searchLower)) ||
          (client.system && client.system.toLowerCase().includes(searchLower)) ||
          (client.notes && client.notes.toLowerCase().includes(searchLower));

        return candidateMatches || clientMatches;
      });
    }

    return filtered;
  }, [matches, roleMatchFilter, timeFilter, roleFilter, searchText]);

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
    <div className="h-screen flex flex-col">
      {/* Compact Header Bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-6">
            {/* Left: Title + Stats Badges */}
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="text-2xl">🔗</span>
                <span>Matches</span>
              </h1>

              {/* Total Count Badge */}
              <div className="px-3 py-1.5 bg-gray-100 rounded-lg border border-gray-300">
                <span className="text-xs font-semibold text-gray-600">Total:</span>
                <span className="text-sm font-bold text-gray-900 ml-1.5">{filteredMatches.length}</span>
                {filteredMatches.length !== matches.length && (
                  <span className="text-xs text-gray-500 ml-1">/ {matches.length}</span>
                )}
              </div>

              {/* Stats Badges (always visible, compact) */}
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 bg-green-50 rounded-lg border border-green-200 flex items-center gap-2">
                  <span className="text-sm">✅</span>
                  <span className="text-xs font-semibold text-green-700">Role Match:</span>
                  <span className="text-sm font-bold text-green-900">{matches.filter(m => m.role_match).length}</span>
                </div>

                <div className="px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-200 flex items-center gap-2">
                  <span className="text-sm">📍</span>
                  <span className="text-xs font-semibold text-orange-700">Location:</span>
                  <span className="text-sm font-bold text-orange-900">{matches.filter(m => !m.role_match).length}</span>
                </div>

                <div className="px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200 flex items-center gap-2">
                  <span className="text-sm">🟢</span>
                  <span className="text-xs font-semibold text-blue-700">&lt;20min:</span>
                  <span className="text-sm font-bold text-blue-900">{matches.filter(m => m.commute_minutes <= 20).length}</span>
                </div>
              </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateMatches}
                disabled={generating}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{generating ? '⏳' : '🔄'}</span>
                <span>{generating ? 'Generating...' : 'Generate'}</span>
              </button>
              <Link href="/candidates" className="px-4 py-2 bg-white text-blue-700 rounded-lg text-sm font-semibold border border-blue-200 hover:bg-blue-50 transition-all flex items-center gap-1.5">
                <span>👥</span>
                <span>Candidates</span>
              </Link>
              <Link href="/clients" className="px-4 py-2 bg-white text-orange-700 rounded-lg text-sm font-semibold border border-orange-200 hover:bg-orange-50 transition-all flex items-center gap-1.5">
                <span>🏥</span>
                <span>Clients</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 bg-gray-50">

        {/* Enhanced Generate Result Message */}
        {generateResult && (
          <div className={`mb-6 p-5 rounded-xl shadow-lg text-sm border-2 ${
            generateResult.success
              ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300 text-blue-900'
              : 'bg-gradient-to-r from-red-50 to-pink-50 border-red-300 text-red-900'
          }`}>
            <div className="flex items-center gap-3">
              {generateResult.processing ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-3 border-blue-600"></div>
              ) : generateResult.success ? (
                <span className="text-xl">✅</span>
              ) : (
                <span className="text-xl">❌</span>
              )}
              <span className="font-bold text-base">{generateResult.message}</span>
            </div>

            {generateResult.stats && (
              <div className="mt-4 text-sm space-y-2 bg-white bg-opacity-50 rounded-lg p-4 border border-opacity-30" style={{ borderColor: generateResult.success ? '#3b82f6' : '#ef4444' }}>
                <div className="flex gap-6 font-semibold">
                  <span className="flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <span>Candidates: <span className="text-blue-700">{generateResult.stats.candidates}</span></span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-lg">🏥</span>
                    <span>Clients: <span className="text-orange-700">{generateResult.stats.clients}</span></span>
                  </span>
                </div>

                {generateResult.processing && generateResult.stats.total_pairs_to_process && (
                  <div className="font-semibold">
                    <span className="flex items-center gap-2">
                      <span className="text-lg">🔄</span>
                      <span>Processing <span className="text-purple-700">{generateResult.stats.total_pairs_to_process}</span> candidate-client pairs</span>
                    </span>
                    {generateResult.stats.estimated_time_seconds && (
                      <span className="ml-2 text-gray-600 font-normal text-xs">
                        (Est. time: ~{Math.ceil(generateResult.stats.estimated_time_seconds / 60)} minutes)
                      </span>
                    )}
                  </div>
                )}

                {generateResult.stats.current_matches !== undefined && (
                  <div className="flex items-center gap-3">
                    <span className="font-semibold flex items-center gap-2">
                      <span className="text-lg">📊</span>
                      <span>Matches found: <span className="text-green-700">{generateResult.stats.current_matches}</span></span>
                    </span>
                    {generateResult.stats.completion_percentage !== undefined && (
                      <>
                        <div className="w-32 bg-gray-300 rounded-full h-3 shadow-inner">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300 shadow-sm"
                            style={{ width: `${Math.min(generateResult.stats.completion_percentage, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-bold text-blue-700">
                          {generateResult.stats.completion_percentage}%
                        </span>
                      </>
                    )}
                  </div>
                )}

                {!generateResult.processing && generateResult.stats.matches_created !== undefined && (
                  <div className="font-semibold flex items-center gap-4">
                    <span className="flex items-center gap-2">
                      <span className="text-lg">✅</span>
                      <span>Total matches created: <span className="text-green-700">{generateResult.stats.matches_created}</span></span>
                    </span>
                    {generateResult.stats.excluded_over_80min > 0 && (
                      <span className="flex items-center gap-2 text-red-700">
                        <span className="text-lg">⊗</span>
                        <span>Excluded (&gt;80min): {generateResult.stats.excluded_over_80min}</span>
                      </span>
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
          searchText={searchText}
          availableRoles={availableRoles}
          onRoleMatchFilterChange={setRoleMatchFilter}
          onTimeFilterChange={setTimeFilter}
          onRoleFilterChange={setRoleFilter}
          onSearchTextChange={setSearchText}
          visibleColumns={visibleColumns}
          onColumnVisibilityChange={handleColumnVisibilityChange}
          collapsed={filtersCollapsed}
          onToggleCollapse={() => setFiltersCollapsed(!filtersCollapsed)}
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

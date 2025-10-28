'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/browser';
import { normalizeRole } from '@/lib/utils/roleNormalizer';
import { MatchesTable } from '@/components/matches/MatchesTable';
import { MatchFilters } from '@/components/matches/MatchFilters';
import { BannedMatchesModal } from '@/components/matches/BannedMatchesModal';
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
  const [showBinModal, setShowBinModal] = useState(false);
  const [bannedMatches, setBannedMatches] = useState<Match[]>([]);

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

        // Fetch active (non-banned) matches
        const { data: matchesData, error: matchesError} = await supabase
          .from('matches')
          .select('*')
          .eq('user_id', user.id)
          .or('banned.is.null,banned.eq.false')  // Only non-banned matches
          .order('commute_minutes', { ascending: true });

        // Also fetch banned matches for bin view
        const { data: bannedData, error: bannedError } = await supabase
          .from('matches')
          .select('*')
          .eq('user_id', user.id)
          .eq('banned', true)
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

        // Transform banned matches
        const transformedBanned: Match[] = (bannedData || [])
          .map(m => {
            const candidate = candidatesMap.get(m.candidate_id);
            const client = clientsMap.get(m.client_id);

            if (!candidate || !client) return null;

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

        console.log('🗑️ Banned matches:', transformedBanned.length);
        setBannedMatches(transformedBanned);
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

  const handleGenerateMatches = async (forceFullRegeneration: boolean = false) => {
    setGenerating(true);
    setGenerateResult(null);

    try {
      // NEW BATCH PROCESSING: Process matches in batches that complete within Netlify's timeout
      // Each API call processes one batch, frontend calls repeatedly until done

      // Step 1: Initialize the process
      const initUrl = `/api/regenerate-batch?force=${forceFullRegeneration}&init=true`;

      const initResponse = await fetch(initUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!initResponse.ok) {
        throw new Error(`Initialization failed! status: ${initResponse.status}`);
      }

      const initResult = await initResponse.json();

      if (!initResult.success) {
        setGenerateResult(initResult);
        setGenerating(false);
        return;
      }

      // If no pairs to process, we're done
      if (initResult.completed) {
        setGenerateResult({
          success: true,
          message: initResult.message,
          stats: initResult.stats
        });
        await fetchMatches(false);
        setGenerating(false);
        return;
      }

      // Step 2: Process batches sequentially
      let currentBatch = 0;
      const totalBatches = initResult.stats.totalBatches;

      console.log(`📊 Starting batch processing: ${totalBatches} batches to process`);

      setGenerateResult({
        success: true,
        message: `Processing ${initResult.stats.pairsToProcess} pairs in ${totalBatches} batches...`,
        processing: true,
        stats: initResult.stats
      });

      // Process each batch
      while (currentBatch < totalBatches) {
        console.log(`📦 Processing batch ${currentBatch + 1}/${totalBatches}`);

        const batchUrl = `/api/regenerate-batch?force=${forceFullRegeneration}&batch=${currentBatch}`;

        const batchResponse = await fetch(batchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!batchResponse.ok) {
          throw new Error(`Batch ${currentBatch + 1} failed! status: ${batchResponse.status}`);
        }

        const batchResult = await batchResponse.json();

        if (!batchResult.success) {
          throw new Error(`Batch ${currentBatch + 1} failed: ${batchResult.error}`);
        }

        // Update progress display
        setGenerateResult(prev => ({
          ...prev!,
          message: `Processed batch ${currentBatch + 1}/${totalBatches} (${batchResult.progress.percentage}% complete)`,
          stats: {
            ...prev!.stats,
            currentBatch: currentBatch + 1,
            totalBatches,
            percentage: batchResult.progress.percentage,
            ...batchResult.progress.batchResults
          }
        }));

        // Check if we're done
        if (batchResult.completed) {
          console.log('✅ All batches processed successfully!');
          break;
        }

        // Move to next batch
        currentBatch = batchResult.nextBatch ?? currentBatch + 1;

        // Small delay between batches to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Step 3: Fetch final results and update display
      await fetchMatches(false);

      // Get final stats from database
      const statusResponse = await fetch('/api/match-status');
      const finalStatus = await statusResponse.json();

      setGenerateResult({
        success: true,
        message: `✅ ${forceFullRegeneration ? 'Full regeneration' : 'Incremental generation'} complete!`,
        processing: false,
        stats: finalStatus.stats
      });

    } catch (err: any) {
      console.error('Error generating matches:', err);
      setGenerateResult({
        success: false,
        message: err.message || 'Failed to generate matches'
      });
    } finally {
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
      {/* Premium Header Bar */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 border-b-2 border-slate-700 shadow-xl">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-6">
            {/* Left: Title + Stats Badges */}
            <div className="flex items-center gap-5">
              <h1 className="text-xl font-bold text-white flex items-center gap-2.5 tracking-tight">
                <span className="text-2xl">🔗</span>
                <span>Matches</span>
              </h1>

              {/* Divider */}
              <div className="h-8 w-px bg-slate-600"></div>

              {/* Total Count Badge */}
              <div className="px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 shadow-inner">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Total:</span>
                <span className="text-base font-bold text-white ml-2">{filteredMatches.length}</span>
                {filteredMatches.length !== matches.length && (
                  <span className="text-xs text-slate-400 ml-1">/ {matches.length}</span>
                )}
              </div>

              {/* Stats Badges (always visible, compact) */}
              <div className="flex items-center gap-2.5">
                <div className="px-3 py-2 bg-gradient-to-br from-emerald-600 to-green-700 rounded-lg shadow-lg border border-emerald-500 flex items-center gap-2">
                  <span className="text-base">✅</span>
                  <span className="text-xs font-semibold text-emerald-100">Match:</span>
                  <span className="text-base font-bold text-white">{matches.filter(m => m.role_match).length}</span>
                </div>

                <div className="px-3 py-2 bg-gradient-to-br from-orange-600 to-amber-700 rounded-lg shadow-lg border border-orange-500 flex items-center gap-2">
                  <span className="text-base">📍</span>
                  <span className="text-xs font-semibold text-orange-100">Location:</span>
                  <span className="text-base font-bold text-white">{matches.filter(m => !m.role_match).length}</span>
                </div>

                <div className="px-3 py-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg shadow-lg border border-blue-500 flex items-center gap-2">
                  <span className="text-base">🟢</span>
                  <span className="text-xs font-semibold text-blue-100">&lt;20min:</span>
                  <span className="text-base font-bold text-white">{matches.filter(m => m.commute_minutes <= 20).length}</span>
                </div>
              </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-3">
              {/* 🆕 INCREMENTAL GENERATE BUTTON (default) */}
              <button
                onClick={() => handleGenerateMatches(false)}
                disabled={generating}
                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-bold shadow-lg hover:shadow-xl hover:from-green-700 hover:to-emerald-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-green-500"
                title="Generate matches only for new candidates/clients (skips existing matches)"
              >
                <span>{generating ? '⏳' : '➕'}</span>
                <span>{generating ? 'Generating...' : 'Generate New'}</span>
              </button>

              {/* 🆕 FULL REGENERATION BUTTON (force) */}
              <button
                onClick={() => {
                  if (confirm('This will delete ALL existing matches and regenerate from scratch. Continue?')) {
                    handleGenerateMatches(true);
                  }
                }}
                disabled={generating}
                className="px-5 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg text-sm font-bold shadow-lg hover:shadow-xl hover:from-orange-700 hover:to-red-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-orange-500"
                title="Delete all existing matches and regenerate everything (slower, uses more API quota)"
              >
                <span>{generating ? '⏳' : '🔄'}</span>
                <span>{generating ? 'Regenerating...' : 'Full Regen'}</span>
              </button>
              <Link href="/candidates" className="px-5 py-2.5 bg-slate-700 text-white rounded-lg text-sm font-semibold border border-slate-600 hover:bg-slate-600 hover:shadow-lg transition-all flex items-center gap-2">
                <span>👥</span>
                <span>Candidates</span>
              </Link>
              <Link href="/clients" className="px-5 py-2.5 bg-slate-700 text-white rounded-lg text-sm font-semibold border border-slate-600 hover:bg-slate-600 hover:shadow-lg transition-all flex items-center gap-2">
                <span>🏥</span>
                <span>Clients</span>
              </Link>

              {/* Bin Button - View Banned Matches */}
              <button
                onClick={() => setShowBinModal(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg text-sm font-bold shadow-lg hover:shadow-xl hover:from-gray-700 hover:to-gray-800 transition-all flex items-center gap-2 border border-gray-500 relative"
                title="View banned matches"
              >
                <span>🗑️</span>
                <span>Bin</span>
                {bannedMatches.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                    {bannedMatches.length}
                  </span>
                )}
              </button>
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
                {/* Initial stats */}
                {generateResult.stats.candidates && (
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
                )}

                {/* Processing info for batch mode */}
                {generateResult.processing && generateResult.stats.pairsToProcess && (
                  <div className="font-semibold space-y-2">
                    <span className="flex items-center gap-2">
                      <span className="text-lg">🔄</span>
                      <span>Processing <span className="text-purple-700">{generateResult.stats.pairsToProcess}</span> pairs</span>
                    </span>
                    {generateResult.stats.totalBatches && (
                      <span className="flex items-center gap-2">
                        <span className="text-lg">📦</span>
                        <span>Batch: <span className="text-blue-700">{generateResult.stats.currentBatch || 0} / {generateResult.stats.totalBatches}</span></span>
                      </span>
                    )}
                  </div>
                )}

                {/* Progress bar */}
                {generateResult.stats.percentage !== undefined && (
                  <div className="flex items-center gap-3">
                    <span className="font-semibold flex items-center gap-2">
                      <span className="text-lg">📊</span>
                      <span>Progress:</span>
                    </span>
                    <div className="flex-1 max-w-xs bg-gray-300 rounded-full h-3 shadow-inner">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300 shadow-sm"
                        style={{ width: `${Math.min(generateResult.stats.percentage, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-bold text-blue-700">
                      {generateResult.stats.percentage}%
                    </span>
                  </div>
                )}

                {/* Current batch results */}
                {generateResult.processing && generateResult.stats.created !== undefined && (
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-2">
                      <span className="text-lg">✅</span>
                      <span>Created: <span className="text-green-700">{generateResult.stats.created || 0}</span></span>
                    </span>
                    {generateResult.stats.excluded !== undefined && (
                      <span className="flex items-center gap-2 text-red-700">
                        <span className="text-lg">⊗</span>
                        <span>Excluded: {generateResult.stats.excluded || 0}</span>
                      </span>
                    )}
                    {generateResult.stats.errors !== undefined && generateResult.stats.errors > 0 && (
                      <span className="flex items-center gap-2 text-red-700">
                        <span className="text-lg">❌</span>
                        <span>Errors: {generateResult.stats.errors}</span>
                      </span>
                    )}
                  </div>
                )}

                {!generateResult.processing && generateResult.stats.matches_created !== undefined && (
                  <div className="space-y-2">
                    <div className="font-semibold flex items-center gap-4 flex-wrap">
                      <span className="flex items-center gap-2">
                        <span className="text-lg">✅</span>
                        <span>New matches created: <span className="text-green-700">{generateResult.stats.matches_created}</span></span>
                      </span>
                      {generateResult.stats.excluded_over_80min > 0 && (
                        <span className="flex items-center gap-2 text-red-700">
                          <span className="text-lg">⊗</span>
                          <span>Excluded (&gt;80min): {generateResult.stats.excluded_over_80min}</span>
                        </span>
                      )}
                      {generateResult.stats.skipped_existing > 0 && (
                        <span className="flex items-center gap-2 text-blue-700">
                          <span className="text-lg">⏭️</span>
                          <span>Skipped (already exist): {generateResult.stats.skipped_existing}</span>
                        </span>
                      )}
                    </div>
                    {generateResult.stats.skipped_existing > 0 && (
                      <div className="text-sm text-green-700 font-semibold flex items-center gap-2">
                        <span className="text-lg">💾</span>
                        <span>API Quota Saved: ~{Math.round((generateResult.stats.skipped_existing / (generateResult.stats.skipped_existing + generateResult.stats.matches_created + generateResult.stats.excluded_over_80min)) * 100)}% (incremental matching)</span>
                      </div>
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
        <MatchesTable
          matches={filteredMatches}
          visibleColumns={visibleColumns}
          onDataChange={() => fetchMatches(false)} // 🆕 Refetch data after edits
        />

        {/* Footer */}
        <div className="mt-2 text-sm text-gray-600">
          Showing {filteredMatches.length} of {matches.length} matches
        </div>
      </div>

      {/* Banned Matches Modal */}
      <BannedMatchesModal
        isOpen={showBinModal}
        onClose={() => setShowBinModal(false)}
        bannedMatches={bannedMatches}
        onUnban={() => fetchMatches(false)}
      />
    </div>
  );
}

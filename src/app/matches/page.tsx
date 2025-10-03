'use client';

import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { normalizeRole } from '@/lib/utils/roleNormalizer';
import { MatchesTable } from '@/components/matches/MatchesTable';
import { MatchFilters } from '@/components/matches/MatchFilters';
import Link from 'next/link';
import { Match, Candidate, Client } from '@/types';

export default function MatchesPage() {
  const [roleMatchFilter, setRoleMatchFilter] = useState<'all' | 'match' | 'location'>('all');
  const [timeFilter, setTimeFilter] = useState<number>(80);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{success: boolean; message: string; stats?: any} | null>(null);
  const [showStats, setShowStats] = useState(true);

  const fetchMatches = async (showLoading = false) => {
      try {
        if (showLoading) {
          setLoading(true);
        }
        setError(null);

        const { data: matchesData, error: matchesError} = await supabase
          .from('matches')
          .select('*')
          .order('commute_minutes', { ascending: true });

        if (matchesError) throw matchesError;

        const { data: candidatesData, error: candidatesError } = await supabase
          .from('candidates')
          .select('*');

        if (candidatesError) throw candidatesError;

        const { data: clientsData, error: clientsError } = await supabase
          .from('clients')
          .select('*');

        if (clientsError) throw clientsError;

        const candidatesMap = new Map(candidatesData.map(c => [c.id, c]));
        const clientsMap = new Map(clientsData.map(c => [c.id, c]));

        const transformedMatches: Match[] = matchesData.map(m => {
          const candidate = candidatesMap.get(m.candidate_id);
          const client = clientsMap.get(m.client_id);

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
        });

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
      });

      const result = await response.json();
      setGenerateResult(result);

      if (result.success) {
        await fetchMatches(false);
      }
    } catch (err: any) {
      setGenerateResult({
        success: false,
        message: err.message || 'Failed to generate matches'
      });
    } finally {
      setGenerating(false);
    }
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-900 font-medium">Loading matches...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Page Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Matches</h1>

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
          <div className={`mb-3 p-2 rounded text-sm ${
            generateResult.success
              ? 'bg-green-50 border border-green-300 text-green-900'
              : 'bg-red-50 border border-red-300 text-red-900'
          }`}>
            {generateResult.success ? '✅' : '❌'} {generateResult.message}
            {generateResult.stats && (
              <div className="mt-1 text-xs">
                <span>Candidates: {generateResult.stats.candidates} | </span>
                <span>Clients: {generateResult.stats.clients} | </span>
                <span>Matches: {generateResult.stats.matches_created}</span>
                {generateResult.stats.excluded_over_80min > 0 && (
                  <span> | Excluded: {generateResult.stats.excluded_over_80min}</span>
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
        />

        {/* Table */}
        <MatchesTable matches={filteredMatches} />

        {/* Footer */}
        <div className="mt-2 text-sm text-gray-600">
          Showing {filteredMatches.length} of {matches.length} matches
        </div>
      </div>
    </div>
  );
}

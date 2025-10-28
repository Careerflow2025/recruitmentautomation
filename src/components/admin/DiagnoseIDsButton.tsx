'use client';

import { useState } from 'react';

export function DiagnoseIDsButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDiagnose = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/diagnose-ids');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to diagnose');
      }

      setResult(data);
      console.log('🔍 Diagnosis Results:', data);

      // Also log to console for debugging
      if (data.candidateDuplicates?.length > 0) {
        console.log('📋 Candidate Duplicates Found:');
        data.candidateDuplicates.forEach((dup: any) => {
          console.log(`  ID "${dup.id}": ${dup.count} occurrences`);
          dup.records.forEach((rec: any) => {
            console.log(`    - Raw: "${rec.rawId}", Name: ${rec.name}, Added: ${rec.added_at}`);
          });
        });
      } else {
        console.log('✅ No candidate duplicates found');
      }

      if (data.clientDuplicates?.length > 0) {
        console.log('📋 Client Duplicates Found:');
        data.clientDuplicates.forEach((dup: any) => {
          console.log(`  ID "${dup.id}": ${dup.count} occurrences`);
          dup.records.forEach((rec: any) => {
            console.log(`    - Raw: "${rec.rawId}", Surgery: ${rec.surgery}, Added: ${rec.added_at}`);
          });
        });
      } else {
        console.log('✅ No client duplicates found');
      }

    } catch (err: any) {
      setError(err.message || 'Failed to diagnose IDs');
      console.error('Diagnosis error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleDiagnose}
        disabled={loading}
        className={`px-4 py-2 rounded-lg font-medium transition ${
          loading
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-yellow-600 text-white hover:bg-yellow-700'
        }`}
      >
        {loading ? '🔄 Analyzing...' : '🔍 Diagnose IDs'}
      </button>

      {result && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg max-w-4xl">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">
            🔍 ID Diagnosis Results
          </h3>

          <div className="space-y-4 text-sm">
            {/* Summary */}
            <div className="bg-white p-3 rounded">
              <h4 className="font-semibold text-gray-800 mb-2">Summary:</h4>
              <ul className="space-y-1 text-gray-700">
                <li>Total Candidates: {result.summary.totalCandidates}</li>
                <li>Total Clients: {result.summary.totalClients}</li>
                <li className="text-red-600 font-semibold">
                  Candidate Duplicates: {result.summary.totalCandidateDuplicates}
                  {result.summary.candidateDuplicateGroups > 0 &&
                    ` (${result.summary.candidateDuplicateGroups} groups)`}
                </li>
                <li className="text-red-600 font-semibold">
                  Client Duplicates: {result.summary.totalClientDuplicates}
                  {result.summary.clientDuplicateGroups > 0 &&
                    ` (${result.summary.clientDuplicateGroups} groups)`}
                </li>
              </ul>
            </div>

            {/* Candidate Duplicates */}
            {result.candidateDuplicates?.length > 0 && (
              <div className="bg-red-50 p-3 rounded">
                <h4 className="font-semibold text-red-800 mb-2">
                  Candidate Duplicate IDs:
                </h4>
                <div className="space-y-2">
                  {result.candidateDuplicates.map((dup: any, idx: number) => (
                    <div key={idx} className="bg-white p-2 rounded text-xs">
                      <strong className="text-red-700">
                        ID "{dup.id}": {dup.count} duplicates
                      </strong>
                      <ul className="ml-4 mt-1">
                        {dup.records.map((rec: any, ridx: number) => (
                          <li key={ridx} className="text-gray-600">
                            • {rec.name} (Raw: "{rec.rawId}")
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Client Duplicates */}
            {result.clientDuplicates?.length > 0 && (
              <div className="bg-red-50 p-3 rounded">
                <h4 className="font-semibold text-red-800 mb-2">
                  Client Duplicate IDs:
                </h4>
                <div className="space-y-2">
                  {result.clientDuplicates.map((dup: any, idx: number) => (
                    <div key={idx} className="bg-white p-2 rounded text-xs">
                      <strong className="text-red-700">
                        ID "{dup.id}": {dup.count} duplicates
                      </strong>
                      <ul className="ml-4 mt-1">
                        {dup.records.map((rec: any, ridx: number) => (
                          <li key={ridx} className="text-gray-600">
                            • {rec.surgery} (Raw: "{rec.rawId}")
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No duplicates message */}
            {result.summary.totalCandidateDuplicates === 0 &&
             result.summary.totalClientDuplicates === 0 && (
              <div className="bg-green-50 p-3 rounded">
                <p className="text-green-800 font-semibold">
                  ✅ No duplicate IDs detected!
                </p>
                <p className="text-green-700 text-xs mt-1">
                  Check the browser console for detailed analysis.
                </p>
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-gray-600">
            Open DevTools Console (F12) for detailed analysis
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
'use client';

import { useState } from 'react';

export function DeduplicateButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDeduplicate = async () => {
    if (!confirm('This will fix any duplicate IDs in the database. Continue?')) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/deduplicate-ids', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to deduplicate');
      }

      setResult(data);

      if (data.totalFixed > 0) {
        // Refresh the page to show updated data
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to deduplicate IDs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleDeduplicate}
        disabled={loading}
        className={`px-4 py-2 rounded-lg font-medium transition ${
          loading
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-purple-600 text-white hover:bg-purple-700'
        }`}
      >
        {loading ? '🔄 Processing...' : '🔧 Fix Duplicate IDs'}
      </button>

      {result && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-lg font-semibold text-green-800 mb-2">
            ✅ Deduplication Complete
          </h3>

          <div className="space-y-2 text-sm">
            <div>
              <strong>Candidates:</strong>
              <ul className="ml-4 text-gray-700">
                <li>Total: {result.candidates.total}</li>
                <li>Duplicates found: {result.candidates.duplicates}</li>
                <li>Fixed: {result.candidates.fixed}</li>
              </ul>
            </div>

            <div>
              <strong>Clients:</strong>
              <ul className="ml-4 text-gray-700">
                <li>Total: {result.clients.total}</li>
                <li>Duplicates found: {result.clients.duplicates}</li>
                <li>Fixed: {result.clients.fixed}</li>
              </ul>
            </div>

            <div className="pt-2 border-t">
              <strong className="text-green-700">
                Total IDs Fixed: {result.totalFixed}
              </strong>
            </div>
          </div>

          {result.totalFixed > 0 && (
            <p className="mt-3 text-sm text-gray-600">
              Page will refresh in 2 seconds...
            </p>
          )}
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
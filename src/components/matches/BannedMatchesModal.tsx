'use client';

import { Match } from '@/types';
import { supabase } from '@/lib/supabase/browser';
import { getCurrentUserId } from '@/lib/auth-helpers';

interface BannedMatchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  bannedMatches: Match[];
  onUnban: () => void; // Callback to refresh matches after unban
}

export function BannedMatchesModal({ isOpen, onClose, bannedMatches, onUnban }: BannedMatchesModalProps) {
  if (!isOpen) return null;

  const handleUnbanMatch = async (match: Match) => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        alert('You must be logged in to restore matches');
        return;
      }

      console.log('♻️ Unbanning match:', {
        candidate_id: match.candidate.id,
        client_id: match.client.id,
        user_id: userId
      });

      // Update match as unbanned in database
      const { error } = await supabase
        .from('matches')
        .update({ banned: false })
        .eq('candidate_id', match.candidate.id)
        .eq('client_id', match.client.id)
        .eq('user_id', userId);

      if (error) {
        console.error('❌ Failed to unban match:', error);
        throw error;
      }

      console.log('✅ Match restored successfully');

      // Refresh matches
      onUnban();

      // Close modal if no more banned matches
      if (bannedMatches.length === 1) {
        onClose();
      }
    } catch (error: any) {
      console.error('Failed to restore match:', error);
      alert(`Failed to restore match: ${error.message}`);
    }
  };

  const getCandidateName = (candidate: any) => {
    const firstName = candidate.first_name?.trim();
    const lastName = candidate.last_name?.trim();
    if (firstName && lastName) return `${firstName} ${lastName}`;
    if (firstName) return firstName;
    if (lastName) return lastName;
    return candidate.id;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden pointer-events-auto border-2 border-gray-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-6 py-4 border-b-2 border-gray-600">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <span className="text-2xl">🗑️</span>
                <span>Banned Matches</span>
                <span className="px-3 py-1 bg-red-600 text-white text-sm font-bold rounded-full shadow-lg">
                  {bannedMatches.length}
                </span>
              </h2>
              <button
                onClick={onClose}
                className="text-white hover:bg-gray-600 rounded-full w-8 h-8 flex items-center justify-center text-2xl font-bold transition-colors"
                title="Close"
              >
                ×
              </button>
            </div>
            <p className="text-gray-300 text-sm mt-2">
              💡 These matches are hidden from the main view. Click "Restore" to unban them.
            </p>
          </div>

          {/* Content */}
          <div className="p-6 overflow-auto max-h-[calc(90vh-140px)]">
            {bannedMatches.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg font-medium">No banned matches</p>
                <p className="text-gray-400 text-sm mt-2">Banned matches will appear here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase">Commute</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase">Role Match</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase">Candidate</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase">Surgery</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase">CAN Role</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase">CL Role</th>
                      <th className="px-4 py-3 text-center text-xs font-bold uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {bannedMatches.map((match, index) => (
                      <tr
                        key={`${match.candidate.id}-${match.client.id}`}
                        className={`transition-colors hover:bg-gray-100 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {match.commute_display}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {match.role_match ? (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                              ✅ Match
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold">
                              📍 Location
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {getCandidateName(match.candidate)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {match.client.surgery}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {match.candidate.role}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {match.client.role}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <button
                            onClick={() => {
                              if (confirm(`Restore this match?\n\nCandidate: ${getCandidateName(match.candidate)}\nSurgery: ${match.client.surgery}\n\nThis will move it back to the main matches view.`)) {
                                handleUnbanMatch(match);
                              }
                            }}
                            className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-bold rounded-lg hover:from-green-700 hover:to-emerald-700 shadow-lg hover:shadow-xl transition-all"
                            title="Restore match"
                          >
                            ♻️ Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              💡 Tip: Restored matches will appear in the main view and will be included in future match generation
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

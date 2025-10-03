'use client';

interface MatchFiltersProps {
  roleMatchFilter: 'all' | 'match' | 'location';
  timeFilter: number;
  roleFilter: string;
  availableRoles: string[];
  onRoleMatchFilterChange: (value: 'all' | 'match' | 'location') => void;
  onTimeFilterChange: (minutes: number) => void;
  onRoleFilterChange: (role: string) => void;
}

export function MatchFilters({
  roleMatchFilter,
  timeFilter,
  roleFilter,
  availableRoles,
  onRoleMatchFilterChange,
  onTimeFilterChange,
  onRoleFilterChange,
}: MatchFiltersProps) {
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
      <h3 className="text-sm font-bold text-gray-900 mb-3">Filters</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Role Match Filter */}
        <div>
          <label className="block text-xs font-bold text-gray-900 mb-1">
            Match Type
          </label>
          <select
            value={roleMatchFilter}
            onChange={(e) => onRoleMatchFilterChange(e.target.value as 'all' | 'match' | 'location')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All Matches</option>
            <option value="match">✅ Role Match Only</option>
            <option value="location">❌ Location-Only</option>
          </select>
        </div>

        {/* Time Filter */}
        <div>
          <label className="block text-xs font-bold text-gray-900 mb-1">
            Max Commute Time
          </label>
          <select
            value={timeFilter}
            onChange={(e) => onTimeFilterChange(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value={80}>All (up to 1h 20m)</option>
            <option value={20}>Under 20 minutes</option>
            <option value={40}>Under 40 minutes</option>
            <option value={60}>Under 1 hour</option>
          </select>
        </div>

        {/* Role Type Filter */}
        <div>
          <label className="block text-xs font-bold text-gray-900 mb-1">
            Role Type
          </label>
          <select
            value={roleFilter}
            onChange={(e) => onRoleFilterChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Roles</option>
            {availableRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick Filter Buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => {
            onRoleMatchFilterChange('match');
            onTimeFilterChange(40);
          }}
          className="px-3 py-1.5 bg-blue-50 text-blue-900 rounded-md text-xs font-bold hover:bg-blue-100 border border-blue-300"
        >
          ✅ Role Match &lt; 40min
        </button>
        <button
          onClick={() => {
            onRoleMatchFilterChange('all');
            onTimeFilterChange(20);
          }}
          className="px-3 py-1.5 bg-green-50 text-green-900 rounded-md text-xs font-bold hover:bg-green-100 border border-green-300"
        >
          🟢🟢🟢 Under 20min
        </button>
        <button
          onClick={() => {
            onRoleMatchFilterChange('all');
            onTimeFilterChange(80);
            onRoleFilterChange('');
          }}
          className="px-3 py-1.5 bg-gray-100 text-gray-900 rounded-md text-xs font-bold hover:bg-gray-200 border border-gray-300"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}

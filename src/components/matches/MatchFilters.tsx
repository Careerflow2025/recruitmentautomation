'use client';

interface MatchFiltersProps {
  roleMatchFilter: 'all' | 'match' | 'location';
  timeFilter: number;
  roleFilter: string;
  searchText: string;
  availableRoles: string[];
  onRoleMatchFilterChange: (value: 'all' | 'match' | 'location') => void;
  onTimeFilterChange: (minutes: number) => void;
  onRoleFilterChange: (role: string) => void;
  onSearchTextChange: (text: string) => void;
  visibleColumns: {
    salary_budget: boolean;
    availability_requirement: boolean;
  };
  onColumnVisibilityChange: (column: string, visible: boolean) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function MatchFilters({
  roleMatchFilter,
  timeFilter,
  roleFilter,
  searchText,
  availableRoles,
  onRoleMatchFilterChange,
  onTimeFilterChange,
  onRoleFilterChange,
  onSearchTextChange,
  visibleColumns,
  onColumnVisibilityChange,
  collapsed,
  onToggleCollapse,
}: MatchFiltersProps) {
  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 mb-4 overflow-hidden">
      {/* Dark Header - Matches Table Style */}
      <div
        className="px-4 py-2.5 cursor-pointer hover:opacity-90 transition-all duration-150"
        style={{ backgroundColor: '#1e293b' }}
        onClick={onToggleCollapse}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 select-none uppercase tracking-wide">
            <span>🎯</span>
            <span>Filters & Display</span>
          </h3>
          <span className="text-xs text-white transition-transform duration-200" style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </div>
      </div>

      {/* Collapsible Content */}
      {!collapsed && (
        <div className="p-4">
          {/* Universal Search - Full Width */}
          <div className="mb-3">
            <div className="relative">
              <input
                type="text"
                value={searchText}
                onChange={(e) => onSearchTextChange(e.target.value)}
                placeholder="Search by ID, name, email, phone, postcode, role..."
                className="w-full px-4 py-2.5 pl-10 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white placeholder-gray-400"
              />
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                🔍
              </span>
              {searchText && (
                <button
                  onClick={() => onSearchTextChange('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Main Filters - Horizontal Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            {/* Match Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Match Type
              </label>
              <select
                value={roleMatchFilter}
                onChange={(e) => onRoleMatchFilterChange(e.target.value as 'all' | 'match' | 'location')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="all">All Matches</option>
                <option value="match">✅ Role Match</option>
                <option value="location">📍 Location Only</option>
              </select>
            </div>

            {/* Max Commute */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Max Commute
              </label>
              <select
                value={timeFilter}
                onChange={(e) => onTimeFilterChange(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value={80}>⏱️ All (1h 20m)</option>
                <option value={20}>🟢 &lt; 20 min</option>
                <option value={40}>🟡 &lt; 40 min</option>
                <option value={60}>🟠 &lt; 1 hour</option>
              </select>
            </div>

            {/* Role Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Role Type
              </label>
              <select
                value={roleFilter}
                onChange={(e) => onRoleFilterChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">All Roles</option>
                {availableRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Clear Button */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  onRoleMatchFilterChange('all');
                  onTimeFilterChange(80);
                  onRoleFilterChange('');
                  onSearchTextChange('');
                }}
                className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-all"
              >
                🔄 Clear All
              </button>
            </div>
          </div>

          {/* Quick Filters & Column Visibility - Horizontal */}
          <div className="flex items-center justify-between gap-4 pt-3 border-t border-gray-100">
            {/* Quick Filter Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onRoleMatchFilterChange('match');
                  onTimeFilterChange(40);
                }}
                className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-all"
              >
                ✅ Match &lt;40min
              </button>
              <button
                onClick={() => {
                  onRoleMatchFilterChange('all');
                  onTimeFilterChange(20);
                }}
                className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold hover:bg-green-600 transition-all"
              >
                🟢 &lt;20min
              </button>
            </div>

            {/* Column Visibility Toggles */}
            <div className="flex gap-2">
              <button
                onClick={() => onColumnVisibilityChange('salary_budget', !visibleColumns.salary_budget)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  visibleColumns.salary_budget
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {visibleColumns.salary_budget ? '✓' : '○'} Salary/Budget
              </button>
              <button
                onClick={() => onColumnVisibilityChange('availability_requirement', !visibleColumns.availability_requirement)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  visibleColumns.availability_requirement
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {visibleColumns.availability_requirement ? '✓' : '○'} Availability
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

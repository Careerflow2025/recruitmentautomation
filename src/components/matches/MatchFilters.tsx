'use client';

interface MatchFiltersProps {
  roleMatchFilter: 'all' | 'match' | 'location';
  timeFilter: number;
  roleFilter: string;
  availableRoles: string[];
  onRoleMatchFilterChange: (value: 'all' | 'match' | 'location') => void;
  onTimeFilterChange: (minutes: number) => void;
  onRoleFilterChange: (role: string) => void;
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
  availableRoles,
  onRoleMatchFilterChange,
  onTimeFilterChange,
  onRoleFilterChange,
  visibleColumns,
  onColumnVisibilityChange,
  collapsed,
  onToggleCollapse,
}: MatchFiltersProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 mb-6 overflow-hidden">
      {/* Modern Header - Clickable */}
      <div
        className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-4 border-b border-slate-600 cursor-pointer hover:from-slate-600 hover:to-slate-700 transition-all duration-200"
        onClick={onToggleCollapse}
      >
        <h3 className="text-base font-bold text-white flex items-center gap-2 select-none">
          <span className="text-xl">🎯</span>
          <span>Filters & Display Options</span>
          <span className="ml-auto text-sm transition-transform duration-200" style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </h3>
      </div>

      {/* Collapsible Content */}
      {!collapsed && (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Role Match Filter */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
              Match Type
            </label>
            <select
              value={roleMatchFilter}
              onChange={(e) => onRoleMatchFilterChange(e.target.value as 'all' | 'match' | 'location')}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-gray-300 transition-all duration-200 shadow-sm"
            >
              <option value="all">All Matches</option>
              <option value="match">✅ Role Match Only</option>
              <option value="location">📍 Location-Only</option>
            </select>
          </div>

          {/* Time Filter */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
              Max Commute Time
            </label>
            <select
              value={timeFilter}
              onChange={(e) => onTimeFilterChange(Number(e.target.value))}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-gray-300 transition-all duration-200 shadow-sm"
            >
              <option value={80}>⏱️ All (up to 1h 20m)</option>
              <option value={20}>🟢 Under 20 minutes</option>
              <option value={40}>🟡 Under 40 minutes</option>
              <option value={60}>🟠 Under 1 hour</option>
            </select>
          </div>

          {/* Role Type Filter */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
              Role Type
            </label>
            <select
              value={roleFilter}
              onChange={(e) => onRoleFilterChange(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-gray-300 transition-all duration-200 shadow-sm"
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
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide flex items-center gap-2">
            <span>⚡</span>
            <span>Quick Filters</span>
          </h4>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                onRoleMatchFilterChange('match');
                onTimeFilterChange(40);
              }}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl text-sm font-bold hover:from-blue-600 hover:to-blue-700 shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
            >
              ✅ Role Match &lt; 40min
            </button>
            <button
              onClick={() => {
                onRoleMatchFilterChange('all');
                onTimeFilterChange(20);
              }}
              className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl text-sm font-bold hover:from-green-600 hover:to-emerald-700 shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
            >
              🟢🟢🟢 Under 20min
            </button>
            <button
              onClick={() => {
                onRoleMatchFilterChange('all');
                onTimeFilterChange(80);
                onRoleFilterChange('');
              }}
              className="px-5 py-2.5 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl text-sm font-bold hover:from-gray-600 hover:to-gray-700 shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
            >
              🔄 Clear Filters
            </button>
          </div>
        </div>

        {/* Column Visibility Toggles */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide flex items-center gap-2">
            <span>👁️</span>
            <span>Show Optional Column Pairs</span>
          </h4>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => onColumnVisibilityChange('salary_budget', !visibleColumns.salary_budget)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 transform hover:scale-105 shadow-md ${
                visibleColumns.salary_budget
                  ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-lg'
                  : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-purple-300 hover:bg-purple-50'
              }`}
            >
              <span className="mr-2">{visibleColumns.salary_budget ? '✓' : '○'}</span>
              <span>Salary / Budget</span>
            </button>
            <button
              onClick={() => onColumnVisibilityChange('availability_requirement', !visibleColumns.availability_requirement)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 transform hover:scale-105 shadow-md ${
                visibleColumns.availability_requirement
                  ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-lg'
                  : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-purple-300 hover:bg-purple-50'
              }`}
            >
              <span className="mr-2">{visibleColumns.availability_requirement ? '✓' : '○'}</span>
              <span>Availability / Requirement</span>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-4 flex items-center gap-1">
            <span>💡</span>
            <span>Required columns (ID, Postcode, Role, Commute, Status) are always visible</span>
          </p>
        </div>
      </div>
      )}
    </div>
  );
}

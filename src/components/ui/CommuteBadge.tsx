import { CommuteBand } from '@/types';

interface CommuteBadgeProps {
  display: string;
  band: CommuteBand;
  minutes: number;
}

export function CommuteBadge({ display, band, minutes }: CommuteBadgeProps) {
  // Color coding based on time band
  const getBandColor = (): string => {
    if (minutes <= 20) return 'bg-green-100 text-green-800 border-green-300';
    if (minutes <= 40) return 'bg-green-50 text-green-700 border-green-200';
    if (minutes <= 55) return 'bg-lime-50 text-lime-700 border-lime-200';
    return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getBandColor()}`}>
      <svg
        className="w-3 h-3 opacity-70"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
      {display}
    </span>
  );
}

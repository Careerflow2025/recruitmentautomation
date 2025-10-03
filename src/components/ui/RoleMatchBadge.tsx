interface RoleMatchBadgeProps {
  isMatch: boolean;
  display: string;
}

export function RoleMatchBadge({ isMatch, display }: RoleMatchBadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center text-lg font-bold ${
        isMatch
          ? 'text-green-600'
          : 'text-red-600'
      }`}
    >
      {isMatch ? '✅' : '❌'}
    </span>
  );
}

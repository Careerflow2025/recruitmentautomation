import { isNewItem } from '@/lib/utils/dateHelpers';

interface NewItemIndicatorProps {
  id: string;
  addedAt: Date;
}

export function NewItemIndicator({ id, addedAt }: NewItemIndicatorProps) {
  const isNew = isNewItem(addedAt);
  
  return (
    <span className="font-bold text-gray-900">
      {isNew && <span className="mr-1">🟨</span>}
      {id}
    </span>
  );
}

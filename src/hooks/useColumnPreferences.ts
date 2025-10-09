'use client';

import { useState, useEffect, useCallback } from 'react';

interface ColumnPreferences {
  order: string[];
  widths: Record<string, number>;
  filters: Record<string, string[]>;
}

/**
 * Hook to persist column order, widths, and filters in localStorage
 */
export function useColumnPreferences(userId: string | null, tableName: string) {
  const storageKey = `column-prefs-${tableName}-${userId}`;

  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Load preferences from localStorage
  useEffect(() => {
    if (!userId) return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const prefs: ColumnPreferences = JSON.parse(stored);
        setColumnOrder(prefs.order || []);
        setColumnWidths(prefs.widths || {});
        setColumnFilters(prefs.filters || {});
      }
    } catch (error) {
      console.error('Failed to load column preferences:', error);
    }
  }, [userId, storageKey]);

  // Save preferences to localStorage
  const savePreferences = useCallback(
    (order?: string[], widths?: Record<string, number>, filters?: Record<string, string[]>) => {
      if (!userId) return;

      try {
        const prefs: ColumnPreferences = {
          order: order || columnOrder,
          widths: widths || columnWidths,
          filters: filters || columnFilters,
        };

        localStorage.setItem(storageKey, JSON.stringify(prefs));

        if (order) setColumnOrder(order);
        if (widths) setColumnWidths(widths);
        if (filters) setColumnFilters(filters);
      } catch (error) {
        console.error('Failed to save column preferences:', error);
      }
    },
    [userId, storageKey, columnOrder, columnWidths, columnFilters]
  );

  // Update just the order
  const updateColumnOrder = useCallback(
    (newOrder: string[]) => {
      savePreferences(newOrder, columnWidths, columnFilters);
    },
    [savePreferences, columnWidths, columnFilters]
  );

  // Update just the widths
  const updateColumnWidths = useCallback(
    (newWidths: Record<string, number>) => {
      savePreferences(columnOrder, newWidths, columnFilters);
    },
    [savePreferences, columnOrder, columnFilters]
  );

  // Update just the filters
  const updateColumnFilters = useCallback(
    (newFilters: Record<string, string[]>) => {
      savePreferences(columnOrder, columnWidths, newFilters);
    },
    [savePreferences, columnOrder, columnWidths]
  );

  // Reset to defaults
  const resetPreferences = useCallback(() => {
    if (!userId) return;
    localStorage.removeItem(storageKey);
    setColumnOrder([]);
    setColumnWidths({});
    setColumnFilters({});
  }, [userId, storageKey]);

  return {
    columnOrder,
    columnWidths,
    columnFilters,
    updateColumnOrder,
    updateColumnWidths,
    updateColumnFilters,
    resetPreferences,
  };
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/browser';
import { RealtimeChannel } from '@supabase/supabase-js';

interface UseSupabaseGridSyncOptions<T> {
  tableName: string;
  orderBy?: { column: string; ascending: boolean };
  onError?: (error: Error) => void;
  filters?: Record<string, any>;
}

export function useSupabaseGridSync<T extends { id: string }>(
  options: UseSupabaseGridSyncOptions<T>
) {
  const { tableName, orderBy, onError, filters = {} } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Initial data load
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      let query = supabase.from(tableName).select('*');

      // Apply filters (multi-tenancy)
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending });
      }

      const { data: fetchedData, error } = await query;

      if (error) throw error;

      setData(fetchedData as T[]);
    } catch (err) {
      console.error('Error loading data:', err);
      onError?.(err as Error);
    } finally {
      setLoading(false);
    }
  }, [tableName, orderBy, filters, onError]);

  // Set up Supabase Realtime subscription
  useEffect(() => {
    loadData();

    // Build filter string for Realtime
    const filterString = Object.entries(filters)
      .map(([key, value]) => `${key}=eq.${value}`)
      .join(',');

    // Subscribe to table changes
    const channel = supabase
      .channel(`${tableName}_changes_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: filterString || undefined,
        },
        (payload) => {
          console.log(`[Realtime] ${payload.eventType}:`, payload);

          if (payload.eventType === 'INSERT') {
            setData((prev) => {
              // Check if already exists (prevent duplicates from optimistic updates)
              const exists = prev.some(item => item.id === (payload.new as T).id);
              if (exists) return prev;
              return [...prev, payload.new as T];
            });
          } else if (payload.eventType === 'UPDATE') {
            setData((prev) =>
              prev.map((item) =>
                item.id === (payload.new as T).id ? (payload.new as T) : item
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setData((prev) =>
              prev.filter((item) => item.id !== (payload.old as any).id)
            );
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Subscription status: ${status}`);
      });

    channelRef.current = channel;

    return () => {
      console.log('[Realtime] Unsubscribing...');
      channel.unsubscribe();
    };
  }, [tableName, loadData, filters]);

  // Insert new row
  const insertRow = useCallback(async (newRow: Partial<T>): Promise<T> => {
    try {
      const { data: inserted, error } = await supabase
        .from(tableName)
        .insert([newRow])
        .select()
        .single();

      if (error) throw error;

      console.log('[Insert] Success:', inserted);

      // Optimistic update (Realtime will also update, but this is instant)
      setData((prev) => {
        const exists = prev.some(item => item.id === (inserted as T).id);
        if (exists) return prev;
        return [...prev, inserted as T];
      });

      return inserted as T;
    } catch (err) {
      console.error('[Insert] Error:', err);
      onError?.(err as Error);
      throw err;
    }
  }, [tableName, onError]);

  // Update existing row
  const updateRow = useCallback(async (id: string, updates: Partial<T>): Promise<T> => {
    try {
      const { data: updated, error } = await supabase
        .from(tableName)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      console.log('[Update] Success:', updated);

      // Optimistic update
      setData((prev) =>
        prev.map((item) => (item.id === id ? (updated as T) : item))
      );

      return updated as T;
    } catch (err) {
      console.error('[Update] Error:', err);
      onError?.(err as Error);
      throw err;
    }
  }, [tableName, onError]);

  // Delete row
  const deleteRow = useCallback(async (id: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);

      if (error) throw error;

      console.log('[Delete] Success:', id);

      // Optimistic update
      setData((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('[Delete] Error:', err);
      onError?.(err as Error);
      throw err;
    }
  }, [tableName, onError]);

  // Batch update multiple rows
  const updateRows = useCallback(async (updates: Array<{ id: string; changes: Partial<T> }>): Promise<void> => {
    try {
      // Execute updates in parallel
      await Promise.all(
        updates.map(({ id, changes }) => updateRow(id, changes))
      );
    } catch (err) {
      console.error('[Batch Update] Error:', err);
      throw err;
    }
  }, [updateRow]);

  return {
    data,
    loading,
    insertRow,
    updateRow,
    deleteRow,
    updateRows,
    refresh: loadData,
  };
}

import { createClient } from '@supabase/supabase-js';

export interface ConversationMessage {
  id: string;
  timestamp: string;
  question: string;
  answer: string;
  userId: string;
}

export interface ConversationSession {
  sessionId: string;
  userId: string;
  startTime: string;
  lastActivity: string;
  messages: ConversationMessage[];
}

class ConversationStorage {
  private supabase: any;
  private tablesChecked: boolean = false;
  private userContextCache: Map<string, { data: any; expiry: number }> = new Map();
  private readonly CONTEXT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Initialize Supabase client with service role for server-side operations
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  private async checkTablesExist(): Promise<boolean> {
    if (this.tablesChecked) return true;

    try {
      // Try to query conversation_sessions table to see if it exists
      const { error } = await this.supabase
        .from('conversation_sessions')
        .select('id')
        .limit(1);

      this.tablesChecked = !error;
      return !error;
    } catch (error) {
      console.error('Error checking if conversation tables exist:', error);
      return false;
    }
  }

  async saveMessage(
    userId: string,
    sessionId: string,
    question: string,
    answer: string
  ): Promise<void> {
    const tablesExist = await this.checkTablesExist();
    
    if (!tablesExist) {
      console.log('Conversation tables do not exist, skipping conversation storage');
      return;
    }

    try {
      // First, try to get existing session
      const { data: existingSession } = await this.supabase
        .from('conversation_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single();

      // Create session if it doesn't exist
      if (!existingSession) {
        await this.supabase
          .from('conversation_sessions')
          .insert({
            session_id: sessionId,
            user_id: userId,
            start_time: new Date().toISOString(),
            last_activity: new Date().toISOString()
          });
      } else {
        // Update last activity
        await this.supabase
          .from('conversation_sessions')
          .update({ last_activity: new Date().toISOString() })
          .eq('session_id', sessionId)
          .eq('user_id', userId);
      }

      // Save the message
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.supabase
        .from('conversation_messages')
        .insert({
          id: messageId,
          session_id: sessionId,
          user_id: userId,
          question,
          answer,
          timestamp: new Date().toISOString()
        });

    } catch (error) {
      console.error('Error saving conversation message:', error);
    }
  }

  async getConversationHistory(
    userId: string,
    sessionId: string,
    limitMessages: number = 100
  ): Promise<ConversationMessage[]> {
    const tablesExist = await this.checkTablesExist();
    
    if (!tablesExist) {
      return [];
    }

    try {
      const { data: messages } = await this.supabase
        .from('conversation_messages')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('timestamp', { ascending: true })
        .limit(limitMessages);

      return messages || [];
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return [];
    }
  }

  async getRecentConversations(
    userId: string,
    limitSessions: number = 20,
    messagesPerSession: number = 50
  ): Promise<ConversationMessage[]> {
    const tablesExist = await this.checkTablesExist();
    
    if (!tablesExist) {
      return [];
    }

    try {
      // Get recent sessions for the user
      const { data: sessions } = await this.supabase
        .from('conversation_sessions')
        .select('session_id')
        .eq('user_id', userId)
        .order('last_activity', { ascending: false })
        .limit(limitSessions);

      if (!sessions || sessions.length === 0) {
        return [];
      }

      // Get messages from these sessions - increased limit for long conversations
      const sessionIds = sessions.map(s => s.session_id);
      const { data: messages } = await this.supabase
        .from('conversation_messages')
        .select('*')
        .eq('user_id', userId)
        .in('session_id', sessionIds)
        .order('timestamp', { ascending: false })
        .limit(1000); // Increased from 200 to support 20+ pages of conversation

      return messages || [];
    } catch (error) {
      console.error('Error getting recent conversations:', error);
      return [];
    }
  }

  async createSessionId(userId?: string): Promise<string> {
    // Include user ID in session ID to prevent cross-contamination in multi-tenant environment
    const userPrefix = userId ? userId.substring(0, 8) : 'anon';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const sessionId = `session_${userPrefix}_${timestamp}_${random}`;
    
    // Log session creation for audit trail
    console.log(`📝 Created new session: ${sessionId} for user: ${userPrefix}...`);
    
    return sessionId;
  }

  async cleanOldConversations(userId: string, daysToKeep: number = 30): Promise<void> {
    const tablesExist = await this.checkTablesExist();
    
    if (!tablesExist) {
      return;
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // Delete old messages
      const { data: deletedMessages } = await this.supabase
        .from('conversation_messages')
        .delete()
        .eq('user_id', userId)
        .lt('timestamp', cutoffDate.toISOString())
        .select('id');

      // Delete old sessions
      const { data: deletedSessions } = await this.supabase
        .from('conversation_sessions')
        .delete()
        .eq('user_id', userId)
        .lt('last_activity', cutoffDate.toISOString())
        .select('session_id');

      console.log(`🧹 Cleaned old data for user ${userId.substring(0, 8)}...: ${deletedMessages?.length || 0} messages, ${deletedSessions?.length || 0} sessions`);

    } catch (error) {
      console.error('Error cleaning old conversations:', error);
    }
  }

  /**
   * Enhanced context management with caching for better performance
   */
  async getUserContext(userId: string): Promise<any> {
    const cacheKey = `context_${userId}`;
    const cached = this.userContextCache.get(cacheKey);
    
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      // This would be where you'd fetch user-specific context data
      // For now, return empty object but this can be extended
      const contextData = {
        userId,
        lastActivity: new Date().toISOString(),
        preferences: {},
        metadata: {}
      };

      // Cache the context
      this.userContextCache.set(cacheKey, {
        data: contextData,
        expiry: Date.now() + this.CONTEXT_CACHE_TTL
      });

      return contextData;
    } catch (error) {
      console.error('Error fetching user context:', error);
      return {};
    }
  }

  /**
   * Clear context cache for a specific user (useful for testing or when user data changes)
   */
  clearUserContextCache(userId: string): void {
    const cacheKey = `context_${userId}`;
    this.userContextCache.delete(cacheKey);
    console.log(`🗑️ Cleared context cache for user ${userId.substring(0, 8)}...`);
  }

  /**
   * Get context cache stats for monitoring
   */
  getContextCacheStats(): { totalCached: number; cacheHits: number; cacheSize: number } {
    const now = Date.now();
    let validEntries = 0;
    let totalSize = 0;
    
    for (const [key, value] of this.userContextCache.entries()) {
      if (value.expiry > now) {
        validEntries++;
        totalSize += JSON.stringify(value.data).length;
      } else {
        // Clean expired entries
        this.userContextCache.delete(key);
      }
    }

    return {
      totalCached: validEntries,
      cacheHits: 0, // This would need to be tracked separately
      cacheSize: totalSize
    };
  }
}

export const conversationStorage = new ConversationStorage();
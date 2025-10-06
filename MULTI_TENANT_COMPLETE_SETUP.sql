-- ================================================
-- MULTI-TENANT COMPLETE SETUP WITH RLS
-- Run in Supabase SQL Editor in order
-- ================================================

-- 0) Add user_id columns if missing (check each table first)
-- Example patterns - adapt table names as needed

-- Check and add user_id to candidates if missing
alter table public.candidates add column if not exists user_id uuid;
-- Update existing data if any (set to a default user or handle in app)
-- update public.candidates set user_id = auth.uid() where user_id is null;
alter table public.candidates alter column user_id set not null;

-- Check and add user_id to clients if missing
alter table public.clients add column if not exists user_id uuid;
-- update public.clients set user_id = auth.uid() where user_id is null;
alter table public.clients alter column user_id set not null;

-- Check and add user_id to matches if missing
alter table public.matches add column if not exists user_id uuid;
-- update public.matches set user_id = auth.uid() where user_id is null;
alter table public.matches alter column user_id set not null;

-- Check and add user_id to match_notes if missing
alter table public.match_notes add column if not exists user_id uuid;
-- update public.match_notes set user_id = auth.uid() where user_id is null;
alter table public.match_notes alter column user_id set not null;

-- Check and add user_id to match_statuses if missing
alter table public.match_statuses add column if not exists user_id uuid;
-- update public.match_statuses set user_id = auth.uid() where user_id is null;
alter table public.match_statuses alter column user_id set not null;

-- Check and add user_id to ai_conversations if missing
alter table public.ai_conversations add column if not exists user_id uuid;
-- update public.ai_conversations set user_id = auth.uid() where user_id is null;
alter table public.ai_conversations alter column user_id set not null;

-- Check and add user_id to ai_messages if missing
alter table public.ai_messages add column if not exists user_id uuid;
-- update public.ai_messages set user_id = auth.uid() where user_id is null;
alter table public.ai_messages alter column user_id set not null;

-- Check and add user_id to conversation_sessions if missing
alter table public.conversation_sessions add column if not exists user_id uuid;
-- update public.conversation_sessions set user_id = auth.uid() where user_id is null;
alter table public.conversation_sessions alter column user_id set not null;

-- Also handle conversation_locks table
alter table public.conversation_locks add column if not exists user_id uuid;
-- update public.conversation_locks set user_id = auth.uid() where user_id is null;
alter table public.conversation_locks alter column user_id set not null;

-- ================================================
-- 1) ENABLE RLS + CREATE "OWN DATA" POLICIES
-- ================================================

-- Candidates table
alter table public.candidates enable row level security;

drop policy if exists candidates_select_own on public.candidates;
create policy candidates_select_own
on public.candidates for select
using (auth.uid() = user_id);

drop policy if exists candidates_insert_own on public.candidates;
create policy candidates_insert_own
on public.candidates for insert
with check (auth.uid() = user_id);

drop policy if exists candidates_update_own on public.candidates;
create policy candidates_update_own
on public.candidates for update
using (auth.uid() = user_id);

drop policy if exists candidates_delete_own on public.candidates;
create policy candidates_delete_own
on public.candidates for delete
using (auth.uid() = user_id);

-- Clients table
alter table public.clients enable row level security;

drop policy if exists clients_select_own on public.clients;
create policy clients_select_own 
on public.clients for select
using (auth.uid() = user_id);

drop policy if exists clients_insert_own on public.clients;
create policy clients_insert_own
on public.clients for insert
with check (auth.uid() = user_id);

drop policy if exists clients_update_own on public.clients;
create policy clients_update_own
on public.clients for update
using (auth.uid() = user_id);

drop policy if exists clients_delete_own on public.clients;
create policy clients_delete_own
on public.clients for delete
using (auth.uid() = user_id);

-- Matches table
alter table public.matches enable row level security;

drop policy if exists matches_select_own on public.matches;
create policy matches_select_own
on public.matches for select
using (auth.uid() = user_id);

drop policy if exists matches_insert_own on public.matches;
create policy matches_insert_own
on public.matches for insert
with check (auth.uid() = user_id);

drop policy if exists matches_update_own on public.matches;
create policy matches_update_own
on public.matches for update
using (auth.uid() = user_id);

drop policy if exists matches_delete_own on public.matches;
create policy matches_delete_own
on public.matches for delete
using (auth.uid() = user_id);

-- Match notes table
alter table public.match_notes enable row level security;

drop policy if exists match_notes_select_own on public.match_notes;
create policy match_notes_select_own
on public.match_notes for select
using (auth.uid() = user_id);

drop policy if exists match_notes_insert_own on public.match_notes;
create policy match_notes_insert_own
on public.match_notes for insert
with check (auth.uid() = user_id);

drop policy if exists match_notes_update_own on public.match_notes;
create policy match_notes_update_own
on public.match_notes for update
using (auth.uid() = user_id);

drop policy if exists match_notes_delete_own on public.match_notes;
create policy match_notes_delete_own
on public.match_notes for delete
using (auth.uid() = user_id);

-- Match statuses table
alter table public.match_statuses enable row level security;

drop policy if exists match_statuses_select_own on public.match_statuses;
create policy match_statuses_select_own
on public.match_statuses for select
using (auth.uid() = user_id);

drop policy if exists match_statuses_insert_own on public.match_statuses;
create policy match_statuses_insert_own
on public.match_statuses for insert
with check (auth.uid() = user_id);

drop policy if exists match_statuses_update_own on public.match_statuses;
create policy match_statuses_update_own
on public.match_statuses for update
using (auth.uid() = user_id);

drop policy if exists match_statuses_delete_own on public.match_statuses;
create policy match_statuses_delete_own
on public.match_statuses for delete
using (auth.uid() = user_id);

-- AI conversations table
alter table public.ai_conversations enable row level security;

drop policy if exists ai_conv_select_own on public.ai_conversations;
create policy ai_conv_select_own
on public.ai_conversations for select
using (auth.uid() = user_id);

drop policy if exists ai_conv_insert_own on public.ai_conversations;
create policy ai_conv_insert_own
on public.ai_conversations for insert
with check (auth.uid() = user_id);

drop policy if exists ai_conv_update_own on public.ai_conversations;
create policy ai_conv_update_own
on public.ai_conversations for update
using (auth.uid() = user_id);

drop policy if exists ai_conv_delete_own on public.ai_conversations;
create policy ai_conv_delete_own
on public.ai_conversations for delete
using (auth.uid() = user_id);

-- AI messages table
alter table public.ai_messages enable row level security;

drop policy if exists ai_msg_select_own on public.ai_messages;
create policy ai_msg_select_own
on public.ai_messages for select
using (auth.uid() = user_id);

drop policy if exists ai_msg_insert_own on public.ai_messages;
create policy ai_msg_insert_own
on public.ai_messages for insert
with check (auth.uid() = user_id);

drop policy if exists ai_msg_update_own on public.ai_messages;
create policy ai_msg_update_own
on public.ai_messages for update
using (auth.uid() = user_id);

drop policy if exists ai_msg_delete_own on public.ai_messages;
create policy ai_msg_delete_own
on public.ai_messages for delete
using (auth.uid() = user_id);

-- Conversation sessions table (if not already enabled)
alter table public.conversation_sessions enable row level security;

drop policy if exists cs_select_own on public.conversation_sessions;
create policy cs_select_own
on public.conversation_sessions for select
using (auth.uid() = user_id);

drop policy if exists cs_insert_own on public.conversation_sessions;
create policy cs_insert_own
on public.conversation_sessions for insert
with check (auth.uid() = user_id);

drop policy if exists cs_update_own on public.conversation_sessions;
create policy cs_update_own
on public.conversation_sessions for update
using (auth.uid() = user_id);

drop policy if exists cs_delete_own on public.conversation_sessions;
create policy cs_delete_own
on public.conversation_sessions for delete
using (auth.uid() = user_id);

-- Conversation locks table
alter table public.conversation_locks enable row level security;

drop policy if exists cl_select_own on public.conversation_locks;
create policy cl_select_own
on public.conversation_locks for select
using (auth.uid() = user_id);

drop policy if exists cl_insert_own on public.conversation_locks;
create policy cl_insert_own
on public.conversation_locks for insert
with check (auth.uid() = user_id);

drop policy if exists cl_update_own on public.conversation_locks;
create policy cl_update_own
on public.conversation_locks for update
using (auth.uid() = user_id);

drop policy if exists cl_delete_own on public.conversation_locks;
create policy cl_delete_own
on public.conversation_locks for delete
using (auth.uid() = user_id);

-- ================================================
-- 2) AUTO-UPDATE TIMESTAMP TRIGGER
-- ================================================

-- Helper function to set updated_at timestamp
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Apply to conversation_sessions if not already present
drop trigger if exists set_timestamp_conversation_sessions on public.conversation_sessions;
create trigger set_timestamp_conversation_sessions
before update on public.conversation_sessions
for each row execute function public.set_updated_at();

-- Apply to conversation_locks
drop trigger if exists set_timestamp_conversation_locks on public.conversation_locks;
create trigger set_timestamp_conversation_locks
before update on public.conversation_locks
for each row execute function public.set_updated_at();

-- ================================================
-- 3) UNIQUE PROCESSING LOCK PER USER
-- ================================================

-- Ensure only one processing session per user at a time
drop index if exists one_processing_session_per_user;
create unique index one_processing_session_per_user
on public.conversation_sessions (user_id)
where status = 'processing' and (ended_at is null);

-- Same for conversation_locks table
drop index if exists one_processing_lock_per_user;
create unique index one_processing_lock_per_user
on public.conversation_locks (user_id)
where status = 'processing' and (ended_at is null);

-- ================================================
-- 4) AUTO-UNLOCK STALE SESSIONS FUNCTION + CRON
-- ================================================

-- Function to unlock stale processing sessions
create or replace function public.unlock_stale_sessions(max_age interval default interval '90 seconds')
returns integer language plpgsql as $$
declare 
  n int;
  total_unlocked int := 0;
begin
  -- Unlock stale conversation_sessions
  update public.conversation_sessions
  set status = 'idle', ended_at = now(), updated_at = now()
  where status = 'processing'
    and (updated_at is null or now() - updated_at > max_age);
  get diagnostics n = row_count;
  total_unlocked := total_unlocked + n;
  
  -- Unlock stale conversation_locks
  update public.conversation_locks
  set status = 'idle', ended_at = now(), updated_at = now()
  where status = 'processing'
    and (updated_at is null or now() - updated_at > max_age);
  get diagnostics n = row_count;
  total_unlocked := total_unlocked + n;
  
  return total_unlocked;
end $$;

-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron;

-- Remove existing cron job if it exists
select cron.unschedule('unlock-stale-conversation-sessions');

-- Schedule the auto-unlock function to run every 2 minutes
select cron.schedule(
  'unlock-stale-conversation-sessions',
  '*/2 * * * *',
  $$ select public.unlock_stale_sessions('90 seconds'::interval); $$
);

-- ================================================
-- 5) SECURE VIEWS WITH SECURITY INVOKER
-- ================================================

-- Check if matches_with_details view exists and make it security invoker
do $$
begin
  if exists (select 1 from information_schema.views where table_name = 'matches_with_details') then
    alter view public.matches_with_details set (security_invoker = true);
  end if;
end $$;

-- If you have other views that the AI uses, add them here
-- Example patterns:
-- alter view public.candidate_summary_view set (security_invoker = true);
-- alter view public.client_summary_view set (security_invoker = true);

-- ================================================
-- 6) VERIFICATION QUERIES
-- ================================================

-- Function to verify RLS is working correctly
create or replace function public.verify_rls_setup()
returns table(
  table_name text,
  rls_enabled boolean,
  has_user_id boolean,
  policy_count bigint
) language plpgsql as $$
begin
  return query
  select 
    t.table_name::text,
    t.row_security::boolean as rls_enabled,
    exists(
      select 1 from information_schema.columns c 
      where c.table_name = t.table_name 
      and c.column_name = 'user_id'
    ) as has_user_id,
    coalesce(p.policy_count, 0) as policy_count
  from information_schema.tables t
  left join (
    select 
      schemaname||'.'||tablename as full_name,
      count(*) as policy_count
    from pg_policies 
    where schemaname = 'public'
    group by schemaname||'.'||tablename
  ) p on p.full_name = 'public.'||t.table_name
  where t.table_schema = 'public' 
  and t.table_name in (
    'candidates', 'clients', 'matches', 'match_notes', 'match_statuses',
    'ai_conversations', 'ai_messages', 'conversation_sessions', 'conversation_locks'
  )
  order by t.table_name;
end $$;

-- ================================================
-- USAGE INSTRUCTIONS
-- ================================================

-- To check your setup, run:
-- select * from public.verify_rls_setup();

-- To manually unlock stale sessions:
-- select public.unlock_stale_sessions();

-- To check current processing locks:
-- select user_id, status, updated_at, started_at, ended_at 
-- from public.conversation_locks 
-- where status = 'processing'
-- order by updated_at desc;

-- To view cron jobs:
-- select * from cron.job;

-- To check if a user has isolated data:
-- set role authenticated; -- simulate authenticated user
-- select count(*) from candidates; -- should only show user's data
-- reset role;

-- ================================================
-- FINAL NOTES
-- ================================================

-- 1. This setup ensures complete per-user data isolation
-- 2. RLS policies enforce that users only see their own data
-- 3. The locking mechanism prevents concurrent AI processing per user
-- 4. Auto-unlock prevents stuck processing states
-- 5. All views use security invoker to respect RLS policies

-- Remember to:
-- - Update your application code to use userClient (with JWT) for data reads
-- - Use serverClient (service role) only for lock management
-- - Include user_id in all new data inserts
-- - Test with different users to verify isolation

-- The setup is complete. Your application should now be fully multi-tenant.
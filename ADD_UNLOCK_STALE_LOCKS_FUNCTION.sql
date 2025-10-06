CREATE OR REPLACE FUNCTION unlock_stale_locks()
RETURNS void AS $
  UPDATE public.conversation_locks
  SET status = 'idle', ended_at = NOW()
  WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '2 minutes';
$ LANGUAGE sql;

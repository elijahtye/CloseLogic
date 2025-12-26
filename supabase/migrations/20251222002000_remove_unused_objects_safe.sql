-- CloseLogic: remove/retire unused DB objects (SAFE)
-- This migration is designed to NOT break the current app.
-- It only removes objects that are not referenced in the repo right now.
--
-- What we found unused in code:
-- - public.gmail_tokens (legacy; app uses public.email_accounts for tokens)
-- - public.feedback (no usage in frontend/backend)
-- - leads.pricing_reason / leads.pricing_confidence (not used by API/UI; optional)
--
-- Strategy:
-- - Archive tables to schema "archive" instead of DROP (easy rollback).
-- - Optionally drop unused columns (commented; enable if you truly want them gone).

CREATE SCHEMA IF NOT EXISTS archive;

-- 1) Retire legacy public.gmail_tokens (archive it)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'gmail_tokens'
  ) THEN
    -- Move to archive schema (keeps data)
    EXECUTE 'ALTER TABLE public.gmail_tokens SET SCHEMA archive';
    RAISE NOTICE 'Moved public.gmail_tokens -> archive.gmail_tokens';
  END IF;
END $$;

-- 2) Retire public.feedback (archive it)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feedback'
  ) THEN
    EXECUTE 'ALTER TABLE public.feedback SET SCHEMA archive';
    RAISE NOTICE 'Moved public.feedback -> archive.feedback';
  END IF;
END $$;

-- 3) OPTIONAL: Drop unused columns from public.leads
-- These are safe to keep. Only enable if you want a lean schema.
-- NOTE: dropping columns is irreversible without a restore.
--
-- ALTER TABLE public.leads DROP COLUMN IF EXISTS pricing_reason;
-- ALTER TABLE public.leads DROP COLUMN IF EXISTS pricing_confidence;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';



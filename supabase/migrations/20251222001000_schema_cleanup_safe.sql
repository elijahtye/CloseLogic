-- CloseLogic SAFE schema cleanup (non-destructive)
-- Goal: add missing indexes + quality-of-life triggers, and gently align old tables.
-- This migration intentionally avoids dropping tables/columns to prevent breaking features.

-- 0) Ensure uuid generation exists (your schema uses uuid_generate_v4())
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='updated_at') THEN
    DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
    CREATE TRIGGER trg_profiles_set_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='updated_at') THEN
    DROP TRIGGER IF EXISTS trg_leads_set_updated_at ON public.leads;
    CREATE TRIGGER trg_leads_set_updated_at
      BEFORE UPDATE ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='action_items' AND column_name='updated_at') THEN
    DROP TRIGGER IF EXISTS trg_action_items_set_updated_at ON public.action_items;
    CREATE TRIGGER trg_action_items_set_updated_at
      BEFORE UPDATE ON public.action_items
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_accounts' AND column_name='updated_at') THEN
    DROP TRIGGER IF EXISTS trg_email_accounts_set_updated_at ON public.email_accounts;
    CREATE TRIGGER trg_email_accounts_set_updated_at
      BEFORE UPDATE ON public.email_accounts
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 2) High-signal indexes for performance
-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_user_last_message_at
  ON public.leads (user_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_leads_user_created_at
  ON public.leads (user_id, created_at DESC);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_user_sent_at
  ON public.messages (user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_lead_sent_at
  ON public.messages (lead_id, sent_at DESC);

-- Gmail dedupe: user_id + gmail_message_id (partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS messages_user_gmail_message_id_unique
  ON public.messages (user_id, gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

-- Lead scores (latest by created_at)
CREATE INDEX IF NOT EXISTS idx_lead_scores_lead_created_at
  ON public.lead_scores (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_scores_user_created_at
  ON public.lead_scores (user_id, created_at DESC);

-- Action items
CREATE INDEX IF NOT EXISTS idx_action_items_user_status_created_at
  ON public.action_items (user_id, status, created_at DESC);

-- Email accounts
CREATE INDEX IF NOT EXISTS idx_email_accounts_user_provider
  ON public.email_accounts (user_id, provider);

-- 3) Optional data hygiene: avoid duplicate leads per user by email (non-blocking)
-- This is optional; it prevents the same lead email being duplicated per user.
-- If your product intentionally allows duplicates, remove this.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'leads_user_lead_email_unique') THEN
    CREATE UNIQUE INDEX leads_user_lead_email_unique
      ON public.leads (user_id, lead_email);
  END IF;
EXCEPTION WHEN others THEN
  -- If duplicates exist, index creation will fail; keep the migration safe.
  RAISE NOTICE 'Skipping unique index leads_user_lead_email_unique (duplicates exist).';
END $$;

-- 4) gmail_tokens table: keep (non-destructive), but add alignment helpers.
-- Your app now uses email_accounts for tokens; gmail_tokens is legacy.
-- If gmail_tokens has data and email_accounts is missing tokens, copy them across.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gmail_tokens')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_accounts') THEN
    -- Copy tokens only where email_accounts has null tokens.
    UPDATE public.email_accounts ea
    SET
      access_token = COALESCE(ea.access_token, gt.access_token),
      refresh_token = COALESCE(ea.refresh_token, gt.refresh_token),
      token_scope = COALESCE(ea.token_scope, gt.scope),
      expires_at = COALESCE(ea.expires_at, gt.expires_at),
      updated_at = now()
    FROM public.gmail_tokens gt
    WHERE ea.user_id = gt.user_id
      AND ea.provider = 'gmail'
      AND (ea.access_token IS NULL OR ea.refresh_token IS NULL);
  END IF;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';



-- CloseLogic tiers + restrictions
-- Adds a strict plan enum to profiles, plus basic enforcement for tier-gated features.
-- NOTE: Some features (background sync, priority processing) are enforced at the API layer.

-- 1) Plan enum + profiles.plan
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_plan') THEN
    CREATE TYPE user_plan AS ENUM ('viewer', 'agent', 'broker');
  END IF;
END $$;

DO $$
DECLARE
  plan_col_type text;
BEGIN
  -- Drop legacy check constraint that only allows ('free','agent','pro')
  -- This is the exact failure you hit when existing rows contain 'viewer'.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'profiles'
      AND c.conname = 'profiles_plan_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_plan_check;
  END IF;

  -- If profiles.plan doesn't exist, add it as enum.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='plan'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN plan user_plan;
  END IF;

  -- Determine current column type.
  SELECT data_type INTO plan_col_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles' AND column_name='plan';

  -- If plan is TEXT/VARCHAR, convert it to enum safely.
  IF plan_col_type IN ('text', 'character varying') THEN
    -- Normalize legacy values (free/agent/pro) into the new enum values.
    UPDATE public.profiles
    SET plan = CASE
      WHEN plan IS NULL THEN 'viewer'
      WHEN plan::text IN ('free', 'viewer') THEN 'viewer'
      WHEN plan::text IN ('agent') THEN 'agent'
      WHEN plan::text IN ('pro', 'broker') THEN 'broker'
      ELSE 'viewer'
    END
    WHERE plan IS NULL OR plan::text NOT IN ('viewer','agent','broker');

    ALTER TABLE public.profiles
      ALTER COLUMN plan TYPE user_plan
      USING (CASE
        WHEN plan::text IN ('viewer','agent','broker') THEN plan::text::user_plan
        WHEN plan::text = 'free' THEN 'viewer'::user_plan
        WHEN plan::text = 'pro' THEN 'broker'::user_plan
        WHEN plan::text = 'agent' THEN 'agent'::user_plan
        ELSE 'viewer'::user_plan
      END);
  END IF;

  -- Ensure defaults
  ALTER TABLE public.profiles
    ALTER COLUMN plan SET DEFAULT 'viewer'::user_plan;

  UPDATE public.profiles SET plan = 'viewer'::user_plan WHERE plan IS NULL;
  ALTER TABLE public.profiles
    ALTER COLUMN plan SET NOT NULL;
END $$;

-- 2) Helper functions: plan rank + min-plan check
CREATE OR REPLACE FUNCTION public.plan_rank(p user_plan)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p
    WHEN 'viewer' THEN 0
    WHEN 'agent' THEN 1
    WHEN 'broker' THEN 2
  END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_plan()
RETURNS user_plan
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT plan FROM public.profiles WHERE id = auth.uid()), 'viewer'::user_plan);
$$;

REVOKE ALL ON FUNCTION public.current_user_plan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_plan() TO authenticated;

CREATE OR REPLACE FUNCTION public.require_min_plan(min_plan user_plan)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.plan_rank(public.current_user_plan()) >= public.plan_rank(min_plan);
$$;

REVOKE ALL ON FUNCTION public.require_min_plan(user_plan) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_min_plan(user_plan) TO authenticated;

-- 3) Enforce: Action items are Agent+ (Agent/Broker)
-- If you want Viewer to have action items too, remove this trigger.
CREATE OR REPLACE FUNCTION public.enforce_action_items_min_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.require_min_plan('agent'::user_plan) IS NOT TRUE THEN
    RAISE EXCEPTION 'tier_restriction: action_items requires agent tier'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='action_items') THEN
    DROP TRIGGER IF EXISTS trg_action_items_min_plan ON public.action_items;
    CREATE TRIGGER trg_action_items_min_plan
      BEFORE INSERT OR UPDATE ON public.action_items
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_action_items_min_plan();
  END IF;
END $$;

-- 4) Enforce: Multiple Gmail accounts only for Broker
-- Restriction: viewer/agent max 1 gmail row per user; broker max 5.
CREATE OR REPLACE FUNCTION public.enforce_email_accounts_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p user_plan;
  max_accounts integer;
  cnt integer;
BEGIN
  p := public.current_user_plan();
  max_accounts := CASE p
    WHEN 'broker' THEN 5
    ELSE 1
  END;

  -- Only apply to gmail provider rows
  IF NEW.provider IS DISTINCT FROM 'gmail' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO cnt
  FROM public.email_accounts
  WHERE user_id = NEW.user_id
    AND provider = 'gmail'
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF cnt >= max_accounts THEN
    RAISE EXCEPTION 'tier_restriction: gmail account limit exceeded for plan % (max=%)', p, max_accounts
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_accounts') THEN
    DROP TRIGGER IF EXISTS trg_email_accounts_limit ON public.email_accounts;
    CREATE TRIGGER trg_email_accounts_limit
      BEFORE INSERT OR UPDATE ON public.email_accounts
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_email_accounts_limit();
  END IF;
END $$;

-- 5) Optional: tighten email_accounts RLS (ownership)
-- If you already have RLS policies for email_accounts, review before applying.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_accounts') THEN
    ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "email_accounts_select_own" ON public.email_accounts;
    CREATE POLICY "email_accounts_select_own"
      ON public.email_accounts
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());

    DROP POLICY IF EXISTS "email_accounts_insert_own" ON public.email_accounts;
    CREATE POLICY "email_accounts_insert_own"
      ON public.email_accounts
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "email_accounts_update_own" ON public.email_accounts;
    CREATE POLICY "email_accounts_update_own"
      ON public.email_accounts
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';



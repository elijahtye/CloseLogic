-- Migration: Commission settings + earnings estimates
-- Adds:
--  - profiles.commission_rate (numeric, e.g. 0.03 = 3%)
--  - profiles.auto_analyze_leads (boolean)
--  - leads.estimated_earnings (integer, USD)

DO $$
BEGIN
  -- profiles.commission_rate
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'commission_rate'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN commission_rate NUMERIC;
  END IF;

  -- profiles.auto_analyze_leads
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'auto_analyze_leads'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN auto_analyze_leads BOOLEAN DEFAULT FALSE;
  END IF;

  -- leads.estimated_earnings
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'estimated_earnings'
  ) THEN
    ALTER TABLE public.leads
      ADD COLUMN estimated_earnings INTEGER;
  END IF;
END $$;

-- Defaults + constraints
DO $$
BEGIN
  -- Default commission to 3% for existing rows where null
  UPDATE public.profiles
    SET commission_rate = 0.03
  WHERE commission_rate IS NULL;

  -- Clamp commission in [0, 0.20]
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'profiles' AND constraint_name = 'profiles_commission_rate_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_commission_rate_check
      CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 0.20));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'leads' AND constraint_name = 'leads_estimated_earnings_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_estimated_earnings_check
      CHECK (estimated_earnings IS NULL OR estimated_earnings >= 0);
  END IF;
END $$;

-- Helpful index for sorting/filtering by earnings
CREATE INDEX IF NOT EXISTS idx_leads_estimated_earnings
ON public.leads(estimated_earnings)
WHERE estimated_earnings IS NOT NULL;



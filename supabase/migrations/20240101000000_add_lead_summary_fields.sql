-- Migration: Add lead summary fields to leads table
-- Adds classification, pipeline value fields, and last_analyzed_at timestamp
-- Run this migration in Supabase SQL Editor

-- Step 1: Add columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS classification TEXT,
  ADD COLUMN IF NOT EXISTS estimated_price_min BIGINT,
  ADD COLUMN IF NOT EXISTS estimated_price_max BIGINT,
  ADD COLUMN IF NOT EXISTS pipeline_value BIGINT,
  ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ;

-- Step 2: Add CHECK constraint for classification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'leads' 
    AND constraint_name = 'leads_classification_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_classification_check 
      CHECK (classification IN ('cold','warm','hot'));
    
    RAISE NOTICE 'Added CHECK constraint for classification';
  ELSE
    RAISE NOTICE 'leads_classification_check constraint already exists';
  END IF;
END $$;

-- Step 3: Add indexes
CREATE INDEX IF NOT EXISTS idx_leads_classification 
ON public.leads(classification);

CREATE INDEX IF NOT EXISTS idx_leads_last_analyzed_at 
ON public.leads(last_analyzed_at DESC);

-- Step 4: Refresh PostgREST schema cache (if using PostgREST)
-- Note: This may not work in all Supabase setups, but won't cause errors if not supported
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Sent schema reload notification to PostgREST';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not notify PostgREST (this is OK if not using PostgREST)';
END $$;

-- Step 5: Verify migration
DO $$
DECLARE
  classification_exists BOOLEAN;
  min_exists BOOLEAN;
  max_exists BOOLEAN;
  value_exists BOOLEAN;
  analyzed_at_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'classification'
  ) INTO classification_exists;
  
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'estimated_price_min'
  ) INTO min_exists;
  
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'estimated_price_max'
  ) INTO max_exists;
  
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'pipeline_value'
  ) INTO value_exists;
  
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'last_analyzed_at'
  ) INTO analyzed_at_exists;
  
  IF classification_exists AND min_exists AND max_exists AND value_exists AND analyzed_at_exists THEN
    RAISE NOTICE '✓ Migration completed successfully: all columns added';
  ELSE
    RAISE WARNING 'Migration may not have completed fully. Please verify manually.';
    RAISE NOTICE 'classification: %, estimated_price_min: %, estimated_price_max: %, pipeline_value: %, last_analyzed_at: %', 
      classification_exists, min_exists, max_exists, value_exists, analyzed_at_exists;
  END IF;
END $$;


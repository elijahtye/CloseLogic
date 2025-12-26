-- CloseLogic Onboarding Flag Migration
-- Adds onboarding_completed and onboarding_completed_at columns to profiles table
-- Ensures every user completes onboarding exactly once

-- Add onboarding_completed column (NOT NULL with default for existing rows)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Add onboarding_completed_at column (nullable timestamp)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Create index for faster queries on onboarding status
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed 
ON public.profiles(onboarding_completed) 
WHERE onboarding_completed = FALSE;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.onboarding_completed IS 'Flag indicating if user has completed onboarding. Must be true to access dashboard.';
COMMENT ON COLUMN public.profiles.onboarding_completed_at IS 'Timestamp when user completed onboarding.';


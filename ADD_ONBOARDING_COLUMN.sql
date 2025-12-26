-- Quick Migration: Add onboarding_completed column to profiles table
-- Run this in Supabase SQL Editor if you get "Could not find the 'onboarding_completed' column" error

-- Add onboarding_completed column if it doesn't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Add onboarding_completed_at column if it doesn't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Create index for faster queries on onboarding status
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed 
ON public.profiles(onboarding_completed) 
WHERE onboarding_completed = FALSE;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.onboarding_completed IS 'Flag indicating if user has completed onboarding. Must be true to access dashboard.';
COMMENT ON COLUMN public.profiles.onboarding_completed_at IS 'Timestamp when user completed onboarding.';


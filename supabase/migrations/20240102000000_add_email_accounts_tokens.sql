-- Migration: Add OAuth token columns to email_accounts table
-- This migration adds columns for storing Gmail OAuth tokens securely

-- Step 1: Add token columns if they do not already exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'access_token') THEN
        ALTER TABLE public.email_accounts ADD COLUMN access_token TEXT;
        RAISE NOTICE 'Added access_token column to public.email_accounts';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'refresh_token') THEN
        ALTER TABLE public.email_accounts ADD COLUMN refresh_token TEXT;
        RAISE NOTICE 'Added refresh_token column to public.email_accounts';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'expires_at') THEN
        ALTER TABLE public.email_accounts ADD COLUMN expires_at TIMESTAMPTZ;
        RAISE NOTICE 'Added expires_at column to public.email_accounts';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'token_scope') THEN
        ALTER TABLE public.email_accounts ADD COLUMN token_scope TEXT;
        RAISE NOTICE 'Added token_scope column to public.email_accounts';
    END IF;
END $$;

-- Step 2: Add unique constraint on (user_id, provider) if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'email_accounts_user_provider_unique'
    ) THEN
        ALTER TABLE public.email_accounts 
        ADD CONSTRAINT email_accounts_user_provider_unique 
        UNIQUE (user_id, provider);
        RAISE NOTICE 'Added unique constraint on (user_id, provider)';
    END IF;
END $$;

-- Step 3: Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verification
DO $$
DECLARE
    col_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'email_accounts'
        AND column_name IN ('access_token', 'refresh_token', 'expires_at', 'token_scope')
    ) INTO col_exists;

    IF col_exists THEN
        RAISE NOTICE '✓ All token columns verified to exist.';
    ELSE
        RAISE WARNING 'Some token columns might be missing. Please check manually.';
    END IF;
END $$;


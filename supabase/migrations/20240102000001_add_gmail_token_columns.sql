-- Migration: Add Gmail OAuth token columns to email_accounts table
-- Adds: refresh_token, access_token, token_expires_at, scope, connected_at

DO $$
BEGIN
    -- Add refresh_token
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'refresh_token') THEN
        ALTER TABLE public.email_accounts ADD COLUMN refresh_token TEXT;
        RAISE NOTICE 'Added refresh_token column';
    END IF;

    -- Add access_token
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'access_token') THEN
        ALTER TABLE public.email_accounts ADD COLUMN access_token TEXT;
        RAISE NOTICE 'Added access_token column';
    END IF;

    -- Add token_expires_at (rename from expires_at if exists)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'expires_at') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'token_expires_at') THEN
            ALTER TABLE public.email_accounts RENAME COLUMN expires_at TO token_expires_at;
            RAISE NOTICE 'Renamed expires_at to token_expires_at';
        END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'token_expires_at') THEN
        ALTER TABLE public.email_accounts ADD COLUMN token_expires_at TIMESTAMPTZ;
        RAISE NOTICE 'Added token_expires_at column';
    END IF;

    -- Add scope (rename from token_scope if exists)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'token_scope') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'scope') THEN
            ALTER TABLE public.email_accounts RENAME COLUMN token_scope TO scope;
            RAISE NOTICE 'Renamed token_scope to scope';
        END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'scope') THEN
        ALTER TABLE public.email_accounts ADD COLUMN scope TEXT;
        RAISE NOTICE 'Added scope column';
    END IF;

    -- Add connected_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts' AND column_name = 'connected_at') THEN
        ALTER TABLE public.email_accounts ADD COLUMN connected_at TIMESTAMPTZ;
        RAISE NOTICE 'Added connected_at column';
    END IF;
END $$;

-- Ensure unique constraint on (user_id, provider)
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

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verification
DO $$
DECLARE
    cols_exist BOOLEAN;
BEGIN
    SELECT COUNT(*) = 5 INTO cols_exist
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'email_accounts'
    AND column_name IN ('refresh_token', 'access_token', 'token_expires_at', 'scope', 'connected_at');

    IF cols_exist THEN
        RAISE NOTICE '✓ All Gmail token columns verified.';
    ELSE
        RAISE WARNING 'Some columns might be missing. Check manually.';
    END IF;
END $$;


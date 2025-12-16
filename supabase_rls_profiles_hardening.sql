-- CloseLogic Profiles RLS Hardening Patch
-- Tightens profiles policies for launch safety
-- Run this after supabase_rls_production_fix.sql and supabase_rls_security_patch.sql

-- ============================================================================
-- 1) Update profiles SELECT policy - add TO authenticated
-- ============================================================================

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;

CREATE POLICY "profiles_select_own" ON profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- ============================================================================
-- 2) Update profiles UPDATE policy - add TO authenticated and ensure WITH CHECK
-- ============================================================================

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ============================================================================
-- 3) Remove client-side INSERT capability for profiles
-- ============================================================================

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;

-- ============================================================================
-- Profiles Hardening Complete
-- ============================================================================
-- Authenticated users can SELECT/UPDATE only their own profile
-- No direct INSERT into profiles from clients (profiles created via trigger)
-- Signup still creates profiles automatically via handle_new_user() trigger


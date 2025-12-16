-- CloseLogic RLS Security Patch
-- Fixes security gaps in production RLS policies
-- Run this after supabase_rls_production_fix.sql

-- ============================================================================
-- 1) Fix profiles UPDATE policy - ensure both USING and WITH CHECK
-- ============================================================================

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE 
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ============================================================================
-- 2) Fix messages policy - require user_id = auth.uid() AND lead ownership
-- ============================================================================

DROP POLICY IF EXISTS "messages_access_own_leads" ON messages;

CREATE POLICY "messages_access_own_leads" ON messages
    FOR ALL 
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = messages.lead_id
            AND leads.user_id = auth.uid()
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = messages.lead_id
            AND leads.user_id = auth.uid()
        )
    );

-- ============================================================================
-- 3) Fix lead_scores policy - require user_id = auth.uid() AND lead ownership
-- ============================================================================

DROP POLICY IF EXISTS "lead_scores_access_own_leads" ON lead_scores;

CREATE POLICY "lead_scores_access_own_leads" ON lead_scores
    FOR ALL 
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = lead_scores.lead_id
            AND leads.user_id = auth.uid()
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = lead_scores.lead_id
            AND leads.user_id = auth.uid()
        )
    );

-- ============================================================================
-- 4) Harden handle_new_user trigger function - set safe search_path
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Security Patch Complete
-- ============================================================================
-- All policies now enforce proper ownership checks
-- Trigger function has safe search_path set


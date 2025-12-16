-- CloseLogic Production RLS Fix Migration
-- Removes dev seed data and applies production-ready RLS policies
-- Run this script in Supabase SQL Editor

-- ============================================================================
-- PART A: Clean up dev seed data that violates FK constraints
-- ============================================================================

-- Define the seed profile ID that needs to be removed
DO $$
DECLARE
    seed_profile_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
    -- Step 1: Delete messages linked to leads owned by seed profile
    DELETE FROM messages
    WHERE user_id = seed_profile_id
       OR lead_id IN (SELECT id FROM leads WHERE user_id = seed_profile_id);
    
    -- Step 2: Delete lead_scores linked to leads owned by seed profile
    DELETE FROM lead_scores
    WHERE user_id = seed_profile_id
       OR lead_id IN (SELECT id FROM leads WHERE user_id = seed_profile_id);
    
    -- Step 3: Delete action_items linked to seed profile or its leads
    DELETE FROM action_items
    WHERE user_id = seed_profile_id
       OR (lead_id IS NOT NULL AND lead_id IN (SELECT id FROM leads WHERE user_id = seed_profile_id));
    
    -- Step 4: Delete leads owned by seed profile
    DELETE FROM leads
    WHERE user_id = seed_profile_id;
    
    -- Step 5: Delete email_accounts linked to seed profile
    DELETE FROM email_accounts
    WHERE user_id = seed_profile_id;
    
    -- Step 6: Delete feedback linked to seed profile
    DELETE FROM feedback
    WHERE user_id = seed_profile_id;
    
    -- Step 7: Finally, delete the seed profile itself
    DELETE FROM profiles
    WHERE id = seed_profile_id;
    
    RAISE NOTICE 'Cleaned up seed data for profile %', seed_profile_id;
END $$;

-- ============================================================================
-- PART B: Apply production changes
-- ============================================================================

-- B1: Drop default on profiles.id (it will be set by auth.users.id)
ALTER TABLE profiles ALTER COLUMN id DROP DEFAULT;

-- B2: Add FK constraint profiles.id -> auth.users.id
-- Drop existing constraint if it exists (idempotent)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_id_fkey_auth_users'
    ) THEN
        ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey_auth_users;
    END IF;
END $$;

-- Add the FK constraint
ALTER TABLE profiles
ADD CONSTRAINT profiles_id_fkey_auth_users
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- B3: Create trigger function to auto-create profile on new auth user insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- B4: Enable RLS and FORCE it on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE ROW LEVEL SECURITY;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

ALTER TABLE lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scores FORCE ROW LEVEL SECURITY;

ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items FORCE ROW LEVEL SECURITY;

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback FORCE ROW LEVEL SECURITY;

-- B5: Drop all Dev:* allow-all policies (idempotent)
DROP POLICY IF EXISTS "Dev: Allow all on profiles" ON profiles;
DROP POLICY IF EXISTS "Dev: Allow all on email_accounts" ON email_accounts;
DROP POLICY IF EXISTS "Dev: Allow all on leads" ON leads;
DROP POLICY IF EXISTS "Dev: Allow all on messages" ON messages;
DROP POLICY IF EXISTS "Dev: Allow all on lead_scores" ON lead_scores;
DROP POLICY IF EXISTS "Dev: Allow all on action_items" ON action_items;
DROP POLICY IF EXISTS "Dev: Allow all on feedback" ON feedback;

-- B6: Create production RLS policies using auth.uid()

-- Profiles: select/update/insert only where id = auth.uid()
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
    FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
    FOR INSERT WITH CHECK (id = auth.uid());

-- Email Accounts: all only where user_id = auth.uid()
DROP POLICY IF EXISTS "email_accounts_all_own" ON email_accounts;
CREATE POLICY "email_accounts_all_own" ON email_accounts
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Leads: all only where user_id = auth.uid()
DROP POLICY IF EXISTS "leads_all_own" ON leads;
CREATE POLICY "leads_all_own" ON leads
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Messages: access only if linked lead belongs to auth.uid()
DROP POLICY IF EXISTS "messages_access_own_leads" ON messages;
CREATE POLICY "messages_access_own_leads" ON messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = messages.lead_id
            AND leads.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = messages.lead_id
            AND leads.user_id = auth.uid()
        )
    );

-- Lead Scores: access only if linked lead belongs to auth.uid()
DROP POLICY IF EXISTS "lead_scores_access_own_leads" ON lead_scores;
CREATE POLICY "lead_scores_access_own_leads" ON lead_scores
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = lead_scores.lead_id
            AND leads.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = lead_scores.lead_id
            AND leads.user_id = auth.uid()
        )
    );

-- Action Items: access only where user_id = auth.uid() and if lead_id exists it must belong to auth.uid()
DROP POLICY IF EXISTS "action_items_all_own" ON action_items;
CREATE POLICY "action_items_all_own" ON action_items
    FOR ALL USING (
        user_id = auth.uid()
        AND (
            lead_id IS NULL
            OR EXISTS (
                SELECT 1 FROM leads
                WHERE leads.id = action_items.lead_id
                AND leads.user_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND (
            lead_id IS NULL
            OR EXISTS (
                SELECT 1 FROM leads
                WHERE leads.id = action_items.lead_id
                AND leads.user_id = auth.uid()
            )
        )
    );

-- Feedback: access only where user_id = auth.uid()
DROP POLICY IF EXISTS "feedback_all_own" ON feedback;
CREATE POLICY "feedback_all_own" ON feedback
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- All dev seed data has been removed
-- FK constraint profiles.id -> auth.users.id has been added
-- Auto-profile creation trigger is active
-- RLS is enabled and forced on all tables
-- Production RLS policies are in place using auth.uid()


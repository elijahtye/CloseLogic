-- CloseLogic Supabase Schema
-- Production-ready Postgres schema with RLS, indexes, and triggers

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- A) PROFILES TABLE
-- ============================================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    lead_volume TEXT CHECK (lead_volume IN ('0-25', '25-100', '100-250', '250+')),
    primary_goal TEXT CHECK (primary_goal IN ('closing-more-deals', 'responding-faster', 'prioritizing-leads', 'reducing-overwhelm')),
    communication_style TEXT CHECK (communication_style IN ('friendly-conversational', 'professional-direct', 'warm-supportive', 'short-efficient')),
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'agent', 'pro')),
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    onboarding_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_user_id ON profiles(id);
CREATE INDEX idx_profiles_onboarding_completed ON profiles(onboarding_completed) WHERE onboarding_completed = FALSE;

-- ============================================================================
-- B) EMAIL ACCOUNTS TABLE
-- ============================================================================
CREATE TABLE email_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider TEXT DEFAULT 'gmail' CHECK (provider IN ('gmail')),
    status TEXT DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error')),
    email_address TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_accounts_user_id ON email_accounts(user_id);
CREATE INDEX idx_email_accounts_status ON email_accounts(status);

-- ============================================================================
-- C) LEADS TABLE
-- ============================================================================
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
    lead_name TEXT,
    lead_email TEXT NOT NULL,
    source TEXT, -- 'zillow', 'realtor', 'referral', 'website', etc.
    score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
    confidence TEXT DEFAULT 'low' CHECK (confidence IN ('low', 'medium', 'high')),
    classification TEXT DEFAULT 'cold' CHECK (classification IN ('cold', 'warm', 'hot')),
    needs_followup BOOLEAN DEFAULT FALSE,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, lead_email)
);

CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_score ON leads(score);
CREATE INDEX idx_leads_needs_followup ON leads(needs_followup) WHERE needs_followup = TRUE;
CREATE INDEX idx_leads_last_message_at ON leads(last_message_at DESC);
CREATE INDEX idx_leads_user_score ON leads(user_id, score DESC);

-- ============================================================================
-- D) MESSAGES TABLE
-- ============================================================================
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    subject TEXT,
    body TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_lead_id ON messages(lead_id);
CREATE INDEX idx_messages_lead_sent_at ON messages(lead_id, sent_at DESC);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at DESC);

-- ============================================================================
-- E) LEAD SCORES TABLE (History)
-- ============================================================================
CREATE TABLE lead_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    deal_probability INTEGER NOT NULL CHECK (deal_probability >= 0 AND deal_probability <= 100),
    confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
    classification TEXT NOT NULL CHECK (classification IN ('cold', 'warm', 'hot')),
    reason TEXT NOT NULL,
    recommended_actions JSONB DEFAULT '[]'::jsonb,
    model_version TEXT DEFAULT 'rules_v1',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lead_scores_lead_id ON lead_scores(lead_id);
CREATE INDEX idx_lead_scores_created_at ON lead_scores(created_at DESC);
CREATE INDEX idx_lead_scores_lead_created ON lead_scores(lead_id, created_at DESC);

-- ============================================================================
-- F) ACTION ITEMS TABLE
-- ============================================================================
CREATE TABLE action_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_action_items_user_id ON action_items(user_id);
CREATE INDEX idx_action_items_lead_id ON action_items(lead_id);
CREATE INDEX idx_action_items_status ON action_items(status) WHERE status = 'pending';
CREATE INDEX idx_action_items_user_status ON action_items(user_id, status) WHERE status = 'pending';

-- ============================================================================
-- G) FEEDBACK TABLE
-- ============================================================================
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    page TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_user_id ON feedback(user_id);
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);

-- ============================================================================
-- TRIGGERS: Auto-update updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_accounts_updated_at BEFORE UPDATE ON email_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_action_items_updated_at BEFORE UPDATE ON action_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- DEV-FRIENDLY POLICIES: Allow all operations for now
-- TODO: Replace with proper auth-based policies when Supabase Auth is integrated
-- Example: WHERE auth.uid() = user_id

-- Profiles: Allow all for dev
CREATE POLICY "Dev: Allow all on profiles" ON profiles
    FOR ALL USING (true) WITH CHECK (true);

-- Email Accounts: Allow all for dev
CREATE POLICY "Dev: Allow all on email_accounts" ON email_accounts
    FOR ALL USING (true) WITH CHECK (true);

-- Leads: Allow all for dev
CREATE POLICY "Dev: Allow all on leads" ON leads
    FOR ALL USING (true) WITH CHECK (true);

-- Messages: Allow all for dev
CREATE POLICY "Dev: Allow all on messages" ON messages
    FOR ALL USING (true) WITH CHECK (true);

-- Lead Scores: Allow all for dev
CREATE POLICY "Dev: Allow all on lead_scores" ON lead_scores
    FOR ALL USING (true) WITH CHECK (true);

-- Action Items: Allow all for dev
CREATE POLICY "Dev: Allow all on action_items" ON action_items
    FOR ALL USING (true) WITH CHECK (true);

-- Feedback: Allow all for dev
CREATE POLICY "Dev: Allow all on feedback" ON feedback
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- SEED DATA (Optional - for testing)
-- ============================================================================

-- Insert a test profile
INSERT INTO profiles (id, email, full_name, lead_volume, primary_goal, communication_style, plan)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'test@closelogic.com', 'Test Agent', '25-100', 'closing-more-deals', 'professional-direct', 'agent')
ON CONFLICT (email) DO NOTHING;

-- Insert test email account
INSERT INTO email_accounts (id, user_id, provider, status, email_address, last_sync_at)
VALUES 
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'gmail', 'connected', 'test@closelogic.com', NOW())
ON CONFLICT DO NOTHING;

-- Insert test leads
INSERT INTO leads (id, user_id, email_account_id, lead_name, lead_email, source, score, confidence, needs_followup, last_message_at)
VALUES 
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Sarah Johnson', 'sarah.johnson@email.com', 'website', 87, 'high', false, NOW() - INTERVAL '2 hours'),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Michael Chen', 'mchen@email.com', 'zillow', 62, 'medium', true, NOW() - INTERVAL '5 hours'),
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Emily Rodriguez', 'emily.r@email.com', 'referral', 94, 'high', false, NOW() - INTERVAL '30 minutes')
ON CONFLICT (user_id, lead_email) DO NOTHING;

-- Insert test messages
INSERT INTO messages (lead_id, user_id, direction, subject, body, sent_at)
VALUES 
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'inbound', 'Property Inquiry', 'Thanks for the info! When can we schedule a viewing?', NOW() - INTERVAL '2 hours'),
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'outbound', 'Re: Property Inquiry', 'Hi Sarah! I''d be happy to help you find your perfect home. What type of property are you looking for?', NOW() - INTERVAL '3 hours'),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'inbound', 'More Details', 'Can you send me more details about the property?', NOW() - INTERVAL '5 hours'),
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'inbound', 'Ready to Move Forward', 'Perfect! Let''s move forward with the offer.', NOW() - INTERVAL '30 minutes');

-- Insert test lead scores
INSERT INTO lead_scores (lead_id, user_id, deal_probability, confidence, reason, recommended_actions, model_version)
VALUES 
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 87, 'high', 'High intent score due to asking about scheduling a viewing, fast response time (2 hours), and expressing specific interest in property details.', '["Respond within the next hour to maintain momentum", "Suggest 2-3 specific viewing times", "Send property details and neighborhood information"]'::jsonb, 'rules_v1'),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 62, 'medium', 'Medium score indicates interest but needs more engagement. Asking for details shows genuine interest, but response time could be faster.', '["Send comprehensive property details immediately", "Follow up with a phone call to gauge interest level", "Ask qualifying questions about timeline and financing"]'::jsonb, 'rules_v1'),
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 94, 'high', 'Very high intent score. Lead is ready to make an offer, showing strong buying intent and urgency.', '["Respond immediately - this is a hot lead", "Prepare offer documents and next steps", "Schedule closing timeline discussion"]'::jsonb, 'rules_v1');


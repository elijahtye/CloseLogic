# Supabase Migrations

This directory contains SQL migration files for the CloseLogic database schema.

## Running Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the migration file you want to run
4. Copy and paste the SQL into the editor
5. Click **Run** to execute

### Option 2: Supabase CLI

If you have Supabase CLI installed:

```bash
supabase db push
```

## Migration Files

### `20240101000000_add_lead_summary_fields.sql`

Adds the following columns to `public.leads`:
- `classification` (TEXT) - Lead classification: 'cold', 'warm', or 'hot'
- `estimated_price_min` (BIGINT) - Minimum estimated price
- `estimated_price_max` (BIGINT) - Maximum estimated price  
- `pipeline_value` (BIGINT) - Calculated pipeline value
- `last_analyzed_at` (TIMESTAMPTZ) - Timestamp of last analysis

Also adds:
- CHECK constraint on `classification` column
- Indexes on `classification` and `last_analyzed_at`

**Run this migration before using `/api/analyze-lead` endpoint.**

## Verification

After running a migration, verify it succeeded:

```sql
-- Check if columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'leads' 
AND column_name IN ('classification', 'estimated_price_min', 'estimated_price_max', 'pipeline_value', 'last_analyzed_at');
```


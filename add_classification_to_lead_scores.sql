-- Migration: Add classification column to lead_scores table
-- This migration adds the missing classification column that was defined in the schema
-- but may not exist in the actual database due to schema drift or manual table creation

-- Step 1: Check if column exists, and add it if it doesn't (with NULL allowed temporarily)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'lead_scores' 
        AND column_name = 'classification'
    ) THEN
        -- Add column as nullable first (so we can populate existing rows)
        ALTER TABLE lead_scores 
        ADD COLUMN classification TEXT;
        
        RAISE NOTICE 'Added classification column to lead_scores table';
    ELSE
        RAISE NOTICE 'classification column already exists in lead_scores table';
    END IF;
END $$;

-- Step 2: Populate existing rows with classification based on deal_probability
-- This ensures all existing data has proper classification values
UPDATE lead_scores
SET classification = CASE
    WHEN deal_probability >= 70 THEN 'hot'
    WHEN deal_probability >= 40 THEN 'warm'
    ELSE 'cold'
END
WHERE classification IS NULL;

-- Step 3: Add CHECK constraint to ensure only valid values
DO $$
BEGIN
    -- Drop constraint if it exists (idempotent)
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'lead_scores' 
        AND constraint_name = 'lead_scores_classification_check'
    ) THEN
        ALTER TABLE lead_scores 
        DROP CONSTRAINT lead_scores_classification_check;
    END IF;
    
    -- Add CHECK constraint
    ALTER TABLE lead_scores 
    ADD CONSTRAINT lead_scores_classification_check 
    CHECK (classification IN ('cold', 'warm', 'hot'));
    
    RAISE NOTICE 'Added CHECK constraint for classification column';
END $$;

-- Step 4: Make column NOT NULL (now that all rows have values)
DO $$
BEGIN
    -- Check if column is already NOT NULL
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'lead_scores' 
        AND column_name = 'classification'
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE lead_scores 
        ALTER COLUMN classification SET NOT NULL;
        
        RAISE NOTICE 'Set classification column to NOT NULL';
    ELSE
        RAISE NOTICE 'classification column is already NOT NULL';
    END IF;
END $$;

-- Step 5: Add default value for future inserts (optional, but good practice)
DO $$
BEGIN
    -- Check if default exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'lead_scores' 
        AND column_name = 'classification'
        AND column_default IS NOT NULL
    ) THEN
        -- Note: We don't set a default because classification should always be computed
        -- from deal_probability, not set to a static value
        -- But if you want a safety default, uncomment the line below:
        -- ALTER TABLE lead_scores ALTER COLUMN classification SET DEFAULT 'cold';
        
        RAISE NOTICE 'No default set for classification (computed from deal_probability)';
    END IF;
END $$;

-- Step 6: Create index on classification if it doesn't exist (for performance)
CREATE INDEX IF NOT EXISTS idx_lead_scores_classification 
ON lead_scores(classification);

-- Step 7: Verify the migration
DO $$
DECLARE
    col_exists BOOLEAN;
    constraint_exists BOOLEAN;
    not_null_check BOOLEAN;
BEGIN
    -- Check column exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'lead_scores' 
        AND column_name = 'classification'
    ) INTO col_exists;
    
    -- Check constraint exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'lead_scores' 
        AND constraint_name = 'lead_scores_classification_check'
    ) INTO constraint_exists;
    
    -- Check NOT NULL
    SELECT (is_nullable = 'NO')
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_scores' 
    AND column_name = 'classification'
    INTO not_null_check;
    
    IF col_exists AND constraint_exists AND not_null_check THEN
        RAISE NOTICE '✓ Migration completed successfully: classification column added with proper constraints';
    ELSE
        RAISE WARNING 'Migration may not have completed fully. Please verify manually.';
        RAISE NOTICE 'Column exists: %, Constraint exists: %, NOT NULL: %', col_exists, constraint_exists, not_null_check;
    END IF;
END $$;

-- Summary comment for reference:
-- This migration ensures the lead_scores table has a classification column that:
-- 1. Is NOT NULL
-- 2. Only accepts values: 'cold', 'warm', 'hot'
-- 3. Is automatically populated for existing rows based on deal_probability
-- 4. Has an index for query performance
-- 5. Matches the schema definition in supabase_schema.sql


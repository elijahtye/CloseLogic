-- Migration: Add pipeline value estimation columns to leads table
-- Conditional AI pipeline value estimation feature
-- Run this migration if columns are missing

-- Step 1: Add nullable pipeline value fields
DO $$
BEGIN
    -- Add estimated_price_min
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'estimated_price_min'
    ) THEN
        ALTER TABLE leads 
        ADD COLUMN estimated_price_min INTEGER;
        
        RAISE NOTICE 'Added estimated_price_min column to leads table';
    ELSE
        RAISE NOTICE 'estimated_price_min column already exists in leads table';
    END IF;
    
    -- Add estimated_price_max
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'estimated_price_max'
    ) THEN
        ALTER TABLE leads 
        ADD COLUMN estimated_price_max INTEGER;
        
        RAISE NOTICE 'Added estimated_price_max column to leads table';
    ELSE
        RAISE NOTICE 'estimated_price_max column already exists in leads table';
    END IF;
    
    -- Add pipeline_value
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'pipeline_value'
    ) THEN
        ALTER TABLE leads 
        ADD COLUMN pipeline_value INTEGER;
        
        RAISE NOTICE 'Added pipeline_value column to leads table';
    ELSE
        RAISE NOTICE 'pipeline_value column already exists in leads table';
    END IF;
    
    -- Add pricing_confidence
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'pricing_confidence'
    ) THEN
        ALTER TABLE leads 
        ADD COLUMN pricing_confidence TEXT CHECK (pricing_confidence IS NULL OR pricing_confidence IN ('low', 'medium', 'high'));
        
        RAISE NOTICE 'Added pricing_confidence column to leads table';
    ELSE
        RAISE NOTICE 'pricing_confidence column already exists in leads table';
    END IF;
    
    -- Add pricing_reason
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'pricing_reason'
    ) THEN
        ALTER TABLE leads 
        ADD COLUMN pricing_reason TEXT;
        
        RAISE NOTICE 'Added pricing_reason column to leads table';
    ELSE
        RAISE NOTICE 'pricing_reason column already exists in leads table';
    END IF;
END $$;

-- Step 2: Add CHECK constraints for price ranges (if values exist, they must be positive)
DO $$
BEGIN
    -- estimated_price_min constraint
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'leads' 
        AND constraint_name = 'leads_estimated_price_min_check'
    ) THEN
        ALTER TABLE leads 
        ADD CONSTRAINT leads_estimated_price_min_check 
        CHECK (estimated_price_min IS NULL OR estimated_price_min > 0);
        
        RAISE NOTICE 'Added CHECK constraint for estimated_price_min';
    END IF;
    
    -- estimated_price_max constraint
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'leads' 
        AND constraint_name = 'leads_estimated_price_max_check'
    ) THEN
        ALTER TABLE leads 
        ADD CONSTRAINT leads_estimated_price_max_check 
        CHECK (estimated_price_max IS NULL OR estimated_price_max > 0);
        
        RAISE NOTICE 'Added CHECK constraint for estimated_price_max';
    END IF;
    
    -- pipeline_value constraint
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'leads' 
        AND constraint_name = 'leads_pipeline_value_check'
    ) THEN
        ALTER TABLE leads 
        ADD CONSTRAINT leads_pipeline_value_check 
        CHECK (pipeline_value IS NULL OR pipeline_value >= 0);
        
        RAISE NOTICE 'Added CHECK constraint for pipeline_value';
    END IF;
    
    -- Ensure max >= min if both exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'leads' 
        AND constraint_name = 'leads_price_range_check'
    ) THEN
        ALTER TABLE leads 
        ADD CONSTRAINT leads_price_range_check 
        CHECK (
            estimated_price_min IS NULL 
            OR estimated_price_max IS NULL 
            OR estimated_price_max >= estimated_price_min
        );
        
        RAISE NOTICE 'Added CHECK constraint for price range validation';
    END IF;
END $$;

-- Step 3: Create indexes for pipeline value queries
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_value 
ON leads(pipeline_value) 
WHERE pipeline_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_estimated_price_range 
ON leads(estimated_price_min, estimated_price_max) 
WHERE estimated_price_min IS NOT NULL AND estimated_price_max IS NOT NULL;

-- Step 4: Verify migration
DO $$
DECLARE
    min_exists BOOLEAN;
    max_exists BOOLEAN;
    value_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'estimated_price_min'
    ) INTO min_exists;
    
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'estimated_price_max'
    ) INTO max_exists;
    
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'pipeline_value'
    ) INTO value_exists;
    
    IF min_exists AND max_exists AND value_exists THEN
        RAISE NOTICE '✓ Migration completed successfully: pipeline value fields added';
    ELSE
        RAISE WARNING 'Migration may not have completed fully. Please verify manually.';
        RAISE NOTICE 'estimated_price_min: %, estimated_price_max: %, pipeline_value: %', min_exists, max_exists, value_exists;
    END IF;
END $$;


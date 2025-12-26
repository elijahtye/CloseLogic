-- Migration: Add gmail_message_id to messages for Gmail sync dedupe
-- Adds:
--  - public.messages.gmail_message_id (text)
--  - unique index on (user_id, gmail_message_id) when gmail_message_id is not null

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'gmail_message_id'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN gmail_message_id TEXT;
    RAISE NOTICE 'Added gmail_message_id column to public.messages';
  END IF;
END $$;

-- Unique index for idempotent sync (allows multiple NULLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'messages_user_gmail_message_id_unique'
  ) THEN
    CREATE UNIQUE INDEX messages_user_gmail_message_id_unique
      ON public.messages (user_id, gmail_message_id)
      WHERE gmail_message_id IS NOT NULL;
    RAISE NOTICE 'Created unique index messages_user_gmail_message_id_unique';
  END IF;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';



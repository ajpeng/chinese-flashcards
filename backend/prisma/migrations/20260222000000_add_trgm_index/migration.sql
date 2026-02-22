-- Enable pg_trgm extension for efficient substring/trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop the existing btree index (useless for leading-wildcard LIKE)
DROP INDEX IF EXISTS "ExampleSentence_simplified_idx";

-- Create a GIN trigram index — efficient for LIKE '%word%' on any substring
CREATE INDEX "ExampleSentence_simplified_trgm_idx"
  ON "ExampleSentence" USING GIN (simplified gin_trgm_ops);

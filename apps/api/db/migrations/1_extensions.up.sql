-- Extensions used across the schema.
--   pgcrypto: gen_random_uuid() for text/uuid primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =================================================â•
-- Publio - Optional Verification & Seed Script
-- File: 005_seed.sql
-- =================================================â•

-- Run this query to verify that all Publio tables and triggers have been created properly:
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'social_accounts', 'posts', 'post_platforms', 'activity_logs');

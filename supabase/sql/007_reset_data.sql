-- =================================================
-- Publio - Clean Test Data / Fresh Start Script
-- File: 007_reset_data.sql
-- =================================================

-- 1. Reset Social Accounts (Deletes old/failed OAuth connections)
TRUNCATE TABLE public.social_accounts CASCADE;

-- 2. Reset Post Platforms & Posts (Deletes test posts)
TRUNCATE TABLE public.post_platforms CASCADE;
TRUNCATE TABLE public.posts CASCADE;

-- 3. Reset Activity Logs
TRUNCATE TABLE public.activity_logs CASCADE;

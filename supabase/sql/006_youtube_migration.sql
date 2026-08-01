-- ==================================================
-- Publio - YouTube & Platform Constraints Migration
-- File: 006_youtube_migration.sql
-- ==================================================

-- Update CHECK constraints to allow 'youtube' and 'tiktok'
ALTER TABLE public.social_accounts DROP CONSTRAINT IF EXISTS social_accounts_platform_check;
ALTER TABLE public.social_accounts ADD CONSTRAINT social_accounts_platform_check 
    CHECK (platform IN ('telegram', 'facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok'));

ALTER TABLE public.post_platforms DROP CONSTRAINT IF EXISTS post_platforms_platform_check;
ALTER TABLE public.post_platforms ADD CONSTRAINT post_platforms_platform_check 
    CHECK (platform IN ('telegram', 'facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok'));

ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_platform_check;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_platform_check 
    CHECK (platform IN ('telegram', 'facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'system'));

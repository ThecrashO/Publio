-- ==================================================
-- Publio - Master Database Rebuild Script
-- File: 000_master_schema_reset.sql
-- Description: Complete wipe and fresh setup of all Publio tables,
-- RLS security policies, triggers, and storage bucket setup.
-- ==================================================

-- --------------------------------------------------
-- 1. CLEAN DROP OF EXISTING TABLES & TRIGGERS
-- --------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;

DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.post_platforms CASCADE;
DROP TABLE IF EXISTS public.posts CASCADE;
DROP TABLE IF EXISTS public.social_accounts CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------
-- 2. CREATE TABLES
-- --------------------------------------------------

-- A. PROFILES TABLE
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- B. SOCIAL ACCOUNTS TABLE
CREATE TABLE public.social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('telegram', 'facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok')),
    account_name TEXT,
    account_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_platform UNIQUE (user_id, platform)
);

-- C. POSTS TABLE
CREATE TABLE public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    caption TEXT NOT NULL,
    image_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'publishing', 'published', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- D. POST PLATFORMS TABLE
CREATE TABLE public.post_platforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('telegram', 'facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
    platform_post_id TEXT,
    error_message TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_post_platform UNIQUE (post_id, platform)
);

-- E. ACTIVITY LOGS TABLE
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
    platform TEXT CHECK (platform IN ('telegram', 'facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'system')),
    action TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'info', 'warning')),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------
-- 3. INDEXES FOR HIGH PERFORMANCE
-- --------------------------------------------------
CREATE INDEX idx_posts_user_id ON public.posts(user_id);
CREATE INDEX idx_posts_status ON public.posts(status);
CREATE INDEX idx_posts_created_at ON public.posts(created_at DESC);

CREATE INDEX idx_post_platforms_post_id ON public.post_platforms(post_id);
CREATE INDEX idx_post_platforms_platform ON public.post_platforms(platform);
CREATE INDEX idx_post_platforms_status ON public.post_platforms(status);

CREATE INDEX idx_social_accounts_user_id ON public.social_accounts(user_id);
CREATE INDEX idx_social_accounts_platform ON public.social_accounts(platform);

CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- --------------------------------------------------
-- 4. AUTOMATION FUNCTIONS & TRIGGERS
-- --------------------------------------------------

-- A. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_social_accounts BEFORE UPDATE ON public.social_accounts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_posts BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_post_platforms BEFORE UPDATE ON public.post_platforms FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- B. AUTO PROFILE CREATION ON USER SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Populate profiles for existing users if any
INSERT INTO public.profiles (id, full_name)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- SOCIAL ACCOUNTS
CREATE POLICY "Users can view own social accounts" ON public.social_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own social accounts" ON public.social_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own social accounts" ON public.social_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own social accounts" ON public.social_accounts FOR DELETE USING (auth.uid() = user_id);

-- POSTS
CREATE POLICY "Users can view own posts" ON public.posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- POST PLATFORMS
CREATE POLICY "Users can view own post platforms" ON public.post_platforms FOR SELECT USING (EXISTS (SELECT 1 FROM public.posts WHERE public.posts.id = public.post_platforms.post_id AND public.posts.user_id = auth.uid()));
CREATE POLICY "Users can insert own post platforms" ON public.post_platforms FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.posts WHERE public.posts.id = public.post_platforms.post_id AND public.posts.user_id = auth.uid()));
CREATE POLICY "Users can update own post platforms" ON public.post_platforms FOR UPDATE USING (EXISTS (SELECT 1 FROM public.posts WHERE public.posts.id = public.post_platforms.post_id AND public.posts.user_id = auth.uid()));
CREATE POLICY "Users can delete own post platforms" ON public.post_platforms FOR DELETE USING (EXISTS (SELECT 1 FROM public.posts WHERE public.posts.id = public.post_platforms.post_id AND public.posts.user_id = auth.uid()));

-- ACTIVITY LOGS
CREATE POLICY "Users can view own activity logs" ON public.activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activity logs" ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- --------------------------------------------------
-- 6. STORAGE BUCKET SETUP
-- --------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'post-images',
    'post-images',
    true,
    52428800, -- 50 MB limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public Read Access for Post Images" ON storage.objects;
CREATE POLICY "Public Read Access for Post Images" ON storage.objects FOR SELECT USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "Authenticated Users Upload Post Images" ON storage.objects;
CREATE POLICY "Authenticated Users Upload Post Images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'post-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users Update Own Post Images" ON storage.objects;
CREATE POLICY "Users Update Own Post Images" ON storage.objects FOR UPDATE USING (bucket_id = 'post-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users Delete Own Post Images" ON storage.objects;
CREATE POLICY "Users Delete Own Post Images" ON storage.objects FOR DELETE USING (bucket_id = 'post-images' AND auth.role() = 'authenticated');

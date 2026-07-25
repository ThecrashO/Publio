-- =================================================═
-- PostPilot - Row Level Security (RLS) Policies
-- File: 002_rls.sql
-- =================================================═

-- 1. ENABLE RLS ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- =================================================═
-- PROFILES POLICIES
-- =================================================═

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- =================================================═
-- SOCIAL ACCOUNTS POLICIES
-- =================================================═

CREATE POLICY "Users can view own social accounts"
    ON public.social_accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own social accounts"
    ON public.social_accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own social accounts"
    ON public.social_accounts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own social accounts"
    ON public.social_accounts FOR DELETE
    USING (auth.uid() = user_id);

-- =================================================═
-- POSTS POLICIES
-- =================================================═

CREATE POLICY "Users can view own posts"
    ON public.posts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own posts"
    ON public.posts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
    ON public.posts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
    ON public.posts FOR DELETE
    USING (auth.uid() = user_id);

-- =================================================═
-- POST PLATFORMS POLICIES
-- =================================================═

CREATE POLICY "Users can view own post platforms"
    ON public.post_platforms FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.posts
            WHERE public.posts.id = public.post_platforms.post_id
            AND public.posts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own post platforms"
    ON public.post_platforms FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.posts
            WHERE public.posts.id = public.post_platforms.post_id
            AND public.posts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own post platforms"
    ON public.post_platforms FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.posts
            WHERE public.posts.id = public.post_platforms.post_id
            AND public.posts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own post platforms"
    ON public.post_platforms FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.posts
            WHERE public.posts.id = public.post_platforms.post_id
            AND public.posts.user_id = auth.uid()
        )
    );

-- =================================================═
-- ACTIVITY LOGS POLICIES
-- =================================================═

CREATE POLICY "Users can view own activity logs"
    ON public.activity_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity logs"
    ON public.activity_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

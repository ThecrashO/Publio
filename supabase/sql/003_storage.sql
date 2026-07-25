-- =================================================═
-- PostPilot - Storage Bucket & Security Policies
-- File: 003_storage.sql
-- =================================================═

-- 1. CREATE BUCKET (IF NOT EXISTS)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'post-images',
    'post-images',
    true,
    10485760, -- 10 MB limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. STORAGE ROW LEVEL SECURITY POLICIES

-- Allow public read access to post-images
CREATE POLICY "Public Read Access for Post Images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'post-images');

-- Allow authenticated users to upload to their user folder: post-images/{user_id}/*
CREATE POLICY "Authenticated Users Upload Post Images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'post-images' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow users to update their uploaded images
CREATE POLICY "Users Update Own Post Images"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'post-images' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow users to delete their uploaded images
CREATE POLICY "Users Delete Own Post Images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'post-images' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

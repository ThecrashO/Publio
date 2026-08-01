// ==================================================
// Publio - Storage File Management Helper
// File: js/storage.js
// ==================================================

const Storage = {
    BUCKET_NAME: 'post-images',
    MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10 MB limit for photos
    MAX_VIDEO_SIZE: 50 * 1024 * 1024, // 50 MB limit for videos
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
    ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mkv'],

    /**
     * Check if a file object or URL is a video
     */
    isVideo(fileOrUrl) {
        if (!fileOrUrl) return false;
        if (typeof fileOrUrl === 'string') {
            const ext = fileOrUrl.split('?')[0].split('.').pop().toLowerCase();
            return ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
        }
        if (fileOrUrl.type) {
            return fileOrUrl.type.toLowerCase().startsWith('video/');
        }
        return false;
    },

    /**
     * Validate selected image/video file
     */
    validateMedia(file) {
        if (!file) return { valid: false, message: 'No file selected.' };

        const mimeType = (file.type || '').toLowerCase();
        const isImg = this.ALLOWED_IMAGE_TYPES.includes(mimeType);
        const isVid = this.ALLOWED_VIDEO_TYPES.includes(mimeType) || mimeType.startsWith('video/');

        if (!isImg && !isVid) {
            return { 
                valid: false, 
                message: 'Invalid file format. Allowed formats: JPG, PNG, WEBP, GIF for photos, or MP4, WEBM, MOV for videos.' 
            };
        }

        if (isVid && file.size > this.MAX_VIDEO_SIZE) {
            return { valid: false, message: 'Video file size exceeds 50 MB limit. Please select a smaller video.' };
        }

        if (isImg && file.size > this.MAX_IMAGE_SIZE) {
            return { valid: false, message: 'Photo file size exceeds 10 MB limit. Please select a smaller image.' };
        }

        return { valid: true, isVideo: isVid };
    },

    /**
     * Backwards-compatible alias for validateMedia
     */
    validateImage(file) {
        return this.validateMedia(file);
    },

    /**
     * Upload post media (photo or video) to Supabase Storage under: post-images/{user_id}/{post_id}/{filename}
     */
    async uploadPostMedia(userId, postId, file) {
        if (!window.sb) throw new Error('Supabase client is not initialized.');

        const validation = this.validateMedia(file);
        if (!validation.valid) {
            throw new Error(validation.message);
        }

        // Sanitize filename and create user-scoped path
        const extension = file.name.split('.').pop();
        const cleanFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${extension}`;
        const filePath = `${userId}/${postId}/${cleanFileName}`;

        const { data, error } = await window.sb.storage
            .from(this.BUCKET_NAME)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) {
            console.error('Storage upload error:', error);
            throw new Error(`Media upload failed: ${error.message}`);
        }

        // Get public URL
        const { data: publicUrlData } = window.sb.storage
            .from(this.BUCKET_NAME)
            .getPublicUrl(filePath);

        return {
            path: filePath,
            url: publicUrlData.publicUrl,
            isVideo: validation.isVideo
        };
    },

    /**
     * Backwards-compatible alias for uploadPostMedia
     */
    async uploadPostImage(userId, postId, file) {
        return this.uploadPostMedia(userId, postId, file);
    },

    /**
     * Delete media from storage
     */
    async deletePostMedia(filePath) {
        if (!window.sb || !filePath) return;
        const { error } = await window.sb.storage
            .from(this.BUCKET_NAME)
            .remove([filePath]);
        if (error) console.error('Failed to delete media from storage:', error);
    },

    /**
     * Backwards-compatible alias for deletePostMedia
     */
    async deletePostImage(filePath) {
        return this.deletePostMedia(filePath);
    }
};

window.Storage = Storage;

// ==================================================
// Publio - Storage File Management Helper
// File: js/storage.js
// ==================================================

const Storage = {
    BUCKET_NAME: 'post-images',
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB limit
    ALLOWED_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],

    /**
     * Validate selected image file
     */
    validateImage(file) {
        if (!file) return { valid: false, message: 'No file selected.' };

        if (!this.ALLOWED_TYPES.includes(file.type.toLowerCase())) {
            return { valid: false, message: 'Invalid file format. Only JPG, JPEG, PNG, and WEBP images are allowed.' };
        }

        if (file.size > this.MAX_FILE_SIZE) {
            return { valid: false, message: 'File size exceeds 10 MB limit. Please select a smaller image.' };
        }

        return { valid: true };
    },

    /**
     * Upload post image to Supabase Storage under: post-images/{user_id}/{post_id}/{filename}
     */
    async uploadPostImage(userId, postId, file) {
        if (!window.sb) throw new Error('Supabase client is not initialized.');

        const validation = this.validateImage(file);
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
            throw new Error(`Image upload failed: ${error.message}`);
        }

        // Get public URL
        const { data: publicUrlData } = window.sb.storage
            .from(this.BUCKET_NAME)
            .getPublicUrl(filePath);

        return {
            path: filePath,
            url: publicUrlData.publicUrl
        };
    },

    /**
     * Delete image from storage
     */
    async deletePostImage(filePath) {
        if (!window.sb || !filePath) return;
        const { error } = await window.sb.storage
            .from(this.BUCKET_NAME)
            .remove([filePath]);
        if (error) console.error('Failed to delete image from storage:', error);
    }
};

window.Storage = Storage;

// ==================================================
// Publio - Post Management & Publishing Orchestrator
// File: js/posts.js
// ==================================================

const Posts = {
    /**
     * Fetch user posts with target platforms
     */
    async getUserPosts(userId, limit = 50) {
        if (!window.sb) return [];

        const { data, error } = await window.sb
            .from('posts')
            .select(`
                *,
                post_platforms (*)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching posts:', error);
            return [];
        }

        return data || [];
    },

    /**
     * Compute Dashboard Metrics
     */
    computeMetrics(posts) {
        const total = posts.length;
        let published = 0;
        let drafts = 0;
        let failed = 0;

        posts.forEach(post => {
            if (post.status === 'published') published++;
            else if (post.status === 'draft') drafts++;
            else if (post.status === 'failed') failed++;
        });

        return { total, published, drafts, failed };
    },

    /**
     * Create Post & optional platform assignments
     */
    async createPost(userId, { caption, imageFile, mediaFile, selectedPlatforms, isPublish = false }) {
        if (!window.sb) throw new Error('Supabase client is not initialized.');

        if (!caption || !caption.trim()) {
            throw new Error('Post caption is required.');
        }

        const cleanCaption = caption.trim();
        const initialStatus = isPublish ? 'publishing' : 'draft';
        const targetFile = mediaFile || imageFile;

        // 1. Insert post parent record
        const { data: postData, error: postError } = await window.sb
            .from('posts')
            .insert({
                user_id: userId,
                caption: cleanCaption,
                status: initialStatus
            })
            .select()
            .single();

        if (postError) {
            console.error('Error creating post:', postError);
            throw new Error(`Failed to save post: ${postError.message}`);
        }

        const postId = postData.id;
        let imageUrl = null;

        // 2. Handle media (image or video) upload if selected
        if (targetFile) {
            try {
                const uploadResult = await Storage.uploadPostMedia(userId, postId, targetFile);
                imageUrl = uploadResult.url;

                // Update post with image_url (used for photo or video media URL)
                await window.sb
                    .from('posts')
                    .update({ image_url: imageUrl })
                    .eq('id', postId);
                
                postData.image_url = imageUrl;
            } catch (err) {
                // Cleanup created post on upload error if needed
                await window.sb.from('posts').delete().eq('id', postId);
                throw err;
            }
        }

        // 3. Insert post_platforms records for selected platforms
        if (selectedPlatforms && selectedPlatforms.length > 0) {
            const platformRows = selectedPlatforms.map(platform => ({
                post_id: postId,
                platform: platform,
                status: isPublish ? 'pending' : 'pending'
            }));

            const { error: platformError } = await window.sb
                .from('post_platforms')
                .insert(platformRows);

            if (platformError) {
                console.error('Error inserting post_platforms:', platformError);
            }
        }

        // Log activity
        await window.sb.from('activity_logs').insert({
            user_id: userId,
            post_id: postId,
            platform: 'system',
            action: isPublish ? 'CREATE_AND_PUBLISH_POST' : 'SAVE_DRAFT_POST',
            status: 'success',
            message: `Post ${postId} created (${isPublish ? 'Publishing initiated' : 'Saved as Draft'}).`
        });

        return postData;
    },

    /**
     * Fetch single post by ID with target platforms
     */
    async getPostById(userId, postId) {
        if (!window.sb) return null;

        const { data, error } = await window.sb
            .from('posts')
            .select(`
                *,
                post_platforms (*)
            `)
            .eq('id', postId)
            .eq('user_id', userId)
            .single();

        if (error) {
            console.error('Error fetching post by ID:', error);
            return null;
        }

        return data;
    },

    /**
     * Update existing draft or post
     */
    async updatePost(userId, postId, { caption, imageFile, mediaFile, removeImage, selectedPlatforms, isPublish = false }) {
        if (!window.sb) throw new Error('Supabase client is not initialized.');

        if (!caption || !caption.trim()) {
            throw new Error('Post caption is required.');
        }

        const cleanCaption = caption.trim();
        const newStatus = isPublish ? 'publishing' : 'draft';
        const targetFile = mediaFile || imageFile;

        // Fetch current post
        const currentPost = await this.getPostById(userId, postId);
        if (!currentPost) throw new Error('Post not found.');

        let imageUrl = currentPost.image_url;

        // Handle image/media removal
        if (removeImage && imageUrl) {
            const urlParts = imageUrl.split('/post-images/');
            if (urlParts.length > 1) {
                await Storage.deletePostMedia(urlParts[1]);
            }
            imageUrl = null;
        }

        // Handle new media upload
        if (targetFile) {
            if (currentPost.image_url) {
                const urlParts = currentPost.image_url.split('/post-images/');
                if (urlParts.length > 1) {
                    await Storage.deletePostMedia(urlParts[1]);
                }
            }
            const uploadResult = await Storage.uploadPostMedia(userId, postId, targetFile);
            imageUrl = uploadResult.url;
        }

        // Update posts record
        const { data: updatedPost, error: updateError } = await window.sb
            .from('posts')
            .update({
                caption: cleanCaption,
                image_url: imageUrl,
                status: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', postId)
            .eq('user_id', userId)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating post:', updateError);
            throw new Error(`Failed to update post: ${updateError.message}`);
        }

        // Synchronize post_platforms
        if (selectedPlatforms) {
            // Delete existing platform assignments not in new selection
            await window.sb
                .from('post_platforms')
                .delete()
                .eq('post_id', postId);

            if (selectedPlatforms.length > 0) {
                const platformRows = selectedPlatforms.map(platform => ({
                    post_id: postId,
                    platform: platform,
                    status: 'pending'
                }));

                await window.sb
                    .from('post_platforms')
                    .insert(platformRows);
            }
        }

        // Log activity
        await window.sb.from('activity_logs').insert({
            user_id: userId,
            post_id: postId,
            platform: 'system',
            action: isPublish ? 'UPDATE_AND_PUBLISH_POST' : 'UPDATE_DRAFT_POST',
            status: 'success',
            message: `Post ${postId} updated (${isPublish ? 'Publishing initiated' : 'Saved as Draft'}).`
        });

        return updatedPost;
    },

    /**
     * Delete Post
     */
    async deletePost(userId, postId) {
        if (!window.sb || !postId) return;

        // Fetch post image_url if any to delete from storage
        const { data: post } = await window.sb
            .from('posts')
            .select('image_url')
            .eq('id', postId)
            .single();

        if (post && post.image_url) {
            const urlParts = post.image_url.split('/post-images/');
            if (urlParts.length > 1) {
                await Storage.deletePostMedia(urlParts[1]);
            }
        }

        const { error } = await window.sb
            .from('posts')
            .delete()
            .eq('id', postId)
            .eq('user_id', userId);

        if (error) {
            console.error('Failed to delete post:', error);
            throw new Error(error.message);
        }
    }
};

window.Posts = Posts;

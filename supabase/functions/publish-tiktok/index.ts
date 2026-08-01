import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Check if a URL or content type corresponds to a video file
 */
function isVideoUrl(urlStr: string): boolean {
    if (!urlStr) return false;
    const cleanUrl = urlStr.split('?')[0].toLowerCase();
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.3gp'];
    return videoExtensions.some(ext => cleanUrl.endsWith(ext));
}

serve(async (req) => {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 1. Validate Authorization Header & Authenticate User
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const tiktokClientKey = Deno.env.get('TIKTOK_CLIENT_KEY') ?? '';
        const tiktokClientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? '';

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 2. Parse Request Payload
        const { post_id } = await req.json();
        if (!post_id) {
            return new Response(JSON.stringify({ error: 'post_id is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 3. Retrieve TikTok Connection Credentials
        const { data: tiktokAccount, error: accError } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('platform', 'tiktok')
            .single();

        if (accError || !tiktokAccount) {
            return new Response(JSON.stringify({ error: 'TikTok account not connected. Please connect TikTok in Settings first.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        let accessToken = tiktokAccount.access_token;
        const refreshToken = tiktokAccount.refresh_token;
        const tokenExpiresAt = tiktokAccount.token_expires_at ? new Date(tiktokAccount.token_expires_at).getTime() : 0;
        const isExpired = Date.now() >= (tokenExpiresAt - 60000); // 1-minute buffer

        // 4. Refresh Token if Access Token is Expired
        if (isExpired && refreshToken && tiktokClientKey) {
            console.log('Refreshing TikTok access token...');
            const refreshRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_key: tiktokClientKey,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                })
            });

            const refreshData = await refreshRes.json();
            const newAccess = refreshData.access_token || refreshData.data?.access_token;
            if (newAccess) {
                accessToken = newAccess;
                const newExpiresIn = refreshData.expires_in || refreshData.data?.expires_in || 86400;
                const newExpiresAt = new Date(Date.now() + newExpiresIn * 1000).toISOString();

                await supabaseAdmin
                    .from('social_accounts')
                    .update({
                        access_token: accessToken,
                        token_expires_at: newExpiresAt,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', tiktokAccount.id);
            } else {
                console.warn('Failed to refresh TikTok access token:', refreshData);
            }
        }

        // 5. Retrieve Post Details
        const { data: post, error: postError } = await supabaseAdmin
            .from('posts')
            .select('*')
            .eq('id', post_id)
            .eq('user_id', user.id)
            .single();

        if (postError || !post) {
            return new Response(JSON.stringify({ error: 'Post not found or unauthorized.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Update post_platforms status to publishing
        await supabaseAdmin
            .from('post_platforms')
            .upsert({
                post_id: post_id,
                platform: 'tiktok',
                status: 'publishing',
                updated_at: new Date().toISOString()
            }, { onConflict: 'post_id, platform' });

        const mediaUrl = post.image_url || '';
        if (!mediaUrl) {
            throw new Error('TikTok publishing requires an attached photo or video file along with your caption.');
        }

        const isVideo = isVideoUrl(mediaUrl);
        let tiktokResult: any = null;
        let publishedId = '';
        let postTypeLabel = '';

        // 6. Call TikTok Content Posting API v2 for Video or Photo + Caption
        if (isVideo) {
            // ==========================================
            // VIDEO POST: TikTok Direct Post (PULL_FROM_URL)
            // ==========================================
            postTypeLabel = 'Video';

            const videoEndpoint = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
            const videoPayload = {
                post_info: {
                    title: post.caption,
                    privacy_level: 'PUBLIC_TO_EVERYONE',
                    disable_comment: false,
                    disable_duet: false,
                    disable_stitch: false
                },
                source_info: {
                    source: 'PULL_FROM_URL',
                    video_url: mediaUrl
                }
            };

            const response = await fetch(videoEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify(videoPayload)
            });

            tiktokResult = await response.json();

            if (response.ok && (tiktokResult.data?.publish_id || tiktokResult.publish_id)) {
                publishedId = tiktokResult.data?.publish_id || tiktokResult.publish_id;
            } else {
                const errDetail = tiktokResult.error?.message || tiktokResult.error?.code || tiktokResult.message || 'TikTok video post failed.';
                throw new Error(errDetail);
            }

        } else {
            // ==========================================
            // PHOTO POST: TikTok Photo Mode (Photo + Caption)
            // ==========================================
            postTypeLabel = 'Photo Mode';

            const photoEndpoint = 'https://open.tiktokapis.com/v2/post/publish/content/init/';
            const photoPayload = {
                post_info: {
                    title: post.caption,
                    privacy_level: 'PUBLIC_TO_EVERYONE',
                    disable_comment: false
                },
                source_info: {
                    source: 'PULL_FROM_URL',
                    photo_cover_index: 1,
                    photo_images: [mediaUrl]
                },
                post_mode: 'DIRECT_POST',
                media_type: 'PHOTO'
            };

            const response = await fetch(photoEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify(photoPayload)
            });

            tiktokResult = await response.json();

            if (response.ok && (tiktokResult.data?.publish_id || tiktokResult.publish_id)) {
                publishedId = tiktokResult.data?.publish_id || tiktokResult.publish_id;
            } else {
                const errDetail = tiktokResult.error?.message || tiktokResult.error?.code || tiktokResult.message || 'TikTok photo post failed.';
                throw new Error(errDetail);
            }
        }

        // 7. Update Database with Success Status
        await supabaseAdmin
            .from('post_platforms')
            .update({
                status: 'published',
                platform_post_id: publishedId,
                error_message: null,
                published_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('post_id', post_id)
            .eq('platform', 'tiktok');

        await supabaseAdmin.from('activity_logs').insert({
            user_id: user.id,
            post_id: post_id,
            platform: 'tiktok',
            action: 'PUBLISH_SUCCESS',
            status: 'success',
            message: `Published ${postTypeLabel} post to TikTok (Publish ID: ${publishedId})`
        });

        return new Response(JSON.stringify({
            success: true,
            platform_post_id: publishedId,
            post_type: postTypeLabel,
            tiktok_response: tiktokResult
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        console.error('Publish TikTok Exception:', err);
        const errorMsg = err.message || 'Internal Edge Function Error';

        // Update post_platforms with error if request payload was parsed
        try {
            const reqClone = req.clone();
            const { post_id } = await reqClone.json();
            const authHeader = req.headers.get('Authorization');
            if (post_id && authHeader) {
                const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
                const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
                const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
                const token = authHeader.replace('Bearer ', '');
                const { data: { user } } = await supabaseAdmin.auth.getUser(token);

                if (user) {
                    await supabaseAdmin
                        .from('post_platforms')
                        .update({
                            status: 'failed',
                            error_message: errorMsg,
                            updated_at: new Date().toISOString()
                        })
                        .eq('post_id', post_id)
                        .eq('platform', 'tiktok');

                    await supabaseAdmin.from('activity_logs').insert({
                        user_id: user.id,
                        post_id: post_id,
                        platform: 'tiktok',
                        action: 'PUBLISH_FAILED',
                        status: 'failed',
                        message: `TikTok publish error: ${errorMsg}`
                    });
                }
            }
        } catch (_) {
            // Ignore secondary error handling logging error
        }

        return new Response(JSON.stringify({
            success: false,
            error: errorMsg
        }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const { post_id } = await req.json();

        // 1. Retrieve Instagram social_account
        const { data: igAccount, error: igError } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('platform', 'instagram')
            .single();

        if (igError || !igAccount || !igAccount.access_token || !igAccount.account_id) {
            return new Response(JSON.stringify({ error: 'Instagram account not connected in Settings.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 2. Retrieve Post
        const { data: post, error: postError } = await supabaseAdmin
            .from('posts')
            .select('*')
            .eq('id', post_id)
            .single();

        if (postError || !post) {
            return new Response(JSON.stringify({ error: 'Post not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Instagram requires an image for Feed posts
        if (!post.image_url) {
            return new Response(JSON.stringify({ error: 'Instagram requires an image. Text-only posts are not supported by the Instagram Graph API.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const igUserId = igAccount.account_id;
        const accessToken = igAccount.access_token;

        // Step 1: Create Container
        const containerUrl = `https://graph.facebook.com/v19.0/${igUserId}/media`;
        const containerParams = new URLSearchParams({
            image_url: post.image_url,
            caption: post.caption,
            access_token: accessToken
        });

        const containerRes = await fetch(containerUrl, {
            method: 'POST',
            body: containerParams
        });
        const containerData = await containerRes.json();

        if (!containerRes.ok || !containerData.id) {
            const errReason = containerData.error?.message || 'Failed to create Instagram media container.';
            await supabaseAdmin.from('post_platforms').upsert({
                post_id: post_id,
                platform: 'instagram',
                status: 'failed',
                error_message: errReason
            }, { onConflict: 'post_id, platform' });

            return new Response(JSON.stringify({ success: false, error: errReason }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const creationId = containerData.id;

        // Step 2: Publish Container
        const publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish`;
        const publishParams = new URLSearchParams({
            creation_id: creationId,
            access_token: accessToken
        });

        const publishRes = await fetch(publishUrl, {
            method: 'POST',
            body: publishParams
        });
        const publishData = await publishRes.json();

        if (publishRes.ok && publishData.id) {
            await supabaseAdmin.from('post_platforms').upsert({
                post_id: post_id,
                platform: 'instagram',
                status: 'published',
                platform_post_id: publishData.id,
                error_message: null,
                published_at: new Date().toISOString()
            }, { onConflict: 'post_id, platform' });

            return new Response(JSON.stringify({ success: true, platform_post_id: publishData.id }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } else {
            const errReason = publishData.error?.message || 'Failed to publish Instagram media container.';
            await supabaseAdmin.from('post_platforms').upsert({
                post_id: post_id,
                platform: 'instagram',
                status: 'failed',
                error_message: errReason
            }, { onConflict: 'post_id, platform' });

            return new Response(JSON.stringify({ success: false, error: errReason }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

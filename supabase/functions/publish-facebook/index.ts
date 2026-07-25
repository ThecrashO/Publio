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

        // 1. Retrieve Facebook social_account
        const { data: fbAccount, error: fbError } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('platform', 'facebook')
            .single();

        if (fbError || !fbAccount || !fbAccount.access_token || !fbAccount.account_id) {
            return new Response(JSON.stringify({ error: 'Facebook account not connected. Connect Facebook Page in Settings.' }), {
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

        const pageId = fbAccount.account_id;
        const pageAccessToken = fbAccount.access_token;

        // 3. Call Facebook Graph API directly
        let fbEndpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
        let bodyParams = new URLSearchParams();
        bodyParams.append('access_token', pageAccessToken);

        if (post.image_url) {
            fbEndpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
            bodyParams.append('url', post.image_url);
            bodyParams.append('caption', post.caption);
        } else {
            bodyParams.append('message', post.caption);
        }

        const fbResponse = await fetch(fbEndpoint, {
            method: 'POST',
            body: bodyParams
        });

        const fbResult = await fbResponse.json();

        if (fbResponse.ok && (fbResult.id || fbResult.post_id)) {
            const fbPostId = fbResult.id || fbResult.post_id;

            await supabaseAdmin.from('post_platforms').upsert({
                post_id: post_id,
                platform: 'facebook',
                status: 'published',
                platform_post_id: fbPostId,
                error_message: null,
                published_at: new Date().toISOString()
            }, { onConflict: 'post_id, platform' });

            await supabaseAdmin.from('activity_logs').insert({
                user_id: user.id,
                post_id: post_id,
                platform: 'facebook',
                action: 'PUBLISH_SUCCESS',
                status: 'success',
                message: `Published to Facebook Page (Post ID: ${fbPostId})`
            });

            return new Response(JSON.stringify({ success: true, platform_post_id: fbPostId }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } else {
            const errorMsg = fbResult.error?.message || 'Facebook API call failed.';

            await supabaseAdmin.from('post_platforms').upsert({
                post_id: post_id,
                platform: 'facebook',
                status: 'failed',
                error_message: errorMsg
            }, { onConflict: 'post_id, platform' });

            return new Response(JSON.stringify({ success: false, error: errorMsg }), {
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

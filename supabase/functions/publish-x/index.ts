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

        // 1. Retrieve X social_account
        const { data: xAccount, error: xError } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('platform', 'x')
            .single();

        if (xError || !xAccount || !xAccount.access_token) {
            return new Response(JSON.stringify({ error: 'X (Twitter) account not connected in Settings.' }), {
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

        // 3. Post Tweet via X API v2
        const tweetPayload = {
            text: post.caption
        };

        const xRes = await fetch("https://api.twitter.com/2/tweets", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${xAccount.access_token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(tweetPayload)
        });

        const xResult = await xRes.json();

        if (xRes.ok && xResult.data?.id) {
            const tweetId = xResult.data.id;

            await supabaseAdmin.from('post_platforms').upsert({
                post_id: post_id,
                platform: 'x',
                status: 'published',
                platform_post_id: tweetId,
                error_message: null,
                published_at: new Date().toISOString()
            }, { onConflict: 'post_id, platform' });

            return new Response(JSON.stringify({ success: true, platform_post_id: tweetId }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } else {
            const errReason = xResult.detail || xResult.errors?.[0]?.message || 'X API call failed.';

            await supabaseAdmin.from('post_platforms').upsert({
                post_id: post_id,
                platform: 'x',
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

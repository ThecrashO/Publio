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

        // 1. Retrieve LinkedIn account
        const { data: liAccount, error: liError } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('platform', 'linkedin')
            .single();

        if (liError || !liAccount || !liAccount.access_token || !liAccount.account_id) {
            return new Response(JSON.stringify({ error: 'LinkedIn account not connected in Settings.' }), {
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

        const authorUrn = `urn:li:person:${liAccount.account_id}`;
        
        // 3. Construct LinkedIn ugcPosts Payload
        const payload = {
            author: authorUrn,
            lifecycleState: "PUBLISHED",
            specificContent: {
                "com.linkedin.ugc.ShareContent": {
                    shareCommentary: {
                        text: post.caption
                    },
                    shareMediaCategory: post.image_url ? "ARTICLE" : "NONE",
                    ...(post.image_url ? {
                        media: [{
                            status: "READY",
                            originalUrl: post.image_url
                        }]
                    } : {})
                }
            },
            visibility: {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
            }
        };

        const liRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${liAccount.access_token}`,
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0"
            },
            body: JSON.stringify(payload)
        });

        const liResult = await liRes.json();

        if (liRes.ok && liResult.id) {
            await supabaseAdmin.from('post_platforms').upsert({
                post_id: post_id,
                platform: 'linkedin',
                status: 'published',
                platform_post_id: liResult.id,
                error_message: null,
                published_at: new Date().toISOString()
            }, { onConflict: 'post_id, platform' });

            return new Response(JSON.stringify({ success: true, platform_post_id: liResult.id }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } else {
            const errReason = liResult.message || 'LinkedIn publishing failed.';
            await supabaseAdmin.from('post_platforms').upsert({
                post_id: post_id,
                platform: 'linkedin',
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

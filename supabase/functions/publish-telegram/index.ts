import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
        
        // Initialize Supabase Admin Client (to query protected DB tables securely)
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // Verify token & extract user
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

        // 3. Retrieve User's Telegram Credentials from social_accounts
        const { data: telegramAccount, error: tgAccError } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('platform', 'telegram')
            .single();

        if (tgAccError || !telegramAccount || !telegramAccount.metadata) {
            return new Response(JSON.stringify({ error: 'Telegram connection not configured. Please save your Telegram Bot Token and Channel ID in Settings.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const { bot_token, chat_id } = telegramAccount.metadata;
        if (!bot_token || !chat_id) {
            return new Response(JSON.stringify({ error: 'Invalid Telegram metadata configuration.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 4. Retrieve Post Details
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

        // Set status in post_platforms to publishing
        await supabaseAdmin
            .from('post_platforms')
            .upsert({
                post_id: post_id,
                platform: 'telegram',
                status: 'publishing',
                updated_at: new Date().toISOString()
            }, { onConflict: 'post_id, platform' });

        // 5. Call Telegram Bot API directly
        let tgApiEndpoint = `https://api.telegram.org/bot${bot_token}/sendMessage`;
        let payload: Record<string, any> = {
            chat_id: chat_id,
            text: post.caption
        };

        if (post.image_url) {
            tgApiEndpoint = `https://api.telegram.org/bot${bot_token}/sendPhoto`;
            payload = {
                chat_id: chat_id,
                photo: post.image_url,
                caption: post.caption
            };
        }

        const tgResponse = await fetch(tgApiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const tgResult = await tgResponse.json();

        // 6. Process Telegram Response & Update Database
        if (tgResult.ok) {
            const messageId = String(tgResult.result?.message_id || '');

            // Update post_platforms
            await supabaseAdmin
                .from('post_platforms')
                .update({
                    status: 'published',
                    platform_post_id: messageId,
                    error_message: null,
                    published_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('post_id', post_id)
                .eq('platform', 'telegram');

            // Log activity
            await supabaseAdmin.from('activity_logs').insert({
                user_id: user.id,
                post_id: post_id,
                platform: 'telegram',
                action: 'PUBLISH_SUCCESS',
                status: 'success',
                message: `Published to Telegram channel (Message ID: ${messageId})`
            });

            return new Response(JSON.stringify({
                success: true,
                platform_post_id: messageId,
                telegram_response: tgResult
            }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

        } else {
            const errorMsg = tgResult.description || 'Failed to post to Telegram API.';

            // Update post_platforms with error
            await supabaseAdmin
                .from('post_platforms')
                .update({
                    status: 'failed',
                    error_message: errorMsg,
                    updated_at: new Date().toISOString()
                })
                .eq('post_id', post_id)
                .eq('platform', 'telegram');

            // Log activity error
            await supabaseAdmin.from('activity_logs').insert({
                user_id: user.id,
                post_id: post_id,
                platform: 'telegram',
                action: 'PUBLISH_FAILED',
                status: 'failed',
                message: `Telegram publish error: ${errorMsg}`
            });

            return new Response(JSON.stringify({
                success: false,
                error: errorMsg,
                telegram_response: tgResult
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

    } catch (err: any) {
        console.error('Edge function exception:', err);
        return new Response(JSON.stringify({ error: err.message || 'Internal Edge Function Error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

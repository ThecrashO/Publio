import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getSiteUrl(req: Request): string {
    const envUrl = Deno.env.get('SITE_URL');
    if (envUrl && envUrl.trim() !== '') {
        return envUrl.replace(/\/$/, '');
    }
    const referer = req.headers.get('referer');
    if (referer) {
        try {
            const u = new URL(referer);
            return `${u.protocol}//${u.host}`;
        } catch (_) {}
    }
    const origin = req.headers.get('origin');
    if (origin && origin !== 'null') {
        return origin.replace(/\/$/, '');
    }
    return 'https://publio-p.vercel.app';
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const appId = Deno.env.get('FACEBOOK_APP_ID') ?? '';
    const appSecret = Deno.env.get('FACEBOOK_APP_SECRET') ?? '';
    const siteUrl = getSiteUrl(req);

    const redirectUri = `${supabaseUrl}/functions/v1/oauth-facebook-callback`;

    // Handle OAuth denial by user
    if (errorParam) {
        return Response.redirect(`${siteUrl}/settings.html?error=facebook_denied`, 302);
    }

    if (!code || !state) {
        return Response.redirect(`${siteUrl}/settings.html?error=facebook_missing_params`, 302);
    }

    // Decode state to get userId
    let userId: string;
    try {
        const decoded = JSON.parse(atob(state));
        userId = decoded.userId;
        if (!userId) throw new Error('No userId in state');
    } catch {
        return Response.redirect(`${siteUrl}/settings.html?error=facebook_invalid_state`, 302);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // 1. Exchange code for short-lived user access token
        const tokenRes = await fetch(
            `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
        );
        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            const errMsg = tokenData.error?.message || 'Token exchange failed';
            console.error('Facebook Token Exchange Error:', tokenData.error || tokenData);
            await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'facebook', action: 'OAUTH_FAILED', status: 'failed', message: errMsg });
            return Response.redirect(`${siteUrl}/settings.html?error=facebook_token_failed&msg=${encodeURIComponent(errMsg)}`, 302);
        }

        // 2. Exchange for long-lived token
        const longLivedRes = await fetch(
            `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
        );
        const longLivedData = await longLivedRes.json();
        const longLivedToken = longLivedData.access_token || tokenData.access_token;

        // 3. Get user profile
        const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${longLivedToken}`);
        const meData = await meRes.json();

        // 4. Get managed Facebook Pages
        const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,category,tasks&access_token=${longLivedToken}`);
        const pagesData = await pagesRes.json();

        if (pagesData.error) {
            const errMsg = pagesData.error.message || 'Failed to fetch Facebook Pages';
            console.error('Facebook me/accounts Graph API Error:', pagesData.error);
            await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'facebook', action: 'OAUTH_FAILED', status: 'failed', message: errMsg });
            return Response.redirect(`${siteUrl}/settings.html?error=facebook_api_error&msg=${encodeURIComponent(errMsg)}`, 302);
        }

        if (!pagesData.data || pagesData.data.length === 0) {
            await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'facebook', action: 'OAUTH_NO_PAGES', status: 'failed', message: 'No Facebook Pages found. Create a Facebook Page first or grant Page permissions.' });
            return Response.redirect(`${siteUrl}/settings.html?error=facebook_no_pages`, 302);
        }

        // Use first page (future: let user pick page)
        const page = pagesData.data[0];

        // 5. Store in social_accounts
        await supabaseAdmin.from('social_accounts').upsert({
            user_id: userId,
            platform: 'facebook',
            account_name: page.name,
            account_id: page.id,
            access_token: page.access_token, // Page access token (never expires if page admin)
            metadata: {
                user_id: meData.id,
                user_name: meData.name,
                page_name: page.name,
                page_id: page.id,
                all_pages: pagesData.data.map((p: any) => ({ id: p.id, name: p.name }))
            },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, platform' });

        await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'facebook', action: 'OAUTH_SUCCESS', status: 'success', message: `Connected Facebook Page: ${page.name} (${page.id})` });

        return Response.redirect(`${siteUrl}/settings.html?connected=facebook`, 302);

    } catch (err: any) {
        console.error('Facebook OAuth error:', err);
        await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'facebook', action: 'OAUTH_ERROR', status: 'failed', message: err.message });
        return Response.redirect(`${siteUrl}/settings.html?error=facebook_error`, 302);
    }
});

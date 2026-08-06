import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

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
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY') ?? '';
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? '';
    const siteUrl = getSiteUrl(req);

    const redirectUri = `${supabaseUrl}/functions/v1/oauth-tiktok-callback`;

    if (errorParam) {
        return Response.redirect(`${siteUrl}/settings.html?error=tiktok_denied`, 302);
    }

    if (!code || !state) {
        return Response.redirect(`${siteUrl}/settings.html?error=tiktok_missing_params`, 302);
    }

    let userId: string;
    try {
        const decoded = JSON.parse(atob(state));
        userId = decoded.userId;
        if (!userId) throw new Error('Invalid state');
    } catch {
        return Response.redirect(`${siteUrl}/settings.html?error=tiktok_invalid_state`, 302);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // 1. Exchange TikTok Authorization Code for Access & Refresh Tokens
        const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            })
        });

        const tokenData = await tokenRes.json();

        if (!tokenData.access_token && !tokenData.data?.access_token) {
            const errMsg = tokenData.error_description || tokenData.error || tokenData.message || 'TikTok token exchange failed';
            await supabaseAdmin.from('activity_logs').insert({
                user_id: userId,
                platform: 'tiktok',
                action: 'OAUTH_FAILED',
                status: 'failed',
                message: errMsg
            });
            return Response.redirect(`${siteUrl}/settings.html?error=tiktok_token_failed`, 302);
        }

        const accessToken = tokenData.access_token || tokenData.data?.access_token;
        const refreshToken = tokenData.refresh_token || tokenData.data?.refresh_token || null;
        const openId = tokenData.open_id || tokenData.data?.open_id || 'tiktok_user';
        const expiresIn = tokenData.expires_in || tokenData.data?.expires_in || 86400;

        // 2. Fetch TikTok User Info profile
        let displayName = 'TikTok Account';
        let avatarUrl = '';

        try {
            const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const userData = await userRes.json();
            if (userData.data?.user) {
                displayName = userData.data.user.display_name || displayName;
                avatarUrl = userData.data.user.avatar_url || '';
            }
        } catch (e) {
            console.warn('Failed to fetch TikTok user info profile:', e);
        }

        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // 3. Store credentials in social_accounts
        await supabaseAdmin.from('social_accounts').upsert({
            user_id: userId,
            platform: 'tiktok',
            account_name: displayName,
            account_id: openId,
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expires_at: expiresAt,
            metadata: {
                open_id: openId,
                display_name: displayName,
                avatar_url: avatarUrl
            },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, platform' });

        // Log successful connection
        await supabaseAdmin.from('activity_logs').insert({
            user_id: userId,
            platform: 'tiktok',
            action: 'OAUTH_SUCCESS',
            status: 'success',
            message: `Connected TikTok Account: ${displayName}`
        });

        return Response.redirect(`${siteUrl}/settings.html?connected=tiktok`, 302);

    } catch (err: any) {
        console.error('TikTok OAuth Callback Error:', err);
        return Response.redirect(`${siteUrl}/settings.html?error=tiktok_error`, 302);
    }
});

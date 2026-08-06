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
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
    const siteUrl = getSiteUrl(req);

    const redirectUri = `${supabaseUrl}/functions/v1/oauth-youtube-callback`;

    if (errorParam) {
        return Response.redirect(`${siteUrl}/settings.html?error=youtube_denied`, 302);
    }

    if (!code || !state) {
        return Response.redirect(`${siteUrl}/settings.html?error=youtube_missing_params`, 302);
    }

    let userId: string;
    try {
        const decoded = JSON.parse(atob(state));
        userId = decoded.userId;
        if (!userId) throw new Error('Invalid state');
    } catch {
        return Response.redirect(`${siteUrl}/settings.html?error=youtube_invalid_state`, 302);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // 1. Exchange Google Authorization Code for Access & Refresh Tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });

        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            const errMsg = tokenData.error_description || tokenData.error || 'Google token exchange failed';
            await supabaseAdmin.from('activity_logs').insert({ 
                user_id: userId, 
                platform: 'youtube', 
                action: 'OAUTH_FAILED', 
                status: 'failed', 
                message: errMsg 
            });
            return Response.redirect(`${siteUrl}/settings.html?error=youtube_token_failed`, 302);
        }

        // 2. Fetch YouTube Channel details via YouTube Data API v3
        const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });

        const channelData = await channelRes.json();
        const channelItem = channelData.items && channelData.items[0];

        let accountName = 'YouTube Channel';
        let accountId = 'default_channel';
        let channelThumbnail = '';

        if (channelItem) {
            accountName = channelItem.snippet?.title || 'YouTube Channel';
            accountId = channelItem.id;
            channelThumbnail = channelItem.snippet?.thumbnails?.default?.url || '';
        }

        const expiresAt = tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
            : null;

        // Check for existing refresh token if not returned in current response
        let refreshToken = tokenData.refresh_token || null;
        if (!refreshToken) {
            const { data: existingAcc } = await supabaseAdmin
                .from('social_accounts')
                .select('refresh_token')
                .eq('user_id', userId)
                .eq('platform', 'youtube')
                .single();
            if (existingAcc && existingAcc.refresh_token) {
                refreshToken = existingAcc.refresh_token;
            }
        }

        // 3. Store credentials in social_accounts
        await supabaseAdmin.from('social_accounts').upsert({
            user_id: userId,
            platform: 'youtube',
            account_name: accountName,
            account_id: accountId,
            access_token: tokenData.access_token,
            refresh_token: refreshToken,
            token_expires_at: expiresAt,
            metadata: {
                channel_id: accountId,
                channel_title: accountName,
                channel_thumbnail: channelThumbnail
            },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, platform' });

        // Log successful connection
        await supabaseAdmin.from('activity_logs').insert({ 
            user_id: userId, 
            platform: 'youtube', 
            action: 'OAUTH_SUCCESS', 
            status: 'success', 
            message: `Connected YouTube Channel: ${accountName}` 
        });

        return Response.redirect(`${siteUrl}/settings.html?connected=youtube`, 302);

    } catch (err: any) {
        console.error('YouTube OAuth Callback Error:', err);
        return Response.redirect(`${siteUrl}/settings.html?error=youtube_error`, 302);
    }
});

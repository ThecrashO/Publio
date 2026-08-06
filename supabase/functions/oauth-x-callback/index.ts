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
    const clientId = Deno.env.get('X_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('X_CLIENT_SECRET') ?? '';
    const siteUrl = getSiteUrl(req);

    const redirectUri = `${supabaseUrl}/functions/v1/oauth-x-callback`;

    if (errorParam) {
        return Response.redirect(`${siteUrl}/settings.html?error=x_denied`, 302);
    }

    if (!code || !state) {
        return Response.redirect(`${siteUrl}/settings.html?error=x_missing_params`, 302);
    }

    let userId: string;
    let codeVerifier: string;
    try {
        const decoded = JSON.parse(atob(state));
        userId = decoded.userId;
        codeVerifier = decoded.codeVerifier;
        if (!userId || !codeVerifier) throw new Error('Invalid state');
    } catch {
        return Response.redirect(`${siteUrl}/settings.html?error=x_invalid_state`, 302);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // 1. Exchange code for access token (X uses OAuth 2.0 PKCE)
        const credentials = btoa(`${clientId}:${clientSecret}`);

        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier
        });

        const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: tokenParams
        });
        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            const errMsg = tokenData.error_description || tokenData.detail || 'X token exchange failed';
            await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'x', action: 'OAUTH_FAILED', status: 'failed', message: errMsg });
            return Response.redirect(`${siteUrl}/settings.html?error=x_token_failed`, 302);
        }

        // 2. Get X user profile
        const profileRes = await fetch('https://api.twitter.com/2/users/me', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const profileData = await profileRes.json();
        const xUser = profileData.data;

        if (!xUser?.id) {
            return Response.redirect(`${siteUrl}/settings.html?error=x_profile_failed`, 302);
        }

        const expiresAt = tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
            : null;

        // 3. Store in social_accounts
        await supabaseAdmin.from('social_accounts').upsert({
            user_id: userId,
            platform: 'x',
            account_name: `@${xUser.username || xUser.name}`,
            account_id: xUser.id,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            token_expires_at: expiresAt,
            metadata: {
                x_id: xUser.id,
                name: xUser.name,
                username: xUser.username
            },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, platform' });

        await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'x', action: 'OAUTH_SUCCESS', status: 'success', message: `Connected X account: @${xUser.username}` });

        return Response.redirect(`${siteUrl}/settings.html?connected=x`, 302);

    } catch (err: any) {
        console.error('X OAuth error:', err);
        return Response.redirect(`${siteUrl}/settings.html?error=x_error`, 302);
    }
});

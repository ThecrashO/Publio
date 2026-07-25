import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

serve(async (req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const clientId = Deno.env.get('LINKEDIN_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET') ?? '';
    const siteUrl = Deno.env.get('SITE_URL') ?? '';

    const redirectUri = `${supabaseUrl}/functions/v1/oauth-linkedin-callback`;

    if (errorParam) {
        return Response.redirect(`${siteUrl}/settings.html?error=linkedin_denied`, 302);
    }

    if (!code || !state) {
        return Response.redirect(`${siteUrl}/settings.html?error=linkedin_missing_params`, 302);
    }

    let userId: string;
    try {
        const decoded = JSON.parse(atob(state));
        userId = decoded.userId;
        if (!userId) throw new Error('No userId in state');
    } catch {
        return Response.redirect(`${siteUrl}/settings.html?error=linkedin_invalid_state`, 302);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // 1. Exchange code for access token
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret
        });

        const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams
        });
        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            const errMsg = tokenData.error_description || 'LinkedIn token exchange failed';
            await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'linkedin', action: 'OAUTH_FAILED', status: 'failed', message: errMsg });
            return Response.redirect(`${siteUrl}/settings.html?error=linkedin_token_failed`, 302);
        }

        // 2. Get LinkedIn profile
        const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const profile = await profileRes.json();

        const linkedinId = profile.sub;
        const displayName = profile.name || profile.email || linkedinId;

        // 3. Store in social_accounts
        const expiresAt = tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
            : null;

        await supabaseAdmin.from('social_accounts').upsert({
            user_id: userId,
            platform: 'linkedin',
            account_name: displayName,
            account_id: linkedinId,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            token_expires_at: expiresAt,
            metadata: {
                linkedin_id: linkedinId,
                name: displayName,
                email: profile.email
            },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, platform' });

        await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'linkedin', action: 'OAUTH_SUCCESS', status: 'success', message: `Connected LinkedIn profile: ${displayName}` });

        return Response.redirect(`${siteUrl}/settings.html?connected=linkedin`, 302);

    } catch (err: any) {
        console.error('LinkedIn OAuth error:', err);
        return Response.redirect(`${siteUrl}/settings.html?error=linkedin_error`, 302);
    }
});

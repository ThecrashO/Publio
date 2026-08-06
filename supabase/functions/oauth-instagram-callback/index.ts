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
    const appId = Deno.env.get('FACEBOOK_APP_ID') ?? '';
    const appSecret = Deno.env.get('FACEBOOK_APP_SECRET') ?? '';
    const siteUrl = getSiteUrl(req);

    const redirectUri = `${supabaseUrl}/functions/v1/oauth-instagram-callback`;

    if (errorParam) {
        return Response.redirect(`${siteUrl}/settings.html?error=instagram_denied`, 302);
    }

    if (!code || !state) {
        return Response.redirect(`${siteUrl}/settings.html?error=instagram_missing_params`, 302);
    }

    let userId: string;
    try {
        const decoded = JSON.parse(atob(state));
        userId = decoded.userId;
        if (!userId) throw new Error('No userId in state');
    } catch {
        return Response.redirect(`${siteUrl}/settings.html?error=instagram_invalid_state`, 302);
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
            await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'instagram', action: 'OAUTH_FAILED', status: 'failed', message: errMsg });
            return Response.redirect(`${siteUrl}/settings.html?error=instagram_token_failed`, 302);
        }

        // 2. Exchange for long-lived token
        const longLivedRes = await fetch(
            `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
        );
        const longLivedData = await longLivedRes.json();
        const longLivedToken = longLivedData.access_token || tokenData.access_token;

        // 3. Get Facebook Pages
        const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedToken}`);
        const pagesData = await pagesRes.json();

        if (!pagesData.data || pagesData.data.length === 0) {
            return Response.redirect(`${siteUrl}/settings.html?error=instagram_no_pages`, 302);
        }

        // 4. For each page, get connected Instagram Business Account
        let igAccountFound = null;

        for (const page of pagesData.data) {
            const igRes = await fetch(
                `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
            );
            const igData = await igRes.json();

            if (igData.instagram_business_account?.id) {
                const igId = igData.instagram_business_account.id;

                // Get Instagram account details
                const igDetailRes = await fetch(
                    `https://graph.facebook.com/v19.0/${igId}?fields=id,name,username,profile_picture_url&access_token=${page.access_token}`
                );
                const igDetail = await igDetailRes.json();

                igAccountFound = {
                    igId,
                    igName: igDetail.name || igDetail.username || igId,
                    igUsername: igDetail.username,
                    pageAccessToken: page.access_token,
                    pageName: page.name,
                    pageId: page.id
                };
                break;
            }
        }

        if (!igAccountFound) {
            await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'instagram', action: 'OAUTH_NO_IG', status: 'failed', message: 'No Instagram Business Account linked to your Facebook Pages. Convert your Instagram account to a Business or Creator account and link it to a Facebook Page.' });
            return Response.redirect(`${siteUrl}/settings.html?error=instagram_no_business_account`, 302);
        }

        // 5. Store in social_accounts (Instagram uses Page Access Token for publishing)
        await supabaseAdmin.from('social_accounts').upsert({
            user_id: userId,
            platform: 'instagram',
            account_name: `@${igAccountFound.igUsername || igAccountFound.igName}`,
            account_id: igAccountFound.igId,
            access_token: igAccountFound.pageAccessToken,
            metadata: {
                ig_user_id: igAccountFound.igId,
                ig_username: igAccountFound.igUsername,
                page_id: igAccountFound.pageId,
                page_name: igAccountFound.pageName
            },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, platform' });

        await supabaseAdmin.from('activity_logs').insert({ user_id: userId, platform: 'instagram', action: 'OAUTH_SUCCESS', status: 'success', message: `Connected Instagram: @${igAccountFound.igUsername}` });

        return Response.redirect(`${siteUrl}/settings.html?connected=instagram`, 302);

    } catch (err: any) {
        console.error('Instagram OAuth error:', err);
        return Response.redirect(`${siteUrl}/settings.html?error=instagram_error`, 302);
    }
});

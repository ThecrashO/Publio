// ==================================================
// Publio - Platform Connections & Credentials Manager
// File: js/platforms.js
// ==================================================

const normalizeTelegramChatInput = (value = '') => {
    const trimmed = (value || '').toString().trim();
    if (!trimmed) return '';

    if (/^-?\d+$/.test(trimmed)) return trimmed;
    if (trimmed.startsWith('@')) return trimmed;
    if (/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(trimmed)) return `@${trimmed}`;

    return trimmed;
};

const Platforms = {
    /**
     * Fetch user's connected social accounts
     */
    async getUserAccounts(userId) {
        if (!window.sb) return [];

        const { data, error } = await window.sb
            .from('social_accounts')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error('Error fetching social accounts:', error);
            return [];
        }

        return data || [];
    },

    /**
     * Save Telegram Bot configuration for current user
     */
    async saveTelegramAccount(userId, botToken, chatId, channelUsername = '') {
        if (!window.sb) throw new Error('Supabase client is not initialized.');

        if (!botToken || !chatId) {
            throw new Error('Telegram Bot Token and Channel ID are required.');
        }

        // Clean inputs
        const cleanToken = botToken.trim();
        const cleanChatId = normalizeTelegramChatInput(chatId);
        const cleanUsername = (channelUsername || '').trim().replace(/^@/, '');

        const metadataPayload = {
            bot_token: cleanToken,
            chat_id: cleanChatId,
            channel_username: cleanUsername
        };

        const { data, error } = await window.sb
            .from('social_accounts')
            .upsert({
                user_id: userId,
                platform: 'telegram',
                account_name: cleanUsername || `Telegram (${cleanChatId})`,
                account_id: cleanChatId,
                metadata: metadataPayload,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id, platform'
            })
            .select();

        if (error) {
            console.error('Failed to save Telegram account:', error);
            throw new Error(error.message || 'Failed to save Telegram settings.');
        }

        // Log connection activity
        await window.sb.from('activity_logs').insert({
            user_id: userId,
            platform: 'telegram',
            action: 'CONNECT_ACCOUNT',
            status: 'success',
            message: `Telegram Bot configured for channel/chat ID: ${cleanChatId}`
        });

        return data;
    },

    /**
     * Disconnect/Remove a social account
     */
    async disconnectAccount(userId, platform) {
        if (!window.sb) return;

        const { error } = await window.sb
            .from('social_accounts')
            .delete()
            .eq('user_id', userId)
            .eq('platform', platform);

        if (error) {
            console.error(`Failed to disconnect ${platform}:`, error);
            throw new Error(error.message);
        }

        await window.sb.from('activity_logs').insert({
            user_id: userId,
            platform: platform,
            action: 'DISCONNECT_ACCOUNT',
            status: 'info',
            message: `Disconnected ${platform} account.`
        });
    }
};

window.Platforms = Platforms;

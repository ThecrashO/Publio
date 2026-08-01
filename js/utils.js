// ==================================================
// Publio - Utility & Helper Functions
// File: js/utils.js
// ==================================================

const Utils = {
    /**
     * Escape HTML characters to prevent XSS
     */
    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * Format ISO timestamp to human-readable string
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Truncate long string
     */
    truncateText(str, maxLength = 80) {
        if (!str) return '';
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    },

    /**
     * Render status badge HTML
     */
    renderStatusBadge(status) {
        const normalized = (status || '').toLowerCase();
        let badgeClass = 'badge-secondary';
        let icon = 'bi-question-circle';

        switch (normalized) {
            case 'published':
                badgeClass = 'badge-success';
                icon = 'bi-check-circle-fill';
                break;
            case 'publishing':
                badgeClass = 'badge-gold';
                icon = 'bi-arrow-repeat spin';
                break;
            case 'pending':
                badgeClass = 'badge-warning';
                icon = 'bi-clock-history';
                break;
            case 'draft':
                badgeClass = 'badge-secondary';
                icon = 'bi-pencil-square';
                break;
            case 'failed':
                badgeClass = 'badge-danger';
                icon = 'bi-exclamation-triangle-fill';
                break;
        }

        return `<span class="badge ${badgeClass} d-inline-flex align-items-center gap-1">
            <i class="bi ${icon}"></i> ${Utils.escapeHtml(normalized.toUpperCase())}
        </span>`;
    },

    /**
     * Platform Icon and Class helper
     */
    getPlatformConfig(platform) {
        const p = (platform || '').toLowerCase();
        switch (p) {
            case 'telegram':
                return { name: 'Telegram', icon: 'bi-telegram', color: '#38bdf8' };
            case 'facebook':
                return { name: 'Facebook', icon: 'bi-facebook', color: '#60a5fa' };
            case 'instagram':
                return { name: 'Instagram', icon: 'bi-instagram', color: '#f43f5e' };
            case 'linkedin':
                return { name: 'LinkedIn', icon: 'bi-linkedin', color: '#38bdf8' };
            case 'x':
                return { name: 'X (Twitter)', icon: 'bi-twitter-x', color: '#ffffff' };
            case 'youtube':
                return { name: 'YouTube', icon: 'bi-youtube', color: '#f87171' };
            case 'tiktok':
                return { name: 'TikTok', icon: 'bi-tiktok', color: '#ffffff' };
            default:
                return { name: platform, icon: 'bi-share', color: '#a1a1aa' };
        }
    }
};

window.Utils = Utils;

// ==================================================
// Publio - Authentication Service & Route Guards
// File: js/auth.js
// ==================================================

const Auth = {
    /**
     * Get current user session
     */
    async getSession() {
        if (!window.sb) return null;
        const { data: { session }, error } = await window.sb.auth.getSession();
        if (error) {
            console.error('Session retrieval error:', error);
            return null;
        }
        return session;
    },

    /**
     * Get current user details
     */
    async getUser() {
        const session = await this.getSession();
        return session ? session.user : null;
    },

    /**
     * Sign Up new user
     */
    async signUp(email, password, fullName) {
        if (!window.sb) throw new Error('Supabase client not initialized.');
        
        const { data, error } = await window.sb.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });

        if (error) throw error;
        return data;
    },

    /**
     * Sign In existing user
     */
    async signIn(email, password) {
        if (!window.sb) throw new Error('Supabase client not initialized.');

        const { data, error } = await window.sb.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    },

    /**
     * Sign Out current user
     */
    async signOut() {
        if (!window.sb) return;
        const { error } = await window.sb.auth.signOut();
        if (error) console.error('Sign out error:', error);
        window.location.href = 'login.html';
    },

    /**
     * Guard protected routes (e.g., dashboard, posts, settings)
     * Redirects to login.html if not authenticated
     */
    async requireAuth() {
        const session = await this.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return null;
        }
        return session.user;
    },

    /**
     * Guard guest routes (e.g., login.html, index.html)
     * Redirects to dashboard.html if already logged in
     */
    async redirectIfAuthenticated() {
        const session = await this.getSession();
        if (session) {
            window.location.href = 'dashboard.html';
            return session.user;
        }
        return null;
    }
};

window.Auth = Auth;

// ==================================================
// PostPilot - Supabase Client Initialization
// File: js/supabase.js
// ==================================================

(function() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.error('Supabase JS Client SDK is missing. Make sure supabase-js script is loaded.');
        return;
    }

    // Initialize global client singleton
    window.sb = window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        }
    );
})();

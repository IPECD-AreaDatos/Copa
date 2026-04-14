/**
 * Authentication Module
 * Manages user authentication and session state
 */

const Auth = (function () {
    'use strict';

    // Authentication configuration
    const CONFIG = {
        SESSION_KEY: 'copa_auth_session',
        SESSION_DURATION: 8 * 60 * 60 * 1000, // 8 hours in milliseconds
    };

    // User credentials (in production, this should be handled by a backend)
    // Fix 1-B Reverted: Restored hardcoded credentials for demo purposes.
    const USERS = {
        'admin': {
            password: 'admin2026',
            name: 'Administrador Demo',
            role: 'admin'
        },
        'usuario': {
            password: 'usuario2026',
            name: 'Usuario Demo',
            role: 'user'
        },
        'gobernador': {
            password: 'gobernador26',
            name: 'Gobernador',
            role: 'user'
        }
    };

    /**
     * Get current session from localStorage
     */
    function getSession() {
        try {
            const sessionData = localStorage.getItem(CONFIG.SESSION_KEY);
            if (!sessionData) return null;

            const session = JSON.parse(sessionData);

            // Check if session has expired
            if (new Date().getTime() > session.expiresAt) {
                clearSession();
                return null;
            }

            return session;
        } catch (error) {
            console.error('Error reading session:', error);
            return null;
        }
    }

    /**
     * Save session to localStorage
     */
    function saveSession(username, userData) {
        const expiresAt = new Date().getTime() + CONFIG.SESSION_DURATION;
        const session = {
            username: username,
            name: userData.name,
            role: userData.role,
            loginTime: new Date().toISOString(),
            expiresAt: expiresAt
        };

        try {
            localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
            return true;
        } catch (error) {
            console.error('Error saving session:', error);
            return false;
        }
    }

    /**
     * Clear session from localStorage
     */
    function clearSession() {
        try {
            localStorage.removeItem(CONFIG.SESSION_KEY);
        } catch (error) {
            console.error('Error clearing session:', error);
        }
    }

    /**
     * Public API
     */
    return {
        /**
         * Attempt to log in with username and password
         * @param {string} username - User's username
         * @param {string} password - User's password
         * @returns {boolean} - True if login successful, false otherwise
         */
        login: function (username, password) {
            if (!username || !password) {
                return false;
            }

            const user = USERS[username];
            if (!user) {
                return false;
            }

            if (user.password !== password) {
                return false;
            }

            // Save session
            return saveSession(username, user);
        },

        /**
         * Log out current user
         */
        logout: function () {
            clearSession();
            // Redirect to main dashboard (public) instead of login
            // Use relative path to work on both localhost and GitHub Pages
            const basePath = new URL('.', window.location.href).pathname === '/' ? '/' : new URL('..', window.location.href).pathname;
            window.location.href = basePath || '/';
        },

        /**
         * Check if user is authenticated
         * @returns {boolean} - True if authenticated, false otherwise
         */
        isAuthenticated: function () {
            const session = getSession();
            return session !== null;
        },

        /**
         * Get current user information
         * @returns {Object|null} - User session data or null
         */
        getCurrentUser: function () {
            return getSession();
        },

        /**
         * Require authentication - redirect to login if not authenticated
         * Call this at the top of protected pages
         */
        requireAuth: function () {
            if (!this.isAuthenticated()) {
                // Store the intended destination
                sessionStorage.setItem('redirect_after_login', window.location.pathname);
                // Use relative path to work on both localhost and GitHub Pages
                const basePath = new URL('.', window.location.href).pathname === '/' ? '/' : new URL('..', window.location.href).pathname;
                window.location.href = (basePath || '/') + 'login.html';
                return false;
            }
            return true;
        },

        /**
         * Extend session duration
         */
        extendSession: function () {
            const session = getSession();
            if (session) {
                saveSession(session.username, {
                    name: session.name,
                    role: session.role
                });
            }
        },

        /**
         * Get session time remaining in minutes
         */
        getSessionTimeRemaining: function () {
            const session = getSession();
            if (!session) return 0;

            const remaining = session.expiresAt - new Date().getTime();
            return Math.floor(remaining / 60000); // Convert to minutes
        }
    };
})();

// Auto-extend session on user activity
let activityTimer;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];

function resetActivityTimer() {
    clearTimeout(activityTimer);
    activityTimer = setTimeout(() => {
        if (Auth.isAuthenticated()) {
            Auth.extendSession();
        }
    }, 5 * 60 * 1000); // Extend every 5 minutes of activity
}

ACTIVITY_EVENTS.forEach(event => {
    document.addEventListener(event, resetActivityTimer, true);
});

// Export for use in modules (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Auth;
}

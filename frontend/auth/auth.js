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

    // User credentials (will be loaded from JSON)
    let USERS = null;
    let API_CONFIG = null;

    /**
     * Helper to get the absolute URL to the /data/ folder.
     * Works regardless of whether the server is started from the project root or from /frontend/.
     */
    function getDataUrl(filename) {
        const origin = window.location.origin;
        const path = window.location.pathname;

        // Case 1: server runs from project root → path includes /frontend/
        if (path.includes('/frontend/')) {
            // Find everything up to and including the root of the project (before /frontend/)
            const rootPath = path.substring(0, path.indexOf('/frontend/'));
            return `${origin}${rootPath}/data/${filename}`;
        }

        // Case 2: server runs from /frontend/ directory → no /frontend/ in path
        // The data/ folder is one level up (../data/), but since we're at origin root, try /data/ first
        // We resolve relative to current page
        const segments = path.split('/');
        // Remove everything after the first subfolder (e.g. /main/ → go up to /)
        const depth = segments.filter(s => s.length > 0).length;
        const ups = depth > 1 ? '../'.repeat(depth - 1) : '';
        return `${origin}/${ups}data/${filename}`.replace(/([^:]\/)\/+/g, '$1');
    }

    /**
     * Load configuration from the synchronized data file
     */
    async function loadConfig() {
        if (API_CONFIG) return API_CONFIG;
        try {
        const response = await fetch(getDataUrl('config.json'));
            if (response.ok) {
                API_CONFIG = await response.json();
            } else {
                API_CONFIG = { API_URL_POST: '/api/coparticipacion/log' };
            }
        } catch (error) {
            console.warn('Error loading config.json, using fallback.');
            API_CONFIG = { API_URL_POST: '/api/coparticipacion/log' };
        }
        return API_CONFIG;
    }

    /**
     * Load users from the synchronized data file
     */
    async function loadUsers() {
        if (USERS) return USERS;
        try {
        const response = await fetch(getDataUrl('users.json'));
            if (!response.ok) throw new Error('Could not load users database');
            USERS = await response.json();
        } catch (error) {
            console.error('Error loading users:', error);
            USERS = {}; // Ensure it's at least an empty object
        }
        return USERS;
    }

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
            id: userData.id, // ID from users.json
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
        login: async function (username, password) {
            if (!username || !password) {
                return false;
            }

            const users = await loadUsers();
            
            const user = users[username];
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
            this.logActivity('Acceso', 'Logout');
            clearSession();
            // Resolve login.html path regardless of current page depth
            const path = window.location.pathname;
            if (path.includes('/frontend/')) {
                // Server runs from project root: /copa/frontend/main/ → /copa/frontend/login.html
                const rootPath = path.substring(0, path.indexOf('/frontend/'));
                window.location.href = `${rootPath}/frontend/login.html`;
            } else {
                // Server runs from frontend/ root
                window.location.href = '/login.html';
            }
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
                sessionStorage.setItem('redirect_after_login', window.location.pathname);
                // Resolve login.html path regardless of current page depth
                const path = window.location.pathname;
                if (path.includes('/frontend/')) {
                    const rootPath = path.substring(0, path.indexOf('/frontend/'));
                    window.location.href = `${rootPath}/frontend/login.html`;
                } else {
                    window.location.href = '/login.html';
                }
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
        },

        /**
         * Log user activity for analytics
         * @param {string} seccion - Section of the dashboard (e.g., 'Analisis Anual')
         * @param {string} accion - Type of action (e.g., 'Filtrar', 'Descargar')
         * @param {Object} detalle - Additional data as JSON
         */
        logActivity: async function (seccion, accion, detalle = {}) {
            const user = this.getCurrentUser();
            if (!user || !user.id) return;

            const logData = {
                id_usuario: user.id,
                seccion_tablero: seccion,
                accion: accion,
                detalle_interaccion: detalle
            };

            const config = await loadConfig();

            // Point to the centralized API
            try {
                return await fetch(config.API_URL_POST, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(logData)
                });
            } catch (err) {
                console.warn("Telemetry not sent:", err.message);
            }
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

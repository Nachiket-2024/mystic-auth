// ---------------------------- Frontend Settings ----------------------------
/**
 * settings
 * ----------------------------
 * Centralized frontend configuration object
 * Fields:
 *   1. apiBaseUrl - Base URL for backend API, loaded from Vite environment variable
 */
const settings = {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL, // Step 1: API base URL from Vite env
};

// ---------------------------- Export ----------------------------
// Export settings object for use throughout the frontend
export default settings;
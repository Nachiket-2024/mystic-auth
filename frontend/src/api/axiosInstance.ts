// ---------------------------- External Imports ----------------------------
// Import Axios HTTP client for making API requests
import axios from "axios";

// ---------------------------- Internal Imports ----------------------------
// Import centralized settings containing API base URL
import settings from "../core/settings";

// ---------------------------- Axios Instance ----------------------------
/**
 * api
 * ----------------------------
 * Input: None
 * Process:
 *   1. Create Axios instance with baseURL from settings
 *   2. Configure withCredentials to true for cookie support
 * Output: Configured Axios instance ready for API calls
 */
const api = axios.create({
    // Step 1: Set the base URL dynamically from settings
    baseURL: settings.apiBaseUrl,
    
    // Step 2: Include credentials such as cookies in cross-site requests
    withCredentials: true,
});

// ---------------------------- Export ----------------------------
// Export the configured Axios instance for use across the app
export default api;
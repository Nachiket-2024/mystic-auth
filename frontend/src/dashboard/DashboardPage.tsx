// ---------------------------- External Imports ----------------------------
// React core library and hooks for component lifecycle and state management
import React, { useEffect, useState } from "react";

// Redux hook to dispatch actions to the store
import { useDispatch } from "react-redux";

// Chakra UI components for layout, styling, and responsive design
import { Box, Heading, Stack, Container, Text, Spinner, Flex } from "@chakra-ui/react";

// ---------------------------- Internal Imports ----------------------------
// Button component to log out current session
import LogoutButton from "../auth/logout/LogoutButton";

// Button component to log out all sessions
import LogoutAllButton from "../auth/logout_all/LogoutAllButton";

// Redux actions to clear logout states
import { clearLogoutState } from "../auth/logout/logout_slice";
import { clearLogoutAllState } from "../auth/logout_all/logout_all_slice";

// API function to fetch current user details
import { getCurrentUserApi } from "../api/auth_api";

// ---------------------------- DashboardPage Component ----------------------------
/**
 * DashboardPage
 * ----------------------------
 * Displays the current user's information and logout options
 * 
 * Input: None (no props)
 * Process:
 *   1. Initialize Redux dispatch
 *   2. Manage local state for user info, loading, and error
 *   3. Clear previous logout states on mount
 *   4. Fetch current user information from API
 *   5. Render user info, loading spinner, or error messages
 *   6. Display logout buttons for session management
 * Output: JSX.Element representing the dashboard page
 */
const DashboardPage: React.FC = () => {
    // ---------------------------- Redux Hooks ----------------------------
    const dispatch = useDispatch(); // Step 1: Initialize Redux dispatch

    // ---------------------------- Local State ----------------------------
    const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null); 
    // Step 1: Store current user information
    const [loading, setLoading] = useState<boolean>(true); 

    // Step 2: Loading indicator while fetching data
    const [error, setError] = useState<string | null>(null);
     
    // Step 3: Error message if fetching fails

    // ---------------------------- Effects ----------------------------
    /**
     * Fetch User Data on Mount
     * ----------------------------
     * Process:
     *   1. Clear any previous logout states in Redux
     *   2. Define async function to fetch user info from API
     *   3. Call getCurrentUserApi to retrieve current user details
     *   4. Update user state on successful response
     *   5. Set error message on failed response or exception
     *   6. Stop loading indicator after API call completes
     * Output: Updates local state with user information or error
     */
    useEffect(() => {
        // Step 1: Clear Redux logout states to prevent stale messages
        dispatch(clearLogoutState());
        dispatch(clearLogoutAllState());

        // Step 2: Async function to fetch user information
        const fetchUser = async () => {
            try {
                // Step 3: Call API to get current user
                const res = await getCurrentUserApi("Dashboard");

                // Step 4: If successful, update user state with response data
                if (res.status === 200 && res.data) {
                    setUser(res.data);
                } else {
                    // Step 5: If API response is not 200, set error message
                    setError("Unable to fetch user details");
                }
            } catch (err: any) {
                // Step 5: Catch network or API errors and set error message
                setError("Failed to load user details");
            } finally {
                // Step 6: Stop loading indicator regardless of success or failure
                setLoading(false);
            }
        };

        // Step 7: Invoke the async fetch function
        fetchUser();
    }, [dispatch]);

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Container with max width for responsive layout
     *   2. Render Box as card container with white background and shadow
     *   3. Render Dashboard heading with teal color
     *   4. Conditionally render:
     *       - Spinner while loading
     *       - Error message if error exists
     *       - User information (name, email, role) if available
     *       - Default message if no user data
     *   5. Render logout buttons in a row using Flex layout
     * Output: Fully styled dashboard UI
     */
    return (
        <Container maxW="md"> {/* Step 1: Center container with max width */}
            <Box
                bg="white"          // Step 2a: White background
                color="gray.700"    // Step 2b: Dark gray text color
                p={8}               // Step 2c: Padding
                rounded="xl"        // Step 2d: Extra large rounded corners
                shadow="xl"         // Step 2e: Extra large shadow for elevation
                textAlign="center"  // Step 2f: Center aligned text
            >
                {/* Step 3: Dashboard Heading */}
                <Heading as="h1" fontSize="22px" mb={6} color="teal.600">
                    Welcome to your Dashboard
                </Heading>

                {/* Step 4: User Information Section */}
                {loading ? (
                    <Spinner size="lg" color="teal.500" /> // Step 4a: Show spinner while loading
                ) : error ? (
                    <Text color="red.500" mb={6}>{error}</Text> // Step 4b: Show error message
                ) : user ? (
                    <Stack mb={6} align="flex-start"> {/* Step 4c: Display user info left-aligned */}
                        {/* Name Row */}
                        <Flex align="center" justify="flex-start">
                            <Box w="30px" textAlign="center" mr={2} color="teal.600">
                                👤
                            </Box>
                            <Text fontSize="17px" fontWeight="semibold">
                                {user.name}
                            </Text>
                        </Flex>

                        {/* Email Row */}
                        <Flex align="center" justify="flex-start">
                            <Box w="30px" textAlign="center" mr={2} color="blue.500">
                                📧
                            </Box>
                            <Text fontSize="17px" color="gray.600">
                                {user.email}
                            </Text>
                        </Flex>

                        {/* Role Row */}
                        <Flex align="center" justify="flex-start">
                            <Box w="30px" textAlign="center" mr={2} color="purple.500">
                                🏷️
                            </Box>
                            <Text fontSize="17px" color="purple.600" fontWeight="medium">
                                {user.role}
                            </Text>
                        </Flex>
                    </Stack>
                ) : (
                    <Text color="gray.500" mb={6}>No user data available</Text> // Step 4d: Default message
                )}

                {/* Step 5: Logout Buttons Section */}
                <Flex justify="center" gap={4}> {/* Step 5a: Logout buttons in one line with gap */}
                    <LogoutButton />
                    <LogoutAllButton />
                </Flex>
            </Box>
        </Container>
    );
};

// ---------------------------- Export ----------------------------
// Export DashboardPage component as default for route rendering
export default DashboardPage;
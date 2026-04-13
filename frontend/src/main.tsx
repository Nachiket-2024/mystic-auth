// ---------------------------- External Imports ----------------------------
// Import React core
import React from 'react';

// Import ReactDOM to render React components
import ReactDOM from 'react-dom/client';

// Import Redux Provider for global store access
import { Provider } from 'react-redux';

// Import ChakraProvider and defaultSystem from Chakra UI for theming and styling
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';

// ---------------------------- Internal Imports ----------------------------
// Import the root App component
import App from './App.tsx';

// Import the Redux store
import { store } from './store/store.ts';

// ---------------------------- Application Entry Point ----------------------------
/**
 * Application Bootstrap
 * ----------------------------
 * Entry point for the React application
 * 
 * Process:
 *   1. Get the root HTML element with id 'root' where the app will be mounted
 *   2. Create a ReactDOM root instance using ReactDOM.createRoot
 *   3. Render the App component wrapped in:
 *       a. React.StrictMode for development-time checks and warnings
 *       b. Redux Provider for global store access across components
 *       c. ChakraProvider with defaultSystem for Chakra UI theming and styling
 * Output: React application mounted in the DOM with Redux and Chakra UI
 */
const rootElement = document.getElementById('root') as HTMLElement; // Step 1: Get root DOM element

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>                                    {/* Step 3a: Strict mode for development checks */}
        <Provider store={store}>                          {/* Step 3b: Redux Provider for store access */}
            <ChakraProvider value={defaultSystem}>        {/* Step 3c: Chakra UI provider for styling */}
                <App />                                   {/* Step 3d: Root App component */}
            </ChakraProvider>
        </Provider>
    </React.StrictMode>
);
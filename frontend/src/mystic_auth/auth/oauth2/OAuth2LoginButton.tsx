import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { useAuthStore } from "../../store/authStore";
import settings from "../../core/settings";
import { translateErrorCode } from "../../api/apiError";
import OAuth2LoginButtonComponent from "./OAuth2LoginButtonComponent";

interface OAuth2ButtonProps {
    onSuccess?: () => void;
    onAttempt?: () => void;
}

// This button never makes an API call of its own, it's a full-page
// redirect to the backend's OAuth2 endpoint, which handles the Google
// callback server-side and redirects back to /login with a `?error=<code>`
// query param on failure (see oauth2_login_handler.py's
// _redirect_to_login_clearing_state). `error` below is read from that param
// once on mount and translated via the same errors.json lookup the rest of
// the app uses for API responses; the param is then stripped from the URL so
// a refresh or back-navigation doesn't re-show it. `isAuthenticated`/`user`
// stay static empty values (nothing in the frontend populates them, there is
// no frontend OAuth2 callback route); only `globalAuth`, the real shared
// session status, carries live data.
const OAuth2LoginButton: React.FC<OAuth2ButtonProps> = ({ onAttempt }) => {
    const globalAuth = useAuthStore((s) => !!s.isAuthenticated);
    const [searchParams, setSearchParams] = useSearchParams();
    // Lazy initializer: reads the `error` param present on the initial
    // redirect back from Google exactly once, during the first render,
    // rather than via setState in an effect (which would trigger a
    // second, avoidable render right after mount).
    const [error] = useState<string | null>(() => {
        const errorCode = searchParams.get("error");
        return errorCode ? translateErrorCode(errorCode) : null;
    });

    useEffect(() => {
        if (!searchParams.get("error")) {
            return;
        }

        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.delete("error");
                return next;
            },
            { replace: true }
        );
        // Only the error param present on the initial redirect back from
        // Google matters here; deliberately not re-running on every
        // searchParams change (that would just observe the deletion above).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleLogin = () => {
        onAttempt?.();
        window.location.href = `${settings.apiBaseUrl}/auth/oauth2/login/google`;
    };

    return (
        <OAuth2LoginButtonComponent
            error={error}
            isAuthenticated={false}
            user={null}
            globalAuth={globalAuth}
            onLogin={handleLogin}
        />
    );
};

export default OAuth2LoginButton;

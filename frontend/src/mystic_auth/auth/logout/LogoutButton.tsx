import React, { useEffect } from "react";
import { useNavigate } from "react-router";

import { useLogoutMutation } from "./useLogoutMutation";
import LogoutButtonComponent from "./LogoutButtonComponent";

const LogoutButton: React.FC = () => {
    const logoutMutation = useLogoutMutation();
    const navigate = useNavigate();

    const handleLogout = () => {
        logoutMutation.mutate();
    };

    useEffect(() => {
        // isSuccess OR isError, not isSuccess alone: useLogoutMutation clears
        // local auth state in onSettled (runs either way - see its own
        // comment), so navigation must follow the same "always leave this
        // page" rule, or a 400/500 from POST /auth/logout would leave the
        // user stuck looking at a now-unauthenticated page with no redirect.
        if (logoutMutation.isSuccess || logoutMutation.isError) {
            navigate("/login");
        }
    }, [logoutMutation.isSuccess, logoutMutation.isError, navigate]);

    return (
        <LogoutButtonComponent
            loading={logoutMutation.isPending}
            error={logoutMutation.error?.message ?? null}
            successMessage={logoutMutation.data?.message ?? null}
            onLogout={handleLogout}
        />
    );
};

export default LogoutButton;

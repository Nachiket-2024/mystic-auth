import React from "react";
import { useNavigate, Navigate } from "react-router";
import { Stack, Text, StackSeparator } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import LoginForm from "./LoginForm";
import OAuth2Button from "../oauth2/OAuth2LoginButton";
import { useAuthStore } from "../../store/authStore";
import AuthInlineLink from "../../ui/AuthInlineLink";

// Shared surface styling (theme surface/border tokens): replaces this
// page's own hand-rolled bg="white"/boxShadow="lg" card.
import Card from "../../ui/Card";

// Shared brand header + footer shell for every unauthenticated page.
import AuthLayout from "../../layout/AuthLayout";

// The brand mark itself: replaces the old plain "Welcome" heading, since
// this is the first (and most identity-critical) card a visitor sees. See
// Logo's own docstring.
import Logo from "../../layout/Logo";

// This page reads isAuthenticated from the Zustand auth store, the single
// source of truth for "is anyone logged in right now" regardless of method
// (password or Google), rather than gating rendering on any per-method
// loading flag, which previously caused LoginForm to unmount mid-typing on
// unrelated session-check requests.
const LoginPage: React.FC = () => {
    const { t } = useTranslation("auth");
    const navigate = useNavigate();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    // Always /dashboard, deliberately never "wherever the caller was before"
    // (ProtectedRoute.tsx no longer carries that through) - a fresh login
    // should be a clean start, not a bounce back to whatever page a session
    // happened to die on.
    if (isAuthenticated) return <Navigate to="/dashboard" replace />;

    const handleLoginSuccess = () => {
        navigate("/dashboard", { replace: true });
    };

    // No page-level error banner here: LoginForm and OAuth2Button each
    // surface their own mutation errors, so a shared banner would either
    // duplicate one of them or never fire.
    return (
        <AuthLayout>
            <Card w="full" maxW="md" p={{ base: 5, md: 7 }}>
                <Stack
                    align="center"
                    textAlign="center"
                    gap={3}
                    separator={<StackSeparator />}
                >
                    <Logo />
                    {/* fg.default (not fg.muted) for stronger contrast: near-black in
                        light mode, near-white in dark mode, since this is the page's
                        primary supporting copy rather than deliberately de-emphasized
                        metadata. */}
                    <Text fontSize="md" color="fg.default">
                        {t("loginPage.subtitle")}
                    </Text>

                    <LoginForm onSuccess={handleLoginSuccess} />
                    <OAuth2Button onSuccess={handleLoginSuccess} />

                    <Text fontSize="md" color="fg.muted">
                        {t("loginPage.noAccount")}{" "}
                        <AuthInlineLink to="/signup">
                            {t("loginPage.signUp")}
                        </AuthInlineLink>
                    </Text>
                </Stack>
            </Card>
        </AuthLayout>
    );
};

export default LoginPage;

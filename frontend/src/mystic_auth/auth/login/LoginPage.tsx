import React from "react";
import { Link, useNavigate, Navigate } from "react-router";
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
import AuthLayout from "../../layout/auth_layout/AuthLayout";

// The brand mark itself: replaces the old plain "Welcome" heading, since
// this is the first (and most identity-critical) card a visitor sees. See
// Logo's own docstring.
import Logo from "../../layout/app_layout/Logo";

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
                    separator={<StackSeparator borderColor="border.default" />}
                >
                    {/* Logo doubles as "back to home": same pattern as Stripe/Linear/
                        Notion and the Clerk-hosted pages AuthLayout is modeled on -
                        the brand mark on a login screen is a link, not just a badge,
                        so a visitor who lands on /login directly isn't stuck with
                        only the browser back button to leave. */}
                    <Link to="/">
                        <Logo />
                    </Link>
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

                    {/* Same "By continuing you agree to X and Y" footnote as
                        SignupForm's - login is just as much an acceptance of
                        the current terms as signing up is, and this is also
                        the only place an unauthenticated visitor who isn't
                        signing up can reach either document. */}
                    <Text fontSize="sm" color="fg.muted">
                        {t("loginPage.agreeToTermsPrefix")}{" "}
                        <AuthInlineLink to="/terms">{t("loginPage.termsOfService")}</AuthInlineLink>{" "}
                        {t("loginPage.and")}{" "}
                        <AuthInlineLink to="/privacy">{t("loginPage.privacyPolicy")}</AuthInlineLink>
                    </Text>
                </Stack>
            </Card>
        </AuthLayout>
    );
};

export default LoginPage;

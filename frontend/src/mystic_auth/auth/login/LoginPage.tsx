import React from "react";
import { Link, useNavigate, Navigate } from "react-router";
import { Stack, Text, StackSeparator } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import LoginForm from "./LoginForm";
import OAuth2Button from "../oauth2/OAuth2LoginButton";
import { useAuthStore } from "../../store/authStore";
import AuthInlineLink from "../../ui/AuthInlineLink";

import Card from "../../ui/Card";

// Shared brand header + footer shell for every unauthenticated page.
import AuthLayout from "../../layout/auth_layout/AuthLayout";

import Logo from "../../layout/app_layout/Logo";

// Reads isAuthenticated from the Zustand auth store (source of truth regardless of
// login method) rather than a per-method loading flag, which used to unmount
// LoginForm mid-typing on unrelated session-check requests.
const LoginPage: React.FC = () => {
    const { t } = useTranslation("auth");
    const navigate = useNavigate();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    // Always /dashboard, never "wherever the caller was before": a fresh login should
    // be a clean start, not a bounce back to whatever page a session died on.
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
                    {/* Logo doubles as "back to home" so a visitor landing on /login
                        directly isn't stuck with only the browser back button. */}
                    <Link to="/">
                        <Logo />
                    </Link>
                    {/* fg.default, not fg.muted: this is primary supporting copy, not
                        de-emphasized metadata. */}
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

                    {/* Same terms footnote as SignupForm's: login accepts the current
                        terms too, and this is the only place a visitor who isn't
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

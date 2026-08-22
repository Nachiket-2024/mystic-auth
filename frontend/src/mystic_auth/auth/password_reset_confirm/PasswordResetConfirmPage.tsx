import React from "react";
import { Stack, Heading, Text, StackSeparator } from "@chakra-ui/react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import PasswordResetConfirmForm from "./PasswordResetConfirmForm";

// Shared surface styling (theme surface/border tokens): replaces this
// page's own hand-rolled bg="white"/boxShadow="lg" card.
import Card from "../../ui/Card";
import AuthInlineLink from "../../ui/AuthInlineLink";

// Shared brand header + footer shell for every unauthenticated page.
import AuthLayout from "../../layout/auth_layout/AuthLayout";
import Logo from "../../layout/app_layout/Logo";

const PasswordResetConfirmPage: React.FC = () => {
    const { t } = useTranslation("auth");
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") || "";

    const hasTokenFromUrl = !!token;

    return (
        <AuthLayout>
            <Card w="full" maxW="3xl" p={{ base: 5, md: 7 }}>
                <Stack align="center" textAlign="center" gap={2} separator={<StackSeparator borderColor="border.default" />}>
                    <Logo />
                    <Heading size="xl" color="brand.fg">
                        {t("passwordResetConfirmPage.heading")}
                    </Heading>

                    {hasTokenFromUrl ? (
                        <Text fontSize="md" color="fg.muted">
                            {t("passwordResetConfirmPage.withToken")}
                        </Text>
                    ) : (
                        <Text fontSize="md" color="fg.muted">
                            {t("passwordResetConfirmPage.withoutToken")}
                        </Text>
                    )}

                    <PasswordResetConfirmForm token={token} />

                    <Text fontSize="md" color="fg.muted">
                        {t("passwordResetConfirmPage.rememberPassword")}{" "}
                        <AuthInlineLink to="/login">
                            {t("passwordResetConfirmPage.backToLogin")}
                        </AuthInlineLink>
                    </Text>
                </Stack>
            </Card>
        </AuthLayout>
    );
};

export default PasswordResetConfirmPage;

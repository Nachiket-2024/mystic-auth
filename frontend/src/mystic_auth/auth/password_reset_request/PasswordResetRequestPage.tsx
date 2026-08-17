import React from "react";
import { Stack, Heading, Text, StackSeparator } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import PasswordResetRequestForm from "./PasswordResetRequestForm";

// Shared surface styling (theme surface/border tokens), replacing this
// page's own hand-rolled bg="white"/boxShadow="lg" card.
import Card from "../../ui/Card";
import AuthInlineLink from "../../ui/AuthInlineLink";

// Shared brand header + footer shell for every unauthenticated page.
import AuthLayout from "../../layout/AuthLayout";
import Logo from "../../layout/Logo";

const PasswordResetRequestPage: React.FC = () => {
    const { t } = useTranslation("auth");

    return (
        <AuthLayout>
            <Card w="full" maxW="md" p={{ base: 5, md: 7 }}>
                <Stack align="center" textAlign="center" separator={<StackSeparator />}>
                    <Logo />
                    <Heading size="xl" color="brand.fg">
                        {t("passwordResetRequestPage.heading")}
                    </Heading>

                    <Text fontSize="md" color="fg.muted">
                        {t("passwordResetRequestPage.subtitle")}
                    </Text>

                    <PasswordResetRequestForm />

                    <Text fontSize="md" color="fg.muted">
                        {t("passwordResetRequestPage.rememberPassword")}{" "}
                        <AuthInlineLink to="/login">
                            {t("passwordResetRequestPage.backToLogin")}
                        </AuthInlineLink>
                    </Text>
                </Stack>
            </Card>
        </AuthLayout>
    );
};

export default PasswordResetRequestPage;

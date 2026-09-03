import React from "react";
import { Stack, Heading, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import SignupForm from "./SignupForm";

import Card from "../../ui/Card";

// Shared brand header + footer shell for every unauthenticated page.
import AuthLayout from "../../layout/auth_layout/AuthLayout";
import Logo from "../../layout/app_layout/Logo";

const SignupPage: React.FC = () => {
    const { t } = useTranslation("auth");

    return (
        <AuthLayout>
            {/* Wider than the other auth cards since the form is genuinely wider
                (name + email side by side), same padding scale otherwise. */}
            <Card w="full" maxW="3xl" p={{ base: 5, md: 7 }}>
                <Stack textAlign="center" gap={3}>
                    <Logo />
                    <Stack gap={1}>
                        <Heading size="2xl" color="brand.fg">
                            {t("signupPage.heading")}
                        </Heading>
                        <Text fontSize="md" color="fg.muted">
                            {t("signupPage.subtitle")}
                        </Text>
                    </Stack>

                    <SignupForm />
                </Stack>
            </Card>
        </AuthLayout>
    );
};

export default SignupPage;

import React from "react";
import { useSearchParams, useNavigate } from "react-router";
import { Box, Heading, Text, VStack, Stack, StackSeparator } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import ConfirmDeleteAccountButton from "./ConfirmDeleteAccountButton";

// Shared surface styling (theme surface/border tokens), same as every other
// unauthenticated confirmation page (VerifyAccountPage, PasswordResetConfirmPage).
import Card from "../../ui/Card";
import AuthInlineLink from "../../ui/AuthInlineLink";

// Shared brand header + footer shell for every unauthenticated page.
import AuthLayout from "../../layout/auth_layout/AuthLayout";
import Logo from "../../layout/app_layout/Logo";

// Unauthenticated by design (same trust model as PasswordResetConfirmPage /
// VerifyAccountPage): reached via the link in the OAuth-only account
// deletion email (see DeleteAccountCard.tsx / decisions.md#account-lifecycle),
// which must work from whatever device/browser the caller opened it in, not
// just the one that originally requested the deletion.
const ConfirmDeleteAccountPage: React.FC = () => {
    const { t } = useTranslation("account_settings");
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const token = searchParams.get("token") || "";

    const handleSuccessRedirect = () => {
        navigate("/login", { replace: true });
    };

    return (
        <AuthLayout variant="status">
            {/* Same card width/padding/heading scale as VerifyAccountPage. */}
            <Card w="full" maxW="md" p={{ base: 5, md: 7 }} textAlign="center">
                <Box mb={4}>
                    <Logo />
                </Box>

                <Heading size="xl" color="fg.error" mb={2}>
                    {t("confirmDeletePage.heading")}
                </Heading>

                <Text fontSize="md" color="fg.muted" mb={6}>
                    {t("confirmDeletePage.subtitle")}
                </Text>

                <Stack
                    align="center"
                    gap={6}
                    separator={<StackSeparator borderColor="border.default" />}
                >
                    <ConfirmDeleteAccountButton token={token} onSuccess={handleSuccessRedirect} />

                    <VStack w="full" gap={3}>
                        <Text fontSize="md" color="fg.muted">
                            {t("confirmDeletePage.linkExpired")}
                        </Text>
                        <AuthInlineLink to="/account-settings">
                            {t("confirmDeletePage.backToAccountSettings")}
                        </AuthInlineLink>
                    </VStack>
                </Stack>
            </Card>
        </AuthLayout>
    );
};

export default ConfirmDeleteAccountPage;

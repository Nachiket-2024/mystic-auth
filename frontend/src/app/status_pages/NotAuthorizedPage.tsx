import React from "react";
import { useNavigate } from "react-router";
import { Flex, Heading, Text, VStack, Button } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { BRAND_SOLID_HOVER_PROPS } from "../sdk";

// Side-effect import: registers the "status_pages" i18next namespace so
// useTranslation("status_pages") below has something to resolve.
import "./translations/registerStatusPagesTranslations";

/**
 * NotAuthorizedPage
 * ----------------------------
 * The 403 page: where ProtectedRoute redirects an authenticated user who
 * lacks a route's required permission (see mystic_auth/authorization/ProtectedRoute.tsx).
 * Deliberately separate from NotFoundPage: "no permission" and "doesn't
 * exist" are different situations a user shouldn't have to guess between.
 */
const NotAuthorizedPage: React.FC = () => {
    const { t } = useTranslation("status_pages");
    const navigate = useNavigate();
    return (
        <Flex align="center" justify="center" h="100vh" bg="bg.canvas" px={4} textAlign="center">
            <VStack gap={4}>
                <Heading color="fg.error" size="2xl">403</Heading>

                <Text fontSize="xl" fontWeight="medium">{t("notAuthorized.message")}</Text>

                <Button
                    colorPalette="brand"
                    size="md"
                    fontWeight="bold"
                    onClick={() => navigate("/")}
                    {...BRAND_SOLID_HOVER_PROPS}
                >
                    {t("goHome")}
                </Button>
            </VStack>
        </Flex>
    );
};

export default NotAuthorizedPage;

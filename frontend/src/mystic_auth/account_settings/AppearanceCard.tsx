import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Field, HStack, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import Card from "../ui/Card";
import FormAlert from "../ui/FormAlert";
import { useUpdateMyAccountMutation } from "./useUpdateMyAccountMutation";
import { toaster } from "../ui/toaster/toasterInstance";
import { BRAND_SOLID_HOVER_PROPS, SECONDARY_BUTTON_PROPS } from "../ui/styles/buttonStyles";
import { useAppearanceStore } from "../store/appearanceStore";
import { generateBrandScale, contrastRatio } from "../theme/generateBrandScale";
import { deriveCanvasFrom } from "../theme/appearanceThemeOverrides";
import { BRAND_COLOR as DEFAULT_BRAND_COLOR } from "../core/settings";

// fg.default's fixed values (themeSemanticTokens.ts): text color doesn't
// move with the derived background, so preview boxes check against these.
const FG_LIGHT = "#3f3f46";
const FG_DARK = "#f4f4f5";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Committing to appearanceStore rebuilds Chakra's entire system, which isn't
// cheap. Doing that on every 'input' tick while dragging the native color
// picker blocked the main thread continuously, making the drag itself feel
// laggy (Chromium's picker popup shares the renderer process). The
// swatch/hex field and preview still update every tick; only the expensive
// theme commit is debounced.
const COMMIT_DEBOUNCE_MS = 100;

/**
 * Lets the signed-in user pick a custom brand color. Every pick applies
 * immediately via appearanceStore, which AppearanceThemeProvider.tsx uses to
 * rebuild Chakra's system, so this is the live app, not a separate preview.
 * The page background gradient derives automatically from the same pick
 * (see appearanceThemeOverrides.ts's deriveCanvasFrom). Save persists the
 * color (PUT /users/me) so it follows the user across devices.
 */
const AppearanceCard: React.FC = () => {
    const { t } = useTranslation("account_settings");
    // Selected as an individual primitive, not an object-literal selector:
    // Zustand's useSyncExternalStore compares snapshots by reference, and
    // `(s) => ({...})` returns a brand-new object every render, which
    // never compares equal to the previous one - React treats that as "the
    // store changed," re-renders, gets a new object again, and loops until
    // it throws "Maximum update depth exceeded" (an earlier version of
    // this file had exactly that bug, seen as a blank Appearance tab).
    const storedBrandColor = useAppearanceStore((s) => s.brandColor);
    const setBrandColor = useAppearanceStore((s) => s.setBrandColor);

    const [draftBrand, setDraftBrand] = useState(storedBrandColor ?? DEFAULT_BRAND_COLOR);
    const mutation = useUpdateMyAccountMutation();
    const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (commitTimer.current) clearTimeout(commitTimer.current);
    }, []);

    const isBrandValid = HEX_RE.test(draftBrand);
    const scale = isBrandValid ? generateBrandScale(draftBrand) : null;
    const brandLowContrast = scale ? contrastRatio(scale["600"], "#ffffff") < 3 : false;
    const canvasFrom = scale ? deriveCanvasFrom(scale) : null;

    const handleBrandPick = (hex: string) => {
        setDraftBrand(hex);
        if (!HEX_RE.test(hex)) return;

        if (commitTimer.current) clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => setBrandColor(hex), COMMIT_DEBOUNCE_MS);
    };

    const handleSave = () => {
        if (!isBrandValid) return;
        if (commitTimer.current) clearTimeout(commitTimer.current);
        setBrandColor(draftBrand);
        mutation.mutate(
            { brand_color: draftBrand },
            { onSuccess: () => toaster.create({ title: t("appearance.updatedToast"), type: "success" }) }
        );
    };

    const handleReset = () => {
        if (commitTimer.current) clearTimeout(commitTimer.current);
        setDraftBrand(DEFAULT_BRAND_COLOR);
        setBrandColor(null);
        mutation.mutate(
            { brand_color: null },
            { onSuccess: () => toaster.create({ title: t("appearance.resetToast"), type: "success" }) }
        );
    };

    return (
        <Card p={5}>
            <Heading as="h2" size="lg" mb={3} textStyle="sectionHeader">
                {t("appearance.title")}
            </Heading>
            <Stack gap={4}>
                <Text fontSize="md" color="fg.muted">
                    {t("appearance.description")}
                </Text>

                <HStack gap={4} align="flex-start" wrap="wrap">
                    <Field.Root flex="1" minW="48">
                        <Field.Label fontSize="md">{t("appearance.brandColorLabel")}</Field.Label>
                        <HStack gap={3}>
                            <Input
                                type="color"
                                value={isBrandValid ? draftBrand : DEFAULT_BRAND_COLOR}
                                onChange={(e) => handleBrandPick(e.target.value)}
                                p={1}
                                w="14"
                                h="11"
                                cursor="pointer"
                            />
                            <Input
                                value={draftBrand}
                                onChange={(e) => handleBrandPick(e.target.value)}
                                maxW="40"
                                fontFamily="mono"
                                aria-invalid={!isBrandValid}
                                size="lg"
                            />
                        </HStack>
                    </Field.Root>

                    {scale && canvasFrom && (
                        <>
                            <Box flex="1" minW="40" bg={canvasFrom.light} p={4} rounded="md" borderWidth="2px" borderColor="blackAlpha.300">
                                <Text fontSize="md" color={FG_LIGHT} mb={2}>
                                    {t("appearance.previewLight")}
                                </Text>
                                <Button bg={scale["600"]} color="white" size="sm" _hover={{}}>
                                    {t("appearance.previewButton")}
                                </Button>
                            </Box>
                            <Box flex="1" minW="40" bg={canvasFrom.dark} p={4} rounded="md" borderWidth="2px" borderColor="whiteAlpha.300">
                                <Text fontSize="md" color={FG_DARK} mb={2}>
                                    {t("appearance.previewDark")}
                                </Text>
                                <Button bg={scale["500"]} color="white" size="sm" _hover={{}}>
                                    {t("appearance.previewButton")}
                                </Button>
                            </Box>
                        </>
                    )}
                </HStack>

                {!isBrandValid && <FormAlert size="lg" status="error">Enter a valid hex color, e.g. #d97706</FormAlert>}

                <Box minH="10" visibility={isBrandValid && brandLowContrast ? "visible" : "hidden"}>
                    <FormAlert size="md" status="warning">{t("appearance.contrastWarning")}</FormAlert>
                </Box>

                {mutation.isError && <FormAlert size="lg" status="error">{mutation.error.message}</FormAlert>}

                <HStack gap={3}>
                    <Button
                        colorPalette="brand"
                        loading={mutation.isPending}
                        loadingText={t("ui_text:saving")}
                        disabled={!isBrandValid}
                        onClick={handleSave}
                        {...BRAND_SOLID_HOVER_PROPS}
                    >
                        {t("appearance.saveButton")}
                    </Button>
                    <Button onClick={handleReset} disabled={mutation.isPending} {...SECONDARY_BUTTON_PROPS}>
                        {t("appearance.resetButton")}
                    </Button>
                </HStack>
            </Stack>
        </Card>
    );
};

export default AppearanceCard;

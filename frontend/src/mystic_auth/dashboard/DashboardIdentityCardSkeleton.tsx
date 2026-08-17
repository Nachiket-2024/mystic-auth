import React from "react";
import { Box, Flex, HStack, Separator, Skeleton, SkeletonCircle, Stack, VisuallyHidden } from "@chakra-ui/react";

// Skeleton's default variant fills with the "bg.emphasized" token, which in
// this app's dark-mode palette is the exact same gray.800 as Card's own
// "bg.surface" background (see theme/system.ts) - invisible against a card,
// even mid-pulse, since the color never actually differs from what's behind
// it. "bg.muted" (gray.900 in dark mode, gray.100 in light) reads as a
// visibly distinct block in both modes instead.
const SKELETON_PROPS = { bg: "bg.muted" };

interface DashboardIdentityCardSkeletonProps {
    /** Announced to screen readers via a visually-hidden role="status" node -
     * the shimmering boxes convey "loading" visually, but carry no signal
     * of their own for anyone not seeing them, so this is the only cue a
     * screen reader user gets that the identity card is still loading. */
    loadingLabel: string;
}

/**
 * Loading placeholder for DashboardPage's identity card, shaped like its
 * loaded state (avatar circle + name/badge + email, a three-column stats
 * block, two action buttons) instead of a generic spinner, so the layout
 * doesn't jump once the real data arrives.
 */
const DashboardIdentityCardSkeleton: React.FC<DashboardIdentityCardSkeletonProps> = ({ loadingLabel }) => (
    <Flex align="stretch" justify="space-between" gap={6} wrap="wrap" rowGap={4}>
        <VisuallyHidden role="status">{loadingLabel}</VisuallyHidden>
        <HStack gap={4} alignSelf="flex-start">
            <SkeletonCircle boxSize="14" flexShrink={0} {...SKELETON_PROPS} />
            <Box>
                <HStack gap={2}>
                    <Skeleton height="5" width="36" {...SKELETON_PROPS} />
                    <Skeleton height="5" width="16" borderRadius="full" {...SKELETON_PROPS} />
                </HStack>
                <Skeleton height="4" width="48" mt={2} {...SKELETON_PROPS} />
            </Box>
        </HStack>

        <Separator orientation="vertical" display={{ base: "none", md: "block" }} />

        <HStack gap={8} align="flex-start" alignSelf="flex-start" wrap="wrap" rowGap={4}>
            {["28", "24", "32"].map((w, i) => (
                <Stack key={i} gap={2} align="center">
                    <Skeleton height="3.5" width={w} {...SKELETON_PROPS} />
                    <Skeleton height="4.5" width="12" {...SKELETON_PROPS} />
                </Stack>
            ))}
        </HStack>

        <Separator orientation="vertical" display={{ base: "none", md: "block" }} />

        <Stack gap={4} minW="36" flexShrink={0} alignSelf="flex-start">
            <Skeleton height="8" width="36" borderRadius="md" {...SKELETON_PROPS} />
            <Skeleton height="8" width="36" borderRadius="md" {...SKELETON_PROPS} />
        </Stack>
    </Flex>
);

export default DashboardIdentityCardSkeleton;

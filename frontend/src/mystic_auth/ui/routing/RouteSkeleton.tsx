import React from "react";
import { Box, Skeleton, Stack, VisuallyHidden } from "@chakra-ui/react";

// Same non-default fill reasoning as DashboardIdentityCardSkeleton's own
// SKELETON_PROPS: Skeleton's stock "bg.emphasized" fill is indistinguishable
// from Card's "bg.surface" background in dark mode.
const SKELETON_PROPS = { bg: "bg.muted" };

/**
 * Suspense fallback for App.tsx's route-level code splitting, shown only for
 * the brief window before a lazy page chunk resolves (see App.tsx's own
 * comment on why this rarely triggers in practice). Shaped like a generic
 * page - a title bar plus a couple of content blocks - rather than a bare
 * spinner, so a route that does suspend reads as "this page is arriving,"
 * not a hard blank cut.
 */
const RouteSkeleton: React.FC = () => (
    <Box maxW="container.xl" mx="auto" w="full" py={2}>
        <VisuallyHidden role="status">Loading page...</VisuallyHidden>
        <Skeleton height="8" width="48" mb="density.sectionGap" {...SKELETON_PROPS} />
        <Stack gap={4}>
            <Skeleton height="32" rounded="density.card" {...SKELETON_PROPS} />
            <Skeleton height="32" rounded="density.card" {...SKELETON_PROPS} />
        </Stack>
    </Box>
);

export default RouteSkeleton;

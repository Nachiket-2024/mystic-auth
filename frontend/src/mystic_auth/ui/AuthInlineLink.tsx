import React from "react";
import { chakra } from "@chakra-ui/react";
import { Link as RouterLink, type LinkProps as RouterLinkProps } from "react-router";

import { FAST_HOVER_TRANSITION } from "../theme/system";

// chakra(RouterLink) (not Chakra's own Link, which renders its own <a> and
// can't take over react-router's client-side `to` navigation) lets a
// react-router Link accept Chakra style props/pseudo-selectors.
const StyledRouterLink = chakra(RouterLink);

// The auth-page links (LoginForm, LoginPage, PasswordResetRequestPage,
// PasswordResetConfirmPage, SignupForm) used to be plain react-router Links
// with an inline `style` and no hover state, reading as static text rather
// than a control. Centralizing the underline/darken hover cue here means the
// five instances can't drift apart the way hand-duplicated styles could.
const AuthInlineLink: React.FC<RouterLinkProps> = (props) => (
    <StyledRouterLink
        color="brand.fg"
        fontWeight="600"
        textDecoration="none"
        transition={FAST_HOVER_TRANSITION}
        _hover={{ color: "brand.600", textDecoration: "underline" }}
        // chakra(RouterLink)'s inferred prop type intersects react-router's
        // `to: To` (a string | Partial<Path>) with Chakra's own `mask` style
        // prop, which TS can't reconcile structurally even though both
        // accept these props fine at runtime - StyledRouterLink really is
        // just RouterLink with Chakra's style props layered on. Narrowing
        // through `unknown` (not `any`) documents that this is a known
        // chakra-ui/react-router type mismatch, not a loosened contract:
        // `props` is still fully typed as RouterLinkProps above.
        {...(props as unknown as React.ComponentProps<typeof StyledRouterLink>)}
    />
);

export default AuthInlineLink;

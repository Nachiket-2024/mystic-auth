import React from "react";
import { chakra } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router";

import { FAST_HOVER_TRANSITION } from "../theme/system";

// chakra(RouterLink), not Chakra's own Link (which renders its own <a> and
// can't take over react-router's client-side `to` navigation), so a
// react-router Link accepts Chakra style props/pseudo-selectors.
const StyledRouterLink = chakra(RouterLink);

// Centralizes the underline/darken hover cue for auth-page links (LoginForm,
// LoginPage, PasswordResetRequestPage, PasswordResetConfirmPage, SignupForm),
// which used to be plain react-router Links with no hover state. Props are
// StyledRouterLink's own, so callers can pass Chakra style props too.
const AuthInlineLink: React.FC<React.ComponentProps<typeof StyledRouterLink>> = (props) => (
    <StyledRouterLink
        color="brand.fg"
        fontWeight="600"
        textDecoration="none"
        transition={FAST_HOVER_TRANSITION}
        _hover={{ color: "brand.600", textDecoration: "underline" }}
        {...props}
    />
);

export default AuthInlineLink;

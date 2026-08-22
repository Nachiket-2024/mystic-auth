import React from "react";
import { chakra } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router";

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
// Props are StyledRouterLink's own (RouterLinkProps intersected with
// Chakra's style props, e.g. `fontSize`), not bare RouterLinkProps -
// callers do pass Chakra style props here (see AccountSettingsPage).
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

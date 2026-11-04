import React, { useEffect, useRef } from "react";

import { cn } from "../styles/classNames";

interface AuthResultPanelProps {
    icon: React.ReactNode;
    /** Variants: brand for a
     * neutral "we did something" result (email sent), success/error for an
     * outcome that needs its own status color. */
    variant: "brand" | "success" | "error";
    title: string;
    description: React.ReactNode;
    /** Heading level of the title. 2 (default) when the page keeps its own h1
     * above the panel; 1 when the panel replaces the page heading (signup's
     * "Check your email" screen hides its "Create your account" h1). */
    headingLevel?: 1 | 2;
    children?: React.ReactNode;
}

// Matches FormAlert's approach: shadcn ships no built-in status palette, so
// error/success colors are applied directly with their own dark: variants.
const VARIANT_CLASSES = {
    brand: "bg-brand-tile-subtle border-brand-solid text-brand-fg",
    success: "bg-green-100 border-green-500 text-fg-success dark:bg-green-950",
    error: "bg-red-100 border-red-500 text-fg-error dark:bg-red-950",
} as const;

/**
 * Replaces a form with a result state (signup/reset "check your email",
 * reset-password success/expired-link, forgot-password success) instead of
 * leaving the filled-in form visible and clickable alongside a banner.
 * Shared across signup, password_reset_request and password_reset_confirm
 * so all three "we sent you an email" / "here's what happened" states match.
 */
const AuthResultPanel: React.FC<AuthResultPanelProps> = ({ icon, variant, title, description, headingLevel = 2, children }) => {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const Heading = headingLevel === 1 ? "h1" : "h2";

    // The form that had focus is gone by the time this renders, which drops
    // focus to the page body and leaves a screen reader silent. Moving focus
    // to the result heading announces the outcome and keeps keyboard users in place.
    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    return (
        <div
            className="flex flex-col items-center text-center gap-3 w-full"
            role={variant === "error" ? "alert" : "status"}
            aria-live={variant === "error" ? "assertive" : "polite"}
        >
            {/* Icon sits beside the title, not above it: a stacked 56px circle pushed
                the actual message down the card for no gain. */}
            <div className="flex items-center justify-center gap-2.5">
                <div className={cn("w-9 h-9 shrink-0 rounded-full flex items-center justify-center border [&_svg]:size-5", VARIANT_CLASSES[variant])}>
                    {icon}
                </div>
                <Heading ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">{title}</Heading>
            </div>
            <p className="text-base text-muted-foreground break-words whitespace-pre-wrap">{description}</p>
            {children && <div className="flex flex-col w-full gap-3 mt-1">{children}</div>}
        </div>
    );
};

export default AuthResultPanel;

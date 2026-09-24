import React from "react";
import { Navigate, Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import { ShieldCheck, KeyRound, ScrollText, Globe } from "lucide-react";

// Everything below comes from the public extension surface (../sdk), not
// internal mystic_auth/* paths. This page is the reference example for an
// app-owned public page outside the authenticated shell.
import {
    useAuthStore,
    APP_NAME,
    SUPPORT_EMAIL,
    Card,
    Logo,
    ControlCluster,
    AuthInlineLink,
    Button,
} from "../sdk";

import "../translations/registerLandingTranslations";

const HIGHLIGHTS = [
    { icon: KeyRound, key: "authentication" },
    { icon: ShieldCheck, key: "authorization" },
    { icon: ScrollText, key: "auditLog" },
    { icon: Globe, key: "multilingual" },
] as const;

/**
 * Public template landing page. Consuming applications should replace or
 * restyle this app-owned page while retaining its session redirect and the
 * public sdk import boundary.
 */
const LandingPage: React.FC = () => {
    const { t } = useTranslation("landing");
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    if (isAuthenticated) return <Navigate to="/dashboard" replace />;

    return (
        <div className="flex min-h-screen flex-col overflow-y-auto bg-bg-canvas bg-linear-to-b from-(--bg-canvas-from) to-(--bg-canvas-to)">
            <a
                href="#main-content"
                className="sr-only z-50 rounded-md bg-bg-surface px-3 py-2 text-sm font-semibold text-fg-default shadow-card focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
            >
                {t("skipToContent")}
            </a>

            <header className="flex flex-wrap items-center justify-between gap-y-2 px-4 py-3 md:px-8 md:py-4">
                <RouterLink
                    to="/"
                    aria-label={t("brandHome", { appName: APP_NAME })}
                    className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                    <Logo size="sm" />
                </RouterLink>
                <nav aria-label={t("primaryNavigation")} className="flex flex-wrap items-center justify-end gap-3">
                    <ControlCluster />
                    <Button asChild variant="brand-outline" size="sm" className="border-2">
                        <RouterLink to="/login">{t("logIn")}</RouterLink>
                    </Button>
                    <Button asChild variant="brand" size="sm">
                        <RouterLink to="/signup">{t("signUp")}</RouterLink>
                    </Button>
                </nav>
            </header>

            <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 focus:outline-none">
                <section aria-labelledby="landing-hero-title" className="mx-auto max-w-2xl text-center">
                    <h1 id="landing-hero-title" className="mb-3 text-4xl font-semibold leading-[2.75rem] tracking-[-0.02em]">
                        {t("hero.title")}
                    </h1>
                    <p className="mb-5 text-lg text-fg-muted">
                        {t("hero.subtitle", { appName: APP_NAME })}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Button asChild variant="brand" size="lg">
                            <RouterLink to="/signup">{t("hero.getStarted")}</RouterLink>
                        </Button>
                        <Button asChild variant="brand-outline" size="lg" className="border-2">
                            <RouterLink to="/login">{t("logIn")}</RouterLink>
                        </Button>
                    </div>
                </section>

                <section aria-labelledby="landing-highlights-title" className="mt-6 w-full max-w-5xl md:mt-10">
                        <h2 id="landing-highlights-title" className="mb-3 text-center text-lg font-semibold">
                            {t("highlights.heading")}
                    </h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {HIGHLIGHTS.map(({ icon: HighlightIcon, key }) => (
                            <Card as="article" key={key} className="p-4 text-left">
                                <HighlightIcon size={20} className="mb-2 text-brand-solid" aria-hidden="true" />
                                <h3 className="mb-1 font-semibold">
                                    {t(`highlights.${key}.title`)}
                                </h3>
                                <p className="text-sm text-fg-muted">
                                    {t(`highlights.${key}.description`)}
                                </p>
                            </Card>
                        ))}
                    </div>
                </section>
            </main>

            <footer className="flex justify-center px-4 py-3 md:py-4">
                <nav aria-label={t("footerNavigation")} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-fg-muted">
                    <AuthInlineLink to="/privacy">{t("footer.privacyPolicy")}</AuthInlineLink>
                    <span aria-hidden="true">·</span>
                    <AuthInlineLink to="/terms">{t("footer.termsOfService")}</AuthInlineLink>
                    {SUPPORT_EMAIL && (
                        <>
                            <span aria-hidden="true">·</span>
                            <a
                                className="font-semibold text-brand-fg no-underline hover:text-[var(--brand-600)] hover:underline"
                                href={`mailto:${SUPPORT_EMAIL}`}
                            >
                                {t("footer.support")}
                            </a>
                        </>
                    )}
                </nav>
            </footer>
        </div>
    );
};

export default LandingPage;

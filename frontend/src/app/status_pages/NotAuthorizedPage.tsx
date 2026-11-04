import React from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Home, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AuthLayout, Card, Logo, Button, Separator } from "../sdk";

// Side-effect import: registers the "status_pages" i18next namespace so
// useTranslation("status_pages") below has something to resolve.
import "../translations/registerStatusPagesTranslations";

/**
 * NotAuthorizedPage
 * ----------------------------
 * The 403 page: where ProtectedRoute redirects an authenticated user who
 * lacks a route's required permission (see mystic_auth/authorization/ProtectedRoute.tsx).
 * Deliberately separate from NotFoundPage: "no permission" and "doesn't
 * exist" are different situations a user shouldn't have to guess between.
 *
 * Rendered inside AuthLayout/Card so the font size, language and theme toggles
 * and the logo stay one click away, as on every other page.
 */
const NotAuthorizedPage: React.FC = () => {
    const { t } = useTranslation("status_pages");
    const navigate = useNavigate();
    return (
        <AuthLayout>
            <Card className="w-full max-w-md border-t-[3px] border-t-brand-solid p-5 md:p-7 text-center">
                <div className="flex flex-col items-center gap-3">
                    <Logo />
                    <Separator className="w-full bg-brand-solid" />
                    {/* text-brand-fg, not fg.error: lacking access isn't a system
                        error state for the user. */}
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="text-brand-fg" size={32} aria-hidden="true" />
                        <h1 className="text-brand-fg text-5xl font-extrabold">403</h1>
                    </div>

                    <div className="flex flex-col gap-1">
                        <h2 className="text-base font-semibold">{t("notAuthorized.title")}</h2>
                        <p className="text-sm text-fg-muted">{t("notAuthorized.hint")}</p>
                    </div>

                    <div className="flex flex-row w-full gap-3 mt-2">
                        <Button
                            className="flex-1 border-2"
                            variant="brand-outline"
                            size="lg"
                            onClick={() => navigate(-1)}
                        >
                            <ArrowLeft size={16} /> {t("goBack")}
                        </Button>
                        <Button
                            className="flex-1"
                            variant="brand"
                            size="lg"
                            onClick={() => navigate("/")}
                        >
                            <Home size={16} /> {t("goHome")}
                        </Button>
                    </div>
                </div>
            </Card>
        </AuthLayout>
    );
};

export default NotAuthorizedPage;

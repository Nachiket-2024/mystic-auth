import translations from "i18next";
import { initReactI18next } from "react-i18next";

import enUiText from "./languages/en/ui_text.json";
import enLayout from "./languages/en/layout.json";
import enAuth from "./languages/en/auth.json";
import enUsers from "./languages/en/users.json";
import enPolicies from "./languages/en/policies.json";
import enPermissions from "./languages/en/permissions.json";
import enAuthorization from "./languages/en/authorization.json";
import enAuditLog from "./languages/en/audit_log.json";
import enAccountSettings from "./languages/en/account_settings.json";
import enDashboard from "./languages/en/dashboard.json";
import enRateLimits from "./languages/en/rate_limits.json";
import enErrors from "./languages/en/errors.json";

import hiUiText from "./languages/hi/ui_text.json";
import hiLayout from "./languages/hi/layout.json";
import hiAuth from "./languages/hi/auth.json";
import hiUsers from "./languages/hi/users.json";
import hiPolicies from "./languages/hi/policies.json";
import hiPermissions from "./languages/hi/permissions.json";
import hiAuthorization from "./languages/hi/authorization.json";
import hiAuditLog from "./languages/hi/audit_log.json";
import hiAccountSettings from "./languages/hi/account_settings.json";
import hiDashboard from "./languages/hi/dashboard.json";
import hiRateLimits from "./languages/hi/rate_limits.json";
import hiErrors from "./languages/hi/errors.json";

import mrUiText from "./languages/mr/ui_text.json";
import mrLayout from "./languages/mr/layout.json";
import mrAuth from "./languages/mr/auth.json";
import mrUsers from "./languages/mr/users.json";
import mrPolicies from "./languages/mr/policies.json";
import mrPermissions from "./languages/mr/permissions.json";
import mrAuthorization from "./languages/mr/authorization.json";
import mrAuditLog from "./languages/mr/audit_log.json";
import mrAccountSettings from "./languages/mr/account_settings.json";
import mrDashboard from "./languages/mr/dashboard.json";
import mrRateLimits from "./languages/mr/rate_limits.json";
import mrErrors from "./languages/mr/errors.json";

import guUiText from "./languages/gu/ui_text.json";
import guLayout from "./languages/gu/layout.json";
import guAuth from "./languages/gu/auth.json";
import guUsers from "./languages/gu/users.json";
import guPolicies from "./languages/gu/policies.json";
import guPermissions from "./languages/gu/permissions.json";
import guAuthorization from "./languages/gu/authorization.json";
import guAuditLog from "./languages/gu/audit_log.json";
import guAccountSettings from "./languages/gu/account_settings.json";
import guDashboard from "./languages/gu/dashboard.json";
import guRateLimits from "./languages/gu/rate_limits.json";
import guErrors from "./languages/gu/errors.json";

// One namespace per feature folder under src/mystic_auth/, so translation
// files stay small and map to code ownership instead of one giant JSON.
export const NAMESPACES = [
    "ui_text",
    "layout",
    "auth",
    "users",
    "policies",
    "permissions",
    "authorization",
    "audit_log",
    "account_settings",
    "dashboard",
    "rate_limits",
    "errors",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const SUPPORTED_LANGUAGES = ["en", "hi", "mr", "gu"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
    en: "English",
    hi: "हिंदी",
    mr: "मराठी",
    gu: "ગુજરાતી",
};

translations.use(initReactI18next).init({
    resources: {
        en: {
            ui_text: enUiText,
            layout: enLayout,
            auth: enAuth,
            users: enUsers,
            policies: enPolicies,
            permissions: enPermissions,
            authorization: enAuthorization,
            audit_log: enAuditLog,
            account_settings: enAccountSettings,
            dashboard: enDashboard,
            rate_limits: enRateLimits,
            errors: enErrors,
        },
        hi: {
            ui_text: hiUiText,
            layout: hiLayout,
            auth: hiAuth,
            users: hiUsers,
            policies: hiPolicies,
            permissions: hiPermissions,
            authorization: hiAuthorization,
            audit_log: hiAuditLog,
            account_settings: hiAccountSettings,
            dashboard: hiDashboard,
            rate_limits: hiRateLimits,
            errors: hiErrors,
        },
        mr: {
            ui_text: mrUiText,
            layout: mrLayout,
            auth: mrAuth,
            users: mrUsers,
            policies: mrPolicies,
            permissions: mrPermissions,
            authorization: mrAuthorization,
            audit_log: mrAuditLog,
            account_settings: mrAccountSettings,
            dashboard: mrDashboard,
            rate_limits: mrRateLimits,
            errors: mrErrors,
        },
        gu: {
            ui_text: guUiText,
            layout: guLayout,
            auth: guAuth,
            users: guUsers,
            policies: guPolicies,
            permissions: guPermissions,
            authorization: guAuthorization,
            audit_log: guAuditLog,
            account_settings: guAccountSettings,
            dashboard: guDashboard,
            rate_limits: guRateLimits,
            errors: guErrors,
        },
    },
    lng: "en",
    fallbackLng: "en",
    ns: NAMESPACES,
    defaultNS: "ui_text",
    interpolation: {
        escapeValue: false,
    },
});

export default translations;

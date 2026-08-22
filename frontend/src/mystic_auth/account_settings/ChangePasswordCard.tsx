import React, { useEffect, useState } from "react";
import { Button, Field, Heading, Stack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import Card from "../ui/Card";
import FormAlert from "../ui/FormAlert";
import PasswordInput from "../ui/PasswordInput";
import PasswordStrengthPanel from "../auth/password_rules/PasswordStrengthPanel";
import { useUpdateMyAccountMutation } from "./useUpdateMyAccountMutation";
import { checkPasswordRules, evaluatePasswordStrength, validatePassword } from "../auth/password_rules/passwordRules";
import { toaster } from "../ui/toaster/toasterInstance";
import { BRAND_SOLID_HOVER_PROPS } from "../ui/styles/buttonStyles";
import { SEARCH_INPUT_PROPS } from "../ui/styles/inputStyles";

interface ChangePasswordCardProps {
    hasPassword: boolean;
    /** Reports whether there's an in-progress (unsaved) password edit, so
     * AccountSettingsPage can combine it with the name card's own dirty
     * state for one page-level unsaved-changes warning. */
    onDirtyChange: (isDirty: boolean) => void;
}

/**
 * ChangePasswordCard
 * ----------------------------
 * The password-change half of AccountSettingsPage: its own independent
 * mutation instance (not shared with ProfileNameCard) so saving a password
 * change never shows a loading spinner or a stale error on the unrelated
 * name card, and vice versa.
 */
const ChangePasswordCard: React.FC<ChangePasswordCardProps> = ({ hasPassword, onDirtyChange }) => {
    const { t } = useTranslation("account_settings");
    const [newPassword, setNewPassword] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [passwordError, setPasswordError] = useState("");

    const passwordMutation = useUpdateMyAccountMutation();

    const rules = checkPasswordRules(newPassword);
    const strength = evaluatePasswordStrength(newPassword);

    const isDirty = newPassword.length > 0;
    useEffect(() => {
        onDirtyChange(isDirty);
    }, [isDirty, onDirtyChange]);

    const handlePasswordSubmit = (e: React.SubmitEvent<HTMLDivElement>) => {
        e.preventDefault();
        setPasswordError("");

        const validationError = validatePassword(newPassword, t);
        if (validationError) {
            setPasswordError(validationError);
            return;
        }
        // Only an account that already has a password needs to confirm it:
        // setting one for the first time on an OAuth-only account has
        // nothing to confirm against.
        if (hasPassword && !currentPassword) {
            setPasswordError(t("changePassword.confirmCurrentRequired"));
            return;
        }

        const payload: { password: string; current_password?: string } = { password: newPassword };
        if (hasPassword) payload.current_password = currentPassword;

        passwordMutation.mutate(payload, {
            onSuccess: (data) => {
                // sessions_revoked === false: the password itself changed
                // (this succeeded), but Redis was unreachable so the
                // account's other sessions were NOT revoked - a distinct,
                // narrower warning rather than the plain success toast, so
                // this doesn't look like a completed "other devices signed
                // out" the way it normally would.
                if (data.sessions_revoked === false) {
                    toaster.create({ title: t("changePassword.updatedButSessionsNotRevokedToast"), type: "warning" });
                } else {
                    toaster.create({ title: t("changePassword.updatedToast"), type: "success" });
                }
                setNewPassword("");
                setCurrentPassword("");
            },
        });
    };

    return (
        <Card p={5} flex="1" flexBasis="80" maxW="3xl">
            <Heading as="h2" size="lg" mb={3} textStyle="sectionHeader">
                {hasPassword ? t("changePassword.changeTitle") : t("changePassword.setTitle")}
            </Heading>
            <Stack as="form" onSubmit={handlePasswordSubmit} gap={4}>
                <Field.Root>
                    <Field.Label fontSize="md">{hasPassword ? t("changePassword.newPasswordLabel") : t("changePassword.setPasswordFieldLabel")}</Field.Label>
                    <PasswordInput
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={
                            hasPassword
                                ? t("changePassword.placeholderKeepCurrent")
                                : t("changePassword.placeholderAddPassword")
                        }
                        aria-invalid={!!passwordError || passwordMutation.isError}
                        aria-describedby={passwordError ? "password-local-error" : passwordMutation.isError ? "password-mutation-error" : undefined}
                        size="lg"
                        {...SEARCH_INPUT_PROPS}
                    />
                </Field.Root>

                {/* Directly below New password, not after Current
                    password: these rules describe the new password
                    you're typing above, not the confirmation field
                    below, so they read more naturally attached to
                    the field they're actually validating. Always rendered
                    (pristine before typing starts), same reasoning as
                    SignupForm/PasswordResetConfirmForm: reserving this
                    block's height from the first render means it filling
                    in never shifts the fields below it. */}
                <PasswordStrengthPanel
                    password={newPassword}
                    label={t("changePassword.strengthLabel", { strength: strength || "-" })}
                    rules={rules}
                    pristine={!isDirty}
                    mt={1}
                />

                {/* Always rendered when the account has a password to
                    confirm against, not only once newPassword has a
                    value: this whole card should look the same the
                    moment it opens as it does mid-edit, not visibly grow
                    a field the instant you start typing. */}
                {hasPassword && (
                    <Field.Root>
                        <Field.Label fontSize="md">{t("changePassword.currentPasswordLabel")}</Field.Label>
                        <PasswordInput
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder={t("changePassword.currentPasswordPlaceholder")}
                            aria-invalid={!!passwordError}
                            aria-describedby={passwordError ? "password-local-error" : undefined}
                            size="lg"
                            {...SEARCH_INPUT_PROPS}
                        />
                    </Field.Root>
                )}

                {passwordError && <FormAlert size="lg" status="error" id="password-local-error">{passwordError}</FormAlert>}
                {passwordMutation.isError && <FormAlert size="lg" status="error" id="password-mutation-error">{passwordMutation.error.message}</FormAlert>}

                <Button
                    type="submit"
                    colorPalette="brand"
                    alignSelf="flex-start"
                    loading={passwordMutation.isPending}
                    loadingText={t("ui_text:saving")}
                    {...BRAND_SOLID_HOVER_PROPS}
                >
                    {hasPassword ? t("changePassword.updateButton") : t("changePassword.setButton")}
                </Button>
            </Stack>
        </Card>
    );
};

export default ChangePasswordCard;

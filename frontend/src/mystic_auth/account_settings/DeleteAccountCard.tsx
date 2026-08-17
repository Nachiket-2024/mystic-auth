import React, { useState } from "react";
import { Button, Field, Heading, Stack, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import Card from "../ui/Card";
import FormAlert from "../ui/FormAlert";
import PasswordInput from "../ui/PasswordInput";
import ConfirmDialog from "../ui/ConfirmDialog";
import { toaster } from "../ui/toaster/toasterInstance";
import { DESTRUCTIVE_SOLID_HOVER_PROPS } from "../ui/styles/buttonStyles";
import { SEARCH_INPUT_PROPS } from "../ui/styles/inputStyles";
import { useDeleteMyAccountMutation } from "./useDeleteMyAccountMutation";

interface DeleteAccountCardProps {
    hasPassword: boolean;
}

/**
 * DeleteAccountCard
 * ----------------------------
 * Self-service counterpart to the admin "Delete user" action on UsersPage:
 * a ConfirmDialog step since this is destructive, gated by the same
 * current-password re-confirmation ChangePasswordCard uses when this
 * account has a password. Deliberately soft-delete only, never immediate:
 * the copy below and docs/mystic_auth/security/decisions.md both describe
 * the same recoverable-for-a-grace-period behavior DELETE /users/me
 * actually implements server-side, so this card never promises something
 * the backend doesn't do.
 *
 * An OAuth-only account (hasPassword=false) has no password to re-confirm
 * with, so it doesn't get deleted synchronously from this dialog at all:
 * DELETE /users/me instead sends a confirmation email
 * (confirmation_required=true in the response - see
 * useDeleteMyAccountMutation.ts), and this card shows "check your email"
 * messaging in place of the deleted-and-signed-out toast/redirect.
 */
const DeleteAccountCard: React.FC<DeleteAccountCardProps> = ({ hasPassword }) => {
    const { t } = useTranslation("account_settings");
    const navigate = useNavigate();
    const [currentPassword, setCurrentPassword] = useState("");
    const [formError, setFormError] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmationSent, setConfirmationSent] = useState(false);

    const deleteMutation = useDeleteMyAccountMutation();

    const handleRequestDelete = (e: React.SubmitEvent<HTMLDivElement>) => {
        e.preventDefault();
        setFormError("");

        if (hasPassword && !currentPassword) {
            setFormError(t("deleteAccount.currentPasswordRequired"));
            return;
        }

        setConfirmOpen(true);
    };

    const handleConfirmDelete = () => {
        deleteMutation.mutate(
            { current_password: hasPassword ? currentPassword : undefined },
            {
                onSuccess: (data) => {
                    setConfirmOpen(false);

                    if (data.confirmation_required) {
                        setConfirmationSent(true);
                        return;
                    }

                    toaster.create({ title: t("deleteAccount.deletedToast"), type: "success" });
                    navigate("/login");
                },
                onError: () => setConfirmOpen(false),
            }
        );
    };

    return (
        <Card p={5} flex="1" flexBasis="80" maxW="lg" borderColor="red.300" _dark={{ borderColor: "red.700" }}>
            <Heading as="h2" size="md" mb={2} textStyle="sectionHeader" color="fg.error">
                {t("deleteAccount.title")}
            </Heading>
            <Text color="fg.muted" fontSize="sm" mb={4}>
                {hasPassword ? t("deleteAccount.description") : t("deleteAccount.oauthOnlyDescription")}
            </Text>

            {confirmationSent ? (
                <FormAlert status="success">{t("deleteAccount.confirmationEmailSent")}</FormAlert>
            ) : (
                <Stack as="form" onSubmit={handleRequestDelete} gap={4}>
                    {hasPassword && (
                        <Field.Root>
                            <Field.Label>{t("deleteAccount.currentPasswordLabel")}</Field.Label>
                            <PasswordInput
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder={t("deleteAccount.currentPasswordPlaceholder")}
                                aria-invalid={!!formError || deleteMutation.isError}
                                aria-describedby={
                                    formError ? "delete-account-local-error" : deleteMutation.isError ? "delete-account-mutation-error" : undefined
                                }
                                {...SEARCH_INPUT_PROPS}
                            />
                        </Field.Root>
                    )}

                    {formError && <FormAlert status="error" id="delete-account-local-error">{formError}</FormAlert>}
                    {deleteMutation.isError && (
                        <FormAlert status="error" id="delete-account-mutation-error">{deleteMutation.error.message}</FormAlert>
                    )}

                    <Button
                        type="submit"
                        colorPalette="red"
                        alignSelf="flex-start"
                        {...DESTRUCTIVE_SOLID_HOVER_PROPS}
                    >
                        {t("deleteAccount.deleteButton")}
                    </Button>
                </Stack>
            )}

            <ConfirmDialog
                isOpen={confirmOpen}
                title={t("deleteAccount.confirmTitle")}
                description={hasPassword ? t("deleteAccount.confirmDescription") : t("deleteAccount.oauthOnlyConfirmDescription")}
                confirmLabel={hasPassword ? t("deleteAccount.confirmButton") : t("deleteAccount.oauthOnlyConfirmButton")}
                isLoading={deleteMutation.isPending}
                onConfirm={handleConfirmDelete}
                onCancel={() => setConfirmOpen(false)}
            />
        </Card>
    );
};

export default DeleteAccountCard;

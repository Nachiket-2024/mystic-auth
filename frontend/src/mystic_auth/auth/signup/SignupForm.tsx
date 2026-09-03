import React, { useState } from "react";
import { Stack, Input, Button, Text } from "@chakra-ui/react";
import { Field as ChakraField } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { useSignupMutation } from "./useSignupMutation";
import FormAlert from "../../ui/FormAlert";
import PasswordInput from "../../ui/PasswordInput";
import AuthInlineLink from "../../ui/AuthInlineLink";
import { BRAND_SOLID_HOVER_PROPS } from "../../ui/styles/buttonStyles";

// Shared password policy logic and checklist UI, kept identical to PasswordResetConfirmForm.
import { checkPasswordRules, evaluatePasswordStrength, validatePassword } from "../password_rules/passwordRules";
import PasswordStrengthPanel from "../password_rules/PasswordStrengthPanel";

const SignupForm: React.FC = () => {
    const { t } = useTranslation("auth");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [localError, setLocalError] = useState("");
    const [passwordStrength, setPasswordStrength] = useState<"Weak" | "Medium" | "Strong" | "">("");

    const signupMutation = useSignupMutation();

    const handlePasswordChange = (value: string) => {
        setPassword(value);
        setPasswordStrength(evaluatePasswordStrength(value));
    };

    const handleSubmit = (e: React.SubmitEvent<HTMLDivElement>) => {
        e.preventDefault();

        const passwordError = validatePassword(password, t);
        if (passwordError) {
            setLocalError(passwordError);
            return;
        }

        if (password !== confirmPassword) {
            setLocalError(t("signup.passwordsDoNotMatch"));
            return;
        }

        setLocalError("");
        signupMutation.mutate(
            { name, email, password },
            {
                // Clears sensitive fields only (name/email stay as a receipt of what
                // was submitted); combined with the disabled button below, this
                // blocks an accidental duplicate submit after signup succeeded.
                onSuccess: () => {
                    setPassword("");
                    setConfirmPassword("");
                    setPasswordStrength("");
                },
            }
        );
    };

    const rules = checkPasswordRules(password);
    const passwordErrorId = localError ? "signup-password-error" : signupMutation.isError ? "signup-mutation-error" : undefined;

    return (
        <Stack as="form" onSubmit={handleSubmit} w="full">
            {/* Column on narrow screens: side-by-side Name/Email is what makes this
                card wider than the other auth cards, which overflowed a 375px
                viewport before this broke to a single column there. */}
            <Stack direction={{ base: "column", sm: "row" }}>
                <ChakraField.Root required flex={1}>
                    <ChakraField.Label>{t("signup.nameLabel")}</ChakraField.Label>
                    <Input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={t("signup.namePlaceholder")}
                        maxLength={100}
                    />
                </ChakraField.Root>

                <ChakraField.Root required flex={1}>
                    <ChakraField.Label>{t("signup.emailLabel")}</ChakraField.Label>
                    <Input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder={t("signup.emailPlaceholder")}
                    />
                </ChakraField.Root>
            </Stack>

            <ChakraField.Root required>
                <ChakraField.Label>{t("signup.passwordLabel")}</ChakraField.Label>
                <PasswordInput
                    value={password}
                    onChange={e => handlePasswordChange(e.target.value)}
                    placeholder={t("signup.passwordPlaceholder")}
                    aria-invalid={!!localError || signupMutation.isError}
                    aria-describedby={passwordErrorId}
                    maxLength={128}
                />
                {/* Always rendered, even before typing starts (neutral "-" placeholder),
                    so the strength meter filling in never shifts the fields below it. */}
                <PasswordStrengthPanel
                    password={password}
                    label={t("signup.strengthLabel", { strength: passwordStrength || "-" })}
                    rules={rules}
                    pristine={!password}
                    mt={1}
                />
            </ChakraField.Root>

            <ChakraField.Root required>
                <ChakraField.Label>{t("signup.confirmPasswordLabel")}</ChakraField.Label>
                <PasswordInput
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder={t("signup.confirmPasswordPlaceholder")}
                    aria-invalid={!!localError}
                    aria-describedby={localError ? "signup-password-error" : undefined}
                    maxLength={128}
                />
            </ChakraField.Root>

            {localError && <FormAlert status="error" id="signup-password-error">{localError}</FormAlert>}
            {signupMutation.isError && (
                <FormAlert status="error" id="signup-mutation-error">{signupMutation.error.message}</FormAlert>
            )}
            {signupMutation.isSuccess && (
                <FormAlert status="success">{signupMutation.data.message}</FormAlert>
            )}

            {/* Signup shows a spinner and disables itself while the request
                is in flight, preventing double-submit. */}
            <Button
                type="submit"
                colorPalette="brand"
                w="full"
                fontSize="md"
                loading={signupMutation.isPending}
                loadingText={t("signup.signingUp")}
                disabled={signupMutation.isSuccess}
                {...BRAND_SOLID_HOVER_PROPS}
            >
                {t("signup.submitButton")}
            </Button>

            <Text fontSize="sm" color="fg.muted" textAlign="center">
                {t("signup.agreeToTermsPrefix")}{" "}
                <AuthInlineLink to="/terms">{t("signup.termsOfService")}</AuthInlineLink>{" "}
                {t("signup.and")}{" "}
                <AuthInlineLink to="/privacy">{t("signup.privacyPolicy")}</AuthInlineLink>
            </Text>

            {/* Matches LoginPage's reciprocal link treatment: a plain inline link, not
                a second competing button, so both pages read as one consistent pattern. */}
            <Text fontSize="md" color="fg.muted" textAlign="center">
                {t("signup.alreadyHaveAccount")}{" "}
                <AuthInlineLink to="/login">
                    {t("signup.login")}
                </AuthInlineLink>
            </Text>
        </Stack>
    );
};

export default SignupForm;

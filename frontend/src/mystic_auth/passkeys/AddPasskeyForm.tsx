import React from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useTranslation } from "react-i18next";

import { Button } from "../ui/buttons/Button";
import FormAlert from "../ui/feedback/FormAlert";
import { Input } from "../ui/inputs/Input";
import { Label } from "../ui/shadcn/label";

interface AddPasskeyFormProps {
    name: string;
    onNameChange: (name: string) => void;
    onSubmit: (name: string) => void;
    isPending: boolean;
}

/** Label field plus "Add a passkey". The label is chosen by the user, never detected from the device. */
const AddPasskeyForm: React.FC<AddPasskeyFormProps> = ({ name, onNameChange, onSubmit, isPending }) => {
    const { t } = useTranslation("account_settings");
    if (!browserSupportsWebAuthn()) return <FormAlert status="warning">{t("passkeys.unsupported")}</FormAlert>;
    return (
        <form
            className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5"
            onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) onSubmit(name.trim());
            }}
        >
            <div className="flex flex-col gap-1.5 w-full sm:max-w-md">
                <Label htmlFor="passkey-name">{t("passkeys.nameLabel")}</Label>
                <Input id="passkey-name" value={name} maxLength={64} required
                    onChange={(event) => onNameChange(event.target.value)}
                    placeholder={t("passkeys.namePlaceholder")} />
            </div>
            <Button type="submit" variant="brand" loading={isPending}>{t("passkeys.addButton")}</Button>
        </form>
    );
};

export default AddPasskeyForm;

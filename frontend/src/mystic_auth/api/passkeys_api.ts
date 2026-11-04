import api from "./axiosInstance";

export const PASSKEYS_QUERY_KEY = ["myPasskeys"] as const;

export interface PasskeyCredential {
    id: number;
    name: string;
    created_at: string;
    last_used_at: string | null;
}

export const listPasskeysApi = () => api.get<PasskeyCredential[]>("/auth/passkeys");
export const beginPasskeyRegistrationApi = (name: string) =>
    api.post("/auth/passkeys/registration/options", { name });
export const completePasskeyRegistrationApi = (name: string, credential: unknown) =>
    api.post("/auth/passkeys/registration/verify", { name, credential });
export const renamePasskeyApi = (id: number, name: string) =>
    api.patch(`/auth/passkeys/${id}`, { name });
export type BulkRemovePayload = { ids: number[] } | { all: true };
export const bulkRemovePasskeysApi = (payload: BulkRemovePayload) =>
    api.post<{ detail: string; removed: number }>("/auth/passkeys/bulk-remove", payload);
export const removePasskeyApi = (id: number) => api.delete(`/auth/passkeys/${id}`);
export const beginPasskeyAuthenticationApi = () => api.post("/auth/passkeys/authentication/options");
export const completePasskeyAuthenticationApi = (credential: unknown) =>
    api.post("/auth/passkeys/authentication/verify", credential);
export const confirmWithPasswordApi = (password: string) =>
    api.post("/auth/passkeys/step-up/password", { password });
export const confirmWithPasskeyApi = (credential: unknown) =>
    api.post("/auth/passkeys/step-up/passkey", credential);

export const STEP_UP_REQUIRED_CODE = "PASSKEY_STEP_UP_REQUIRED";

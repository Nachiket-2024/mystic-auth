import type { TFunction } from "i18next";

// The shape of `t` that table/label helpers accept. Using i18next's own
// TFunction (any namespace) means every `useTranslation(...)` result is
// assignable, including the stricter typing introduced in i18next 27.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Translate = TFunction<any>;

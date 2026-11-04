import React from "react";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

import AppTooltip from "../ui/feedback/AppTooltip";
import Badge from "../ui/badges/Badge";
import { Button } from "../ui/buttons/Button";
import { toaster } from "../ui/toaster/toasterInstance";
import { cn } from "../ui/styles/classNames";
import { isDestructiveAction } from "../authorization/destructiveActions";
import { formatPolicyActionLabel } from "./policyCardHelpers";

// A small icon per verb-group header. Falls back to a bare Circle for a verb this list doesn't
// recognize (a fork's own action vocabulary).
interface PolicyActionGroupsProps {
  actions: string[];
}

/**
 * PolicyActionGroups
 * ----------------------------
 * A policy's actions as readable permission cards, shared by the policy card
 * and PolicyDetailsDialog's Actions field so both read identically.
 *
 * Groups flow in CSS multi-column layout (`column-width`) so a multi-verb policy
 * does not read as one long list. `breakInside: "avoid"` keeps each group's
 * header and rows together in one column.
 */
const PolicyActionGroups: React.FC<PolicyActionGroupsProps> = ({ actions }) => {
  const { t } = useTranslation(["policies", "users"]);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {actions.map((a) => {
        return (
          <div
            key={a}
            className="flex min-w-0 items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-2.5"
          >
            <p
              className={cn(
                "text-sm line-clamp-2 flex-1 min-w-0",
                isDestructiveAction(a) ? "text-red-fg" : "text-fg-default",
              )}
            >
              {formatPolicyActionLabel(a)}
            </p>
            {isDestructiveAction(a) && (
              <Badge
                size="xs"
                colorPalette="red"
                variant="subtle"
                className="shrink-0"
              >
                {t("users:accessDialog.sensitive")}
              </Badge>
            )}
            <AppTooltip content={t("users:accessDialog.copyKey", { key: a })}>
              <Button
                size="2xs"
                variant="ghost"
                className="p-0.5 min-w-0 h-auto text-fg-muted shrink-0 opacity-60 focus-visible:opacity-100"
                aria-label={t("users:accessDialog.copyKey", { key: a })}
                onClick={(event) => {
                  event.stopPropagation();
                  navigator.clipboard?.writeText(a).catch(() => {});
                  toaster.create({
                    title: t("users:accessDialog.copyKeyToast", { key: a }),
                    type: "info",
                  });
                }}
              >
                <Copy size={12} aria-hidden="true" />
              </Button>
            </AppTooltip>
          </div>
        );
      })}
    </div>
  );
};

export default PolicyActionGroups;

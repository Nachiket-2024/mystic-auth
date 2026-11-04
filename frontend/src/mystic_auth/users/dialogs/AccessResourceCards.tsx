import React, { useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../ui/styles/classNames";
import DataTable, { type DataTableColumn } from "../../ui/DataTable/DataTable";
import { isDestructiveAction } from "../../authorization/destructiveActions";
import { groupByResourceType } from "../../policies/logic/effectiveGrants";
import { formatPolicyActionLabel, formatResourceTypeLabel } from "../../policies/policyCardHelpers";

export interface AccessChipItem {
    action: string;
    resource_type: string;
    /** Short label(s) naming where this grant came from - a policy name, or
     * "Direct". Omit for a list where the source is already obvious from
     * context (e.g. a raw direct-grants-only list). */
    sourceLabels?: string[];
}

interface AccessResourceCardsProps {
    items: AccessChipItem[];
    emptyText: string;
}

/**
 * AccessResourceCards
 * ----------------------------
 * Groups a flat list of (action, resource_type[, source]) grants into one
 * collapsible card per resource type, each a DataTable (Action/Source
 * columns), with the same header layout as PermissionsPage's groups.
 * Groups start expanded, unlike PermissionsPage: that page lists the whole
 * catalog (worth collapsing), while this shows one user's or policy's grants,
 * which the viewer opened the dialog to read.
 * Used by UserDetailsDialog, PolicyDetailsDialog and AccountStatusCard.
 */
const AccessResourceCards: React.FC<AccessResourceCardsProps> = ({ items, emptyText }) => {
    const { t } = useTranslation(["permissions", "policies"]);
    // Tracks manually-collapsed groups rather than expanded ones, so the
    // default (nothing in the set) is "everything expanded" without needing
    // to know the resource types up front.
    const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
    const toggleTypeExpanded = (type: string) => {
        setCollapsedTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    };

    if (items.length === 0) {
        return <p className="text-fg-muted">{emptyText}</p>;
    }

    const groups = groupByResourceType(items);

    const columns: DataTableColumn<AccessChipItem>[] = [
        {
            key: "action",
            header: t("permissions:columns.action"),
            width: "14rem",
            truncate: true,
            render: (item) => (
                <div className="flex items-center gap-1.5">
                    <span
                        className={
                            isDestructiveAction(item.action)
                                ? "text-sm font-medium text-red-fg"
                                : "text-sm font-medium text-fg-default"
                        }
                    >
                        {formatPolicyActionLabel(item.action)}
                    </span>
                    {isDestructiveAction(item.action) && (
                        <TriangleAlert size={13} aria-hidden="true" color="var(--red-fg)" />
                    )}
                </div>
            ),
        },
        {
            key: "source",
            header: t("permissions:columns.source"),
            render: (item) =>
                item.sourceLabels && item.sourceLabels.length > 0 ? (
                    <p className="text-fg-muted">{item.sourceLabels.join(", ")}</p>
                ) : null,
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            {[...groups.entries()].map(([resourceType, grants]) => {
                const isExpanded = !collapsedTypes.has(resourceType);
                return (
                    <div key={resourceType}>
                        <div
                            className={cn(
                                "flex items-center justify-between px-4 py-2.5 border border-border-default bg-bg-surface cursor-pointer rounded-t-lg text-sm leading-5",
                                isExpanded ? "rounded-b-none border-b-0" : "rounded-b-lg border-b"
                            )}
                            onClick={() => toggleTypeExpanded(resourceType)}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    toggleTypeExpanded(resourceType);
                                }
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <ChevronRight
                                    size={16}
                                    aria-hidden="true"
                                    style={{ transform: isExpanded ? "rotate(90deg)" : undefined, transition: "transform var(--duration-hover)" }}
                                />
                                <p title={resourceType}>{formatResourceTypeLabel(resourceType, t("permissions:page.allResourceTypes"))}</p>
                            </div>
                            <p className="text-fg-muted">
                                {t("permissions:page.actionCount", { count: grants.length })}
                            </p>
                        </div>
                        {isExpanded && (
                            <DataTable
                                ariaLabel={formatResourceTypeLabel(resourceType, t("permissions:page.allResourceTypes"))}
                                columns={columns}
                                rows={grants}
                                rowKey={(g) => `${g.action}:${g.resource_type}`}
                                startIndex={0}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default AccessResourceCards;

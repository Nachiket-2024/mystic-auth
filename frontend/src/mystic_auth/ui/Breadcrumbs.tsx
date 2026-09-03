import React from "react";
import { Breadcrumb } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router";

export interface BreadcrumbEntry {
    label: string;
    /** Omit for the current/last page - rendered as plain text instead of a
     * link. The last entry always renders as the current page regardless of
     * whether it sets `to`. */
    to?: string;
}

interface BreadcrumbsProps {
    items: BreadcrumbEntry[];
}

/**
 * Reusable breadcrumb trail: an ordered `{ label, to? }` list, rendered as
 * links for every entry except the last, which always renders as the
 * current, non-clickable page. No page in this template needs one yet (the
 * nav is flat - see PageContainer's `breadcrumbs` prop) - this exists as a
 * ready-made pattern for the first nested/detail route.
 */
const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
    if (items.length === 0) return null;

    return (
        <Breadcrumb.Root fontSize="sm" color="fg.muted" mb={2}>
            <Breadcrumb.List>
                {items.map((item, index) => {
                    const isCurrent = index === items.length - 1;
                    return (
                        <React.Fragment key={item.to ?? item.label}>
                            <Breadcrumb.Item>
                                {isCurrent || !item.to ? (
                                    <Breadcrumb.CurrentLink color="fg.default" fontWeight="medium">
                                        {item.label}
                                    </Breadcrumb.CurrentLink>
                                ) : (
                                    <Breadcrumb.Link asChild>
                                        <RouterLink to={item.to}>{item.label}</RouterLink>
                                    </Breadcrumb.Link>
                                )}
                            </Breadcrumb.Item>
                            {!isCurrent && <Breadcrumb.Separator />}
                        </React.Fragment>
                    );
                })}
            </Breadcrumb.List>
        </Breadcrumb.Root>
    );
};

export default Breadcrumbs;

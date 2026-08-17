import React from "react";
import { Breadcrumb } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router";

export interface BreadcrumbEntry {
    label: string;
    /** Omit for the current/last page - rendered as plain text instead of a
     * link, same as omitting it on any trailing entry (whichever comes
     * last in the array always renders as the current page regardless of
     * whether it happens to set `to`). */
    to?: string;
}

interface BreadcrumbsProps {
    items: BreadcrumbEntry[];
}

/**
 * Reusable breadcrumb trail: an ordered `{ label, to? }` list, rendered as
 * links (react-router `Link`) for every entry except the last, which always
 * renders as the current, non-clickable page regardless of whether it sets
 * `to`. No current page in this template actually needs one yet (the nav is
 * flat - see PageContainer's own `breadcrumbs` prop docstring) - this
 * exists so the first nested/detail route (e.g. a user's own detail page
 * reached from Users) has a ready-made pattern instead of inventing one
 * from scratch.
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

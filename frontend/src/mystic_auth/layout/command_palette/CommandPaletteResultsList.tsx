import React from "react";
import { HStack, Stack, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { GROUP_LABEL_KEY, type Result } from "./CommandPaletteResults";

interface CommandPaletteResultsListProps {
    filtered: Result[];
    kindCount: number;
    activeIndex: number;
    setActiveIndex: (index: number) => void;
    goTo: (to: string) => void;
}

/** CommandPalette's result list: grouped rows with a header wherever the
 * result kind changes, and the currently-highlighted row (keyboard or
 * mouse-hover) shown selected. Pulled out of CommandPalette.tsx so that file
 * only owns the dialog shell/input/keyboard-navigation wiring. */
const CommandPaletteResultsList: React.FC<CommandPaletteResultsListProps> = ({
    filtered,
    kindCount,
    activeIndex,
    setActiveIndex,
    goTo,
}) => {
    const { t } = useTranslation("layout");

    if (filtered.length === 0) {
        return (
            <Text px={4} py={6} textAlign="center" color="fg.muted" fontSize="sm">
                {t("commandPalette.noResults")}
            </Text>
        );
    }

    return (
        <>
            {filtered.map((item, i) => {
                const Icon = item.icon;
                const isActive = i === activeIndex;
                // A group header renders right before the first item of
                // that kind - cheaper than a second pass to build sections,
                // and `filtered` is already ordered pages-then-content-then-users.
                const isFirstOfKind = kindCount > 1 && (i === 0 || filtered[i - 1].kind !== item.kind);
                return (
                    <React.Fragment key={`${item.kind}:${item.to}:${item.label}`}>
                        {isFirstOfKind && (
                            <Text
                                px={4}
                                pt={i === 0 ? 1 : 3}
                                pb={1}
                                fontSize="xs"
                                fontWeight="semibold"
                                color="fg.muted"
                                textTransform="uppercase"
                            >
                                {t(GROUP_LABEL_KEY[item.kind])}
                            </Text>
                        )}
                        <HStack
                            as="button"
                            w="100%"
                            minW={0}
                            textAlign="left"
                            px={4}
                            py={2.5}
                            gap={3}
                            bg={isActive ? "brand.selected" : "transparent"}
                            onMouseEnter={() => setActiveIndex(i)}
                            onClick={() => goTo(item.to)}
                            cursor="pointer"
                            color="fg.default"
                        >
                            {Icon && <Icon size={16} aria-hidden="true" style={{ flexShrink: 0 }} />}
                            {/* A real user's name/email result (unlike every other
                                palette row, all short translated labels) can be
                                arbitrarily long - truncate with an ellipsis instead
                                of wrapping unevenly against the fixed-size icon. */}
                            <Stack gap={0} minW={0} flex="1 1 auto">
                                <Text fontWeight="medium" truncate title={item.label}>{item.label}</Text>
                                {item.sublabel && (
                                    <Text fontSize="xs" color="fg.muted" truncate title={item.sublabel}>
                                        {item.sublabel}
                                    </Text>
                                )}
                            </Stack>
                        </HStack>
                    </React.Fragment>
                );
            })}
        </>
    );
};

export default CommandPaletteResultsList;

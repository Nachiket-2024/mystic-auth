import React, { useState } from "react";
import { IconButton, Input, InputGroup, type InputProps } from "@chakra-ui/react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FAST_HOVER_TRANSITION } from "../theme/system";

// Forwards every Input prop except `type`, which this component owns so it
// can toggle between "password" and "text" internally.
type PasswordInputProps = Omit<InputProps, "type">;

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>((props, ref) => {
    const { t } = useTranslation("ui_text");
    const [visible, setVisible] = useState(false);

    return (
        <InputGroup
            endElement={
                <IconButton
                    aria-label={visible ? t("hidePassword") : t("showPassword")}
                    variant="ghost"
                    size="sm"
                    tabIndex={-1}
                    // Plain ghost is invisible at rest (no border, no fill),
                    // same issue ICON_BUTTON_PROPS fixes for the navbar's
                    // icon-only controls: without a hover cue this reads as
                    // a static glyph, not a button. Muted at rest so it
                    // doesn't outcompete the input's own text, then a soft
                    // background tint + full-contrast icon on hover/focus so
                    // it visibly "lights up" as clickable - lighter than
                    // ICON_BUTTON_PROPS's solid fill since this lives inside
                    // an input rather than standing alone on a toolbar.
                    color="fg.muted"
                    _hover={{ bg: "gray.200", color: "fg.default" }}
                    _dark={{ _hover: { bg: "gray.700" } }}
                    transition={FAST_HOVER_TRANSITION}
                    onClick={() => setVisible((v) => !v)}
                >
                    {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </IconButton>
            }
        >
            <Input ref={ref} type={visible ? "text" : "password"} {...props} />
        </InputGroup>
    );
});
PasswordInput.displayName = "PasswordInput";

export default PasswordInput;

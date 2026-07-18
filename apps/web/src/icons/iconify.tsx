import type {IconProps} from "@iconify/react";

import {addCollection, Icon} from "@iconify/react";
import {forwardRef} from "react";

import gravityIcons from "./gravity-ui/icons.json";

addCollection(gravityIcons);

export const gravityIconNames = Object.keys(gravityIcons.icons).sort();

export type IconifyProps = Omit<IconProps, "icon"> & {
  /**
   * Bare names resolve to the bundled Gravity UI icon set by default.
   * Use prefixed Iconify names such as "logos:github-icon",
   * "simple-icons:x", or "flag:us-4x3" when the UI needs remote icon sets.
   */
  icon: IconProps["icon"] | string;
  isGravityIcon?: boolean;
};

export const Iconify = forwardRef<SVGSVGElement, IconifyProps>(
  ({icon: iconProp, isGravityIcon, ...props}, ref) => {
    const shouldUseGravityIcon =
      typeof iconProp === "string" && (isGravityIcon ?? !iconProp.includes(":"));
    const icon = shouldUseGravityIcon ? "gravity-ui:" + iconProp : iconProp;

    return <Icon {...props} ref={ref} icon={icon} />;
  },
);

Iconify.displayName = "HeroUIBuilder.Iconify";

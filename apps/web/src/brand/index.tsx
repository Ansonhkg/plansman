import type {SVGProps} from "react";

import metadata from "./metadata.json";
import guidelines from "./guidelines.json";

type BrandImageAsset = {
  alt?: string;
  height?: number;
  src?: string;
  width?: number;
};

type BrandMetadata = typeof metadata & {
  assets?: {
    favicon?: string;
    isotipo?: BrandImageAsset;
    logo?: BrandImageAsset;
    logotipo?: BrandImageAsset;
    mark?: BrandImageAsset;
    ogImage?: string;
  };
};

export const brand = metadata as BrandMetadata;
export const brandGuidelines = guidelines;

export type BrandIconProps = SVGProps<SVGSVGElement>;

export function BrandLogotipo({className, height, width, ...props}: BrandIconProps) {
  const asset = brand.assets?.logotipo ?? brand.assets?.logo;

  if (asset?.src) {
    return (
      <img
        alt={asset.alt ?? brand.name}
        className={className}
        height={height ?? asset.height ?? 31}
        src={asset.src}
        width={width ?? asset.width}
      />
    );
  }

  const mark = brand.assets?.isotipo ?? brand.assets?.mark;

  if (mark?.src) {
    return (
      <svg
        aria-label={brand.name}
        className={className}
        height={height ?? 31}
        role="img"
        viewBox="0 0 170 44"
        width={width ?? 128}
        {...props}
      >
        <image
          height="44"
          href={mark.src}
          preserveAspectRatio="xMidYMid meet"
          width="44"
          x="0"
          y="0"
        />
        <text
          fill="currentColor"
          fontFamily="var(--brand-font-heading, var(--font-sans, system-ui, sans-serif))"
          fontSize="19"
          fontWeight="700"
          x="52"
          y="29"
        >
          {brand.name}
        </text>
      </svg>
    );
  }

  return (
    <svg
      aria-label={brand.name}
      className={className}
      height={height ?? 31}
      role="img"
      viewBox="0 0 170 44"
      width={width ?? 128}
      {...props}
    >
      <circle cx="22" cy="22" fill="currentColor" opacity="0.16" r="20" />
      <path
        d="M28.8 10.6c.3-1.1-.8-1.8-1.8-1.1L12.5 19.7c-1 .7-.8 2.3.4 2.3h5.8l-3.2 11.4c-.3 1.1.8 1.8 1.8 1.1l14.5-10.2c1-.7.8-2.3-.4-2.3h-5.8l3.2-11.4Z"
        fill="currentColor"
      />
      <text
        fill="currentColor"
        fontFamily="var(--brand-font-heading, var(--font-sans, system-ui, sans-serif))"
        fontSize="19"
        fontWeight="700"
        x="52"
        y="29"
      >
        {brand.name}
      </text>
    </svg>
  );
}

export function BrandIsotipo({className, height, width, ...props}: BrandIconProps) {
  const asset = brand.assets?.isotipo ?? brand.assets?.mark;

  if (asset?.src) {
    return (
      <img
        alt={asset.alt ?? brand.name}
        className={className}
        height={height ?? asset.height ?? 44}
        src={asset.src}
        width={width ?? asset.width ?? 44}
      />
    );
  }

  return (
    <svg
      aria-label={brand.name}
      className={className ?? "text-accent"}
      height={height ?? 44}
      role="img"
      viewBox="0 0 44 44"
      width={width ?? 44}
      {...props}
    >
      <circle cx="22" cy="22" fill="currentColor" opacity="0.16" r="20" />
      <path
        d="M28.8 10.6c.3-1.1-.8-1.8-1.8-1.1L12.5 19.7c-1 .7-.8 2.3.4 2.3h5.8l-3.2 11.4c-.3 1.1.8 1.8 1.8 1.1l14.5-10.2c1-.7.8-2.3-.4-2.3h-5.8l3.2-11.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export const BrandLogo = BrandLogotipo;
export const BrandMark = BrandIsotipo;

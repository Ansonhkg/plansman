import type {NodePath} from "@babel/traverse";
import type * as BabelTypes from "@babel/types";
import type {RawSourceMap} from "source-map-js";

import {SourceMapConsumer} from "source-map-js";

type BabelFile = {
  opts: {
    filename?: string;
  };
};

type BabelState = {
  file: BabelFile;
};

type PluginOptions = {
  inputSourceMap?: RawSourceMap | string;
  types: typeof BabelTypes;
};

export default function injectDataLocatorPlugin(
  babel: {assertVersion: (version: number) => void; types: typeof BabelTypes},
  options: PluginOptions,
) {
  babel.assertVersion(7);

  const t = babel.types;
  const consumer = createSourceMapConsumer(options.inputSourceMap);

  return {
    name: "heroui-inject-data-locator",
    visitor: {
      JSXElement(path: NodePath<BabelTypes.JSXElement>, state: BabelState) {
        const openingElement = path.node.openingElement;
        const elementName = getElementName(t, openingElement.name);

        if (!isLocatableElementName(elementName)) return;

        const hasDataLocator = openingElement.attributes.some(
          (attribute) => t.isJSXAttribute(attribute) && attribute.name.name === "data-locator",
        );

        if (hasDataLocator || !path.node.loc) return;

        const filename = state.file.opts.filename ?? "unknown";
        const location = getOriginalLocation(consumer, path.node.loc.start);
        const locator = `${getSourceFilePath(filename)}:${elementName}:${location.line}:${location.column}`;

        openingElement.attributes.push(
          t.jsxAttribute(t.jsxIdentifier("data-locator"), t.stringLiteral(locator)),
        );
      },
    },
  };
}

function getElementName(
  t: typeof BabelTypes,
  name: BabelTypes.JSXIdentifier | BabelTypes.JSXMemberExpression | BabelTypes.JSXNamespacedName,
): string | null {
  if (t.isJSXIdentifier(name)) return name.name;

  if (t.isJSXMemberExpression(name)) {
    const objectName = getElementName(t, name.object);
    const propertyName = t.isJSXIdentifier(name.property) ? name.property.name : null;

    return objectName && propertyName ? `${objectName}.${propertyName}` : null;
  }

  return null;
}

function createSourceMapConsumer(inputSourceMap: PluginOptions["inputSourceMap"]) {
  if (!inputSourceMap) return null;

  try {
    const sourceMap =
      typeof inputSourceMap === "string"
        ? (JSON.parse(inputSourceMap) as RawSourceMap)
        : inputSourceMap;

    return new SourceMapConsumer(sourceMap);
  } catch {
    return null;
  }
}

function getOriginalLocation(
  consumer: SourceMapConsumer | null,
  location: {column: number; line: number},
) {
  if (!consumer) return location;

  try {
    const original = consumer.originalPositionFor(location);

    if (original.line != null && original.column != null) {
      return {
        column: original.column,
        line: original.line,
      };
    }
  } catch {
    return location;
  }

  return location;
}

function getSourceFilePath(filename: string) {
  const srcIndex = filename.lastIndexOf("/src/");

  if (srcIndex >= 0) return filename.slice(srcIndex + 1);

  return filename.split("/").pop() ?? filename;
}

function isLocatableElementName(name: string | null) {
  if (!name) return false;
  const leafName = name.split(".").at(-1);

  if (leafName === "Fragment" || leafName === "StrictMode") return false;

  return true;
}

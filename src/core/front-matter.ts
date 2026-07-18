export type FrontMatterParseResult = {
  data: Record<string, unknown> | null;
  body: string;
  errors: string[];
  rawFrontMatter: string;
};

export function parseScalar(rawValue: string): unknown {
  const value = rawValue.trim();

  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);

  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => parseScalar(part.trim()));
  }

  const quoted = value.match(/^(['"])(.*)\1$/);
  if (quoted) return quoted[2].replaceAll(`${quoted[1]}${quoted[1]}`, quoted[1]);

  return value;
}

export function parseFrontMatter(content: string): FrontMatterParseResult {
  const lines = content.split(/\r?\n/);

  if (lines[0] !== "---") {
    return {
      data: null,
      body: content,
      errors: ["missing opening front matter delimiter `---` on line 1"],
      rawFrontMatter: ""
    };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");

  if (closingIndex === -1) {
    return {
      data: null,
      body: "",
      errors: ["missing closing front matter delimiter `---`"],
      rawFrontMatter: lines.slice(1).join("\n")
    };
  }

  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  lines.slice(1, closingIndex).forEach((line, index) => {
    const lineNumber = index + 2;
    const trimmed = line.trim();

    if (trimmed === "") return;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);

    if (!match) {
      errors.push(`line ${lineNumber}: expected \`key: value\``);
      return;
    }

    const [, key, value] = match;
    data[key] = parseScalar(value);
  });

  return {
    data,
    body: lines.slice(closingIndex + 1).join("\n"),
    errors,
    rawFrontMatter: lines.slice(1, closingIndex).join("\n")
  };
}

export function quoteYamlString(value: string): string {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function formatFrontMatter(data: Record<string, unknown>, order: string[]): string {
  const keys = [
    ...order.filter((key) => Object.hasOwn(data, key)),
    ...Object.keys(data).filter((key) => !order.includes(key))
  ];

  return keys
    .map((key) => {
      const value = data[key];
      if (typeof value === "string") return `${key}: ${quoteYamlString(value)}`;
      if (Array.isArray(value)) return `${key}: [${value.map((item) => (typeof item === "string" ? quoteYamlString(item) : String(item))).join(", ")}]`;
      return `${key}: ${String(value)}`;
    })
    .join("\n");
}

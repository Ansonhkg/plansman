# Plansman Web

The Plansman web app provides list, board, DAG, draft, and resolution views over the same markdown workspace used by the CLI, REST API, SDK, and MCP server.

## HeroUI Pro

This app uses HeroUI Pro (`@heroui-pro/react`) for several UI components. Installing or building this package requires a valid HeroUI Pro license. For CI or hosted builds, configure `HEROUI_AUTH_TOKEN` as a private secret; never commit the token or vendored HeroUI Pro package contents.

The public GitHub workflow intentionally checks and releases the CLI/core only, so open-source users can build Plansman without HeroUI Pro access unless they are working on this web app.

## Development

From the repository root, start the web app and REST API through Portless:

```bash
bun run dev
```

Open `https://plansman.localhost`. The web app proxies `/api` to the sibling
`https://api.plansman.localhost` route. Use `bun run dev:direct` when you need
the fixed `http://127.0.0.1:3100` and `http://127.0.0.1:4000` endpoints instead.

Run package checks independently with:

```bash
bun install --cwd apps/web
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

## Static Demo

The web app can run without the local REST server by enabling bundled mock data:

```bash
VITE_PLANSMAN_DEMO=true bun run --cwd apps/web build
```

Deploy this folder as a Vercel project with `VITE_PLANSMAN_DEMO=true` and `HEROUI_AUTH_TOKEN` set in the project environment. The demo build is intended to be embedded by the marketing page iframe.

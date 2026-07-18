# Implementation map

This directory contains the product implementation:

- `src/` contains framework-agnostic planning domain logic.
- `ports/` and `adapters/` define and implement persistence boundaries.
- `surfaces/` exposes the CLI, REST API, SDK, and MCP server.
- `apps/web/` contains the product dashboard.
- `tests/` contains product-level contract and integration tests.

## Mock-data product snapshot

The public dashboard example uses the bundled **Atlas Cloud Demo** workspace;
it is mock data, not a customer or local-machine workspace.

![Plansman mock-data DAG view](../assets/screenshot_1.jpg)

The landing page and canonical public documentation live in the separate `web`
repository. This file describes only the public application repository.

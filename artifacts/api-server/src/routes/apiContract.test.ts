import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROUTES_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const OPENAPI_PATH = fileURLToPath(
  new URL("../../../../lib/api-spec/openapi.yaml", import.meta.url),
);
type Route = { method: string; path: string };

async function listRouteSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRouteSourceFiles(path));
    } else if (
      entry.isFile()
      && entry.name.endsWith(".ts")
      && !entry.name.endsWith(".test.ts")
    ) {
      files.push(path);
    }
  }

  return files;
}

function normalizeExpressPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

async function getRegisteredRoutes(): Promise<Route[]> {
  const files = await listRouteSourceFiles(ROUTES_DIRECTORY);
  const routes = new Map<string, Route>();
  const routeDefinition = /\brouter\.(get|post|put|patch|delete|options|head)\(\s*["']([^"']+)["']/g;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(routeDefinition)) {
      const method = match[1].toUpperCase();
      const path = normalizeExpressPath(match[2]);
      routes.set(`${method} ${path}`, { method, path });
    }
  }

  return [...routes.values()].sort((left, right) =>
    left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
  );
}

function getDocumentedRoutes(openApiSource: string): Set<string> {
  const routes = new Set<string>();
  let currentPath: string | null = null;

  for (const line of openApiSource.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:\s]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = currentPath
      && line.match(/^    (get|post|put|patch|delete|options|head):\s*$/i);
    if (methodMatch) {
      routes.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }

  return routes;
}

test("checks every registered API route method against OpenAPI", async () => {
  const [registeredRoutes, openApiSource] = await Promise.all([
    getRegisteredRoutes(),
    readFile(OPENAPI_PATH, "utf8"),
  ]);
  const documentedRoutes = getDocumentedRoutes(openApiSource);
  const undocumentedRoutes = registeredRoutes
    .filter(({ method, path }) => !documentedRoutes.has(`${method} ${path}`))
    .map(({ method, path }) => `${method} ${path}`);

  assert.ok(registeredRoutes.length > 0, "route scan did not find any server routes");
  assert.equal(
    undocumentedRoutes.length,
    0,
    undocumentedRoutes.length
      ? `Undocumented API server routes:\n${undocumentedRoutes.join("\n")}`
      : undefined,
  );
});

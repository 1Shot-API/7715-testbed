import { defineConfig } from "vite";

const repositoryName =
  process.env.GITHUB_REPOSITORY?.split("/")[1] || "7715-testbed";
const configuredBasePath = process.env.VITE_PUBLIC_BASE_PATH;

function normalizeBasePath(value) {
  if (!value) {
    return null;
  }
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

export default defineConfig(({ command }) => ({
  // Override with VITE_PUBLIC_BASE_PATH to support custom domains later.
  // Examples:
  // - GitHub project pages: /7715-testbed/
  // - Custom domain root: /
  base:
    normalizeBasePath(configuredBasePath) ||
    (command === "serve" ? "/" : `/${repositoryName}/`),
}));

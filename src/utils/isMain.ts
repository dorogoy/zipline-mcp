import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Determines whether the current module is the one Node was invoked with.
 *
 * Both `process.argv[1]` and `import.meta.url` are resolved through
 * `realpathSync` so that npm/npx bin symlinks (e.g.
 * `/usr/local/bin/zipline-mcp -> ../lib/node_modules/zipline-mcp/dist/index.js`)
 * are recognized as the main module.
 */
export function isMainModule(
  scriptPath: string | undefined,
  moduleUrl: string
): boolean {
  if (!scriptPath) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(scriptPath);
  } catch {
    // scriptPath does not exist or cannot be resolved; not the main module
    return false;
  }
}

## 2026-09-12 - IPv4-compatible IPv6 SSRF Validation Bypass

**Vulnerability:** URL host parsing converts IPv4-compatible IPv6 addresses like `[::127.0.0.1]` into normalized hex forms like `[::7f00:1]`. SSRF filters checking only `::ffff:` prefix or dotted quad formats fail to catch IPv4-compatible representations targeting private IP ranges.
**Learning:** `new URL()` in Node normalizes IPv4-compatible IPv6 URLs to hex form (`::7f00:1` instead of `::127.0.0.1`).
**Prevention:** Regexes for IPv6 SSRF validation must handle `(?:0*:)*?(?:ffff:)?` prefix and match both dotted quad and hex representations of embedded IPv4 addresses.

## 2026-09-13 - Path Traversal Sandbox Escape via Partial Prefix Match

**Vulnerability:** Simple `startsWith(sandboxRoot)` checks in path validation allow sandbox traversal into adjacent directories sharing a path prefix (e.g. `/tmp/users/abc-other` passes `startsWith('/tmp/users/abc')`).
**Learning:** `path.normalize()` and `path.resolve()` do not append trailing path separators, so `targetPath.startsWith(rootPath)` matches any path whose prefix string starts with `rootPath`, missing directory boundaries.
**Prevention:** Always append `path.sep` to `rootPath` if missing or check `targetPath === rootPath` when using string prefix matching for path containment checks.

## 2026-09-14 - IPv6 Zone Identifier SSRF Validation Bypass

**Vulnerability:** Hostnames containing IPv6 zone indices / scope IDs (e.g. `::1%eth0` or `::ffff:127.0.0.1%25eth0`) bypass SSRF host checks when `new URL()` parser throws an error on unencoded `%` in IPv6 hosts, causing string comparison checks like `host === '::1'` to fail on the suffix.
**Learning:** Node's WHATWG `URL` parser throws an error on raw `%` characters inside IPv6 literal hosts unless percent-encoded, causing host parsing fallbacks to evaluate the unstripped scope ID string.
**Prevention:** Always strip IPv6 zone identifiers (`%` / `%25` and trailing index name) from hostname strings before URL parsing or IP classification checks.

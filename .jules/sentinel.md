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

## 2026-09-15 - Unredacted Sensitive Data Leakage in Logged Error Objects

**Vulnerability:** Object masking functions relying on `JSON.stringify` to sanitize log arguments evaluate `Error` instances to `{}` because `message` and `stack` are non-enumerable properties. This causes logger tools to lose error context and bypass string redaction when logging raw `Error` objects.
**Learning:** `JSON.stringify(new Error(...))` returns `{}` in JavaScript/Node.js, failing to expose or sanitize `message` and `stack` strings.
**Prevention:** Redaction utilities must explicitly check `if (arg instanceof Error)` and sanitize `arg.message` and `arg.stack` explicitly before logging.

## 2026-09-16 - 6to4 and NAT64 IPv6 Transition Mechanism SSRF Validation Bypass

**Vulnerability:** 6to4 (`2002::/16`) and NAT64 (`64:ff9b::/96`) IPv6 transition mechanisms embed IPv4 addresses in their prefix structure (bits 16..47 for 6to4, lower 32 bits for NAT64 WKP). SSRF filters checking only IPv4 dotted-decimal or `::ffff:` IPv4-mapped IPv6 formats fail to detect 6to4 and NAT64 URLs targeting loopback (`127.0.0.1`), private networks, or AWS metadata (`169.254.169.254`).
**Learning:** IPv6 transition protocols enable client stacks or IPv6-to-IPv4 gateways to translate embedded IPv4 addresses transparently, bypassing SSRF filters that do not inspect 6to4 (`2002::/16`) and NAT64 (`64:ff9b::/96`) prefixes.
**Prevention:** SSRF host validation must explicitly parse and extract embedded IPv4 addresses from 6to4 (`2002:WWXX:YYZZ::`) and NAT64 (`64:ff9b::...`) IPv6 addresses and classify them against private/loopback/metadata IPv4 address ranges.

## 2026-09-17 - ISATAP IPv6 Transition Mechanism SSRF Validation Bypass

**Vulnerability:** ISATAP (`RFC 5214`, `:5efe:`) IPv6 transition mechanisms embed IPv4 addresses in the 64-bit interface identifier (`0000:5efe:WWXX:YYZZ` or `0000:5efe:W.X.Y.Z`). SSRF filters checking only `::ffff:` IPv4-mapped, 6to4, or NAT64 IPv6 formats fail to detect ISATAP URLs targeting loopback (`127.0.0.1`), private networks, or AWS metadata (`169.254.169.254`).
**Learning:** ISATAP interface identifiers (`:5efe:`) can be appended to any 64-bit IPv6 prefix, embedding dotted-quad or hex-encoded IPv4 targets that client networking stacks or gateways translate directly to IPv4.
**Prevention:** SSRF host validation regexes for IPv6 embedded IPv4 addresses must include `:5efe:` alongside `:ffff:` and `64:ff9b::`, extracting both dotted decimal and hex forms of embedded IPv4 addresses for classification against private address ranges.

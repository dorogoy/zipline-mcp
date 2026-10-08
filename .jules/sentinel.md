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

## 2026-09-18 - RFC 8215 NAT64 Local Prefix IPv6 SSRF Validation Bypass

**Vulnerability:** RFC 8215 defines `64:ff9b:1::/48` as the Local-Use IPv4/IPv6 Translation Prefix for NAT64 gateways. SSRF filters checking only the RFC 6052 Well-Known Prefix (`64:ff9b::/96`) fail to detect `64:ff9b:1::/48` IPv6 addresses embedding loopback (`127.0.0.1`), private networks, or cloud metadata IPs.
**Learning:** NAT64 gateways or dual-stack transition software handle local translation via `64:ff9b:1::/48` in addition to `64:ff9b::/96`, allowing attackers to construct valid NAT64 URLs like `http://[64:ff9b:1::127.0.0.1]` or `http://[64:ff9b:1::7f00:1]` that bypass SSRF filters targeting only `64:ff9b::`.
**Prevention:** NAT64 IPv6 SSRF validation regexes must match `64:ff9b:(?:1:)?` to cover both RFC 6052 (`64:ff9b::/96`) and RFC 8215 (`64:ff9b:1::/48`) prefixes, extracting dotted quad and hex representations of embedded IPv4 targets.

## 2026-09-19 - RFC 2544 Benchmarking and RFC 5737 Special IPv4 SSRF Validation Bypass

**Vulnerability:** RFC 2544 defines `198.18.0.0/15` as the IPv4 Inter-Network Benchmark address block, and RFC 5737 defines `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24` as TEST-NET documentation blocks. SSRF filters checking only RFC 1918 private, RFC 6598 CGNAT, loopback, and link-local ranges fail to detect `198.18.0.0/15` and TEST-NET addresses, allowing SSRF requests to target benchmark or non-routable internal test networks.
**Learning:** `198.18.0.0/15` (`198.18.0.0` to `198.19.255.255`) and TEST-NET blocks are non-routable Special-Purpose IPv4 addresses under RFC 6890 with `Global: False`. SSRF checks comparing only `p1 === 10`, `172.16-31`, `192.168`, `127`, `100.64-127`, and `169.254` leave `198.18.0.0/15` unblocked.
**Prevention:** IPv4 SSRF validation must inspect third octets `p3` and include `p1 === 198 && (p2 === 18 || p2 === 19)` for RFC 2544 benchmarking alongside RFC 5737 TEST-NET documentation ranges (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) and RFC 6890 IETF protocol assignments (`192.0.0.0/24`).

## 2026-09-20 - RFC 4380 Teredo IPv6 Transition Mechanism SSRF Validation Bypass

**Vulnerability:** Teredo (`RFC 4380`, `2001:0::/32`) IPv6 transition mechanisms embed IPv4 addresses in the last 32 bits, obfuscated via bitwise XOR with `0xFFFFFFFF` (`80ff:fffe` for `127.0.0.1`). SSRF filters checking only `::ffff:`, `64:ff9b::`, `2002::`, or `:5efe:` IPv6 formats fail to detect Teredo IPv6 addresses targeting loopback (`127.0.0.1`), private networks, or AWS metadata (`169.254.169.254`).
**Learning:** Node's WHATWG `URL` parser normalizes `2001:0::` and `2001:0000::` host prefixes to `2001::`. Teredo addresses XOR-invert client IPv4 bits (`p ^ 0xffff`), allowing attackers to construct valid Teredo URLs like `http://[2001:0::80ff:fffe]` that bypass standard prefix-matching SSRF checks while dual-stack interfaces/gateways un-XOR and route to internal IPv4 targets.
**Prevention:** SSRF host validation must expand the IPv6 address into eight hextets (including `::` compression) and treat only `2001:0::/32` as Teredo. Inspect the client IPv4 in hextets 6 and 7 both raw and XOR-inverted (`^ 0xffff`). A textual `2001:` regex misses middle-compressed addresses and can match unrelated `2001::/16` addresses.

## 2026-09-21 - Special-Purpose IPv6 Address Block SSRF Validation Bypass

**Vulnerability:** RFC 6666 Discard-Only (`100::/64`), RFC 3849 Documentation (`2001:db8::/32`), and RFC 5180 Benchmarking (`2001:2::/48`) are non-routable Special-Purpose IPv6 ranges. SSRF filters inspecting only loopback (`::1`), link-local (`fe80::/10`), ULA (`fc00::/7`), and multicast (`ff00::/8`) fail to detect requests targeting these special-purpose IPv6 address blocks.
**Learning:** Special-Purpose IPv6 blocks like `100::/64`, `2001:db8::/32`, and `2001:2::/48` are classified as non-global or non-routable under RFC 6890, but standard prefix checks or textual regexes miss middle-compressed or hextet-expanded variations.
**Prevention:** SSRF host validation must inspect expanded hextet arrays (`expandIpv6Hextets`) to check `100::/64` (`0x0100:0:0:0`), `2001:db8::/32` (`0x2001:0x0db8`), and `2001:2::/48` (`0x2001:0x0002:0`) against RFC 6890 Special-Purpose IPv6 assignments.

## 2026-09-22 - RFC 3068 / RFC 7526 6to4 Anycast Relay IPv4 SSRF Validation Bypass

**Vulnerability:** RFC 3068 / RFC 7526 defines `192.88.99.0/24` as the 6to4 Anycast Relay address block. SSRF filters checking only RFC 1918, CGNAT, loopback, link-local, and TEST-NET addresses fail to detect `192.88.99.0/24` addresses or their embedded IPv6 transition forms (e.g. `::ffff:192.88.99.1`, `64:ff9b::192.88.99.1`, `2002:c058:6301::`), allowing SSRF requests to target 6to4 relay infrastructure or internal routing nodes.
**Learning:** Under RFC 7526, 6to4 anycast relays were deprecated and reclassified as non-globally-routable Special-Purpose IPv4 addresses with `Global: False` under RFC 6890.
**Prevention:** IPv4 SSRF validation functions (`isPrivateIPv4`) must inspect `p1 === 192 && p2 === 88 && p3 === 99` alongside other RFC 6890 special-purpose address ranges to block direct and IPv6-embedded 6to4 anycast relay requests.

- source_spec: `_bmad-output/implementation-artifacts/spec-gh-146-symlink-main-module-check-fix.md`
  summary: Validate the published-package launch path (e.g. `npm pack` + install from tarball, or a canary release) to confirm the bin-wrapper fix end to end.
  evidence: The fix was verified with a hand-made symlink and unit tests, not against the real packaged artifact users install; issue #146 affects the published package.

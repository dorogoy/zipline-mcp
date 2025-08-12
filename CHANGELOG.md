## [1.1.1](https://github.com/dorogoy/zipline-mcp/compare/v1.1.0...v1.1.1) (2025-08-10)


### Bug Fixes

* **config:** track version in src/index.ts ([dd8ac2a](https://github.com/dorogoy/zipline-mcp/commit/dd8ac2a5802e955ad6a9ee2e2478a2cd0c19e4b4))

## [1.4.0](https://github.com/dorogoy/zipline-mcp/compare/v1.3.0...v1.4.0) (2025-08-12)


### Features

* **config:** add env override for extensions ([a8caaf0](https://github.com/dorogoy/zipline-mcp/commit/a8caaf0e4ddd4598fe2c314dfac967ad04ca136e))
* **http:** use mime-types for mime type detection ([3d769fb](https://github.com/dorogoy/zipline-mcp/commit/3d769fb2c3b7ba0f71d6d92bf428c7fcf16efebc))

## [1.3.0](https://github.com/dorogoy/zipline-mcp/compare/v1.2.0...v1.3.0) (2025-08-11)


### Features

* **httpClient:** implement downloadExternalUrl ([5ef4e0e](https://github.com/dorogoy/zipline-mcp/commit/5ef4e0e6eb68c436758c885aacdbbc14ce4a878f))

## [1.2.0](https://github.com/dorogoy/zipline-mcp/compare/v1.1.1...v1.2.0) (2025-08-11)


### Features

* **httpClient:** extend mime type detection and update sandbox message ([d9958b2](https://github.com/dorogoy/zipline-mcp/commit/d9958b2e64396eac3c35f7d6a930ece6dc1abd42))
* **sandbox:** add per-user sandboxing ([f8e2bc3](https://github.com/dorogoy/zipline-mcp/commit/f8e2bc30848ac141ea0ec939c3335b3a75ddce79))
* **sandbox:** introduce sandboxUtils module and integrate ([ca11a6e](https://github.com/dorogoy/zipline-mcp/commit/ca11a6ef20300f28a9481090bd16609206900cd9))
* **tmp_file_manager:** add PATH command ([ec098df](https://github.com/dorogoy/zipline-mcp/commit/ec098df7e1649db3a5dd8277fe525e3cc7b6050f))

## [1.1.0](https://github.com/dorogoy/zipline-mcp/compare/v1.0.3...v1.1.0) (2025-08-10)


### Features

* **api:** add upload options and remove preview tool ([4bc271a](https://github.com/dorogoy/zipline-mcp/commit/4bc271adc9f0742b9ffe017e2a662473e51b304e))

## [1.0.3](https://github.com/dorogoy/zipline-mcp/compare/v1.0.2...v1.0.3) (2025-08-10)


### Bug Fixes

* Revert "fix(deps): bump zod from 3.25.76 to 4.0.17" ([#6](https://github.com/dorogoy/zipline-mcp/issues/6)) ([2c286ee](https://github.com/dorogoy/zipline-mcp/commit/2c286eee6c6dafa93a22adb9d457031d13ec7487))

## [1.0.2](https://github.com/dorogoy/zipline-mcp/compare/v1.0.1...v1.0.2) (2025-08-10)


### Bug Fixes

* **deps:** bump zod from 3.25.76 to 4.0.17 ([4831858](https://github.com/dorogoy/zipline-mcp/commit/4831858c24965d4416449aff6f2b1195f18a7ba9))

## [1.0.1](https://github.com/dorogoy/zipline-mcp/compare/v1.0.0...v1.0.1) (2025-08-09)


### Bug Fixes

* **api:** correct blob creation and file validation ([436a3bc](https://github.com/dorogoy/zipline-mcp/commit/436a3bc6ade63712b604b6c5c42ceaa518ece657))

# 1.0.0 (2025-08-09)


### Bug Fixes

* add more extensions ([eeb56ed](https://github.com/dorogoy/zipline-mcp/commit/eeb56ed0de4999bf63803bc5501b09766831dcc7))


### Features

* **api:** add format normalization and validation ([215aa38](https://github.com/dorogoy/zipline-mcp/commit/215aa386255e72db572d3de693e94c677d69054f))
* **api:** add HTTP client for file uploads ([53b6074](https://github.com/dorogoy/zipline-mcp/commit/53b607470ea8ecf03d828809c119807eb1d797f4))
* **api:** detect mime type for uploads ([b87738a](https://github.com/dorogoy/zipline-mcp/commit/b87738a7106a2a075ae9a06a50be0604d4a0149c))
* **api:** enforce allowed file extensions for uploads ([1324f9b](https://github.com/dorogoy/zipline-mcp/commit/1324f9bc9f5244b112b630fcfe4b7956c76f30ca))
* **api:** implement enhanced header validation ([17c4c69](https://github.com/dorogoy/zipline-mcp/commit/17c4c695b7c2d3744f1e2e3f1e9cb60e658d2364))
* **api:** strengthen header validation and http client ([c6098fc](https://github.com/dorogoy/zipline-mcp/commit/c6098fc8c18cb799973a5e2ee22172b4ca544e36))
* **api:** wire ZIPLINE_TOKEN and ZIPLINE_ENDPOINT for uploads ([109064e](https://github.com/dorogoy/zipline-mcp/commit/109064e6378ee7f00757c4851edc8ab524772b0f))
* **tmp_file_manager:** add sandboxed tmp file manager tool ([d568a04](https://github.com/dorogoy/zipline-mcp/commit/d568a04252614ba9b4803d5858c63f3c47ab0bf9))

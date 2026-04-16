# Security Fix Hotspots — Research

This document records the empirical research that informed the security-fix analysis section of `repolyze`. The findings below were gathered by examining the git history of nine open-source repositories with known security fixes.

---

## Repositories studied

| Repository | Local path | Security reference |
|---|---|---|
| axios | `/tmp/repos/axios` | [commit fb3befb](https://github.com/axios/axios/commit/fb3befb6daac6cad26b2e54094d0f2d9e47f24df) |
| magento2-dev-mcp | `/tmp/repos/magento2-dev-mcp` | [PR #5](https://github.com/elgentos/magento2-dev-mcp/pull/5) |
| heim-mcp | `/tmp/repos/heim-mcp` | [PR #2](https://github.com/Nor2-io/heim-mcp/pull/2) |
| unhead | `/tmp/repos/unhead` | [commit 64b5ac0](https://github.com/unjs/unhead/commit/64b5ac0aa30cc256ea6677ce3dc4f132f81b2ff6) |
| saltcorn | `/tmp/repos/saltcorn` | [commit 16f946f](https://github.com/saltcorn/saltcorn/commit/16f946fc397992e5ec0f127f6151115c22cd6237) |
| PraisonAI | `/tmp/repos/PraisonAI` | [commit cc0544a](https://github.com/MervinPraison/PraisonAI/commit/cc0544a4e3d6c41aec6a74936d9f80a6dbd5f221) |
| n8n-mcp | `/tmp/repos/n8n-mcp` | [commit d9d847f](https://github.com/czlonkowski/n8n-mcp/commit/d9d847f230923d96e0857ccecf3a4dedcc9b0096) |
| nodemailer | `/tmp/repos/nodemailer` | [commit 0a43876](https://github.com/nodemailer/nodemailer/commit/0a43876801a420ca528f492eaa01bfc421cc306e) |
| express | `/tmp/repos/express` | Security fixes found in history |

---

## Research Findings

### Pattern 1: Explicit Security Identifiers in Commit Messages

The most reliable signal. Commits referencing **GHSA IDs**, **CVE IDs**, or **CWE IDs** are almost always true security fixes:

- nodemailer: `GHSA-vvjj-xcjg-gr5g`, `GHSA-9h6g-pr28-7cqp`
- unhead: `GHSA-x7mm-9vvv-64w8`
- n8n-mcp: `GHSA-4ggg-h7ph-26qr`
- express: `CVE-2024-51999`, `CVE-2026-2391`, `GHSA-w7fw-mjwx-w883`
- axios: `CVE-2024-39338`, `CVE-2023-45857`
- PraisonAI: `CWE-78`, `CWE-942`, `CVE-2026-22218`

These appear in both **commit subjects** and **commit bodies**, so searching the body is essential.

### Pattern 2: GitHub Security Advisory Merge Pattern

GitHub creates a distinctive commit when merging from a security advisory fork: `"Merge commit from fork"` as the subject, with the GHSA details in the body. Found in:

- unhead (1 instance)
- n8n-mcp (3 instances)

This is a **high-confidence** signal — the subject is generic but the body contains the advisory.

### Pattern 3: Conventional Commit Scopes for Security

Many projects use conventional commit prefixes that flag security work:

- `fix(security):` — axios, PraisonAI, n8n-mcp
- `fix(sec):` — axios, express
- `sec:` — express
- `security:` — PraisonAI, n8n-mcp
- `fix(CSRF):` — axios
- `fix(vulnerability):` — axios

### Pattern 4: Vulnerability Type Keywords in Messages

Commit messages often name the vulnerability class directly:

- **Command injection**: magento2-dev-mcp, heim-mcp, nodemailer (`"command injection"`, `"SMTP command injection"`)
- **SSRF**: axios, n8n-mcp (`"SSRF"`, `"ssrf-protection"`)
- **XSS**: unhead (`"XSS"`, `"streamKey injection"`)
- **Path traversal**: saltcorn, PraisonAI, express (`"path traversal"`, `"traversal"`)
- **Prototype pollution**: axios (`"prototype pollution"`)
- **ReDoS**: axios, nodemailer (`"ReDoS"`, `"denial of service"`)
- **CRLF injection**: nodemailer (`"CRLF"`, `"sanitize"`)
- **CSRF**: axios (`"CSRF"`)
- **Sandbox escape**: PraisonAI (`"sandbox escape"`)

### Pattern 5: Security-Touched Files Cluster

Security fixes concentrate in specific files. The `--name-only` analysis reveals:

- axios: `lib/adapters/http.js` (6), `lib/helpers/isValidXss.js` (4), `lib/core/Axios.js` (7)
- nodemailer: `lib/smtp-connection/index.js` (3), `lib/mail-composer/index.js` (4)
- n8n-mcp: `src/http-server-single-session.ts` (21), `src/utils/ssrf-protection.ts` (new)
- PraisonAI: `praisonaiagents/tools/python_tools.py` (9), `praisonaiagents/agent/agent.py` (16)

### Key Observation: Body Search is Critical

Several high-confidence security commits have **generic subjects** but **detailed bodies**:

- `"Merge commit from fork"` — body contains GHSA ID and full vulnerability description
- `"feat(context): enhance agent ledger and monitor functionality"` — body describes path traversal prevention

A search limited to `--oneline` or subject-only would **miss** these. The `git log --grep` flag searches both subject and body by default, which is the correct behavior.

---

## Detailed Commit Analysis

### axios — no_proxy hostname normalization bypass (SSRF)

- **Commit**: `fb3befb6daac6cad26b2e54094d0f2d9e47f24df`
- **Subject**: `fix: no_proxy hostname normalization bypass leads to ssrf (#10661)`
- **Files changed**: `lib/adapters/http.js`, `lib/helpers/shouldBypassProxy.js` (new), plus tests
- **Fix**: Added a new `shouldBypassProxy` helper that properly normalizes hostnames (trailing dots, IPv6 brackets) before comparing against `NO_PROXY` entries

Other security commits in axios history:
- `fix(sec): CVE-2024-39338` — SSRF via protocol-relative URL
- `fix(security): fixed formToJSON prototype pollution vulnerability`
- `fix(CSRF): fixed CSRF vulnerability CVE-2023-45857`
- `fix: Regular Expression Denial of Service (ReDoS)`

### nodemailer — SMTP command injection via CRLF

- **Commit**: `0a43876801a420ca528f492eaa01bfc421cc306e`
- **Subject**: `fix: sanitize CRLF in transport name option to prevent SMTP command injection (GHSA-vvjj-xcjg-gr5g)`
- **Files changed**: `lib/smtp-connection/index.js`, plus tests
- **Fix**: Strip `\r\n` from the transport `name` option before it flows into EHLO/HELO/LHLO commands

Related commit: `2d7b971` — `fix: sanitize envelope size to prevent SMTP command injection`

### unhead — XSS via unsanitized streamKey

- **Commit**: `64b5ac0aa30cc256ea6677ce3dc4f132f81b2ff6`
- **Subject**: `Merge commit from fork` (GitHub security advisory merge)
- **Body**: `GHSA-x7mm-9vvv-64w8: streamKey was interpolated directly into the bootstrap and suspense-chunk inline scripts...`
- **Files changed**: `packages/unhead/src/stream/server.ts`, plus tests
- **Fix**: Validate `streamKey` against a conservative ASCII identifier regex before embedding in `window.<streamKey>` inline scripts

### n8n-mcp — SSRF in multi-tenant instance configuration

- **Commit**: `d9d847f230923d96e0857ccecf3a4dedcc9b0096`
- **Subject**: `Merge commit from fork`
- **Body**: `Closes GHSA-4ggg-h7ph-26qr. Reported by Eresus Security Research Team.`
- **Files changed**: 28 files — new `src/utils/ssrf-protection.ts`, changes to `http-server-single-session.ts`, `n8n-api-client.ts`, extensive tests
- **Fix**: Added comprehensive SSRF protection module, auth guards on previously unprotected routes

### saltcorn — Path traversal + missing auth on sync endpoints

- **Commit**: `16f946fc397992e5ec0f127f6151115c22cd6237`
- **Subject**: `Merge commit from fork`
- **Files changed**: `packages/server/routes/sync.js`
- **Fix**: Added `loggedIn` middleware to unauthenticated endpoints, replaced `path.join` with `File.normalise_in_base` to prevent path traversal via `syncDirName`

### PraisonAI — Path traversal and sandbox escape

- **Commit**: `cc0544a4e3d6c41aec6a74936d9f80a6dbd5f221`
- **Subject**: `feat(context): enhance agent ledger and monitor functionality` (generic — security intent hidden in body)
- **Files changed**: `context/ledger.py`, `context/monitor.py`, `tools/python_tools.py`, `yaml-parser.ts`, `agent_tools.py`, `a2u_server.py`
- **Fix**: Path sanitization in monitor output paths, YAML step key allowlisting, sandbox hardening

Other security commits in PraisonAI history:
- `security: fix critical path traversal and sandbox escape vulnerabilities`
- `fix(security): Replace insecure MD5 with SHA-256, disable debug mode`
- `fix: reject dangerous environment variable keys from YAML schedule config (CWE-78)`
- `fix(cors): Patch 3 follow-up bugs from CWE-942 CORS hardening`

### magento2-dev-mcp — Command injection via exec

- **Commit**: `235f93bea9c914c23d4429db346884f6c2261ac2`
- **Subject**: `fix: prevent command injection by using execFile and shellQuote for magerun2 commands`
- **Files changed**: `src/index.ts`, `package-lock.json`
- **Fix**: Replaced `child_process.exec` (shell-based) with `execFile` and argument arrays, added `shellQuote` for Docker wrapper commands

### heim-mcp — Command injection via exec

- **Commit**: `2b1864fd6e39003d69b0c956f8c909f37ebca2fe`
- **Subject**: `fix: prevent command injection by replacing child_process.exec with execFile`
- **Files changed**: `src/tools.ts`
- **Fix**: Same pattern as magento2-dev-mcp — `exec` → `execFile` with argument arrays

### express — Multiple security fixes across history

- `925a1dff` — `fix: bump qs minimum to ^6.14.2 for CVE-2026-2391` (dependency version bump)
- `2f64f68c` — `sec: security patch for CVE-2024-51999` (query string parsing)
- `82de4de5` — `examples: fix path traversal in downloads example` (path traversal)
- `5e7ad38` — `fix: Regular Expression Denial of Service (ReDoS)` (from axios cross-reference)

---

## Keyword Strategy Derived from Research

### Tier 1 — Advisory IDs (near-zero false positives)

```
GHSA-|CVE-|CWE-
```

### Tier 2 — Security scopes and GitHub advisory merges (high confidence)

```
Merge commit from fork
fix(sec
fix(security
fix(vuln
sec:
security:
```

### Tier 3 — Vulnerability-class keywords (moderate confidence, noisier)

```
SSRF|XSS|CSRF|injection|traversal|prototype.pollution|ReDoS|sandbox.escape|auth.bypass|command.injection|CRLF|deserialization|open.redirect
```

# Repository analysis signals

This document describes the **git-derived repository signals** that `repolyze` collects before diving into source code. The workflow is inspired by Maciej Piechowski’s article *“The Git Commands I Run Before Reading Any Code”*, which argues that commit history gives a diagnostic picture of a project: ownership, churn, bug clustering, momentum, crisis patterns, and security-fix hotspots.

- **Article**: [The Git Commands I Run Before Reading Any Code](https://piechowski.io/post/git-commands-before-reading-code/)
- **Author**: Maciej Piechowski
- **Site**: [piechowski.io](https://piechowski.io/)

The commands below are the conceptual basis for the tool. `repolyze` implements the same intent using `git` invocations suitable for structured output (including a machine-readable `--json` report).

---

## 1. What changes the most (high churn)

### Purpose

Surface the files that change most often. The article notes that the top file is often the one people are nervous to touch. High churn can mean active development, but paired with low ownership or repeated bug fixes it can signal **codebase drag** and unpredictable blast radius.

### How to run (article)

```bash
git log --format=format: --name-only --since="1 year ago" \
  | sort | uniq -c | sort -nr | head -20
```

### Insights we gather

- **Top changed paths** in the last year (frequency counts across commits).
- **Top directories (depth-capped rollup)** from the same history: file-level counts are summed into directory keys using at most the **first three directory segments** (the filename is dropped; deeper paths roll up to that prefix). Root-only paths (for example `README.md`) bucket under **`.`**. Useful for **monorepos** and large trees where many files sit under a few busy prefixes. The human report shows this as **Churn · top directories (max depth 3)** immediately after **Churn · top paths**; JSON includes `churn.topDirectories`, `churn.directoryDepthMax`, and shares `churn.window` with file churn.
- **Hotspot candidates** for cross-checking with bug-keyword history (see section 3).
- Context from the article: churn-based signals have been studied as predictors of defects (the article references Microsoft Research work on relative code churn).

### Top directories: how the bucket is chosen

Given a path like `packages/api/src/handlers/foo.ts`, directory segments are `packages`, `api`, `src`, `handlers`, …; the rollup key keeps **up to three** of those in order, here **`packages/api/src`**. A shallower file such as `src/hot.ts` rolls up to **`src`**. Touch counts match file churn semantics (one increment per path line in the name-only log).

---

## 2. Who built this (contributorship)

### Purpose

See **who contributes** and how concentrated work is. The article highlights:

- **Bus factor risk** when one person accounts for a very large share of commits.
- **Recency mismatch**: if the overall top contributor does not appear in a shorter window (example given: last 6 months), that can signal a handoff or risk concentration.
- **Tail shape**: many historical contributors but few active recently suggests the maintainers are not the same cohort that built the system.

The article also cautions that **squash-merge** workflows can make authorship look like “who merged” rather than “who wrote”.

### How to run (article)

```bash
git shortlog -sn --no-merges
```

Optional comparison window from the article:

```bash
git shortlog -sn --no-merges --since="6 months ago"
```

### Insights we gather

- Ranked contributors by commit counts (excluding merge commits, matching the article’s `shortlog` usage).
- **Concentration** of commits among top authors (useful for bus-factor style interpretation).
- **Activity shift** signals by comparing all-time versus recent windows.

### Pretty output: likely automation in the contributor list

`git shortlog` only provides **display names**, not email addresses. In the terminal report’s **Contributors** section, `repolyze` highlights rows that look like **GitHub automation accounts** so they read distinctly from people:

- Any name ending in **`[bot]`** (GitHub’s usual App account form in shortlog, for example `renovate[bot]` or `github-actions[bot]`).
- The humanized label **`GitHub Actions`**, which matches the common shortlog name for commits authored as `GitHub Actions <actions@github.com>` (the address itself is not visible in `shortlog`).

This is **name-based heuristics only**: a human named like a bot could be highlighted incorrectly, and the inverse can happen if a bot uses an unusual display name. Use the **AI / automation tooling** block in the report (which uses author email and trailers from `git log`) for stronger attribution of automation work.

---

## 3. Where bugs cluster (keyword-filtered file touches)

### Purpose

Find files touched by commits whose messages look bug-related. The article recommends comparing this list to churn hotspots: files appearing on **both** lists are strong **risk** candidates (frequent change *and* repeated break/fix cycles).

### How to run (article)

```bash
git log -i -E --grep="fix|bug|broken" --name-only --format='' \
  | sort | uniq -c | sort -nr | head -20
```

### Insights we gather

- **Bug-keyword hotspot paths** ranked by frequency.
- **Overlap** with high-churn files (intersection), when both signals exist.

Caveat from the article: this depends on **commit message discipline**; vague messages weaken the signal, but a rough map is still better than none.

---

## 4. Is the project accelerating or dying (commit cadence by month)

### Purpose

Turn commit timestamps into a **timeline** of activity. The article reads “shapes”: steady rhythm vs sudden drops (often organizational), gradual decline vs batching/release spikes.

### How to run (article)

```bash
git log --format='%ad' --date=format:'%Y-%m' | sort | uniq -c
```

### Insights we gather

- **Commits per month** across repository history.
- Simple momentum cues (recent slope, peaks/troughs) suitable for human scan and programmatic trend checks.

---

## 5. How often the team is firefighting (reverts / hotfixes / rollbacks)

### Purpose

Detect **incident-driven** commit patterns via message keywords. The article frames frequent reverts/hotfixes as potential evidence of deploy fear, weak staging/tests, or painful rollbacks—while also noting that **zero** matches might mean stability *or* non-descriptive messages.

### How to run (article)

Commits whose **subject or body** matches the keyword family (same as `repolyze`’s grep pass):

```bash
git log -i -E --grep='revert|hotfix|emergency|rollback' --oneline --since="1 year ago"
```

Paths touched by those commits (ranked by touch count, capped like other hotspot tables):

```bash
git log -i -E --grep='revert|hotfix|emergency|rollback' \
  --name-only --format= --since="1 year ago"
```

### Insights we gather

- **Ranked paths** in the configured window: each time a matching commit lists a path in `git log --name-only`, that path’s touch count increments (top 20 paths, same aggregation style as churn and bug-keyword hotspots). Large merges can list many paths in one commit, so counts reflect “appears in crisis-shaped commits,” not necessarily sustained edit churn.
- **Matching commits** in newest-first order, using the same extended-regexp keyword list (`revert`, `hotfix`, `emergency`, `rollback`, case-insensitive) and window as the path query.
- **Machine vs terminal**: JSON (`--json`) includes the **full** ordered `matches` list for tooling. Human-readable output shows the path table first, then the **five most recent** matching commits, with a short note that older matches exist in JSON when there are more than five.

---

## 6. Where security fixes land (security-keyword file touches)

### Purpose

Surface commits that address **security vulnerabilities** and identify which files they touch. This extends the bug-clustering idea from section 3 with a more targeted keyword set tuned for security work. Files appearing in both churn hotspots (section 1) and security-fix lists are the highest-risk paths in a codebase—frequently changing *and* repeatedly patched for vulnerabilities.

### Research basis

Analysis of nine open-source repositories (axios, nodemailer, express, unhead, PraisonAI, n8n-mcp, magento2-dev-mcp, heim-mcp, saltcorn) revealed that security-relevant commits can be reliably surfaced from git history using a **tiered keyword strategy**. The tiers are ordered from highest confidence / lowest noise to broadest coverage / highest noise.

#### Tier 1 — Advisory identifiers (near-zero false positives)

Commits referencing **GHSA**, **CVE**, or **CWE** identifiers are almost always true security fixes. These identifiers appear in both commit subjects and commit bodies, so a search that covers the full message is essential.

Examples found across the researched repositories:


| Repository | Identifier                             | Vulnerability                                      |
| ---------- | -------------------------------------- | -------------------------------------------------- |
| nodemailer | `GHSA-vvjj-xcjg-gr5g`                  | SMTP command injection via CRLF in transport name  |
| nodemailer | `GHSA-9h6g-pr28-7cqp`                  | ReDoS in matching patterns                         |
| unhead     | `GHSA-x7mm-9vvv-64w8`                  | XSS via unsanitized streamKey in inline scripts    |
| n8n-mcp    | `GHSA-4ggg-h7ph-26qr`                  | SSRF in multi-tenant instance configuration        |
| express    | `CVE-2024-51999`                       | Query string parsing vulnerability                 |
| express    | `CVE-2026-2391`, `GHSA-w7fw-mjwx-w883` | qs arrayLimit bypass / denial of service           |
| axios      | `CVE-2024-39338`                       | SSRF via protocol-relative URL                     |
| axios      | `CVE-2023-45857`                       | CSRF vulnerability                                 |
| PraisonAI  | `CWE-78`                               | OS command injection via environment variable keys |
| PraisonAI  | `CWE-942`                              | CORS misconfiguration                              |
| PraisonAI  | `CVE-2026-22218`                       | Supply chain / dependency vulnerability            |


#### Tier 2 — Conventional commit scopes and GitHub security advisory merges (high confidence)

Many projects use conventional-commit prefixes that flag security work explicitly. Additionally, GitHub produces a distinctive merge commit when a maintainer merges from a **security advisory fork**: the subject reads `"Merge commit from fork"` while the body contains the GHSA identifier and vulnerability description.

Conventional-commit patterns observed:

- `fix(security):` — axios, PraisonAI, n8n-mcp
- `fix(sec):` — axios, express
- `fix(vulnerability):` — axios
- `fix(CSRF):` — axios
- `sec:` — express
- `security:` — PraisonAI, n8n-mcp

GitHub security advisory merge pattern observed in: unhead (1 instance), n8n-mcp (3 instances). The generic subject means `--oneline` alone gives no signal—the body must be searched.

#### Tier 3 — Vulnerability-class keywords (moderate confidence, noisier)

Commit messages often name the vulnerability class directly. This tier casts a wider net and will produce some false positives (for example, `"injection"` matching dependency-injection discussions, or `"escape"` matching string-escaping utilities unrelated to security), but it catches fixes that lack formal advisory IDs.

Vulnerability classes observed in the researched repositories:


| Keyword pattern               | Repositories where it appeared                    |
| ----------------------------- | ------------------------------------------------- |
| `command injection`           | magento2-dev-mcp, heim-mcp, nodemailer            |
| `SSRF`                        | axios, n8n-mcp                                    |
| `XSS`                         | unhead                                            |
| `path traversal`, `traversal` | saltcorn, PraisonAI, express                      |
| `prototype pollution`         | axios                                             |
| `ReDoS`                       | axios, nodemailer                                 |
| `CRLF`                        | nodemailer                                        |
| `CSRF`                        | axios                                             |
| `sandbox escape`              | PraisonAI                                         |
| `injection` (general)         | magento2-dev-mcp, heim-mcp, nodemailer, PraisonAI |


### How to run

#### Step 1 — Find security-fix commits (three-tier grep)

**Tier 1** — advisory identifiers:

```bash
git log --all -i -E --grep="GHSA-|CVE-|CWE-" --oneline
```

**Tier 2** — security scopes and GitHub advisory merges:

```bash
git log --all -i -E \
  --grep="Merge commit from fork" \
  --grep="fix\(sec" --grep="fix\(security" --grep="fix\(vuln" \
  --grep="^sec:" --grep="^security:" \
  --oneline
```

Multiple `--grep` flags without `--all-match` give **OR** semantics in `git log`.

**Tier 3** — vulnerability-class keywords:

```bash
git log --all -i -E \
  --grep="SSRF|XSS|CSRF|injection|traversal|prototype.pollution|ReDoS|sandbox.escape|auth.bypass|command.injection|CRLF|deserialization|open.redirect" \
  --oneline
```

**Important:** `git log --grep` matches against both the commit subject and body. A commit whose body mentions `"injection"` (for example, in a changelog paragraph or co-author line) but whose subject is entirely unrelated (for example, `"feat: add --serve flag"`) would be a false positive. `repolyze` therefore validates tier-3 matches by checking that the **subject line** itself contains the keyword. Commits that only matched via body content are dropped.

#### Step 2 — Files most touched by security-fix commits

Combine all tiers into a single pass and extract file paths:

```bash
git log --all -i -E \
  --grep="GHSA-|CVE-|CWE-" \
  --grep="Merge commit from fork" \
  --grep="fix\(sec" --grep="fix\(security" --grep="fix\(vuln" \
  --grep="^sec:" --grep="^security:" \
  --grep="SSRF|XSS|CSRF|injection|traversal|prototype.pollution|ReDoS|sandbox.escape|auth.bypass|command.injection|CRLF|deserialization|open.redirect" \
  --format=format: --name-only \
  | sort | uniq -c | sort -nr | head -20
```

#### Step 3 — Extract advisory references from commit bodies

For commits with the generic `"Merge commit from fork"` subject, the GHSA identifier lives in the **body**. To retrieve it:

```bash
git log --all --grep="Merge commit from fork" --format="%H %s%n%b" \
  | grep -E "GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}"
```

### Insights we gather

- **Security hotspot paths** ranked by frequency of security-fix touches.
- **Overlap with churn** (section 1): files appearing in both the churn top-20 and the security-fix top-20 are the highest-risk candidates—they change often *and* have been patched for vulnerabilities.
- **Overlap with bug hotspots** (section 3): files in both bug-keyword and security-keyword lists indicate paths with persistent quality and security problems.
- **Recency of last security fix**: a recent fix suggests active security maintenance; a very old last fix (or none) may indicate the project has not been audited recently—or that commit messages do not follow conventions detectable by keyword search.
- **Security-fix density**: the ratio of security-fix commits to total commits. A high ratio can mean the project has a large attack surface or is security-conscious; a low ratio in a complex project may mean fixes are not labeled.
- **Advisory coverage**: presence of GHSA/CVE/CWE references signals **responsible disclosure** practices and formal vulnerability tracking. Their absence does not mean no vulnerabilities—just that fixes may not be formally catalogued.
- **Tier distribution**: if most security commits come from tier 1 (advisory IDs), the project has strong disclosure practices. If they only appear in tier 3 (broad keywords), the signal is weaker and may include false positives.

### Caveats

- Like bug-keyword detection (section 3), this depends entirely on **commit message discipline**. Projects with vague or formulaic messages (`"fix stuff"`, `"update"`) will produce weak or empty signals.
- The `"Merge commit from fork"` pattern is specific to GitHub's security advisory workflow. Repositories hosted elsewhere or using different merge strategies will not produce this signal.
- Some security fixes use **generic messages** that no keyword search can catch. For example, PraisonAI's commit `feat(context): enhance agent ledger and monitor functionality` actually contained path-traversal hardening in the diff, but the subject gives no indication of security intent. Keyword grep will miss these.
- Broad tier-3 keywords like `"injection"` or `"escape"` can match non-security commits (dependency injection frameworks, string escaping utilities). `repolyze` mitigates this by requiring the keyword to appear in the commit **subject** (not just the body), but subject-level false positives are still possible. Tier-1 and tier-2 results should be treated with high confidence, while tier-3 results benefit from human review.
- Merge commits can inflate file-touch counts when `--name-only` includes the merge diff. Filtering with `--no-merges` reduces noise but may exclude the advisory merge commits themselves; `repolyze` should count both and let the consumer decide.

---

## 7. AI and automation tooling (paths + agent identities)

### Purpose

Complement ownership and churn (sections 1–2) with a **separate slice of history**: commits that are plausibly **agent- or automation-assisted**, then which **paths** they touch and which **identities** appear (including direct authors, not only `Co-authored-by` trailers).

This is **heuristic metadata** from commit metadata (author email, message trailers), not proof of how lines were written.

### Window and scope

- Same **~1 year** window as churn, **non-merge** commits only (aligned with contributor `shortlog` semantics).
- **Paths**: ranked by how often a path appears in the diff of a classified commit (same spirit as section 1, filtered to this subset).
- **Overlap styling** (pretty output): paths that also appear in **security-fix hotspots** (section 6) can be emphasized as an intersection hint, not causality.

### What counts as “agent / automation assisted”

`repolyze` classifies a commit when **any** of the following holds (author line, commit body footer, or any `Co-authored-by` trailer; case-insensitive `Co-authored-by:` prefix):

1. **GitHub App noreply** addresses: `123+slug[bot]@users.noreply.github.com` or `slug[bot]@users.noreply.github.com` (any slug GitHub uses for that app).
2. **Built-in GitHub Actions** commits: author **`GitHub Actions <actions@github.com>`** (common for workflow-generated commits such as changelog bumps).
3. **Anthropic**: `noreply@anthropic.com` with a matching `Claude` display name rule set (strict enough to avoid arbitrary emails).
4. **Windsurf / Codeium**: trailer emails under `@codeium.com` or `@windsurf.com`.
5. **Cursor**: trailer email **`cursoragent@cursor.com`**, or a commit body whose **last non-blank line** is **`Made-with: Cursor`** (footer the Cursor IDE adds when creating a commit from the product).

### Agent & bot identities · commit contributions

Under the same **AI / automation tooling** section, a second table lists **commit counts per stable identity** for the window:

- GitHub automation rows use the **`slug[bot]`** form derived from noreply email when available, or the label **`GitHub Actions`** for `actions@github.com`.
- Anthropic trailers roll up to **`Claude (Anthropic)`**; Windsurf and Cursor use fixed row labels **`Windsurf`** and **`Cursor`** (including the **`Made-with: Cursor`** body footer when present).
- A single commit can credit **multiple** identities (for example several `Co-authored-by` bots).

For **machine-readable** output, see `aiToolingHotspots` in the JSON report (`topFiles`, `trackedBotContributors`, `patternSetVersion`, etc.). The human report uses a dedicated **purple** palette for this block so it is visually distinct from churn, bugs, security, and the green contributor bars in section 2.

---

## How `repolyze` maps this document to output

- **Human output**: a non-interactive, terminal-formatted report (styled for quick scanning).
- **Machine output**: `repolyze --json` emits a structured report for tooling and AI agents (including **`churn.topDirectories`** / **`churn.directoryDepthMax`**, **`aiToolingHotspots`**, and a monotonic **`schemaVersion`**).

If you extend the tool, keep the article’s intent in mind: these signals narrow **where to read first** and **what organizational dynamics might be in play**, not a complete audit on their own.

## Tooling note (`repolyze` implementation)

When running `git shortlog` from non-interactive environments (for example, a Node.js subprocess), pass an explicit revision such as `HEAD`. Otherwise Git may treat standard input as the commit input stream when stdin is not a TTY, which can hang or behave unexpectedly.
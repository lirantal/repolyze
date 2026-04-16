# Repository analysis signals

This document describes the **git-derived repository signals** that `repolyze` collects before diving into source code. The workflow is inspired by Maciej Piechowski’s article *“The Git Commands I Run Before Reading Any Code”*, which argues that commit history gives a diagnostic picture of a project: ownership, churn, bug clustering, momentum, and crisis patterns.

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
- **Hotspot candidates** for cross-checking with bug-keyword history (see section 3).
- Context from the article: churn-based signals have been studied as predictors of defects (the article references Microsoft Research work on relative code churn).

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

```bash
git log --oneline --since="1 year ago" \
  | grep -iE 'revert|hotfix|emergency|rollback'
```

### Insights we gather

- Matching **one-line commits** in the last year using the same keyword family (`revert`, `hotfix`, `emergency`, `rollback`, case-insensitive).
- Count and recency for “crisis-shaped” commit traffic.

---

## How `repolyze` maps this document to output

- **Human output**: a non-interactive, terminal-formatted report (styled for quick scanning).
- **Machine output**: `repolyze --json` emits a structured report for tooling and AI agents.

If you extend the tool, keep the article’s intent in mind: these signals narrow **where to read first** and **what organizational dynamics might be in play**, not a complete audit on their own.

## Tooling note (`repolyze` implementation)

When running `git shortlog` from non-interactive environments (for example, a Node.js subprocess), pass an explicit revision such as `HEAD`. Otherwise Git may treat standard input as the commit input stream when stdin is not a TTY, which can hang or behave unexpectedly.

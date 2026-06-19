# GitHub Actions Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit the currently approved full working tree to `main`, push it to `origin/main`, and verify that the GitHub Actions Docker build workflow is triggered.

**Architecture:** This is a release-operation plan, not a code feature. The existing workflow `.github/workflows/deploy.yml` already triggers on `push` to `main`, so the implementation is limited to transparent preflight checks, full-scope staging, one release commit, push, and workflow observation.

**Tech Stack:** Git, GitHub Actions, GHCR, Docker build workflow.

---

## File Structure

- Modify: `docs/superpowers/plans/2026-06-19-github-actions-release.md` — this execution plan.
- Commit: all files already present in the approved working tree, plus this plan file.
- Do not modify: `.github/workflows/deploy.yml` — current push-to-main trigger is used as-is.

## Task 1: Preflight Snapshot

**Files:**
- Read/check: repository working tree
- Read/check: `.github/workflows/deploy.yml`

- [ ] **Step 1: Show current branch and working tree status**

Run:

```bash
git status --short --branch
```

Expected: output shows `main...origin/main` and the full set of modified/untracked files that will be released.

- [ ] **Step 2: Confirm workflow trigger is still push to main**

Run:

```bash
git diff -- .github/workflows/deploy.yml
```

Expected: no output, because the workflow is not being changed for this release.

- [ ] **Step 3: Record known local test failures without blocking release**

Run:

```bash
npm run test
```

Expected: frontend tests may fail with the known legacy failures recorded before this plan.

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest
```

Expected: backend tests may fail with `MODEL_CONFIG_MASTER_KEY is required to save API key` in agent initialization tests.

- [ ] **Step 4: Commit the plan document**

Run:

```bash
git add docs/superpowers/plans/2026-06-19-github-actions-release.md
git commit -m "$(cat <<'EOF'
docs(plan): GitHub Actions 发布打包实施计划
EOF
)"
```

Expected: a new docs(plan) commit is created before the full release commit.

## Task 2: Full Release Commit

**Files:**
- Commit: all approved modified and untracked files in the working tree

- [ ] **Step 1: Show all files that will be staged**

Run:

```bash
git status --short
```

Expected: output includes the approved full working tree, including code, docs, sandbox files, generated release-related files, and other untracked files.

- [ ] **Step 2: Stage the approved full working tree**

Run:

```bash
git add -A
```

Expected: all currently visible modified and untracked files are staged.

- [ ] **Step 3: Show staged summary before committing**

Run:

```bash
git diff --cached --stat
```

Expected: a summary of all staged files appears. If unexpected secret files appear, stop before committing.

- [ ] **Step 4: Create the release commit**

Run:

```bash
git commit -m "$(cat <<'EOF'
chore(release): 触发 GitHub Actions 打包
EOF
)"
```

Expected: one release commit is created containing the approved full working tree.

## Task 3: Push and Verify Actions Trigger

**Files:**
- No file modifications

- [ ] **Step 1: Push `main` to origin**

Run:

```bash
git push origin main
```

Expected: push succeeds and updates `origin/main`, which triggers `.github/workflows/deploy.yml`.

- [ ] **Step 2: Check latest workflow run**

Run:

```bash
gh run list --workflow "Build and Push Docker Image" --limit 3
```

Expected: the newest run corresponds to the pushed commit.

- [ ] **Step 3: Show workflow run detail**

Run:

```bash
gh run view --workflow "Build and Push Docker Image" --log-failed
```

Expected: if the workflow has failed, failed logs are shown; if it is still running, GitHub CLI reports the current status.

- [ ] **Step 4: Final status check**

Run:

```bash
git status --short --branch
```

Expected: local `main` is aligned with `origin/main` or has no uncommitted release files left.

## Self-Review

- Spec coverage: The plan commits current full scope, pushes to `main`, uses existing workflow trigger, and verifies Actions run.
- Placeholder scan: No TODO/TBD placeholders remain.
- Type consistency: No code symbols or interfaces are introduced.

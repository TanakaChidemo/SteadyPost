# Contributing Guide

`main` is protected. **Nobody can push to it directly.** Every change goes through a pull request (PR) and needs approval from all the other team members before it can be merged.

---

## One-time setup

```bash
git clone https://github.com/TanakaChidemo/SteadyPost.git
cd <repo>
```

---

## The workflow

### 1. Start from an up-to-date `main`

```bash
git checkout main
git pull origin main
```

### 2. Create a branch for your change

```bash
git checkout -b feature/short-description
```

Branch naming:

| Prefix      | Use for                        | Example                  |
|-------------|--------------------------------|--------------------------|
| `feature/`  | New functionality              | `feature/login-page`     |
| `fix/`      | Bug fixes                      | `fix/null-user-crash`    |
| `docs/`     | Documentation only             | `docs/update-readme`     |
| `chore/`    | Config, dependencies, cleanup  | `chore/bump-deps`        |

### 3. Make your changes and commit

```bash
git add .
git commit -m "Add login form validation"
```

Keep commits small and messages clear. Say *what* changed, in the present tense.

### 4. Push your branch (not `main`)

```bash
git push -u origin feature/short-description
```

### 5. Open a pull request

1. GitHub will show a **Compare & pull request** banner. Click it (or go to **Pull requests → New pull request**).
2. Base: `main` ← Compare: your branch.
3. Write a short description: what changed, why, and how to test it.
4. Under **Reviewers**, add every other team member.

### 6. Review and respond to feedback

- Reviewers leave comments or **Approve** / **Request changes**.
- To fix something, just commit and push to the same branch. The PR updates automatically:

  ```bash
  git add .
  git commit -m "Address review comments"
  git push
  ```

- **Note:** pushing new commits resets existing approvals. Reviewers will need to approve again.
- Resolve all comment threads before merging.

### 7. Merge

Once all required approvals are in and checks pass, the **Merge pull request** button turns green. Merge it, then click **Delete branch**.

### 8. Clean up locally

```bash
git checkout main
git pull origin main
git branch -d feature/short-description
```

---

## Reviewing someone else's PR

1. Open the PR → **Files changed** tab.
2. Leave comments on specific lines if needed.
3. Click **Review changes** → choose **Approve**, **Comment**, or **Request changes** → **Submit review**.

To test their branch locally:

```bash
git fetch origin
git checkout feature/their-branch
```

---

## Common problems

**"Protected branch hook declined" / push rejected**
You tried to push to `main`. If you committed to `main` by accident, move the work to a branch:

```bash
git branch feature/my-work        # save your commits on a new branch
git reset --hard origin/main      # reset local main to match GitHub
git checkout feature/my-work
git push -u origin feature/my-work
```

**Merge conflicts on the PR**
Update your branch with the latest `main`:

```bash
git checkout feature/your-branch
git pull origin main
# fix the conflicted files, then:
git add .
git commit
git push
```

**Merge button is greyed out**
Check the bottom of the PR: it lists what's missing (approvals, unresolved conversations, or failing checks).

---

## Golden rules

- Never work directly on `main`. Always branch first.
- Pull `main` before starting new work.
- One branch per feature or fix. Keep PRs small and focused.
- Review your teammates' PRs promptly. Nothing merges without you.

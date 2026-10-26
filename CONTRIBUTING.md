# Contributing

These rules apply to every change in this repo.

## Branches

- `main` is protected. Nothing is pushed to it directly; changes land through a pull request.
- Create a branch from an up-to-date `main`, with one topic per branch.
- Name branches `type/short-topic`, lowercase with hyphens:
  - `docs/` for documentation
  - `feat/` for new features
  - `fix/` for bug fixes
  - `chore/` for tooling, config and cleanup
- Examples: `docs/architecture`, `feat/pomodoro-timer`, `fix/quota-reset`.
- Delete the branch after it is merged.

## Commits

- Write short, clear messages in the imperative: `docs: add architecture overview`.
- Prefix with the same types as branches: `docs`, `feat`, `fix`, `chore`.
- Keep each commit focused on one change.

## Pull requests

- One pull request per branch, targeting `main`.
- Title format: `type: short summary`, for example `docs: add architecture overview`.
- The description has three parts:
  - **What**: what changed.
  - **Why**: the reason for the change.
  - **How to verify**: how to check it works (for docs, what to read or compare).
- Keep diffs small and focused. Split unrelated changes into separate pull requests.
- Link the roadmap step the change belongs to, when there is one.
- The pull request is reviewed and approved by the repo owner before merging.
- Merge with **squash and merge**.

## Code and docs

- Match the style of the surrounding files.
- Do not commit secrets, API keys, tokens or `.env` files.
- Use original art, names and sounds only. Do not copy assets from other games or sites.

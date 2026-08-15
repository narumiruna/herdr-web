# Tag-Driven Release Automation Plan

## Goal

Make the manual version-bump workflow commit and tag the new version directly, then let the tag validate, publish the npm package and container image, and create the GitHub Release without a pull request.

## Context

- `power-monitor` uses a PAT for its version commit and tag so tag-triggered workflows run.
- `pi-extensions` publishes to npm with GitHub OIDC and npm Trusted Publishing instead of a stored npm token.
- `hath-rust` creates releases from pushed tags after reusable build work succeeds.
- herdr-web currently commits the version directly but does not create a tag.
- herdr-web currently requires a manually signed annotated tag, so an automatically created lightweight tag would be rejected.
- The repository has `PAT_TOKEN`; npm authentication is configured at npmjs through Trusted Publishing.
- The first `v0.1.2` run authenticated through OIDC and produced signed provenance, but npm rejected the stale `narumiruna/herdr-web` repository URL after GitHub moved the repository to `narumiruna/herdr-web`.

## Architecture

- **Bump version:** update `package.json` and `package-lock.json`, create a GitHub-signed commit on the default branch with `PAT_TOKEN`, then create `vX.Y.Z` at that exact commit with the same PAT.
- **Release:** run independently on `vX.Y.Z`, verify that the tag and package versions match, then create the GitHub Release with generated release notes.
- **Publish:** run independently on `vX.Y.Z`, verify the same metadata, run release checks, publish npm through GitHub OIDC, and publish GHCR with the job-scoped `GITHUB_TOKEN`.
- PAT-authenticated branch and tag updates trigger CI, Release, and Publish without explicit dispatches.

## Risks

- `PAT_TOKEN` needs GitHub repository Contents read/write permission.
- npm Trusted Publishing must authorize this repository, `publish.yml`, and the `release` environment before a release.
- npm provenance rejects publication when `package.json` repository metadata differs from the GitHub repository, so package checks enforce the canonical URL.
- Commit and tag creation are separate GitHub API operations; if tag creation fails after the commit, the workflow must report the exact recovery tag and commit and must not hide the partial result.
- A concurrent default-branch update is rejected by `expectedHeadOid` before a version commit is created.

## Rollback / Recovery

- If the version commit succeeds but tag creation fails, create `vX.Y.Z` at the reported commit instead of running another bump.
- Delete an incorrect unpublished tag before retrying its tag creation.
- Published npm versions and immutable container digests are not rolled back or overwritten.

## Plan

- [x] Update `.github/workflows/bump-version.yml` to create `vX.Y.Z` with `PAT_TOKEN` at the exact version commit and report partial tag failures; mocked success and recovery paths pass.
- [x] Update `.github/workflows/publish.yml` to trigger directly from `vX.Y.Z`, validate and test the tagged source, use npm Trusted Publishing, and retain `GITHUB_TOKEN` for GHCR.
- [x] Update `.github/workflows/release.yml` to trigger independently from `vX.Y.Z`, validate the generated tag, and create generated release notes without requiring a manually signed annotated tag.
- [x] Update `README.md` with the automatic tag flow, token responsibilities, and tag-recovery procedure.
- [x] Align `package.json`, package validation, and GHCR documentation with `narumiruna/herdr-web`; the package check and packed manifest preserve the CLI while matching npm provenance.
- [x] Parse all workflow YAML, inspect embedded scripts and permissions, run repository checks, and verify the final diff; actionlint, bump simulations, positive and negative tag validators, 133 repository tests, both builds, and 17 Chromium tests pass.

## Completion Checklist

- [x] A bump run has one selected semver increment and creates no pull request.
- [x] The version commit updates both package files and the generated tag targets that exact commit.
- [x] A PAT-authenticated tag push independently starts Release and Publish.
- [x] Publishing validates and tests the tag, uses GitHub OIDC for npmjs, and uses `GITHUB_TOKEN` for GHCR.
- [x] Release validation rejects mismatched tags, versions, or non-default-branch commits.
- [x] Failure after commit creation reports a finite manual tag recovery path.
- [x] Documentation and all available static and repository checks pass.

# Release process

CodexLattice releases are designed to be reproducible, reviewable, and free of long-lived npm publish tokens.

## Release trust model

The intended steady-state path is:

1. merge a reviewed version/changelog PR to `main`;
2. create an annotated or signed `vX.Y.Z` tag pointing at that `main` commit;
3. `.github/workflows/release.yml` re-runs tests and package verification;
4. GitHub Actions obtains a short-lived npm credential through OIDC trusted publishing;
5. npm publishes the public package with provenance when the registry supports it for the public repository;
6. the workflow creates a GitHub Release with the exact npm tarball and `SHA256SUMS.txt`.

Do not add a long-lived `NPM_TOKEN` to this repository for normal publishing.

## One-time npm setup

Trusted publishing is configured on npm, not in repository source.

If `codex-lattice` has never been published to npm, first establish package ownership with a one-time maintainer-controlled bootstrap publish from a clean checkout. Confirm the package name and ownership before doing this.

After the package exists, configure its npm Trusted Publisher with:

- provider: GitHub Actions;
- GitHub owner: `hamburger-os`;
- repository: `CodexLattice`;
- workflow filename: `release.yml`;
- environment: `npm`;
- allowed action: `npm publish`.

The workflow uses GitHub-hosted runners and grants `id-token: write`, which npm requires for OIDC. The package `repository.url` must continue to point to this GitHub repository.

After one successful OIDC release, restrict or revoke traditional automation publish tokens in npm.

## GitHub environment

Create a GitHub Actions environment named `npm`. For a single-maintainer project it may initially have no required reviewer. If another trusted maintainer is added later, consider requiring an approval for production publishing.

Do not put package secrets in this environment; OIDC publication does not need an npm write token.

## Routine release checklist

Before tagging:

- update `package.json` version;
- move relevant `CHANGELOG.md` entries from `Unreleased` into the release version;
- ensure `required / ci` and CodeQL are green on the release commit;
- run `npm run verify:package` locally when practical;
- confirm the tag will point at the intended `main` commit.

Then create and push `vX.Y.Z`. The release workflow rejects tags that do not exactly match the package version.

## Recovery and reruns

The workflow compares the local packed tarball integrity with an already-published registry version. A rerun may skip `npm publish` only when the registry version has the same integrity; a mismatched existing version fails closed. GitHub Release assets are uploaded with replacement enabled so a failed final release step can be safely retried.

Never overwrite or republish an npm version with different content. Bump the version instead.

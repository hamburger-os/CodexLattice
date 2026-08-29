# Release process

CodexLattice releases are designed to be reproducible and reviewable. The canonical distribution channel is GitHub Releases; npm registry publication is intentionally deferred and is not a release prerequisite.

## Release trust model

The current release path is:

1. merge a reviewed version/changelog PR to `main`;
2. create an annotated or signed `vX.Y.Z` tag pointing at that `main` commit;
3. `.github/workflows/release.yml` re-runs tests and package verification;
4. the workflow packs the exact installable tarball from the tagged source;
5. the tarball is installed in a clean temporary prefix and its CLI version is checked;
6. the workflow publishes a GitHub Release with generated notes, the tarball, and `SHA256SUMS.txt`.

The repository does not require npm credentials, an npm environment, or a long-lived publish token.

## npm status

The project remains npm-package-compatible because Git-based global installs and release tarballs use the same package manifest. Direct npm registry publishing may be added later if it materially improves user distribution. Until then:

- do not treat npm availability as a release gate;
- do not add `NPM_TOKEN` or another long-lived registry secret;
- do not claim npm provenance or Trusted Publishing is active;
- keep `npm run verify:package` as a packaging-integrity check rather than a registry-publishing check.

## Routine release checklist

Before tagging:

- update `package.json` version;
- move relevant `CHANGELOG.md` entries from `Unreleased` into the release version;
- ensure `required / ci` and CodeQL are green on the release commit;
- run `npm run verify:package` locally when practical;
- confirm the tag will point at the intended `main` commit.

Then create and push `vX.Y.Z`. The release workflow rejects tags that do not exactly match the package version.

## Recovery and reruns

GitHub Release asset upload uses replacement mode. If a run fails after the release is created, rerunning the tag workflow can safely refresh the tarball and checksum assets from the same immutable tag.

Never move an existing release tag to different source content. Bump the version instead.

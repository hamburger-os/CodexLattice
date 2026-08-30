# Release process

CodexLattice releases are designed to be reproducible and reviewable. The canonical distribution channel is GitHub Releases; npm registry publication is intentionally deferred and is not a release prerequisite.

## Release trust model

The current release path is:

1. merge a reviewed version/changelog PR to `main`;
2. add a reviewed `.github/release-requests/vX.Y.Z.json` request that pins the exact release commit SHA;
3. `.github/workflows/release-request.yml` verifies that the target is an ancestor of reviewed `main`, that `package.json` and `CHANGELOG.md` agree with the requested version, and that an existing tag is not being moved;
4. the release-request workflow creates an annotated immutable tag and dispatches `.github/workflows/release.yml` for that tag;
5. the release workflow re-runs tests and package verification, packs the exact installable tarball, and verifies a clean global install;
6. the workflow publishes or refreshes a GitHub Release with generated notes, the tarball, and `SHA256SUMS.txt`.

The repository does not require npm credentials, an npm environment, or a long-lived publish token. Release tags are created only from reviewed request manifests merged through the protected default branch.

## Release request format

A request is intentionally tiny and immutable:

```json
{
  "version": "X.Y.Z",
  "targetSha": "<full 40-character release commit SHA>"
}
```

The real filename must be exactly `vX.Y.Z.json` for the concrete semantic version. The target SHA must already be contained in the reviewed branch. If the tag already exists, the request is accepted only when it resolves to the exact same commit; tag movement fails closed.

## npm status

The project remains npm-package-compatible because Git-based global installs and release tarballs use the same package manifest. Direct npm registry publishing may be added later if it materially improves user distribution. Until then:

- do not treat npm availability as a release gate;
- do not add `NPM_TOKEN` or another long-lived registry secret;
- do not claim npm provenance or Trusted Publishing is active;
- keep `npm run verify:package` as a packaging-integrity check rather than a registry-publishing check.

## Routine release checklist

Before opening the release-request PR:

- update `package.json` version;
- move relevant `CHANGELOG.md` entries from `Unreleased` into the release version;
- ensure `required / ci` and CodeQL are green on the release commit;
- run `npm run verify:package` locally when practical;
- for transparent-runtime changes, ensure the real-Codex smoke verifies the installed manifest-bound Hook command and `doctor --strict` on Linux, macOS, and Windows;
- record the exact intended `main` commit SHA in `.github/release-requests/vX.Y.Z.json`.

After the request PR is merged, the tag and GitHub Release are automated. The release workflow rejects any tag that does not exactly match the package version at the tagged source.

## Recovery and reruns

`release.yml` also supports an explicit `workflow_dispatch` input named `tag`. This is the recovery path when a verified tag exists but the release job needs to be retried. GitHub Release asset upload uses replacement mode, so rerunning against the same immutable tag safely refreshes the tarball and checksum assets.

Never move an existing release tag to different source content. Bump the version instead.

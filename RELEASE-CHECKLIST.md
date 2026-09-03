# Release checklist

## Before publishing a version

- [ ] Confirm the version is strict `x.y.z` and matches `manifest.json`, `versions.json`, source metadata, and the Git tag.
- [ ] Build the private source repository from a clean checkout.
- [ ] Run typecheck, lint, tests, and the project build.
- [ ] Verify the generated `main.js` exactly matches the release asset.
- [ ] Validate `manifest.json` and confirm the description is under 250 characters and ends with a period.
- [ ] Test desktop and mobile behavior, including an empty Specialty → Surgeon → Case state.
- [ ] Scan release assets for personal data, credentials, absolute paths, diagnostics, and development-only files.
- [ ] Confirm no telemetry, undeclared network use, or outside-vault access has been added.
- [ ] Update `CHANGELOG.md` and `README.md` when user-visible behavior changes.
- [ ] Create a GitHub release tagged exactly `0.1.5` and attach `main.js`, `manifest.json`, and `styles.css`.

## Before submitting to the Obsidian Community directory

- [ ] Select and add a real license file.
- [ ] Commit all public-distribution repository files to its default branch.
- [ ] Create and connect the private source repository.
- [ ] Install the Obsidian Community directory GitHub App on the private source repository.
- [ ] Use the Community directory review preview and resolve blocking results.
- [ ] Submit the public repository URL, link the GitHub account, and complete required listings/disclosures.

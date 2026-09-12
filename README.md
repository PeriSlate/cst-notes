# CST Notes

CST Notes organizes surgical technologist notes in Obsidian with a Specialty → Surgeon → Case hierarchy. Cases remain ordinary Markdown files in the user’s vault, and the plugin includes templates, surgeon profiles, glove and gown data, navigation, migrations, reference workflows, and mobile support.

## Privacy and data

CST Notes is designed for local, offline vault use. It has no external processing service or telemetry and does not require file access outside the active Obsidian vault. Obsidian's own community-plugin update checks are enabled on supported versions; updates are not installed automatically. Import from clipboard reads the clipboard only when pressed. No real surgeon records, cases, clinical notes, backups, diagnostics, or other user data are included in this repository or release. The onboarding example is fictional teaching content.

CST Notes is proprietary software; see [LICENSE](LICENSE) for the permitted end-user and distribution rights.

## Closed-source Community Directory disclosure

CST Notes is proprietary, closed-source software. The source code is not published in this public distribution repository. PeriSlate will provide the Obsidian Community directory read-only access to the separate private source repository through the official Community Directory GitHub App solely for review, security scanning, and verification that the release assets match the source build.

CST Notes has no payment requirement, account requirement, external processing service, telemetry, advertising, or outside-vault file access. See [COMMUNITY-REVIEW.md](COMMUNITY-REVIEW.md) for clipboard and host-setting disclosures and [LICENSE](LICENSE) for the applicable proprietary license.

## Installation from a release

1. Download `main.js`, `manifest.json`, and `styles.css` from the release matching your Obsidian version.
2. Create `<vault>/.obsidian/plugins/cst-notes/`.
3. Place the downloaded files in that folder.
4. In Obsidian, open **Settings → Community plugins**, enable community plugins if needed, then enable **CST Notes**.
5. Use **CST Notes: Initialize / repair installation** if the plugin prompts you to initialize its workspace.

## Release contents

GitHub releases attach these files:

- `main.js`
- `manifest.json`
- `styles.css`

`versions.json` is tracked in the repository for version compatibility metadata. This repository intentionally does not contain user vault data, local settings, source code, or build tooling.

## New in 0.1.12

Fixed glove, music and settings input; direct New Specialty and recoverable Delete Surgeon actions in Admin; corrected surgeon navigation and search keyboard handling; clearer Copy package/Save package sharing; and swipe-down onboarding guidance. See [release notes](RELEASE-NOTES.md) for details. Surgeon deletion previews its affected cases and preserves recovery copies; shared templates and other surgeons remain unchanged.

## Support

Use the repository’s issue tracker for reproducible bugs and include only redacted diagnostics. Do not attach real patient, case, surgeon, hospital, or credential information.

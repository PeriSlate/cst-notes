# CST Notes Community Directory review disclosure

## Licensing and source access

CST Notes is proprietary, closed-source software owned by PeriSlate. The public repository contains only the distribution documentation and compiled release assets. The complete source repository remains private.

PeriSlate authorizes the Obsidian Community directory to access the private source repository through the official Community Directory GitHub App solely to inspect source, perform security scanning, reproduce the build, and verify that the public release assets match the private source build.

## Privacy and operational disclosures

- No payment is required for the current plugin functionality.
- No user account is required.
- No network services are used by the plugin.
- No telemetry, advertising, or analytics are included.
- The plugin does not access files outside the active Obsidian vault.
- The release contains no patient, surgeon, hospital, case, backup, diagnostic, or credential data.

## Release asset verification

The private source repository includes a deterministic build script and release verification checks. The source output, the private build output, and the public `main.js` are byte-for-byte identical for v0.1.5.

## Maintainer action before submission

1. Push the public distribution repository to GitHub.
2. Push the private source repository to a separate private GitHub repository.
3. Create the v0.1.5 public GitHub Release and attach `main.js`, `manifest.json`, and `styles.css`.
4. Submit the public repository to the Obsidian Community directory.
5. Install the official Community Directory GitHub App on the private source repository when prompted.
6. Run the Community Directory review preview and address any review feedback.

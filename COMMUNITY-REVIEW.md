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

The private source repository includes a deterministic build script and release verification checks. The source output, the private build output, and the public `main.js` are byte-for-byte identical for v0.1.8.

## Maintainer action before submission

1. Push the public distribution repository to GitHub.
2. Push the private source repository to a separate private GitHub repository.
3. Create the v0.1.8 public GitHub Release and attach `main.js`, `manifest.json`, and `styles.css`.
4. Submit the public repository to the Obsidian Community directory.
5. Install the official Community Directory GitHub App on the private source repository when prompted.
6. Run the Community Directory review preview and address any review feedback.

## Release access and provenance disclosures

Routine file discovery is scoped to the relevant CST folders. Initialization still checks cached Markdown metadata across the vault to detect moved or legacy CST records before creating infrastructure; this safety check does not read unrelated note bodies.

The two Copy diagnostic buttons write diagnostic text to the system clipboard only after a user clicks them. CST Notes does not read clipboard contents. Review diagnostic output before sharing it.

The public release workflow will attest the attached main.js, manifest.json, and styles.css from the public release tag. These attestations identify the distribution workflow and exact asset bytes; they do not claim that this workflow builds the private source. Private-source reproducibility remains separately verified by the Obsidian review process.

The proprietary LICENSE is intentional. An automated standard-license detector may report it as unrecognized; this is not permission to relicense CST Notes. Clipboard and initialization-enumeration recommendations may also remain because those capabilities are disclosed and intentional. Availability of the review provider's malware scan is outside the plugin's control.

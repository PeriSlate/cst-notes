# CST Notes 0.1.16

- Restore the iOS **Copy** activity by presenting the single `.cstcase` attachment as JSON.
- Keep the one-file share payload with no title or text companion, preventing the extra title-only `.txt` file in Save to Files.
- If Messages exposes only an attachment reference, open a focused paste field that can receive the copied `.cstcase` file through iOS Paste.
- Skip recipient-profile comparison when importing into a new surgeon; review the sender profile directly before confirmation.
- Highlight **Preview import** after comparing an existing surgeon’s profile.
- Simplify final import confirmation while retaining the destination, profile values, case preview, consent, and actions.
- Highlight the confirm action and separate it clearly from cancel.
- Keep transferred Markdown comments hidden instead of displaying escaped comment markers in imported cases.
- Preserve surgeon-named files and the exact-title/exact-surgeon duplicate replacement workflow from 0.1.15.

iOS controls which activities appear for each shared data type. Physical-iPhone confirmation remains required; **Choose case file** remains the reliable fallback when the clipboard exposes only a file reference.

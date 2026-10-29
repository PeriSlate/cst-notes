# CST Notes 0.1.15

- Include the surgeon name in every shared filename: `Case name - Surgeon name - short ID.cstcase`.
- Send one `.cstcase` attachment through the device share sheet instead of creating a second title-only text file on iPhone.
- Make the single share attachment text-readable so iPhone Copy can provide the complete case data to **Paste case**.
- When a clipboard contains only a file reference, direct the recipient to **Choose case file** and select the `.cstcase` attachment.
- Treat a case as a duplicate only when both surgeon name and case title exactly match; offer safe replacement, opening the existing case, or cancellation.
- Archive the previous case before a confirmed replacement so it remains recoverable.

Native Copy behavior still depends on what iOS and the Obsidian host expose. **Choose case file** remains the reliable fallback for a saved `.cstcase` attachment.

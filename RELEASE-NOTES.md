# CST Notes 0.1.14

- Make the device share sheet receive only the case-named `.cstcase` file so its Copy action copies the case instead of generic share text.
- Add a primary **Paste case** importer that accepts a copied `.cstcase` file, raw JSON, or the complete text from a `.cstcase` file.
- Highlight **Open surgeon** in the case header and keep **Share case** as a secondary action.

Native share and clipboard-file exposure depend on the host device. Choose case file and manual text paste remain available. Physical iPhone and iPad behavior has not been verified for this change.

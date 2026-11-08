# CSTPACK-1 library snapshots

A `.cstpack` is an offline, unencrypted ZIP snapshot for moving an active CST Notes library into a downstream application. The manifest declares `absencePolicy: "no-deletion"`. A downstream consumer must treat missing items as absent from this snapshot. It must never infer deletion from that absence. Archive integrity checks detect corruption and inconsistencies. Sender authentication would require a separate mechanism.

## Archive layout

| Member | Contents |
| --- | --- |
| `manifest.json` | Canonical JSON manifest |
| `manifest.sha256` | Exactly 64 ASCII lowercase hexadecimal digits for the SHA-256 of the stored manifest bytes |
| `records/assets.json`, `records/cases.json`, `records/documents.json`, `records/references.json`, `records/resources.json`, `records/specialties.json`, `records/surgeons.json`, `records/templates.json` | One JSON array per member, including empty arrays |
| `report.json` | Object with `warnings`, `errors`, and `exclusions` arrays. Entries carry `path` and `message`. Warnings and errors also carry `code`. |
| `content/<document-id>.md` | Preserved Markdown payload |
| `assets/<sha256>.<extension>` | Preserved image bytes |

All eleven fixed members are mandatory. The ZIP contains only these names and the payload names declared by the document and asset records. A document ID in a member path has 1–128 ASCII characters, starts with a letter or digit, and allows letters, digits, underscores, and hyphens thereafter. Windows device names `CON`, `PRN`, `AUX`, `NUL`, `COM0`–`COM9`, and `LPT0`–`LPT9` are rejected case-insensitively. The image suffix allowlist is `png`, `jpg`, `jpeg`, `gif`, and `webp`. The collector writes `jpg` for JPEG.

The writer uses single-disk ZIP32 with STORE (method 0), the UTF-8 flag, version-needed 2.0, lexicographic member order, and the fixed DOS timestamp 1980-01-01 at midnight. The runtime reader accepts version-needed 1.0–2.0 and flags 0 or the UTF-8 flag alone. It requires contiguous local entries followed by the central directory and an uncommented end record. Local and central names, sizes, CRCs, timestamps, flags, version-needed, and compression method must match. Encryption, compression, data descriptors, ZIP64, extra fields, comments, directories, symlinks, overlapping ranges, leading or trailing bytes, and case-insensitive duplicate member names are outside this profile.

## Manifest and projections

The [JSON Schema](cstpack-1.schema.json) describes the emitted JSON structure in Draft 2020-12. Use its root for `manifest.json`, `#/$defs/report` for `report.json`, and `#/$defs/<kind>` for each `records/<kind>.json` array. It permits additional properties on projected records, nested projections, source metadata, and the manifest. The count and inventory entry objects are exact. Schema validation covers structure. ZIP framing, canonical bytes, bounds across members, sorted inventory, equality of hashes, and record relationships require procedural validation. The CST Notes package reader checks the wire contract directly. It accepts some minimal projections with optional fields omitted and does not run this JSON Schema.

| Manifest fields | Meaning |
| --- | --- |
| `format`, `schemaVersion`, `kind` | `"perislate-library"`, `"1.0.0"`, `"library-snapshot"` |
| `scope`, `absencePolicy`, `reportPath` | `"active-library"`, `"no-deletion"`, `"report.json"` |
| `packageId`, `libraryId` | Export instance ID and stable source library ID |
| `createdAt` | UTC timestamp with seconds and optional three-digit milliseconds, ending in `Z` |
| `source` | Exporter object. CST Notes writes `application`, its plugin `version`, and its internal numeric `schemaVersion`. |
| `gloveConfig`, `resourceAliases` | Glove sizes and types and approved resource alias projections. The package writer defaults to `{}` and `[]` when omitted from its input. |
| `requiredFeatures` | Empty array for 1.0.0 |
| `counts` | Exact count for each of the eight record arrays |
| `files` | Sorted inventory of all members except the manifest and its digest. Each entry is `{path, size, sha256}`, with size measured in bytes. |
| `snapshotHash` | Semantic snapshot digest, defined below |

The package reader requires the exact 1.0.0 profile literals and an empty `requiredFeatures` array. An unsupported package version, profile, or required feature fails validation. The source application's version and internal schema version are provenance.

| Array | CST Notes projection |
| --- | --- |
| `specialties` | Name and specialty-note document IDs |
| `surgeons` | Source ID, name, and specialty `associations`. Each association has a specialty ID, name, aliases, and profile. A single association is also copied to the top-level record. Profiles carry structured gloves, original glove text, parse status, gown, and music. |
| `cases` | Source ID, title, specialty, surgeon and document IDs, and separate `createdTemplate` and `currentTemplate` projections. Each projection can be null. |
| `templates` | Source ID, title, document ID, nullable `currentVersion`, and revision links with version and document ID |
| `references` | Source ID, title, category, aliases, and document ID |
| `resources` | Source ID, catalog key, kind, label, section, hidden flag, and case provenance entries with section, raw phrase, and nullable quantity |
| `documents` | Package path, source path, title, kind, raw SHA-256, and preamble, heading, fence, and attachment spans. Legacy review status can be present. |
| `assets` | SHA-256 ID, package path, byte size, original filenames, and media type |

Records carry an `id` and `fingerprint`. The runtime accepts an omitted asset fingerprint by using its ID. IDs are unique within each array. The runtime checks case, surgeon, specialty and document links, optional template links, template revision documents, resource sources, and resolved attachment asset IDs. A case's specialty must be one of its surgeon's associations. When a referenced document carries a kind, that kind must agree with the relationship.

Document spans are half-open offsets in UTF-16 code units from the start of the decoded Markdown, including any BOM. Headings include `level`, `heading`, and `bodyStart`. Fences carry their `info` string. Attachments carry `target`, `syntax` (`wiki`, `markdown`, or `html`), `embedded`, `status`, and `assetId`. The exporter emits resolved attachments. The Markdown link remains in the original text and the span points to its location. Treat text, links, source paths, and file names as data. A downstream renderer must apply its own content safety policy.

## Source identity and scope

- The exporter creates a UUID `libraryId` and persists it in the backend's `_Data/Portability Identity.md` ledger. Each prepared export gets a fresh UUID `packageId`. Use `libraryId`, record kind, and record `id` to correlate exports. Preserve the ledger with the source library's backups.
- Case, template, and reference projections carry the original `cst_id` as `sourceId` when usable. Surgeons use the registry's `cst_id` or `id`, and profiles sharing a source ID are grouped by specialty. Resource source IDs hash the canonical JSON catalog key. A legacy item without a usable ID can carry an empty source ID. Document identity can use its note's `cst_id`. Template revision documents use their own ledger identity because their frontmatter can contain a copy of the template's ID.
- The identity ledger reuses compatible matches at the same path, by source ID, or from an observed rename. An unresolved move can prompt for an identity choice. A new record ID is its kind followed by a hyphen and either the SHA-256 of canonical JSON `[libraryId, kind, sourceId]` or a generated UUID when no source ID is available. Asset IDs come from image bytes.
- Active cases, specialty notes, supplemental notes, surgeon profiles, active templates and their linked revisions, references, resource projections, and referenced supported local images are in scope. Excluded items include unreferenced attachments, unrelated vault files, and recovery archives. Pending legacy notes can be included as saved with a warning and document `reviewStatus`.
- The collector checks recognized image links and embeds against managed image locations and the supported formats. An explicit safe vault-root path can also resolve a supported local image outside those locations. Missing, ambiguous, unsupported, remote or inline required embeds and mismatched image signatures block preparation and appear in the review report. Ordinary remote hyperlinks are preserved as text. Unsupported glove formats retain the original value and add a warning.
- Markdown uses the original saved UTF-8 bytes when the vault provides binary reads, including BOM, CRLF, frontmatter, and links. If binary Markdown reads are unavailable, the collector warns and encodes fresh text as UTF-8. Images require binary reads. Preparation rechecks the snapshot before writing the export-owned identity ledger.

## Hashes and bounds

Canonical JSON is compact UTF-8 without BOM or a trailing newline. Sort object keys by UTF-16 code units at every level. Keep array order. Use ECMAScript `JSON.stringify` spelling for strings, booleans, null, and finite numbers, including `-0` as `0`. Reject unpaired surrogates and non-JSON values. The runtime parses the stored JSON and requires its canonical re-encoding to match the stored bytes.

1. Verify ZIP CRC-32 over each stored member's bytes. Hash the exact stored `manifest.json` bytes and compare the lowercase hex result to `manifest.sha256`. That digest member has no newline or BOM.
2. Compute the byte length and SHA-256 of every remaining member, excluding the two manifest members. Sort by path and compare the complete `files` array. An asset's digest must equal the ID in its member path, and the image header must match the suffix. Check a document's raw `sha256` and an asset's `size` when provided.
3. Build `[kind, id, fingerprint]` tuples for all records. Use the exact plural array name for `kind`. Add `["configuration", "gloveConfig", H(gloveConfig)]` and `["configuration", "resourceAliases", H(resourceAliases)]`, where `H(value)` is SHA-256 of canonical JSON UTF-8. Sort by kind, then ID, using UTF-16 code-unit order. `snapshotHash` is `H` of that tuple array. The runtime checks this aggregate from the declared fingerprints. File hashes separately cover the exact stored records and payloads.

The collector produces semantic fingerprints as follows. The projection field names inside each hash are significant.

| Kind | Fingerprint input |
| --- | --- |
| Specialty | `H({name})` |
| Surgeon | `H({gloveConfigHash, associations})`. Here `gloveConfigHash = H(gloveConfig)`. Sort the semantic associations by specialty ID and use `{specialtyId, name, aliases, gloves, gown, music}` for each. Use the raw glove text when structured gloves are unavailable. |
| Document | `H({bodyHash, metadataHash, assets})`. `bodyHash` is SHA-256 of the trimmed, LF-normalized body after removing the managed surgeon header fences, resource markers and example template markers. `metadataHash` is `H` of parsed frontmatter after omitting source IDs and managed classification, graph, schema, template, transfer, timestamp, and verification metadata. `assets` is the ordered array of attachment asset IDs. |
| Case | `H({title, specialtyId, surgeonId, fingerprint, createdTemplate})`, where `fingerprint` is the case document fingerprint |
| Template | `H({title, fingerprint})`, where `fingerprint` is the current template document fingerprint. Each exported revision contributes its own document tuple. |
| Reference | `H({title, category, fingerprint})`, where `fingerprint` is the reference document fingerprint |
| Resource | `H({key, kind, label, section, hidden})` |
| Asset | SHA-256 of the stored image bytes |

For `metadataHash`, ignore frontmatter keys matching this case-insensitive expression. Date values in the remaining parsed metadata become ISO strings before hashing.

```regex
^(?:cst_id|cst_type|specialty|surgeon|surgeon_id|graph_parent|schema_version|template(?:_initialized|_version|_created(?:_version)?)?|cst_created_template(?:_version)?|cst_transfer_.*|(?:cst_)?(?:created|updated|modified|last_verified|verified|verification)(?:_.*)?)$
```

The snapshot hash omits package ID, creation time, source metadata, and the report. It represents the stated semantic projection. Byte changes in notes or other JSON fields can change the inventory while preserving the snapshot hash.

The maximum archive size is 64 MiB including ZIP framing. Each entry is limited to 12 MiB, and the archive has at most 10,000 entries including fixed entries. Canonical JSON containers are allowed through depth 128 with the root at zero. The collector bounds read input to 64 MiB total and 12 MiB per file, scoped inventory to 10,000 entries, folder depth to 128, image references to 10,000, and counted Markdown spans to 100,000. Each note's expanded semantic frontmatter is bounded to 10,000 values, depth 32, and 12 Mi UTF-16 code units across string values. The collector reserves space for manifest and ZIP overhead and can stop preparation before the archive writer's limits.

## Plain example

The small synthetic fixture contains one case and no assets. This is an excerpt of its layout and decoded values.

```text
small.cstpack
  manifest.json
  manifest.sha256
  records/cases.json
  records/documents.json
  content/doc-case-demo.md
  …
```

```json
{"path":"content/doc-case-demo.md","sha256":"e7044e58e5052d2b8dfd96cecae0bd183e862f8129f480f2cc86bdcde82af531","size":69}
```

```markdown
---
cst_id: fixture-case-source
---
# Demo Case
Synthetic café 🧪
```

## Fixture and platform verification

From the worktree root on Windows, macOS, or Linux, use Node and Python 3 for the independent fixture check. The verifier uses Python's standard-library ZIP and SHA-256 modules. Set `CSTPACK_PYTHON` to the Python 3 executable if automatic discovery fails.

```sh
node --test test/library-fixture.test.mjs
node scripts/check-library-fixtures.mjs
node scripts/check-library-fixtures.mjs --verify "path/to/example.cstpack"
```

The generator prints a fresh system temp directory named `cstpack-fixtures-*`. It writes `small.cstpack`, `typical.cstpack`, `legacy.cstpack`, `repeat-a.cstpack`, `repeat-b.cstpack`, `large.cstpack`, and `corrupt.cstpack`, with source-derived JSON in `expected/` and independently read JSON in `decoded/`. The large fixture has 350 cases and 40 distinct 512×320 PNGs at roughly 480 KiB each. The corrupted file has valid ZIP CRCs but a changed Markdown payload and fails its SHA-256 inventory check. The standalone `--verify` path exits nonzero on failure and prints decoded JSON on success. It reads members in memory, checks the fixture wire integrity, and works without loading the CST Notes plugin or package module. The Node tests additionally exercise the production package reader and compare the decoded bytes to the synthetic input.

1. In an isolated synthetic test vault on the target platform, create a case with a supported local image and save any open editor changes. Record the case and image checksums before exporting.
2. Open **Admin → Export / Data Portability**. Review the export scope, authorize the synthetic export, and confirm first export if there is no identity ledger. Use **Review library**, then **Prepare export**. Record the counts and report.
3. On desktop use **Save file** and verify the downloaded bytes. On iOS or Android use **Share file** if offered and save a local copy, or open **Other save options → Save validated copy to vault** and retrieve that copy. Move the resulting synthetic file to a host for the independent `--verify` command. Keep the original `.cstpack` filename when the platform permits it. **Save with ZIP extension** provides the same package bytes.
4. Compare the case and image payloads with their recorded source checksums. Repeat the unchanged export and check that `libraryId`, record IDs, and `snapshotHash` match while `packageId` changes. Add an unsupported required embed in the test vault and check that review reports the blocker before offering a package. Record platform, Obsidian and CST Notes versions, save path used, and observed results.

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/transfer-core.mjs
function fail(message) {
  throw new Error(message);
}
function object(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`Invalid ${label}.`);
  if (Object.keys(value).some((k) => !keys.includes(k)) || keys.some((k) => !own(value, k))) fail(`Unexpected or missing fields in ${label}.`);
}
function string(value, label, max = TRANSFER_LIMITS.text) {
  if (typeof value !== "string" || bytes(value) > max || /\u0000/.test(value)) fail(`Invalid or oversized ${label}.`);
  return value;
}
function transferSegment(value, label = "Name") {
  string(value, label, 120);
  if (!value || value !== value.trim() || /[\\/:*?"<>|\x00-\x1f\x7f]/.test(value) || /[. ]$/.test(value) || /^[._]/.test(value) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)) fail(`Invalid ${label}. Use a portable folder/file name.`);
  return value.normalize("NFC");
}
function identifier(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) fail("Invalid transfer or case ID.");
  return value;
}
function stripReservedTransferComments(text) {
  return text.replace(/<!--\s*cst-(?:resource-grabbed|example-template):[\s\S]*?-->/g, "");
}
function portableMarkdown(text) {
  string(text, "Markdown");
  return stripReservedTransferComments(text).replace(/^\uFEFF/, "").replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").replace(/^([ \t]*)(`{3,}|~{3,})cst-[^\r\n]*\r?\n[\s\S]*?^\1\2[ \t]*$/gm, "").replace(/(`{3,}|~{3,})[^\r\n]*/g, "$1").replace(/`([ \t]*)(?=[=$])/g, "`$1\\").replace(/!\[(?!\[)([^\]\r\n]*)\](?![([])/g, "[$1]").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\]\(\s*(?:javascript|data|vbscript|file|obsidian):[^)]*\)/gi, "](blocked-link)");
}
function imageReferences(markdown) {
  const refs = [], definitions = /* @__PURE__ */ new Map();
  const destination = (value) => {
    const s = value.trim();
    if (s.startsWith("<")) {
      const end = s.indexOf(">");
      if (end < 0) fail("Malformed image destination.");
      return s.slice(1, end);
    }
    return s.replace(/\s+["'][\s\S]*["']\s*$/, "");
  };
  for (const m of markdown.matchAll(/^ {0,3}\[([^\]\r\n]+)\]:\s*(.+)$/gm)) definitions.set(m[1].trim().toLowerCase(), destination(m[2]));
  const re = /!?\[\[([^\]\r\n]+)\]\]|(!?)\[([^\]\r\n]*)\](?:\(|\[([^\]\r\n]*)\])|<img\b[^>]*>/gi;
  for (const match of markdown.matchAll(re)) {
    if (refs.length && match.index < refs.at(-1).start + refs.at(-1).raw.length) continue;
    let target, end = match.index + match[0].length, embedded = match[0].startsWith("!");
    if (/^<img/i.test(match[0])) {
      if (/\bsrcset\s*=/i.test(match[0])) fail("Convert responsive HTML images to local Markdown images before transfer.");
      const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[0]);
      if (!src) fail("An HTML image has no source.");
      target = src[1] ?? src[2] ?? src[3];
      embedded = true;
      target = target.replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
    } else if (match[1] !== void 0) target = match[1].split("|")[0].split("#")[0];
    else if (match[4] !== void 0) target = definitions.get((match[4] || match[3]).trim().toLowerCase());
    else {
      let depth = 1, angle = false, escaped = false, cursor = end;
      for (; cursor < markdown.length; cursor++) {
        const c = markdown[cursor];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          continue;
        }
        if (c === "<") angle = true;
        if (c === ">") angle = false;
        if (!angle && c === "(") depth++;
        if (!angle && c === ")" && --depth === 0) break;
      }
      if (depth !== 0) fail("Unclosed Markdown link.");
      target = destination(markdown.slice(end, cursor));
      end = cursor + 1;
    }
    if (target == null) {
      if (embedded) fail("Unresolved image reference definition.");
      continue;
    }
    try {
      target = decodeURIComponent(target.replace(/\\([() ])/g, "$1"));
    } catch {
      fail("Malformed image link.");
    }
    if (!embedded && !/\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|tiff?)(?:[#?]|$)/i.test(target)) continue;
    refs.push({ raw: markdown.slice(match.index, end), target, start: match.index });
  }
  for (const m of markdown.matchAll(/!\[(?!\[)([^\]\r\n]+)\](?![([])/g)) {
    if (refs.some((r) => m.index >= r.start && m.index < r.start + r.raw.length)) continue;
    const target = definitions.get(m[1].trim().toLowerCase());
    if (!target) fail("Unresolved shortcut image reference.");
    refs.push({ raw: m[0], target, start: m.index });
  }
  return refs.sort((a, b) => a.start - b.start);
}
function imageType(data) {
  if (data.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => data[i] === v)) return "png";
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "jpg";
  const head = String.fromCharCode(...data.slice(0, 12));
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "webp";
  fail("Only PNG, JPEG, GIF and WebP image data is supported. SVG and executable attachments are excluded.");
}
function encodeTransferImage(data) {
  const array = new Uint8Array(data);
  if (array.length > TRANSFER_LIMITS.imageBytes) fail("An image exceeds the 5 MiB limit.");
  const extension = imageType(array);
  let binary = "";
  for (let i = 0; i < array.length; i += 8192) binary += String.fromCharCode(...array.subarray(i, i + 8192));
  return { extension, data: btoa(binary) };
}
function decodeTransferImage(item) {
  if (typeof item.data !== "string" || item.data.length > Math.ceil(TRANSFER_LIMITS.imageBytes / 3) * 4 || (item.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data))) fail("Invalid or oversized base64 attachment.");
  const binary = atob(item.data);
  if (btoa(binary) !== item.data) fail("Non-canonical base64 attachment.");
  const array = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (array.length > TRANSFER_LIMITS.imageBytes || imageType(array) !== item.name.split(".").pop()) fail("Attachment type does not match its name.");
  return array;
}
function parseTransfer(raw) {
  string(raw, "portable file", TRANSFER_LIMITS.bytes);
  const data = JSON.parse(raw);
  if (data?.format === FORMAT && ![1, EXPORT_VERSION].includes(data.version)) {
    const error = new Error(`Unsupported CST Notes portable version ${String(data.version).slice(0, 40)}. Update CST Notes to read this format, or explicitly save the case text as plain Markdown for manual sorting.`);
    error.code = "UNSUPPORTED_TRANSFER_VERSION";
    throw error;
  }
  object(data, ["format", "version", "id", "case", "sender", "attachments", ...data?.version === 1 ? ["template"] : []], "bundle");
  if (data.format !== FORMAT || ![1, EXPORT_VERSION].includes(data.version)) fail("Not a supported CST Notes portable file.");
  identifier(data.id);
  object(data.case, ["id", "title", "markdown", "example", ...data.version === EXPORT_VERSION ? ["createdTemplate"] : []], "case");
  if (data.version === EXPORT_VERSION) validateCreatedTemplate(data.case.createdTemplate);
  identifier(data.case.id);
  transferSegment(data.case.title, "Case title");
  string(data.case.markdown, "case Markdown");
  if (typeof data.case.example !== "boolean") fail("Invalid example flag.");
  object(data.sender, ["specialty", "surgeon", "profile"], "sender");
  transferSegment(data.sender.specialty, "Specialty");
  transferSegment(data.sender.surgeon, "Surgeon");
  object(data.sender.profile, [...PROFILE_FIELDS], "surgeon profile");
  for (const field of PROFILE_FIELDS) string(data.sender.profile[field], field, 4096);
  if (!["XL", "XL-Long", "2X", "2X-Long", "Unknown"].includes(data.sender.profile.gown)) fail("Invalid sender gown value.");
  if (data.version === 1) {
    object(data.template, ["name", "markdown"], "template");
    string(data.template.name, "template name", 180);
    string(data.template.markdown, "template Markdown");
  }
  if (!Array.isArray(data.attachments) || data.attachments.length > TRANSFER_LIMITS.images) fail("Too many attachments.");
  const names = /* @__PURE__ */ new Set();
  for (const attachment of data.attachments) {
    object(attachment, ["name", "data"], "attachment");
    if (typeof attachment.name !== "string" || !/^image-[0-9]{1,2}\.(png|jpg|gif|webp)$/.test(attachment.name) || names.has(attachment.name)) fail("Invalid, duplicate or unsafe attachment path.");
    names.add(attachment.name);
    decodeTransferImage(attachment);
  }
  const used = /* @__PURE__ */ new Set();
  for (const markdown of [data.case.markdown, ...data.version === 1 ? [data.template.markdown] : []]) {
    if (portableMarkdown(markdown) !== markdown) fail("Bundle contains internal metadata, HTML or active renderer syntax.");
    for (const ref of imageReferences(markdown)) {
      if (!names.has(ref.target) || ref.raw !== `![[${ref.target}]]`) fail("Unresolved, remote or unsafe image reference.");
      used.add(ref.target);
    }
  }
  if (names.size !== used.size) fail("Bundle includes unreferenced attachments.");
  return data;
}
function validateCreatedTemplate(value) {
  if (value === null) return;
  object(value, ["name", "version"], "created template metadata");
  string(value.name, "created template name", 180);
  string(value.version, "created template version", 80);
  if (!value.name.trim() || /[\x00-\x1f\x7f]/.test(value.name + value.version)) fail("Invalid created template metadata.");
}
function createdTemplateMetadata(fm = {}) {
  const key4 = own(fm, "cst_created_template") || own(fm, "cst_created_template_version") ? "cst_created_template" : own(fm, "template_created") || own(fm, "template_created_version") ? "template_created" : "template";
  if (key4 === "template" && own(fm, "cst_transfer_template")) return null;
  const name = fm[key4];
  const rawVersion = fm[key4 === "template" ? "template_version" : key4 + "_version"];
  if (typeof name !== "string" || !name.trim() || /^(manual|unknown)$/i.test(name.trim())) return null;
  const version = typeof rawVersion === "string" ? rawVersion : Number.isSafeInteger(rawVersion) && rawVersion >= 0 ? String(rawVersion) : "";
  const result = { name, version };
  try {
    validateCreatedTemplate(result);
    return result;
  } catch {
    return null;
  }
}
function transferCreatedTemplate(bundle) {
  return bundle.version === EXPORT_VERSION ? bundle.case.createdTemplate : null;
}
function fallbackMarkdown(raw) {
  string(raw, "portable file", TRANSFER_LIMITS.bytes);
  const parsed = JSON.parse(raw);
  if (parsed?.format !== FORMAT || typeof parsed.case?.markdown !== "string") fail("No recognizable case Markdown is available.");
  return portableMarkdown(parsed.case.markdown).replace(/!\[\[/g, "[[").replace(/!\[/g, "[");
}
function profileConflicts(sender, recipient) {
  return PROFILE_FIELDS.map((field) => ({ field, sender: sender[field] || "", recipient: recipient?.[field] || "", differs: !!recipient && (sender[field] || "") !== (recipient[field] || "") }));
}
function collectLegacyTransferLeftovers(plugin, sourceText, destinationText, templateBody, working = {}) {
  const blocks = plugin.parseLegacyMigrationBlocks(String(sourceText || ""), templateBody).blocks;
  let destination = plugin.normalizeComparable(String(destinationText || ""));
  const ignored = new Set(working.ignored || []), leftovers = [];
  const consume = (value) => {
    const needle = plugin.normalizeComparable(value);
    if (!needle) return true;
    let offset = 0;
    while (offset <= destination.length) {
      const at = destination.indexOf(needle, offset);
      if (at < 0) return false;
      const end = at + needle.length;
      if ((at === 0 || /\s/.test(destination[at - 1])) && (end === destination.length || /\s/.test(destination[end]))) {
        destination = destination.slice(0, at) + " ".repeat(needle.length) + destination.slice(end);
        return true;
      }
      offset = at + 1;
    }
    return false;
  };
  for (const block of blocks) {
    if (ignored.has(block.id)) continue;
    const body = plugin.extractMigrationSectionBody(block, block.suggested);
    if (!body || consume(body)) continue;
    const remaining = body.replace(/\r\n?/g, "\n").split("\n").filter((line) => !line.trim() || !consume(line)).join("\n").trim();
    if (remaining) leftovers.push({ ...block, content: remaining });
  }
  return leftovers;
}
function createTransferService(plugin, deps) {
  const vault = plugin.app.vault;
  const path = (...parts) => {
    const raw = parts.join("/");
    if (!raw || raw.startsWith("/") || /[\\\x00-\x1f\x7f]/.test(raw) || raw.split("/").some((s) => !s || s === "." || s === ".." || /[:*?"<>|]/.test(s) || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s))) fail("Unsafe transfer vault path.");
    const normalized = deps.validatePortableVaultPath(raw, "Transfer path");
    if (normalized !== raw) fail("Transfer path must already be normalized.");
    return raw;
  };
  const lookup = (p) => vault.getAbstractFileByPath(p);
  const isFile = (f) => f instanceof deps.TFile;
  const unique = (prefix) => identifier(deps.id(prefix));
  const profileOf = (data) => Object.fromEntries(PROFILE_FIELDS.map((k) => [k, String(data?.[k] || (k === "music" ? "" : "Unknown"))]));
  const same = (file, expected) => {
    if (!file || file.path !== expected || lookup(expected) !== file) fail(`Sync changed ${expected}. Reopen the preview.`);
  };
  async function read(file) {
    if (!isFile(file)) fail("Source file is unavailable. Wait for Sync.");
    if (file.stat?.size > TRANSFER_LIMITS.bytes) fail("Source file exceeds 24 MiB.");
    const expected = file.path;
    same(file, expected);
    const text = await vault.read(file);
    same(file, expected);
    return { file, path: expected, text };
  }
  async function check(state) {
    same(state.file, state.path);
    if (await vault.read(state.file) !== state.text) fail(`Content changed in ${state.path}. Reopen the preview.`);
    same(state.file, state.path);
  }
  function vacant(p) {
    if (lookup(p) || (vault.getAllLoadedFiles?.() || []).some((f) => fold(f.path) === fold(p))) fail(`Destination already exists: ${p}. Choose another case name.`);
  }
  async function folder(p) {
    p = path(p);
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const sub = parts.slice(0, i).join("/");
      const present = lookup(sub);
      if (present && !(present instanceof deps.TFolder)) fail(`Folder path is occupied: ${sub}`);
      if (!present) {
        vacant(sub);
        await vault.createFolder(sub);
      }
    }
  }
  function parents(paths) {
    const seen = /* @__PURE__ */ new Map();
    for (const p of paths) {
      const segments = p.split("/");
      for (let i = 1; i < segments.length; i++) {
        const key4 = segments.slice(0, i).join("/"), item = lookup(key4);
        if (item) seen.set(key4, item);
      }
    }
    return [...seen].map(([path2, file]) => ({ path: path2, file }));
  }
  function guardParents(guards) {
    for (const state of guards || []) same(state.file, state.path);
  }
  function incomingFolder(p) {
    path(p);
    const protectedRoots = [plugin.contentRoot, plugin.p(""), vault.configDir || ".obsidian"];
    if (p.split("/").some((s) => s.startsWith(".")) || protectedRoots.some((root) => p === root || p.startsWith(root + "/") || root.startsWith(p + "/"))) fail("Choose an incoming folder outside the CST library, backend and app configuration.");
    const file = lookup(p);
    if (!(file instanceof deps.TFolder)) fail("Incoming folder is unavailable.");
    return file;
  }
  async function ready() {
    if (!await plugin.quickStructureCheck()) fail("Wait for Sync and Initialize / Repair before transferring cases.");
  }
  async function duplicate(bundle) {
    for (const file of plugin.allCaseFiles()) {
      const fm = deps.parseFrontmatterObject((await read(file)).text);
      if (fm.cst_transfer_id === bundle.id) fail(`This bundle was already imported: ${file.path}`);
    }
  }
  function collector() {
    const attachments = [], imageStates = [], warnings = [], known = /* @__PURE__ */ new Map();
    let encodedBytes = 0;
    async function portable(text, sourcePath) {
      string(text, "case or template Markdown");
      let result = stripReservedTransferComments(text).replace(/^\uFEFF/, "").replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
      for (const ref of imageReferences(result).reverse()) {
        const refKey = sourcePath + "\0" + ref.target;
        let name = known.get(refKey), state = null, encoded;
        if (!name) {
          if (attachments.length >= TRANSFER_LIMITS.images) fail("More than 32 referenced images.");
          const inline = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(ref.target);
          if (inline) {
            const extension = inline[1].toLowerCase().replace("jpeg", "jpg");
            const array = decodeTransferImage({ name: `image-1.${extension}`, data: inline[2] });
            encoded = encodeTransferImage(array);
          } else {
            if (/^[a-z][a-z0-9+.-]*:/i.test(ref.target) || ref.target.startsWith("//")) fail("Remote images cannot be packaged offline. Save each image into the vault and replace its link before transferring.");
            const target = plugin.app.metadataCache.getFirstLinkpathDest(ref.target, sourcePath);
            if (!isFile(target)) fail(`Referenced image is missing: ${ref.target}. Restore it before transferring.`);
            if (!/\.(png|jpe?g|gif|webp)$/i.test(target.path)) fail(`Unsupported embedded file: ${ref.target}. Convert images to PNG, JPEG, GIF or WebP before transfer.`);
            name = known.get(target.path);
            if (!name) {
              const expected = target.path;
              same(target, expected);
              if (target.stat?.size > TRANSFER_LIMITS.imageBytes) fail(`Image is too large: ${expected}`);
              encoded = encodeTransferImage(await vault.readBinary(target));
              same(target, expected);
              state = { file: target, path: expected, data: encoded.data };
            }
          }
          if (!name) {
            encodedBytes += encoded.data.length;
            if (encodedBytes > TRANSFER_LIMITS.bytes - 2 * TRANSFER_LIMITS.text) fail("Referenced images exceed the total portable file limit.");
            name = `image-${attachments.length + 1}.${encoded.extension}`;
            attachments.push({ name, data: encoded.data });
            if (state) {
              imageStates.push(state);
              known.set(state.path, name);
            }
          }
          known.set(refKey, name);
        }
        result = result.slice(0, ref.start) + `![[${name}]]` + result.slice(ref.start + ref.raw.length);
      }
      return portableMarkdown(result);
    }
    return { portable, attachments, imageStates, warnings };
  }
  async function checkImages(states) {
    for (const state of states || []) {
      same(state.file, state.path);
      if (encodeTransferImage(await vault.readBinary(state.file)).data !== state.data) fail("An image changed. Reopen the preview.");
      same(state.file, state.path);
    }
  }
  async function prepareExport(file) {
    const context = plugin.caseContext(file);
    if (!context) fail("Select a case in Specialty / Surgeon / Case.");
    const source = await read(file);
    const fm = deps.parseFrontmatterObject(source.text);
    const registryFile = lookup(plugin.surgeonRegistryPath());
    if (!isFile(registryFile)) fail("Surgeon registry unavailable. Wait for Sync.");
    const registry = await read(registryFile);
    const data = await plugin.getSurgeonData(context.specialty, context.surgeon, { createIfMissing: false });
    if (!data || data.unavailable) fail("Sender surgeon profile unavailable.");
    const { portable, attachments, imageStates, warnings } = collector();
    const bundle = { format: FORMAT, version: EXPORT_VERSION, id: unique("transfer"), case: { id: identifier(fm.cst_id || unique("case")), title: transferSegment(file.basename, "Case title"), markdown: await portable(source.text, source.path), example: fm.cst_example === true || fm.cst_id === "cst-example-lumbar-v1", createdTemplate: createdTemplateMetadata(fm) }, sender: { specialty: context.specialty, surgeon: context.surgeon, profile: profileOf(data) }, attachments };
    const json = JSON.stringify(bundle, null, 2);
    parseTransfer(json);
    const exportPath = path(plugin.p("Admin/Exports"), `${bundle.id}.cst.json`);
    await check(source);
    await check(registry);
    return { bundle, json, exportPath, warnings, states: [source, registry], imageStates };
  }
  async function exportJSON(plan) {
    if (stopped) fail("Transfer was unloaded. Reopen CST Notes before continuing.");
    for (const state of plan.states) await check(state);
    await checkImages(plan.imageStates);
    parseTransfer(plan.json);
    if (stopped) fail("Transfer was unloaded. Reopen CST Notes before continuing.");
    return plan.json;
  }
  async function saveExport(plan) {
    await exportJSON(plan);
    vacant(plan.exportPath);
    await folder(plugin.p("Admin/Exports"));
    for (const state of plan.states) await check(state);
    await checkImages(plan.imageStates);
    vacant(plan.exportPath);
    return await vault.create(plan.exportPath, plan.json);
  }
  async function prepareExternal(file, choice) {
    if (plugin.caseContext(file)) fail("Choose an external incoming note.");
    incomingFolder(file.path.slice(0, file.path.lastIndexOf("/")));
    const source = { ...await read(file), external: true };
    const { portable, attachments, imageStates } = collector();
    const metadata = deps.parseFrontmatterObject(source.text);
    const bundle = { format: FORMAT, version: EXPORT_VERSION, id: unique("external"), case: { id: unique("case"), title: transferSegment(deps.validatedPathSegment(choice.title, "Case title")), markdown: await portable(source.text, source.path), example: metadata.cst_example === true || metadata.cst_id === "cst-example-lumbar-v1", createdTemplate: null }, sender: { specialty: transferSegment(deps.validatedPathSegment(choice.specialty, "Specialty")), surgeon: transferSegment(deps.validatedPathSegment(choice.surgeon, "Surgeon", { person: true })), profile: { gloves: "Unknown", gown: "Unknown", music: "" } }, attachments };
    const plan = await prepareImport(bundle, choice);
    plan.parentGuards.push(...parents([source.path]));
    plan.externalSource = source;
    plan.sourceState = source;
    plan.imageStates = imageStates;
    await check(source);
    return plan;
  }
  async function prepareImport(bundle, choice) {
    bundle = parseTransfer(JSON.stringify(bundle));
    await ready();
    await duplicate(bundle);
    const specialty = transferSegment(deps.validatedPathSegment(choice.specialty, "Specialty"), "Specialty");
    const surgeon2 = transferSegment(deps.validatedPathSegment(choice.surgeon, "Surgeon", { person: true }), "Surgeon");
    const title = transferSegment(deps.validatedPathSegment(choice.title, "Case title"), "Case title");
    const specialtyPath = path(plugin.contentRoot, specialty), surgeonPath = path(specialtyPath, surgeon2);
    for (const p of [specialtyPath, surgeonPath]) {
      const existing = lookup(p);
      if (existing && !(existing instanceof deps.TFolder)) fail(`Destination is not a folder: ${p}`);
      if (!existing) vacant(p);
    }
    const casePath = path(surgeonPath, `${title}.md`);
    vacant(casePath);
    const registryFile = lookup(plugin.surgeonRegistryPath());
    if (!isFile(registryFile)) fail("Surgeon registry unavailable.");
    const registry = await read(registryFile);
    const current = await plugin.getRegistrySurgeon(specialty, surgeon2, { create: false });
    if (current.invalid) fail("Surgeon registry is invalid. Repair it before import.");
    const recipient = current.data ? JSON.parse(JSON.stringify(current.data)) : null;
    await check(registry);
    if (!!lookup(surgeonPath) !== !!recipient) fail("Surgeon folder and registry disagree. Repair or wait for Sync.");
    const resolved = profileOf(choice.profile || recipient || bundle.sender.profile);
    for (const k of PROFILE_FIELDS) string(resolved[k], k, 4096);
    if (!["XL", "XL-Long", "2X", "2X-Long", "Unknown"].includes(resolved.gown)) fail("Choose a supported gown: XL, XL-Long, 2X, 2X-Long or Unknown.");
    resolved.gloves = deps.normalizeGloves(resolved.gloves);
    const operationId = unique("transfer");
    const transferRoot = path(plugin.p("Admin/Transfers"), operationId);
    const attachmentRoot = path(plugin.p("Attachments/Transfers"), operationId);
    vacant(transferRoot);
    vacant(attachmentRoot);
    path(transferRoot, "source.cst.json");
    if (bundle.version === 1) path(transferRoot, "Sender template.md");
    for (const item of bundle.attachments) path(attachmentRoot, item.name);
    return { parentGuards: parents([casePath, path(transferRoot, "source.cst.json"), path(attachmentRoot, "image-1.png")]), bundle, specialty, surgeon: surgeon2, title, casePath, specialtyPath, surgeonPath, specialtyObject: lookup(specialtyPath), surgeonObject: lookup(surgeonPath), registry, recipient, fingerprint: recipient ? plugin.surgeonRecordFingerprint(recipient) : "", resolved, transferRoot, attachmentRoot, caseId: unique("case") };
  }
  async function commitImport(plan) {
    parseTransfer(JSON.stringify(plan.bundle));
    if (plan.casePath !== path(plan.surgeonPath, `${plan.title}.md`) || plan.surgeonPath !== path(plugin.contentRoot, plan.specialty, plan.surgeon)) fail("Import destination or configuration changed. Reopen preview.");
    guardParents(plan.parentGuards);
    await ready();
    await duplicate(plan.bundle);
    await check(plan.registry);
    if (plan.sourceState) await check(plan.sourceState);
    await checkImages(plan.imageStates);
    if (plan.externalSource) {
      await check(plan.externalSource);
      for (const file of plugin.allCaseFiles()) {
        if (deps.parseFrontmatterObject((await read(file)).text).cst_external_source === plan.externalSource.path) fail("This incoming note was already sorted.");
      }
    }
    for (const [p, expected] of [[plan.specialtyPath, plan.specialtyObject], [plan.surgeonPath, plan.surgeonObject]]) {
      if (lookup(p) !== expected || expected && expected.path !== p) fail("Destination changed during preview. Reopen import.");
    }
    vacant(plan.casePath);
    vacant(plan.transferRoot);
    vacant(plan.attachmentRoot);
    const writes = [];
    try {
      await plugin.snapshotFiles("portable-import", [plan.registry.file, ...plan.externalSource ? [plan.externalSource.file] : []]);
      await check(plan.registry);
      if (plan.sourceState) await check(plan.sourceState);
      if (plan.externalSource) await check(plan.externalSource);
      for (const [p, expected] of [[plan.specialtyPath, plan.specialtyObject], [plan.surgeonPath, plan.surgeonObject]]) {
        if (lookup(p) !== expected || expected && expected.path !== p) fail("Sync changed the destination during backup.");
      }
      guardParents(plan.parentGuards);
      await folder(plugin.p("Admin/Transfers"));
      const transferFolder = await vault.createFolder(plan.transferRoot);
      plan.parentGuards.push({ file: transferFolder, path: plan.transferRoot });
      guardParents(plan.parentGuards);
      writes.push(plan.transferRoot);
      await vault.create(path(plan.transferRoot, "source.cst.json"), JSON.stringify(plan.bundle, null, 2));
      guardParents(plan.parentGuards);
      if (!plan.specialtyObject) {
        vacant(plan.specialtyPath);
        await plugin.createSpecialty(plan.specialty);
        plan.parentGuards.push({ file: lookup(plan.specialtyPath), path: plan.specialtyPath });
      }
      guardParents(plan.parentGuards);
      let expectedProfile;
      if (!plan.surgeonObject) {
        vacant(plan.surgeonPath);
        await plugin.createSurgeon({ specialty: plan.specialty, surgeon: plan.surgeon, ...plan.resolved });
        expectedProfile = (await plugin.getRegistrySurgeon(plan.specialty, plan.surgeon, { create: false })).data;
      } else {
        same(plan.surgeonObject, plan.surgeonPath);
        const latest = (await plugin.getRegistrySurgeon(plan.specialty, plan.surgeon, { create: false })).data;
        if (plugin.surgeonRecordFingerprint(latest) !== plan.fingerprint) fail("Recipient profile changed after preview.");
        expectedProfile = latest;
        const updates = { ...plan.resolved };
        for (const field of PROFILE_FIELDS) updates[`dirty${field[0].toUpperCase()}${field.slice(1)}`] = plan.resolved[field] !== (plan.recipient[field] || "");
        if (PROFILE_FIELDS.some((field) => updates[`dirty${field[0].toUpperCase()}${field.slice(1)}`])) {
          expectedProfile = await plugin.updateSurgeonProfileExpected(plan.specialty, plan.surgeon, updates, plan.fingerprint);
        }
      }
      const destination = lookup(plan.surgeonPath);
      if (!(destination instanceof deps.TFolder)) fail("Destination surgeon folder disappeared.");
      plan.parentGuards.push({ file: destination, path: plan.surgeonPath });
      guardParents(plan.parentGuards);
      const rewrite = (markdown2) => imageReferences(markdown2).reverse().reduce((result, ref) => result.slice(0, ref.start) + `![[${path(plan.attachmentRoot, ref.target)}]]` + result.slice(ref.start + ref.raw.length), markdown2);
      if (plan.bundle.attachments.length) {
        await folder(plugin.p("Attachments/Transfers"));
        guardParents(plan.parentGuards);
        const imageFolder = await vault.createFolder(plan.attachmentRoot);
        plan.parentGuards.push({ file: imageFolder, path: plan.attachmentRoot });
        guardParents(plan.parentGuards);
        writes.push(plan.attachmentRoot);
        for (const item of plan.bundle.attachments) {
          guardParents(plan.parentGuards);
          same(destination, plan.surgeonPath);
          const target = path(plan.attachmentRoot, item.name);
          vacant(target);
          await vault.createBinary(target, decodeTransferImage(item).buffer);
        }
      }
      guardParents(plan.parentGuards);
      if (plan.bundle.version === 1) await vault.create(path(plan.transferRoot, "Sender template.md"), rewrite(plan.bundle.template.markdown));
      const record = (await plugin.getRegistrySurgeon(plan.specialty, plan.surgeon, { create: false })).data;
      if (!record || plugin.surgeonRecordFingerprint(record) !== plugin.surgeonRecordFingerprint(expectedProfile)) fail("Recipient surgeon profile changed during import.");
      same(destination, plan.surgeonPath);
      vacant(plan.casePath);
      if (plan.sourceState) await check(plan.sourceState);
      if (plan.externalSource) await check(plan.externalSource);
      await checkImages(plan.imageStates);
      guardParents(plan.parentGuards);
      same(destination, plan.surgeonPath);
      vacant(plan.casePath);
      const createdTemplate = transferCreatedTemplate(plan.bundle);
      const fm = { schema_version: 3, ...plan.externalSource ? {} : { template_initialized: true }, ...createdTemplate ? { template: createdTemplate.name, template_version: createdTemplate.version, cst_created_template: createdTemplate.name, cst_created_template_version: createdTemplate.version } : {}, ...plan.bundle.version === 1 ? { cst_transfer_template: path(plan.transferRoot, "Sender template.md") } : {}, cst_type: "case", cst_id: plan.caseId, specialty: plan.specialty, surgeon: plan.surgeon, surgeon_id: record.cst_id, cst_transfer_id: plan.bundle.id, cst_transfer_source_id: plan.bundle.case.id, ...plan.externalSource ? { cst_external_source: plan.externalSource.path } : {}, ...plan.bundle.case.example ? { cst_example: true } : {} };
      const content = rewrite(plan.bundle.case.markdown);
      const heading = /^# [^\r\n]+/m.exec(content);
      const body = heading ? content.slice(0, heading.index + heading[0].length) + `

${deps.CASE_HEADER_BLOCK}
` + content.slice(heading.index + heading[0].length) : `# ${plan.title}

${deps.CASE_HEADER_BLOCK}

${content}`;
      const markdown = `---
${Object.entries(fm).map(([k, v]) => `${k}: ${typeof v === "boolean" || typeof v === "number" ? v : deps.yamlString(String(v || ""))}`).join("\n")}
---

${body}`;
      plugin.markInternalCreate(plan.casePath);
      const file = await vault.create(plan.casePath, markdown);
      writes.push(plan.casePath);
      try {
        plugin.scheduleGraphRebuild(500);
      } catch {
      }
      return { file, recoveryPath: plan.transferRoot };
    } catch (error) {
      throw new Error(`${error.message || error} Import stopped. Any completed files/profile changes are preserved for review. Recovery: ${writes.length ? plan.transferRoot : "registry snapshot, if created"}. Reopen the preview before retrying.`);
    }
  }
  let queue = Promise.resolve(), stopped = false;
  function mutate(action) {
    const run = queue.catch(() => {
    }).then(() => {
      if (stopped) fail("Transfer was unloaded. Reopen CST Notes before continuing.");
      if (typeof deps.withAdminMutation !== "function") fail("Transfer needs the host mutation pause hook.");
      return deps.withAdminMutation(() => {
        if (stopped) fail("Transfer was unloaded before the host became ready.");
        return action();
      });
    });
    queue = run.catch(() => {
    });
    return run;
  }
  function applyImport(plan) {
    return mutate(() => commitImport(plan));
  }
  function dispose() {
    stopped = true;
  }
  return { prepareExport, exportJSON, saveExport: (plan) => mutate(() => saveExport(plan)), prepareImport, prepareExternal, applyImport, mutate, dispose, incomingFolder, read, check, folder, vacant, path, unique };
}
var TRANSFER_LIMITS, PROFILE_FIELDS, FORMAT, EXPORT_VERSION, own, bytes, fold;
var init_transfer_core = __esm({
  "src/transfer-core.mjs"() {
    TRANSFER_LIMITS = Object.freeze({ bytes: 24 * 1024 * 1024, text: 1024 * 1024, images: 32, imageBytes: 5 * 1024 * 1024 });
    PROFILE_FIELDS = Object.freeze(["gloves", "gown", "music"]);
    FORMAT = "cst-notes-portable";
    EXPORT_VERSION = 2;
    own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
    bytes = (s) => new TextEncoder().encode(s).length;
    fold = (s) => s.normalize("NFC").toLowerCase();
  }
});

// src/template-lifecycle.mjs
var template_lifecycle_exports = {};
__export(template_lifecycle_exports, {
  TEMPLATE_REVISIONS_TO_KEEP: () => TEMPLATE_REVISIONS_TO_KEEP,
  creationTemplateMetadata: () => creationTemplateMetadata,
  describeTemplateProvenance: () => describeTemplateProvenance,
  pruneTemplateRevisions: () => pruneTemplateRevisions,
  templateRevisionNumber: () => templateRevisionNumber
});
function templateRevisionNumber(name) {
  const match = /^v([1-9]\d*)\.md$/.exec(String(name || ""));
  const number = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(number) ? number : 0;
}
function creationTemplateMetadata(frontmatter = {}) {
  const recorded = createdTemplateMetadata(frontmatter);
  if (!recorded) return { name: "", version: "" };
  const name = recorded.name.trim();
  const storedVersion = /^(unknown|manual)$/i.test(recorded.version.trim()) ? "" : recorded.version.trim();
  const numericVersion = /^v?([1-9]\d*)$/i.exec(storedVersion);
  const version = numericVersion && Number.isSafeInteger(Number(numericVersion[1])) ? `v${Number(numericVersion[1])}` : storedVersion;
  return { name, version };
}
async function describeTemplateProvenance(plugin, file) {
  const path = file.path;
  plugin.assertVaultFilePath(file, path, "Case changed while reading template provenance.");
  const fm = await plugin.fileFrontmatter(file);
  plugin.assertVaultFilePath(file, path, "Case changed while reading template provenance.");
  const created = creationTemplateMetadata(fm);
  let current = null;
  const name = created.name;
  if (name && name !== "manual" && !/[\\/\x00-\x1f]/.test(name) && !/^\.{1,2}$/.test(name)) {
    let relative = /^Spine-(Cervical|Lumbar|Thoracic)$/.test(name) ? `Spine/${name.slice(6)}` : name.endsWith("-Default") ? "_Default" : name;
    if (name === "Example") relative = "Example";
    const templatePath = name === "Example" && plugin.exampleTemplatePath ? plugin.exampleTemplatePath() : plugin.p(`_Templates/Cases/${relative}.md`);
    const template = plugin.app.vault.getAbstractFileByPath(templatePath);
    if (template?.extension === "md" && plugin.isTemplatePath(templatePath)) {
      try {
        const versions = plugin.templateVersionFilesReadOnly(templatePath);
        const latest = versions.at(-1);
        if (latest) current = { name, version: `v${latest.n}` };
      } catch {
      }
    }
  }
  return { created, current };
}
async function pruneTemplateRevisions(plugin, file, currentVersion, expectedText) {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < TEMPLATE_REVISIONS_TO_KEEP + 1) return 0;
  const vault = plugin.app.vault;
  const path = file.path;
  const rootPath = plugin.templateVersionRoot(path);
  const root = vault.getAbstractFileByPath(rootPath);
  const versions = plugin.templateVersionFilesReadOnly(path);
  const latest = versions.at(-1);
  const stale = versions.filter((entry) => entry.n <= currentVersion - TEMPLATE_REVISIONS_TO_KEEP);
  if (!stale.length) return 0;
  if (typeof vault.trash !== "function") throw new Error("Template cleanup paused: the vault trash service is unavailable.");
  const conflict3 = () => new Error("Template cleanup paused because the template or revision history changed. Wait for Sync, then retry.");
  const remaining = new Set(versions.map((entry) => entry.file));
  const stamp = (item) => [item.stat?.mtime, item.stat?.ctime, item.stat?.size].join(":");
  const states = new Map(versions.map((entry) => [entry.file, { path: entry.file.path, stamp: stamp(entry.file), n: entry.n }]));
  const templateStamp = stamp(file);
  const assertState = () => {
    plugin.assertVaultFilePath(file, path, "Template moved or was replaced during revision cleanup.");
    if (plugin.templateVersionRoot(path) !== rootPath || vault.getAbstractFileByPath(rootPath) !== root || root?.path !== rootPath) throw conflict3();
    if (plugin.unloading || plugin.settings?.resetNeedsReview || stamp(file) !== templateStamp) throw conflict3();
    const live = plugin.templateVersionFilesReadOnly(path);
    if (live.length !== remaining.size || live.some((entry) => {
      const state = states.get(entry.file);
      return !remaining.has(entry.file) || !state || state.n !== entry.n || state.path !== entry.file.path || state.stamp !== stamp(entry.file);
    })) throw conflict3();
    if (!latest || latest.n !== currentVersion || live.at(-1)?.file !== latest.file) throw conflict3();
  };
  const verifyCurrent = async () => {
    assertState();
    const activeText = await vault.read(file);
    assertState();
    const savedText = await vault.read(latest.file);
    assertState();
    if (activeText !== expectedText || savedText !== expectedText) throw conflict3();
  };
  await verifyCurrent();
  const plans = [];
  for (const entry of stale) {
    const revisionPath = `${rootPath}/v${entry.n}.md`;
    plugin.assertVaultFilePath(entry.file, revisionPath, "Template revision moved or was replaced before cleanup.");
    const text = await vault.read(entry.file);
    assertState();
    plugin.assertVaultFilePath(entry.file, revisionPath, "Template revision moved or was replaced while preparing cleanup.");
    plans.push({ ...entry, path: revisionPath, text });
  }
  let removed = 0;
  for (const plan of plans) {
    await verifyCurrent();
    plugin.assertVaultFilePath(plan.file, plan.path, "Template revision moved or was replaced before cleanup.");
    const text = await vault.read(plan.file);
    assertState();
    plugin.assertVaultFilePath(plan.file, plan.path, "Template revision moved or was replaced during cleanup.");
    if (text !== plan.text) throw conflict3();
    const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const stagedName = "r" + nonce.replace(/-/g, "").slice(0, Math.min(15, plan.file.name.length - 1));
    const stagedPath = `${rootPath}/${stagedName}`;
    if (vault.getAbstractFileByPath(stagedPath)) throw conflict3();
    try {
      await plugin.renameVaultItem(plan.file, stagedPath, plan.path);
      remaining.delete(plan.file);
      await verifyCurrent();
      plugin.assertVaultFilePath(plan.file, stagedPath, "Template revision moved during retirement.");
      const stagedStamp = stamp(plan.file);
      const stagedText = await vault.read(plan.file);
      assertState();
      plugin.assertVaultFilePath(plan.file, stagedPath, "Template revision moved during retirement.");
      if (stagedText !== plan.text || stamp(plan.file) !== stagedStamp) throw conflict3();
      await vault.trash(plan.file, false);
      if (vault.getAbstractFileByPath(stagedPath)) throw conflict3();
      removed++;
      assertState();
    } catch (error) {
      if (vault.getAbstractFileByPath(stagedPath) === plan.file) {
        if (!vault.getAbstractFileByPath(plan.path)) {
          try {
            await plugin.renameVaultItem(plan.file, plan.path, stagedPath);
            remaining.add(plan.file);
          } catch {
            throw new Error(`Template cleanup stopped; the revision was preserved at ${plan.file.path}. Review after Sync settles.`);
          }
        } else {
          throw new Error(`Template cleanup stopped; both the incoming revision and the retired copy at ${stagedPath} were preserved.`);
        }
      }
      throw error;
    }
  }
  return removed;
}
var TEMPLATE_REVISIONS_TO_KEEP;
var init_template_lifecycle = __esm({
  "src/template-lifecycle.mjs"() {
    init_transfer_core();
    TEMPLATE_REVISIONS_TO_KEEP = 6;
  }
});

// src/transfer-ui.mjs
init_transfer_core();
function installTransferFeatures(plugin, deps) {
  if (plugin.cstTransferFeatures) return plugin.cstTransferFeatures;
  const service = createTransferService(plugin, deps);
  plugin.collectLegacyTransferLeftovers = (source, destination, template, working) => collectLegacyTransferLeftovers(plugin, source, destination, template, working);
  const vault = plugin.app.vault;
  const notice = (text) => new deps.Notice(text);
  const activeModals = /* @__PURE__ */ new Set();
  function modal(title, render) {
    class TransferModal extends deps.Modal {
      onOpen() {
        this.alive = true;
        activeModals.add(this);
        this.modalEl?.classList?.add("cst-transfer-modal");
        this.contentEl.classList?.add("cst-transfer-content");
        this.contentEl.tabIndex = 0;
        this.contentEl.createEl("h2", { text: title });
        Promise.resolve().then(() => render(this.contentEl, this)).catch((error) => {
          if (this.alive) this.contentEl.createEl("p", { text: error.message || String(error), attr: { role: "alert" } });
        });
      }
      onClose() {
        this.alive = false;
        activeModals.delete(this);
        this.contentEl.empty();
      }
    }
    const view = new TransferModal(plugin.app);
    view.open();
    return view;
  }
  function button(el, text, action) {
    const control = el.createEl("button", { text, attr: { type: "button" } });
    control.onclick = async () => {
      if (control.disabled || !control.isConnected) return;
      control.disabled = true;
      try {
        await action();
      } catch (error) {
        notice(error.message || String(error));
      } finally {
        control.disabled = false;
      }
    };
    return control;
  }
  function input(el, label, value = "") {
    const wrap = el.createEl("label");
    wrap.createSpan({ text: label });
    const field = wrap.createEl("input", { type: "text", attr: { "aria-label": label } });
    field.value = value;
    return field;
  }
  function select(el, label, values, value = "") {
    const wrap = el.createEl("label");
    wrap.createSpan({ text: label });
    const field = wrap.createEl("select", { attr: { "aria-label": label } });
    for (const [key4, text] of values) field.createEl("option", { value: key4, text });
    field.value = value;
    return field;
  }
  function check(el, text) {
    const wrap = el.createEl("label");
    const field = wrap.createEl("input", { type: "checkbox" });
    wrap.createSpan({ text });
    return field;
  }
  function previewText(el, label, text) {
    const detail = el.createEl("details");
    detail.createEl("summary", { text: label });
    const area = detail.createEl("textarea", { attr: { "aria-label": label, rows: "12", readonly: "" } });
    area.value = text;
  }
  function bundlePreview(el, bundle) {
    el.createEl("p", { text: `${bundle.case.title} · ${bundle.sender.specialty} / ${bundle.sender.surgeon}` });
    for (const field of PROFILE_FIELDS) el.createEl("p", { text: `${field}: ${bundle.sender.profile[field] || "(empty)"}` });
    previewText(el, "Case text to share", bundle.case.markdown);
    const created = transferCreatedTemplate(bundle);
    el.createEl("p", { text: created ? `Created with ${created.name}${created.version ? " v" + created.version.replace(/^v/i, "") : ""} (informational only).` : "Creation template was not recorded. No template is required to import this case." });
    if (bundle.version === 1) previewText(el, `Legacy sender template: ${bundle.template.name}`, bundle.template.markdown);
    el.createEl("p", { text: `${bundle.attachments.length} referenced images. Image metadata is retained: review photos and their metadata for identifying information before sharing.` });
    for (const attachment of bundle.attachments) {
      const detail = el.createEl("details");
      detail.createEl("summary", { text: attachment.name });
      const type = attachment.name.endsWith(".jpg") ? "jpeg" : attachment.name.split(".").pop();
      detail.createEl("img", { attr: { src: `data:image/${type};base64,${attachment.data}`, alt: attachment.name, width: "240", loading: "lazy" } });
    }
    if (bundle.case.example) el.createEl("p", { text: "Example case: its example flag stays attached and it must be excluded from resource learning." });
  }
  function destinations(el, defaults, changed2 = () => {
  }) {
    const specialties = plugin.getSpecialties();
    const initial = specialties.includes(defaults.specialty) ? defaults.specialty : "";
    const specialty = select(el, "Destination specialty", [["", "Create specialty…"], ...specialties.map((s) => [s, s])], initial);
    const newSpecialty = input(el, "New specialty name", defaults.specialty);
    const surgeonWrap = el.createDiv();
    let surgeon2, newSurgeon;
    function surgeons() {
      newSpecialty.hidden = !!specialty.value;
      surgeonWrap.empty();
      const names = specialty.value ? plugin.getSurgeons(specialty.value) : [];
      surgeon2 = select(surgeonWrap, "Destination surgeon", [["", "Create surgeon…"], ...names.map((s) => [s, s])], names.includes(defaults.surgeon) ? defaults.surgeon : "");
      newSurgeon = input(surgeonWrap, "New surgeon name", defaults.surgeon);
      newSurgeon.hidden = !!surgeon2.value;
      surgeon2.onchange = () => {
        newSurgeon.hidden = !!surgeon2.value;
        changed2();
      };
      newSurgeon.oninput = changed2;
    }
    surgeons();
    specialty.onchange = () => {
      surgeons();
      changed2();
    };
    newSpecialty.oninput = changed2;
    const title = input(el, "New case name (never overwrites an existing case)", defaults.title);
    title.oninput = changed2;
    return () => ({ specialty: specialty.value || newSpecialty.value, surgeon: surgeon2.value || newSurgeon.value, title: title.value });
  }
  function confirmImport(plan, sourceState, sourceView, afterImport) {
    if (sourceState) plan.sourceState = sourceState;
    modal("Confirm CST Notes import", (el, view) => {
      el.createEl("p", { text: `Create: ${plan.casePath}` });
      el.createEl("p", { text: `${plan.specialtyObject ? "Use existing" : "Create"} specialty. ${plan.surgeonObject ? "Use existing" : "Create"} surgeon.` });
      el.createEl("p", { text: "Resolved surgeon profile (changed fields update all live headers for this recipient surgeon):" });
      el.createEl("p", { text: "Glove codes use this vault’s labels. Shared packages do not include code definitions, so confirm their meaning with the sender before importing—even when a code already exists here. Review or adjust the profile and Admin → Settings labels if needed." });
      for (const row of profileConflicts(plan.resolved, plan.recipient)) {
        el.createEl("p", { text: `${row.field}: ${plan.recipient ? row.recipient || "(empty)" : "(new profile)"} → ${row.sender || "(empty)"}` });
      }
      previewText(el, "Case content", plan.bundle.case.markdown);
      el.createEl("p", { text: `The original bundle${plan.bundle.version === 1 ? " and its legacy sender template" : ""} is saved for recovery at ${plan.transferRoot}. Existing templates are not replaced. Images go to ${plan.attachmentRoot}. A registry backup is created before changes. If Sync interrupts, completed work stays available for review.` });
      const consent = check(el, "I reviewed the destination, case contents and profile changes.");
      button(el, "Confirm and import", async () => {
        if (!consent.checked) throw new Error("Review the preview and check the confirmation box.");
        if (sourceState) await service.check(sourceState);
        const result = await service.applyImport(plan);
        view.close();
        sourceView?.close();
        notice(`Imported ${result.file.path}. Recovery copy: ${result.recoveryPath}`);
        await plugin.openFile(result.file);
        if (afterImport) await afterImport(result);
      });
      button(el, "Cancel", () => view.close());
    });
  }
  function importBundle(bundle, sourceState = null, afterImport = null) {
    return modal("Import portable CST Notes case", (el, view) => {
      bundlePreview(el, bundle);
      const profileArea = el.createDiv();
      let resolved = null, readChoice = null, nonce = 0;
      const readDestination = destinations(el, { ...bundle.sender, title: bundle.case.title }, () => {
        resolved = null;
        profileArea.empty();
        nonce++;
      });
      const profileStatus = el.createEl("p", { cls: "cst-transfer-status", attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" } });
      async function prepareRecipient(choice) {
        profileStatus.textContent = "";
        try {
          return await service.prepareImport(bundle, choice);
        } catch (error) {
          if (error?.name !== "GloveValidationError" || error.field !== "gloves") throw error;
          const message = "This glove size or type code is not configured here. Add the sender’s matching size/code in Admin → Settings after confirming its meaning, or choose an existing recipient surgeon and keep/edit their profile. Then retry; the shared file stays unchanged.";
          if (view.alive) profileStatus.textContent = message;
          throw new Error(message);
        }
      }
      button(el, "Compare recipient profile", async () => {
        const token = ++nonce;
        const choice = readDestination();
        const initial = await prepareRecipient(choice);
        if (!view.alive || token !== nonce) return;
        if (!initial.recipient) {
          confirmImport(initial, sourceState, view, afterImport);
          return;
        }
        profileArea.empty();
        readChoice = JSON.stringify(choice);
        resolved = {};
        profileArea.createEl("p", { text: initial.recipient ? "Choose each field independently. Recipient values are selected initially. You may edit any resolved value." : "This surgeon is missing. Review or edit sender values for the new profile." });
        for (const row of profileConflicts(bundle.sender.profile, initial.recipient)) {
          const group = profileArea.createDiv();
          group.createEl("p", { text: `${row.field} — Sender: ${row.sender || "(empty)"} · Recipient: ${initial.recipient ? row.recipient || "(empty)" : "(new)"}` });
          const pick = select(group, `${row.field} source`, [["recipient", "Keep recipient"], ["sender", "Use sender"], ["edit", "Use edited value"]], initial.recipient ? "recipient" : "sender");
          const edited = input(group, `Resolved ${row.field}`, initial.resolved[row.field]);
          pick.onchange = () => {
            if (pick.value !== "edit") edited.value = pick.value === "sender" ? row.sender : row.recipient;
          };
          edited.oninput = () => {
            pick.value = "edit";
          };
          resolved[row.field] = edited;
        }
        const baseline = initial.fingerprint;
        button(profileArea, "Preview import", async () => {
          if (!resolved || readChoice !== JSON.stringify(readDestination())) throw new Error("Destination changed. Compare profiles again.");
          const profile = Object.fromEntries(PROFILE_FIELDS.map((k) => [k, resolved[k].value]));
          const token2 = nonce;
          const selected = readDestination();
          const plan = await prepareRecipient({ ...selected, profile });
          if (!view.alive || token2 !== nonce) throw new Error("Destination changed; compare profiles again.");
          if (plan.fingerprint !== baseline) throw new Error("The recipient profile changed. Compare profiles again before choosing values.");
          if (sourceState?.external) plan.externalSource = sourceState;
          confirmImport(plan, sourceState, view, afterImport);
        });
      });
    });
  }
  async function plainFallback(raw, sourceState) {
    const markdown = fallbackMarkdown(raw);
    modal("Save plain Markdown for manual sorting", (el, view) => {
      el.createEl("p", { text: "Unsupported portable version: only recognizable case text will be saved. Profile, template and attachments will not be interpreted. Review the text, then use External → CST Notes to sort it manually." });
      previewText(el, "Plain case text", markdown);
      const name = input(el, "File name", "Portable case");
      const consent = check(el, "Save this reviewed text as a new note in Imported Notes.");
      button(el, "Save Markdown", async () => {
        if (!consent.checked) throw new Error("Confirm saving the reviewed Markdown.");
        const p = service.path("Imported Notes", `${transferSegment(name.value)}.md`);
        service.vacant(p);
        if (sourceState) await service.check(sourceState);
        const file = await service.mutate(async () => {
          if (sourceState) await service.check(sourceState);
          await service.folder("Imported Notes");
          if (sourceState) await service.check(sourceState);
          service.vacant(p);
          return await vault.create(p, markdown);
        });
        view.close();
        await plugin.openFile(file);
      });
    });
  }
  async function loadImport(raw, state = null) {
    try {
      importBundle(parseTransfer(raw), state);
    } catch (error) {
      if (error.code !== "UNSUPPORTED_TRANSFER_VERSION") throw error;
      modal("Unsupported CST Notes portable version", (el, view) => {
        el.createEl("p", { text: error.message });
        button(el, "Review plain Markdown fallback", async () => {
          await plainFallback(raw, state);
          view.close();
        });
      });
    }
  }
  plugin.openCSTExport = (file) => modal("Export CST Notes case", (el, view) => {
    if (!plugin.caseContext(file)) throw new Error("Select a CST case first.");
    el.createEl("p", { text: "Share one case, its sender surgeon profile and referenced local images. Creation template metadata is informational only; no template files are needed or included. Review for patient identifiers, private notes and photo metadata. No backend scripts or unrelated cases are included. Your original is preserved." });
    el.createEl("p", { text: "If you customized glove codes, tell the recipient what they mean. Code definitions are not included in the shared package." });
    button(el, "Build privacy preview", async () => {
      const plan = await service.prepareExport(file);
      if (!view.alive) return;
      modal("Privacy preview", (preview, confirm) => {
        bundlePreview(preview, plan.bundle);
        for (const warning of plan.warnings) preview.createEl("p", { text: warning });
        preview.createEl("p", { text: `Save shareable file in your vault: ${plan.exportPath}. On mobile or desktop, select the file in Obsidian’s Files pane and use the available share/open action or your device’s Files app.` });
        preview.createEl("p", { text: "To receive this case: copy the shared JSON, then Admin → Import → Import from CST Notes → Import from clipboard → review and import. Older versions may need an update to read the new portable format." });
        const consent = check(preview, "I reviewed all text and images and approve sharing this export.");
        const manual = preview.createDiv({ cls: "cst-transfer-manual-copy" });
        const actions = preview.createDiv({ cls: "cst-transfer-actions" });
        button(actions, "Copy JSON", async () => {
          if (!consent.checked) throw new Error("Review the privacy preview and confirm before exporting.");
          const json = await service.exportJSON(plan);
          if (!confirm.alive || !view.alive) return;
          const copy = deps.copyText || (globalThis.navigator?.clipboard?.writeText ? (text) => globalThis.navigator.clipboard.writeText(text) : null);
          try {
            if (!copy) throw new Error("Clipboard unavailable");
            await copy(json);
            notice("JSON copied. Send it to the recipient to use Import from clipboard in Import from CST Notes.");
          } catch {
            if (!confirm.alive || !view.alive) return;
            manual.empty();
            manual.createEl("p", { text: "Automatic copying is unavailable on this device. Select the JSON below and use Copy, or save the portable file instead." });
            const area = manual.createEl("textarea", { cls: "cst-transfer-json", attr: { "aria-label": "JSON to copy manually", rows: "6", readonly: "", spellcheck: "false" } });
            area.value = json;
            button(manual, "Select JSON", async () => {
              area.value = await service.exportJSON(plan);
              if (!confirm.alive) return;
              area.focus?.();
              area.select?.();
              area.setSelectionRange?.(0, area.value.length);
            });
          }
        });
        button(actions, "Save portable export", async () => {
          if (!consent.checked) throw new Error("Review the privacy preview and confirm before exporting.");
          const exported = await service.saveExport(plan);
          confirm.close();
          view.close();
          notice(`Portable export saved: ${exported.path}`);
          await plugin.openFile(exported);
        });
      });
    });
  });
  plugin.openCSTImport = () => modal("Import from CST Notes", (el, view) => {
    el.classList?.add("cst-transfer-import");
    el.createEl("p", { text: "Copy the JSON shared by another CST Notes user, then choose Import from clipboard. Clipboard access happens only when you choose that button. Review the case, destination and surgeon profile before confirming the import." });
    let readClipboard = null;
    try {
      if (typeof deps.readClipboardText === "function") readClipboard = () => deps.readClipboardText();
      else {
        const clipboard = globalThis.navigator?.clipboard;
        if (typeof clipboard?.readText === "function") readClipboard = () => clipboard.readText();
      }
    } catch {
    }
    const status = el.createEl("p", { cls: "cst-transfer-status", attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" } });
    const actions = el.createDiv({ cls: "cst-transfer-actions" });
    const controls = [];
    let busy = false, composing = false, focusManual = false;
    async function review(read) {
      if (busy || !view.alive) return;
      busy = true;
      el.setAttribute?.("aria-busy", "true");
      status.textContent = "Reading and validating the export…";
      for (const control of controls) control.disabled = true;
      try {
        const { raw, state = null } = await read();
        if (!view.alive) return;
        if (typeof raw !== "string") throw new Error("The export must contain JSON text.");
        if (raw.length > TRANSFER_LIMITS.bytes) throw new Error("Portable file exceeds 24 MiB.");
        if (!raw.trim()) throw new Error("No JSON text was found. Copy the exported CST Notes JSON, paste it manually, or choose a JSON file.");
        await loadImport(raw, state);
        view.close();
      } catch (error) {
        if (view.alive) status.textContent = error instanceof SyntaxError ? "This is not valid JSON. Copy a CST Notes portable export and try again." : error.message || "Unable to read this export. Try manual paste or choose a JSON file.";
      } finally {
        busy = false;
        if (view.alive) {
          el.setAttribute?.("aria-busy", "false");
          for (const control of controls) control.disabled = false;
          clipboardButton.disabled = !readClipboard;
          if (focusManual) {
            focusManual = false;
            pasted.focus?.();
          }
        }
      }
    }
    const clipboardButton = button(actions, "Import from clipboard", () => review(async () => {
      try {
        return { raw: await readClipboard() };
      } catch {
        if (view.alive) showManual(true);
        throw new Error("Clipboard access is unavailable or was denied. Paste the JSON below and choose Continue, or choose a JSON file.");
      }
    }));
    clipboardButton.disabled = !readClipboard;
    const picker = el.createEl("input", { type: "file", attr: { accept: ".json,application/json", "aria-label": "Choose portable file from device" } });
    picker.hidden = true;
    const chooseFile = button(actions, "Choose JSON file", () => {
      if (!busy && view.alive) picker.click();
    });
    const pasteButton = button(actions, "Paste manually", () => {
      if (!busy) showManual(true);
    });
    button(actions, "Cancel", () => view.close());
    const manual = el.createDiv({ cls: "cst-transfer-manual-paste" });
    manual.hidden = true;
    manual.createEl("p", { text: "Paste the exported JSON below. Choose Continue or press Enter to validate it and review the recipient details. Shift+Enter adds a line break." });
    const pasted = manual.createEl("textarea", { cls: "cst-transfer-json", attr: { "aria-label": "Paste CST Notes JSON", placeholder: "Paste exported CST Notes JSON here", rows: "6", spellcheck: "false", autocapitalize: "off", autocomplete: "off", maxlength: String(TRANSFER_LIMITS.bytes + 1) } });
    const continueActions = manual.createDiv({ cls: "cst-transfer-actions" });
    const continueButton = button(continueActions, "Continue", () => review(() => ({ raw: pasted.value })));
    function showManual(focus = false) {
      manual.hidden = false;
      if (focus) {
        if (busy) focusManual = true;
        else pasted.focus?.();
      }
    }
    pasted.oncompositionstart = () => {
      composing = true;
    };
    pasted.oncompositionend = () => {
      composing = false;
    };
    pasted.onkeydown = (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing || composing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && !busy) return continueButton.onclick();
    };
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;
      return review(async () => {
        try {
          if (file.size > TRANSFER_LIMITS.bytes) throw new Error("Portable file exceeds 24 MiB.");
          return { raw: await file.text() };
        } finally {
          picker.value = "";
        }
      });
    };
    const alternatives = el.createEl("details");
    alternatives.createEl("summary", { text: "Or choose an exported vault file" });
    alternatives.createEl("p", { text: "Files are limited to 24 MiB, with up to 32 images (5 MiB each). Import always previews the destination and profile changes." });
    const files = vault.getFiles().filter((file) => file.path.endsWith(".cst.json"));
    const fromVault = select(alternatives, "Or choose an exported vault file", [["", "Select file…"], ...files.map((f) => [f.path, f.path])]);
    const vaultButton = button(alternatives, "Read selected vault export", () => review(async () => {
      const file = vault.getAbstractFileByPath(fromVault.value);
      if (!(file instanceof deps.TFile)) throw new Error("Select an available vault export.");
      if (file.stat?.size > TRANSFER_LIMITS.bytes) throw new Error("Portable file exceeds 24 MiB.");
      const state = await service.read(file);
      return { raw: state.text, state };
    }));
    controls.push(clipboardButton, chooseFile, pasteButton, pasted, continueButton, picker, fromVault, vaultButton);
    if (!readClipboard) {
      status.textContent = "Clipboard access is unavailable on this device. Paste the JSON below and choose Continue, or choose a JSON file.";
      showManual();
    }
    (readClipboard ? clipboardButton : chooseFile).focus?.();
  });
  plugin.renderTransferAdmin = (el) => {
    el.createEl("h3", { text: "CST Notes portable transfer" });
    el.createEl("p", { text: "Export a selected case for another CST Notes user, or import a shared case with a reviewed surgeon profile." });
    const cases = plugin.allCaseFiles();
    const selection = select(el, "Case to export", [["", "Select case…"], ...cases.map((f) => [f.path, f.path])]);
    button(el, "Export selected CST case", () => plugin.openCSTExport(vault.getAbstractFileByPath(selection.value)));
    button(el, "Import from CST Notes", () => plugin.openCSTImport());
  };
  function migration() {
    if (!deps.LegacyTemplateMigrationModal) throw new Error("The integration has not supplied the Legacy Template Migration workspace.");
    new deps.LegacyTemplateMigrationModal(plugin).open();
  }
  async function sortedSourcePaths() {
    const paths = /* @__PURE__ */ new Set();
    for (const file of plugin.allCaseFiles()) {
      const fm = deps.parseFrontmatterObject((await service.read(file)).text);
      if (typeof fm.cst_external_source === "string") paths.add(fm.cst_external_source);
    }
    return paths;
  }
  async function externalCase(file) {
    const state = { ...await service.read(file), external: true };
    if ((await sortedSourcePaths()).has(state.path)) throw new Error("This incoming note already has a sorted CST copy. Open the migration workspace to continue it.");
    modal("Sort imported note", (el, view) => {
      previewText(el, "Incoming text (source stays unchanged)", state.text);
      el.createEl("p", { text: "Choose the specialty and surgeon yourself. Referenced local images are copied with the case. This creates a CST copy; the legacy workspace then lets you arrange its content manually. Existing saved migration drafts are preserved." });
      const readDestination = destinations(el, { specialty: "", surgeon: "", title: file.basename });
      button(el, "Preview sorted case", async () => {
        await service.check(state);
        const choice = readDestination();
        const plan = await service.prepareExternal(file, choice);
        if (!view.alive || JSON.stringify(choice) !== JSON.stringify(readDestination())) throw new Error("Destination changed; preview it again.");
        confirmImport(plan, plan.sourceState, view, async () => {
          notice("Sorted copy created. Choose it in the legacy workspace; move text manually, then choose Save & Next when finished. Only content still left unmapped in the legacy source is retained for Needs Review.");
          migration();
        });
      });
    });
  }
  function openExternalQueue(folderPath) {
    return modal("External import sorting queue", async (el, view) => {
      service.path(folderPath);
      if (folderPath === plugin.contentRoot || folderPath.startsWith(plugin.contentRoot + "/") || folderPath === plugin.p("") || folderPath.startsWith(plugin.p("") + "/")) throw new Error("Choose an incoming folder outside the managed CST library and backend.");
      const incoming = service.incomingFolder(folderPath);
      if (!(incoming instanceof deps.TFolder)) throw new Error("Incoming folder is unavailable.");
      const sorted = await sortedSourcePaths();
      if (!view.alive) return;
      const files = vault.getMarkdownFiles().filter((f) => f.path.startsWith(folderPath + "/") && !f.path.startsWith(folderPath + "/Needs Review/") && !plugin.caseContext(f));
      el.createEl("p", { text: `${files.length} Markdown notes in ${folderPath}. Sort each note explicitly. Unsorted notes stay here. Originals are preserved; opening this queue does not change migration drafts. Needs Review is handled after Save & Next in the legacy workspace, using only source leftovers.` });
      button(el, "Resume legacy workspace / saved drafts", migration);
      for (const file of files) {
        const row = el.createDiv();
        row.createEl("p", { text: `${file.path}${sorted.has(file.path) ? " — CST copy already created" : ""}` });
        const sourcePath = file.path;
        const assertSource = () => {
          if (incoming.path !== folderPath || vault.getAbstractFileByPath(folderPath) !== incoming || file.path !== sourcePath || vault.getAbstractFileByPath(sourcePath) !== file) throw new Error("The incoming folder or note changed. Reopen the sorting queue.");
        };
        const sort = button(row, "Choose destination and sort", async () => {
          assertSource();
          await externalCase(file);
        });
        sort.disabled = sorted.has(file.path);
      }
    });
  }
  plugin.renderExternalImport = (el) => {
    el.createEl("h3", { text: "External → CST Notes" });
    el.createEl("p", { text: "First convert your source into ordinary Markdown with Obsidian Importer. Then confirm the import is complete and sort notes into CST Notes yourself." });
    button(el, "External → CST Notes: prepare Imported Notes", () => modal("Prepare external import", (body, view) => {
      body.createEl("p", { text: "Create the top-level Imported Notes folder if missing. Existing files will be preserved. You can then open the Obsidian Importer listing and install/enable it yourself." });
      const originalFolder = vault.getAbstractFileByPath("Imported Notes");
      const consent = check(body, "Create or use Imported Notes.");
      button(body, "Confirm folder preparation", async () => {
        if (!consent.checked) throw new Error("Confirm folder preparation.");
        await service.mutate(async () => {
          if (vault.getAbstractFileByPath("Imported Notes") !== originalFolder || originalFolder && originalFolder.path !== "Imported Notes") throw new Error("Imported Notes changed during confirmation. Reopen preparation.");
          await service.folder("Imported Notes");
        });
        view.close();
        modal("Import your external notes", (instructions) => {
          instructions.createEl("p", { text: "1. Open the official Importer listing below. In Restricted Mode, first allow Community plugins in Obsidian Settings. Choose Install, then Enable." });
          instructions.createEl("p", { text: "2. Export from your previous app using a format supported by Importer. Open the command palette and run the Importer import command. Choose your export and set its output folder to Imported Notes. Check the imported text and attachments." });
          instructions.createEl("p", { text: "3. Return to External → CST Notes, confirm the upstream import is complete, choose its output folder, and open the sorting queue. For each note, choose or create its specialty and surgeon. In the legacy workspace, place text manually into template sections. When finished sorting a case, choose Save & Next. The legacy workspace automatically retains genuine unmapped source leftovers in Needs Review. Keep the original export until everything is checked." });
          instructions.createEl("a", { text: "Open Obsidian Importer installation listing", href: "obsidian://show-plugin?id=obsidian-importer" });
          instructions.createEl("p", { text: "If the link is unavailable on this device: Settings → Community plugins → Browse → search “Importer” by Obsidian. CST Notes never installs or enables a plugin automatically." });
          if (deps.openImporterSettings) button(instructions, "Open Importer installation screen", () => deps.openImporterSettings());
        });
      });
    }));
    const complete = check(el, "I completed the upstream import and checked its Markdown output.");
    const folders = vault.getAllLoadedFiles().filter((f) => {
      if (!(f instanceof deps.TFolder)) return false;
      try {
        return service.incomingFolder(f.path) === f;
      } catch {
        return false;
      }
    });
    const folder = select(el, "Incoming folder", [["", "Select imported folder…"], ...folders.map((f) => [f.path, f.path])], folders.some((f) => f.path === "Imported Notes") ? "Imported Notes" : "");
    button(el, "Refresh incoming folders", () => {
      el.empty();
      plugin.renderExternalImport(el);
    });
    button(el, "Open external sorting queue", () => {
      if (!complete.checked) throw new Error("Confirm the upstream import is complete first.");
      if (!folder.value) throw new Error("Choose the folder containing the imported Markdown.");
      openExternalQueue(folder.value);
    });
    button(el, "Resume saved legacy migration drafts", migration);
  };
  plugin.register?.(() => {
    service.dispose();
    for (const view of [...activeModals]) view.close();
  });
  plugin.cstTransferFeatures = { service };
  return plugin.cstTransferFeatures;
}

// src/resource-normalization.mjs
var key = (text) => String(text).normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
var optionalString = (value) => value === void 0 || value === null ? null : typeof value === "string" && value.trim() && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : void 0;
function validateResourceSuggestion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid resource suggestion");
  const allowed = /* @__PURE__ */ new Set(["label", "quantity", "size", "material", "needle", "catalogRef"]);
  if (Object.keys(value).some((name) => !allowed.has(name))) throw new Error("Unexpected suggestion fields");
  const label = optionalString(value.label);
  if (!label) throw new Error("A resource label is required");
  const quantity = value.quantity ?? null;
  if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1e4)) throw new Error("Invalid quantity");
  const fields = {};
  for (const name of ["size", "material", "needle", "catalogRef"]) {
    fields[name] = optionalString(value[name]);
    if (fields[name] === void 0) throw new Error(`Invalid ${name}`);
  }
  return { label, quantity, ...fields };
}
var needles = /* @__PURE__ */ new Set(["CT", "CT-1", "CT-2", "CT-3", "CTX", "CTX-1", "SH", "SH-1", "SH-2", "SH-3", "SH-4", "SH-5", "RB", "RB-1", "RB-2", "RB-3", "RB-4", "RB-5", "RB-6", "FS", "FS-1", "FS-2", "FS-3", "FS-4", "PS", "PS-1", "PS-2", "PS-3", "PS-4", "PS-5", "PS-6", "P-1", "P-2", "P-3", "P-4", "P-6", "PC-1", "PC-3", "CP-1", "CP-2", "TP-1", "BV-1", "BV-2", "CV-1", "CV-2", "CV-3", "V-20", "V-26", "KS"]);
var materials = /* @__PURE__ */ new Map([["vic", "Vicryl"], ["vicryl", "Vicryl"], ["monocryl", "Monocryl"], ["mono", "Monocryl"], ["pds", "PDS"], ["prolene", "Prolene"], ["nylon", "Nylon"], ["ethilon", "Ethilon"], ["silk", "Silk"], ["ethibond", "Ethibond"], ["chromic", "Chromic"], ["gut", "Gut"], ["biosyn", "Biosyn"], ["polysorb", "Polysorb"], ["maxon", "Maxon"], ["surgipro", "Surgipro"]]);
function resourcePhraseKey(text) {
  return key(text);
}
function normalizeResourceIdentity(raw, section = "") {
  let text = String(raw).normalize("NFC").trim().replace(/\s+/g, " ");
  if (!text || text.length > 1e3 || /[\r\n]/.test(String(raw))) return null;
  text = text.replace(/^(?:\d+\s*[x×]\s*|[x×]\s*\d+\s+)/i, "").replace(/\s*[x×]\s*\d+$/i, "").trim();
  let quantity = null;
  const explicitQuantity = String(raw).trim().match(/(?:[x×]\s*(\d+)$|^(\d+)\s*[x×])/i);
  if (explicitQuantity) quantity = Number(explicitQuantity[1] || explicitQuantity[2]);
  const suture = /^sutures?$/i.test(section) || /\b(?:vic(?:ryl)?|monocryl|pds|prolene|ethilon|ethibond|chromic|biosyn|polysorb|maxon|surgipro)\b/i.test(text);
  if (suture) {
    text = text.replace(/^sutures?\s+/i, "");
    const leading = text.match(/^\d+\s+(?=\d+\s*-\s*0\b|[1-9]0\b|\d+\s+[A-Za-z])/);
    if (leading) quantity ?? (quantity = Number(leading[0].trim()));
    text = text.replace(/^\d+\s+(?=\d+\s*-\s*0\b|[1-9]0\b|\d+\s+[A-Za-z])/, "");
    text = text.replace(/^(\d+)\s*-\s*0\b/, "$1-0").replace(/^([1-9])0\b/, "$1-0");
    const tokens = text.split(" ");
    if (!/^(?:[1-9]\d?-0|0{1,3}|[1-9])$/.test(tokens[0])) return null;
    const size = tokens.shift();
    const canonical = tokens.join(" ").replace(/\b([A-Za-z]{1,3})\s*-?\s*(\d{1,2})\b/g, "$1-$2").split(" ");
    if (/^\d+$/.test(canonical.at(-1) || "")) quantity ?? (quantity = Number(canonical.pop()));
    const found = canonical.filter((token) => needles.has(token.toUpperCase()));
    if (found.length !== 1) return null;
    const needle = found[0].toUpperCase();
    const words = canonical.filter((token) => token.toUpperCase() !== needle);
    if (!words.length) return null;
    const material = words.map((word) => materials.get(key(word)) || word).join(" ");
    const label = size + " " + material + " " + needle;
    return { label, normalized: key(label), kind: "suture", quantity, size, material, needle, key: JSON.stringify(["suture", key(label)]) };
  }
  const countable = /^(?:kelly|allis|hemostat|kocher|crile|mosquito|clamp|gauze|towel|scissors|forceps|retractor)(?:\b|\d)/i;
  const barePrefix = text.match(/^(\d+)\s+(.+)$/);
  if (barePrefix && countable.test(barePrefix[2])) {
    quantity ?? (quantity = Number(barePrefix[1]));
    text = barePrefix[2];
  }
  if (countable.test(text) && !/\b(?:size|fr|mm|cm|inch|blade)\b/i.test(text)) {
    const suffix = text.match(/(?<=[A-Za-z])\s*(\d+)$/);
    if (suffix) {
      quantity ?? (quantity = Number(suffix[1]));
      text = text.slice(0, suffix.index).trim();
    }
  }
  if (!text) return null;
  const kind = /\b(?:kelly|allis|hemostat|kocher|crile|mosquito|clamp)\b/i.test(text) ? "clamp" : /\b(?:scissors|metzenbaum)\b/i.test(text) ? "scissors" : /\b(?:needle holder|needle driver)\b/i.test(text) ? "needle-holder" : /\b(?:forceps|debakey|adson)\b/i.test(text) ? "forceps" : /\b(?:retractor|richardson|army navy|weitlaner)\b/i.test(text) ? "retractor" : /\b(?:gauze|telfa|tegaderm|dressing|kerlix)\b/i.test(text) ? "dressing" : /\b(?:saline|water|irrigation)\b/i.test(text) ? "fluid" : "resource";
  return { label: text, normalized: key(text), kind, quantity, key: JSON.stringify([kind, key(text)]) };
}

// src/resource-collector.mjs
var sections = /* @__PURE__ */ new Map([
  ["suture", "Sutures"],
  ["sutures", "Sutures"],
  ["mayo", "Mayo"],
  ["mayo contents", "Mayo"],
  ["mayo stand", "Mayo"],
  ["basin", "Basin"],
  ["basins", "Basin"],
  ["basin contents", "Basin"],
  ["dressing", "Dressings"],
  ["dressings", "Dressings"]
]);
function stripResourceMarkers(text) {
  return String(text).replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => /^<!-- cst-resource-grabbed:v1:[a-f0-9]{64} -->$/.test(comment) ? "" : comment);
}
function resourceBody(text) {
  return String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?:\n|$)/, "").replace(/<!--[\s\S]*?(?:-->|$)/g, "");
}
function comparableResourceBody(text) {
  return resourceBody(text).split("\n").map((line) => line.trim().replace(/[ \t]+/g, " ")).filter(Boolean).join("\n");
}
function extractResourceCandidates(text, aliases = []) {
  const stack = [], entries = /* @__PURE__ */ new Map();
  let fence = null;
  for (const raw of resourceBody(text).split("\n")) {
    const fenceMatch = raw.match(/^\s{0,3}(\x60{3,}|~{3,})/);
    if (fenceMatch) {
      const token = fenceMatch[1];
      if (!fence) fence = token;
      else if (token[0] === fence[0] && token.length >= fence.length && raw.trim() === token) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = raw.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const depth = heading[1].length;
      while (stack.length && stack.at(-1).depth >= depth) stack.pop();
      const name = resourcePhraseKey(heading[2].replace(/:$/, ""));
      stack.push({ depth, name, section: sections.get(name) });
      continue;
    }
    if (stack.some((h) => /^(needs[ -]review|unmapped|legacy(?: preserved)?(?: notes?| sections?)?|internal)$/.test(h.name))) continue;
    const section = [...stack].reverse().find((h) => h.section)?.section;
    if (!section) continue;
    const label = raw.trim().replace(/^(?:[-+*]|\d+[.)])\s+/, "").replace(/^\[[ xX]\]\s+/, "").trim();
    if (!label || /^(?:[-*_]\s*){3,}$/.test(label) || label.startsWith("|")) continue;
    const initial = normalizeResourceIdentity(label, section);
    const alias = aliases.find((a) => a.approved && a.section === section && (resourcePhraseKey(a.raw) === resourcePhraseKey(label) || initial && a.identityKey === initial.key));
    const identity = normalizeResourceIdentity(alias?.suggestion?.label || label, section);
    if (!identity || identity.kind === "suture" && initial?.kind !== "suture") continue;
    if (alias) {
      identity.quantity = initial?.quantity ?? null;
      identity.kind = alias.kind;
      identity.key = JSON.stringify([identity.kind, identity.normalized]);
    }
    const sourceKey = JSON.stringify([identity.key, section]);
    if (!entries.has(sourceKey)) entries.set(sourceKey, { ...identity, section, raw: label, aliasApplied: !!alias });
  }
  return [...entries.values()];
}
var catalogKinds = /* @__PURE__ */ new Set(["resource", "clamp", "scissors", "forceps", "retractor", "needle-holder", "suture", "dressing", "fluid"]);
function validateResourceCatalogEntry(entry) {
  const sectionNames2 = new Set(sections.values());
  const identity = typeof entry?.label === "string" && sectionNames2.has(entry.section) ? normalizeResourceIdentity(entry.label, entry.section) : null;
  if (!identity || !catalogKinds.has(entry.kind) || entry.normalized !== identity.normalized || entry.key !== JSON.stringify([entry.kind, identity.normalized]) || identity.kind === "suture" !== (entry.kind === "suture")) {
    throw new Error("Invalid resource catalog identity.");
  }
  if (!Array.isArray(entry.sources) || entry.sources.some((source) => !source || typeof source.noteId !== "string" || typeof source.path !== "string" || !sectionNames2.has(source.section) || typeof source.raw !== "string")) {
    throw new Error("Invalid resource catalog provenance.");
  }
  const raw = typeof entry.raw === "string" ? entry.raw : identity.label;
  return {
    ...identity,
    key: entry.key,
    kind: entry.kind,
    section: entry.section,
    raw,
    quantity: normalizeResourceIdentity(raw, entry.section)?.quantity ?? null,
    aliasApplied: entry.aliasApplied === true,
    sources: entry.sources.map((source) => ({
      noteId: source.noteId,
      path: source.path,
      section: source.section,
      raw: source.raw,
      quantity: normalizeResourceIdentity(source.raw, source.section)?.quantity ?? null
    }))
  };
}
var ResourceCollector = class {
  constructor({ aliases = [], catalog = [] } = {}) {
    this.notes = /* @__PURE__ */ new Map();
    this.pending = /* @__PURE__ */ new Set();
    this.revision = 0;
    this.catalog = /* @__PURE__ */ new Map();
    this.aliases = aliases;
    for (const cached of catalog) {
      const entry = validateResourceCatalogEntry(cached);
      this.catalog.set(entry.key, { ...entry, sources: new Map(entry.sources.map((source) => [JSON.stringify([source.noteId, source.section]), { ...source }])) });
    }
  }
  observe({ id: id2, path, text, fingerprint }) {
    if (!id2 || !path) throw new Error("A stable note identity and path are required.");
    const body = comparableResourceBody(text);
    const previous = this.notes.get(id2);
    for (const resource of this.catalog.values()) {
      for (const source of resource.sources.values()) if (source.noteId === id2) source.path = path;
    }
    if (previous?.body === body && previous.fingerprint === fingerprint) {
      previous.path = path;
      previous.text = text;
      return false;
    }
    this.notes.set(id2, { id: id2, path, body, text, fingerprint, revision: ++this.revision, grabbed: false, entries: [] });
    this.pending.add(id2);
    return true;
  }
  invalidate(id2) {
    const note = this.notes.get(id2);
    if (!note) return;
    note.grabbed = false;
    note.revision = ++this.revision;
    this.pending.add(id2);
  }
  prepare(id2) {
    const note = this.notes.get(id2);
    if (!note || note.grabbed) return null;
    return { id: id2, revision: note.revision, entries: extractResourceCandidates(note.text, this.aliases) };
  }
  commit(result) {
    const note = result && this.notes.get(result.id);
    if (!note || note.revision !== result.revision) return false;
    note.entries = extractResourceCandidates(note.text, this.aliases);
    for (const entry of note.entries) {
      const sources = this.catalog.get(entry.key)?.sources || /* @__PURE__ */ new Map();
      this.catalog.set(entry.key, { ...entry, sources });
      this.catalog.get(entry.key).sources.set(JSON.stringify([note.id, entry.section]), {
        noteId: note.id,
        path: note.path,
        section: entry.section,
        raw: entry.raw,
        quantity: entry.quantity
      });
    }
    note.grabbed = true;
    this.pending.delete(note.id);
    return true;
  }
  remove(id2) {
    this.pending.delete(id2);
    this.notes.delete(id2);
  }
  snapshot() {
    return {
      catalog: [...this.catalog.values()].map((entry) => ({ ...entry, sources: [...entry.sources.values()] })),
      // No source text or frontmatter is retained in the index.
      notes: [...this.notes.values()].map((note) => ({
        id: note.id,
        path: note.path,
        fingerprint: note.fingerprint,
        grabbed: note.grabbed,
        entries: note.entries.map((entry) => ({ key: entry.key, section: entry.section }))
      }))
    };
  }
  resources() {
    return [...this.catalog.values()].map((entry) => {
      const sources = [...entry.sources.values()].map((source) => {
        const parent3 = this.notes.get(source.noteId);
        const current = !!parent3?.grabbed && parent3.entries.some((item) => item.key === entry.key && item.section === source.section);
        return { ...source, path: parent3?.path || source.path, current };
      });
      const noteCount = new Set(sources.filter((source) => source.current).map((source) => source.noteId)).size;
      return {
        ...entry,
        sources,
        noteCount,
        historicalNoteCount: new Set(sources.map((s) => s.noteId)).size,
        qualified: noteCount >= 2,
        verified: noteCount >= 2,
        status: noteCount >= 2 ? "verified" : "unverified"
      };
    }).sort((a, b) => a.kind.localeCompare(b.kind) || a.normalized.localeCompare(b.normalized));
  }
};

// src/resource-runtime.mjs
var kinds = ["resource", "clamp", "scissors", "forceps", "retractor", "needle-holder", "suture", "dressing", "fluid"];
var sectionNames = ["Mayo", "Basin", "Sutures", "Dressings"];
var emptyState = () => ({ version: 1, revision: 0, aliases: [], hidden: [], catalog: [], notes: [] });
var conflict = () => new Error("Resource collection paused because Sync changed a file. Refresh after Sync settles.");
var safePath = (path) => {
  if (typeof path !== "string" || !path || /[\\:\u0000-\u001f]/.test(path) || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Invalid resource storage path.");
  return path;
};
function validateResourceAlias(value) {
  if (!value || typeof value.raw !== "string" || !value.raw.trim() || value.raw.length > 1e3 || /[\r\n]/.test(value.raw) || !sectionNames.includes(value.section) || !kinds.includes(value.kind) || value.approved !== true) {
    throw new Error("Choose a resource phrase, section, canonical name and kind.");
  }
  const suggestion = validateResourceSuggestion(value.suggestion);
  const identity = normalizeResourceIdentity(suggestion.label, value.section);
  if (!identity || identity.kind === "suture" !== (value.kind === "suture")) {
    throw new Error("Sutures require a size, material and recognized needle identifier.");
  }
  const original = normalizeResourceIdentity(value.raw, value.section);
  return {
    raw: value.raw.trim(),
    section: value.section,
    kind: value.kind,
    approved: true,
    identityKey: original?.key || null,
    suggestion: { ...suggestion, label: identity.label, quantity: null }
  };
}
function encodeResourceIndex(state) {
  return "---\ncst_type: resource-library\n---\n\n# Resource Library\n\nManaged by CST Notes. Review terminology in Resource Admin. AI disconnected.\n\n```cst-resource-data\n" + JSON.stringify(state, null, 2) + "\n```\n";
}
function decodeResourceIndex(text) {
  if (typeof text !== "string" || text.length > 16e6) throw new Error("Invalid resource index.");
  const match = /^\x60{3}cst-resource-data\r?\n([\s\S]*?)\r?\n\x60{3}[ \t]*$/m.exec(text);
  if (!match) throw new Error("Resource index data is missing.");
  const state = JSON.parse(match[1]);
  if (state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !["aliases", "hidden", "catalog", "notes"].every((name) => Array.isArray(state[name])) || state.catalog.length > 1e5 || state.aliases.length > 1e4) throw new Error("Unsupported resource index.");
  state.aliases = state.aliases.map(validateResourceAlias);
  const seen = /* @__PURE__ */ new Set();
  for (const alias of state.aliases) {
    const key4 = JSON.stringify([alias.section, alias.identityKey || resourcePhraseKey(alias.raw)]);
    if (seen.has(key4)) throw new Error("Conflicting resource aliases.");
    seen.add(key4);
  }
  if (state.hidden.some((key4) => typeof key4 !== "string")) throw new Error("Invalid hidden resources.");
  for (const entry of state.catalog) {
    if (!entry || typeof entry.key !== "string" || typeof entry.label !== "string" || typeof entry.normalized !== "string" || !kinds.includes(entry.kind) || !Array.isArray(entry.sources) || entry.sources.some((s) => typeof s.noteId !== "string" || typeof s.path !== "string" || !sectionNames.includes(s.section) || typeof s.raw !== "string")) throw new Error("Invalid resource provenance.");
  }
  state.catalog = state.catalog.map(validateResourceCatalogEntry);
  return state;
}
async function resourceFingerprint(text, aliases = []) {
  if (!globalThis.crypto?.subtle) throw new Error("Resource hashing is unavailable on this device.");
  const bytes2 = new TextEncoder().encode(JSON.stringify([comparableResourceBody(text), aliases]));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes2);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
function createDisconnectedResourceProvider() {
  return Object.freeze({
    status: "disconnected",
    async suggest(input) {
      if (!input || typeof input.raw !== "string" || !input.raw.trim() || input.raw.length > 1e3 || /[\r\n]/.test(input.raw) || !sectionNames.includes(input.section)) throw new Error("Only a resource phrase and section are accepted.");
      return { raw: input.raw, section: input.section, status: "disconnected", suggestion: null, clinicalVerification: false };
    },
    validateAdvisory(value) {
      return { suggestion: validateResourceSuggestion(value), status: "needs-review", clinicalVerification: false };
    }
  });
}
function createResourceRuntime(plugin, deps) {
  const vault = plugin.app.vault;
  if (!deps.TFile || !deps.TFolder || typeof deps.parseFrontmatterObject !== "function" || typeof deps.id !== "function" || typeof plugin.allCaseFiles !== "function" || typeof plugin.migrationSessionPath !== "function" || typeof plugin.parseMigrationSessionText !== "function") {
    throw new Error("Resource features require vault types, parser, id, scoped cases and migration-session access.");
  }
  const runtime = {
    state: emptyState(),
    collector: new ResourceCollector(),
    pending: /* @__PURE__ */ new Map(),
    paths: /* @__PURE__ */ new Map(),
    claims: /* @__PURE__ */ new Map(),
    stopped: true,
    timer: null,
    busy: false,
    error: "",
    indexFile: null,
    indexText: null,
    serial: Promise.resolve(),
    epoch: 0,
    holds: /* @__PURE__ */ new Set(),
    provider: createDisconnectedResourceProvider(),
    reviewPaths: /* @__PURE__ */ new Set(),
    reviewFile: null,
    reviewText: null,
    reviewDirty: true,
    reviewGeneration: 0,
    indexDirty: false,
    indexGeneration: 0,
    indexSuspended: /* @__PURE__ */ new Map(),
    scanDirty: false,
    discardHistoryOnResume: false,
    pathVersions: /* @__PURE__ */ new Map()
  };
  const requestedBatch = Number(deps.resourceBatchSize), requestedDelay = Number(deps.resourceDebounceMs);
  const batchSize = Number.isFinite(requestedBatch) ? Math.max(1, Math.min(32, Math.floor(requestedBatch))) : 8;
  const delay = Number.isFinite(requestedDelay) ? Math.max(10, Math.min(6e4, requestedDelay)) : 400;
  let indexWriting = false, operationEpoch = 0;
  const previews = /* @__PURE__ */ new WeakSet();
  function roots() {
    const backend = safePath(plugin.p()), content = safePath(plugin.contentRoot);
    const session = safePath(plugin.migrationSessionPath());
    if (backend === content || backend.startsWith(content + "/") || content.startsWith(backend + "/") || !session.startsWith(backend + "/")) throw new Error("Resource storage must be separate from cases.");
    return { backend, content, session, index: safePath(plugin.p("_Data/Resource Library.md")), backups: safePath(plugin.p("Admin/Backups/Resource Library")) };
  }
  const resetPending = () => plugin.settings?.resetNeedsReview === true || plugin.adminWorkspace?.resetNeedsReview === true;
  const suspended = () => runtime.stopped || runtime.holds.size > 0 || resetPending();
  function active() {
    if (resetPending()) throw new Error("Resource collection is suspended until reset recovery is reviewed.");
    if (suspended() || runtime.epoch !== operationEpoch || JSON.stringify(roots()) !== runtime.rootKey) {
      throw new Error("Resource collection paused, stopped or configured folders changed.");
    }
    if (runtime.error) throw new Error(runtime.error);
  }
  function fileAt(file, path) {
    active();
    if (!(file instanceof deps.TFile) || file.path !== path || vault.getAbstractFileByPath(path) !== file) throw conflict();
  }
  function serial(fn) {
    const job = runtime.serial.then(async () => {
      operationEpoch = runtime.epoch;
      return fn();
    });
    runtime.serial = job.catch(() => {
    });
    return job;
  }
  function clearTimer() {
    if (runtime.timer !== null) clearTimeout(runtime.timer);
    runtime.timer = null;
  }
  function invalidateAll() {
    for (const id2 of runtime.collector.notes.keys()) runtime.collector.invalidate(id2);
  }
  function suspendIndexEvidence() {
    for (const note of runtime.collector.notes.values()) {
      const previous = runtime.indexSuspended.get(note.id);
      const restorable = note.grabbed || previous?.note === note && previous.revision === note.revision;
      runtime.collector.invalidate(note.id);
      if (restorable) runtime.indexSuspended.set(note.id, { note, revision: note.revision });
      else runtime.indexSuspended.delete(note.id);
    }
  }
  function restoreUnchangedIndexEvidence() {
    for (const [id2, saved] of runtime.indexSuspended) {
      if (runtime.collector.notes.get(id2) === saved.note && saved.note.revision === saved.revision) {
        saved.note.grabbed = true;
        runtime.collector.pending.delete(id2);
      }
    }
    runtime.indexSuspended.clear();
  }
  function invalidatePath(path) {
    runtime.pathVersions.set(path, (runtime.pathVersions.get(path) || 0) + 1);
    const known = runtime.paths.get(path);
    if (known) runtime.collector.invalidate(known.id);
  }
  function fail2(error) {
    if (!suspended()) runtime.error = error.message || "Resource collection paused.";
    clearTimer();
    invalidateAll();
  }
  async function ensureFolder(path) {
    active();
    await plugin.ensureFolder(path);
    active();
    if (!(vault.getAbstractFileByPath(path) instanceof deps.TFolder)) throw conflict();
  }
  async function backup(path, text) {
    const base = roots().backups;
    await ensureFolder(base);
    const token = deps.id("resource");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(token)) throw new Error("Invalid resource backup identity.");
    const folder = safePath(base + "/" + token);
    if (vault.getAbstractFileByPath(folder)) throw conflict();
    await ensureFolder(folder);
    active();
    const originalPath = folder + "/Original.md", manifestPath = folder + "/Manifest.md";
    const original = await vault.create(originalPath, text);
    active();
    const manifestText = "# Resource backup\n\n" + JSON.stringify({ originalPath: path, version: 1 }) + "\n";
    const manifest = await vault.create(manifestPath, manifestText);
    fileAt(original, originalPath);
    if (await vault.read(original) !== text) throw conflict();
    fileAt(original, originalPath);
    fileAt(manifest, manifestPath);
    if (await vault.read(manifest) !== manifestText) throw conflict();
    fileAt(manifest, manifestPath);
    fileAt(original, originalPath);
    return folder;
  }
  async function load({ discardHistory = false } = {}) {
    active();
    const generation = runtime.indexGeneration;
    const path = roots().index, file = vault.getAbstractFileByPath(path);
    if (file && !(file instanceof deps.TFile)) throw new Error("Resource index path is occupied.");
    const text = file ? await vault.read(file) : null;
    if (file) {
      fileAt(file, path);
      if (await vault.read(file) !== text) throw conflict();
      fileAt(file, path);
    } else if (vault.getAbstractFileByPath(path)) throw conflict();
    if (generation !== runtime.indexGeneration) throw conflict();
    const state = text === null ? emptyState() : decodeResourceIndex(text);
    const local = discardHistory ? [] : runtime.collector.snapshot().catalog;
    const merged = new ResourceCollector({ catalog: state.catalog, aliases: state.aliases });
    for (const entry of local) {
      const current = merged.catalog.get(entry.key);
      if (!current) merged.catalog.set(entry.key, { ...entry, sources: new Map(entry.sources.map((s) => [JSON.stringify([s.noteId, s.section]), s])) });
      else for (const source of entry.sources) {
        const key4 = JSON.stringify([source.noteId, source.section]);
        if (!current.sources.has(key4)) current.sources.set(key4, source);
      }
    }
    runtime.state = state;
    runtime.collector = merged;
    runtime.indexFile = file || null;
    runtime.indexText = text;
    runtime.paths.clear();
    runtime.claims.clear();
    runtime.pathVersions.clear();
    runtime.pending.clear();
    runtime.indexDirty = false;
    runtime.indexSuspended.clear();
  }
  async function refreshReviews(force = false) {
    active();
    const path = roots().session, file = vault.getAbstractFileByPath(path) || null;
    const generation = runtime.reviewGeneration;
    if (file && !(file instanceof deps.TFile)) throw new Error("Migration session path is occupied.");
    const text = file ? await vault.read(file) : null;
    if (file) fileAt(file, path);
    active();
    if (generation !== runtime.reviewGeneration || (vault.getAbstractFileByPath(path) || null) !== file) throw conflict();
    if (!force && !runtime.reviewDirty && file === runtime.reviewFile && text === runtime.reviewText) return false;
    const session = text === null ? null : plugin.parseMigrationSessionText(text);
    if (session && (!session.status || typeof session.status !== "object" || Array.isArray(session.status) || Object.values(session.status).some((value) => typeof value !== "string"))) throw new Error("Invalid migration review status.");
    const excluded = new Set(Object.entries(session?.status || {}).filter(([, status]) => /^needs[ _-]review$/i.test(status)).map(([path2]) => path2));
    if (generation !== runtime.reviewGeneration) throw conflict();
    invalidateAll();
    runtime.reviewPaths = excluded;
    runtime.reviewFile = file;
    runtime.reviewText = text;
    runtime.reviewDirty = false;
    return true;
  }
  async function refreshDependencies() {
    if (runtime.indexDirty) {
      const generation = runtime.indexGeneration;
      const path = roots().index, current = vault.getAbstractFileByPath(path) || null;
      const text = current instanceof deps.TFile ? await vault.read(current) : null;
      active();
      if (current !== runtime.indexFile || text !== runtime.indexText) {
        await load();
        runtime.scanDirty = true;
      } else if (generation === runtime.indexGeneration) {
        runtime.indexDirty = false;
        restoreUnchangedIndexEvidence();
      }
    }
    if (await refreshReviews()) runtime.scanDirty = true;
    if (runtime.scanDirty) {
      runtime.scanDirty = false;
      scan();
    }
  }
  async function persist() {
    active();
    const path = roots().index, expectedFile = runtime.indexFile, expectedText = runtime.indexText;
    const snapshot = () => ({ ...runtime.state, ...runtime.collector.snapshot(), revision: runtime.state.revision + 1 });
    const comparable = (value) => JSON.stringify({ ...value, revision: 0 });
    if (expectedText && comparable(decodeResourceIndex(expectedText)) === comparable(snapshot())) {
      fileAt(expectedFile, path);
      if (await vault.read(expectedFile) !== expectedText) throw conflict();
      fileAt(expectedFile, path);
      return;
    }
    await ensureFolder(path.slice(0, path.lastIndexOf("/")));
    let nextState, next;
    if (expectedFile) {
      fileAt(expectedFile, path);
      if (await vault.read(expectedFile) !== expectedText) throw conflict();
      await backup(path, expectedText);
      fileAt(expectedFile, path);
      if (typeof vault.process !== "function") throw new Error("Atomic vault updates are required for resource collection.");
      indexWriting = true;
      try {
        await vault.process(expectedFile, (current) => {
          fileAt(expectedFile, path);
          if (current !== expectedText) throw conflict();
          nextState = snapshot();
          next = encodeResourceIndex(nextState);
          return next;
        });
      } finally {
        indexWriting = false;
      }
    } else {
      if (vault.getAbstractFileByPath(path)) throw conflict();
      active();
      nextState = snapshot();
      next = encodeResourceIndex(nextState);
      indexWriting = true;
      try {
        runtime.indexFile = await vault.create(path, next);
      } finally {
        indexWriting = false;
      }
    }
    fileAt(runtime.indexFile, path);
    if (await vault.read(runtime.indexFile) !== next) throw conflict();
    fileAt(runtime.indexFile, path);
    runtime.indexText = next;
    runtime.state = nextState;
  }
  function eligible(file, text) {
    const context = plugin.caseContext(file);
    if (!context || !plugin.isCasePath(file.path) || runtime.reviewPaths.has(file.path) || runtime.reviewDirty) return null;
    const relative = file.path.slice(plugin.contentRoot.length + 1).split("/");
    if (relative.length !== 3 || relative.some((part) => /^(?:needs[ _-]review|internal|_.*)(?:\.md)?$/i.test(part))) return null;
    const fm = deps.parseFrontmatterObject(text);
    if (fm.cst_type && fm.cst_type !== "case" || String(fm.cst_example).toLowerCase() === "true" || String(fm.cst_id || "").startsWith("cst-example-") || String(fm.cst_internal).toLowerCase() === "true" || [fm.cst_status, fm.migration_status, fm.status].some((value) => /needs[ _-]review/i.test(String(value || ""))) || fm.cst_id && (typeof fm.cst_id !== "string" || fm.cst_id.length > 200)) return null;
    return { id: fm.cst_id ? "id:" + fm.cst_id : "path:" + file.path, context };
  }
  function releasePath(path) {
    const old = runtime.paths.get(path);
    if (!old) return;
    runtime.paths.delete(path);
    const claims = runtime.claims.get(old.id);
    claims?.delete(path);
    runtime.collector.remove(old.id);
    if (!claims?.size) runtime.claims.delete(old.id);
    else for (const remaining of claims) enqueue(remaining);
  }
  function enqueue(path, expectedFile = null) {
    if (runtime.stopped || !path || !plugin.isCasePath(path)) return;
    runtime.pending.set(path, { file: expectedFile || vault.getAbstractFileByPath(path) });
    schedule();
  }
  function scan() {
    for (const path of [...runtime.paths.keys()]) if (!vault.getAbstractFileByPath(path)) releasePath(path);
    for (const file of plugin.allCaseFiles()) if (plugin.caseContext(file)) enqueue(file.path, file);
  }
  function schedule() {
    if (suspended() || runtime.busy || runtime.timer !== null || runtime.error) return;
    runtime.timer = setTimeout(() => {
      runtime.timer = null;
      void runtime.flushBatch().catch(fail2);
    }, delay);
  }
  async function collect(path, expected) {
    active();
    const file = vault.getAbstractFileByPath(path);
    if (!(file instanceof deps.TFile)) {
      releasePath(path);
      return;
    }
    if (expected && expected !== file) {
      releasePath(path);
      enqueue(path, file);
      return;
    }
    if (runtime.reviewPaths.has(path)) {
      releasePath(path);
      return;
    }
    const reviewGeneration = runtime.reviewGeneration, initialVersion = runtime.pathVersions.get(path) || 0;
    const text = await vault.read(file);
    fileAt(file, path);
    if (initialVersion !== (runtime.pathVersions.get(path) || 0)) throw conflict();
    const identity = eligible(file, text);
    if (!identity) {
      releasePath(path);
      return;
    }
    const prior = runtime.paths.get(path);
    if (prior && prior.id !== identity.id) releasePath(path);
    runtime.paths.set(path, { id: identity.id, file });
    if (!runtime.claims.has(identity.id)) runtime.claims.set(identity.id, /* @__PURE__ */ new Set());
    runtime.claims.get(identity.id).add(path);
    if (runtime.claims.get(identity.id).size > 1) {
      runtime.collector.remove(identity.id);
      return;
    }
    const hash = await resourceFingerprint(text, runtime.state.aliases);
    fileAt(file, path);
    if (initialVersion !== (runtime.pathVersions.get(path) || 0) || reviewGeneration !== runtime.reviewGeneration) throw conflict();
    runtime.collector.observe({ id: identity.id, path, text, fingerprint: hash });
    const result = runtime.collector.prepare(identity.id);
    const current = await vault.read(file);
    fileAt(file, path);
    if (current !== text || initialVersion !== (runtime.pathVersions.get(path) || 0) || reviewGeneration !== runtime.reviewGeneration || eligible(file, current)?.id !== identity.id) throw conflict();
    if (result && !runtime.collector.commit(result)) throw conflict();
  }
  async function cleanupLegacyMarkers() {
    active();
    const report = { cleaned: [], skipped: 0 };
    runtime.lastMarkerCleanup = report;
    for (const file of plugin.allCaseFiles()) {
      active();
      const path = file.path, content = roots().content;
      if (!(file instanceof deps.TFile) || !path.startsWith(content + "/") || path.slice(content.length + 1).split("/").length !== 3 || !plugin.isCasePath(path) || !plugin.caseContext(file)) {
        report.skipped++;
        continue;
      }
      safePath(path);
      fileAt(file, path);
      const version = runtime.pathVersions.get(path) || 0;
      const text = await vault.read(file);
      fileAt(file, path);
      if (version !== (runtime.pathVersions.get(path) || 0)) throw conflict();
      const next = stripResourceMarkers(text);
      if (next === text) {
        report.skipped++;
        continue;
      }
      if (typeof vault.process !== "function") throw new Error("Atomic vault updates are required for resource cleanup.");
      if (await vault.read(file) !== text) throw conflict();
      fileAt(file, path);
      const backupPath = await backup(path, text);
      fileAt(file, path);
      await vault.process(file, (current2) => {
        fileAt(file, path);
        if (current2 !== text || version !== (runtime.pathVersions.get(path) || 0) || !plugin.isCasePath(path) || !plugin.caseContext(file)) throw conflict();
        return next;
      });
      invalidatePath(path);
      enqueue(path, file);
      const finalVersion = runtime.pathVersions.get(path) || 0;
      const current = await vault.read(file);
      fileAt(file, path);
      if (current !== next || finalVersion !== (runtime.pathVersions.get(path) || 0)) throw conflict();
      report.cleaned.push({ path, backupPath });
    }
    return report;
  }
  runtime.cleanupLegacyMarkers = () => serial(async () => {
    try {
      return await cleanupLegacyMarkers();
    } catch (error) {
      fail2(error);
      throw error;
    }
  });
  runtime.flushBatch = () => serial(async () => {
    if (suspended() || runtime.error) {
      clearTimer();
      return;
    }
    clearTimer();
    runtime.busy = true;
    try {
      await refreshDependencies();
      for (const [path, queued] of [...runtime.pending].slice(0, batchSize)) {
        runtime.pending.delete(path);
        try {
          await collect(path, queued.file);
        } catch (error) {
          runtime.pending.set(path, queued);
          throw error;
        }
      }
      await persist();
    } catch (error) {
      fail2(error);
    } finally {
      runtime.busy = false;
      if (runtime.pending.size || runtime.indexDirty || runtime.reviewDirty || runtime.scanDirty) schedule();
    }
  });
  async function restart(options = {}) {
    const rootKey = JSON.stringify(roots());
    const discardHistory = !!options.discardHistory || runtime.discardHistoryOnResume || runtime.rootKey && runtime.rootKey !== rootKey;
    runtime.rootKey = rootKey;
    runtime.error = "";
    runtime.busy = true;
    try {
      await load({ discardHistory });
      runtime.discardHistoryOnResume = false;
      await refreshReviews(true);
      if (options.cleanupLegacyMarkers === true) runtime.lastMarkerCleanup = await cleanupLegacyMarkers();
      runtime.scanDirty = false;
      scan();
      if (!runtime.pending.size) await persist();
    } catch (error) {
      fail2(error);
    } finally {
      runtime.busy = false;
      if (runtime.pending.size || runtime.indexDirty) schedule();
    }
    return runtime.status();
  }
  runtime.start = (options = {}) => {
    const epoch = runtime.epoch;
    return serial(async () => {
      if (runtime.holds.size || epoch !== runtime.epoch || resetPending()) {
        if (resetPending()) clearTimer();
        return runtime.status();
      }
      runtime.stopped = false;
      return restart(options);
    });
  };
  runtime.pause = (reason = "Administrative transaction") => {
    const token = Object.freeze({ reason: String(reason).slice(0, 160) });
    runtime.holds.add(token);
    runtime.epoch++;
    clearTimer();
    invalidateAll();
    return token;
  };
  runtime.drain = () => serial(() => runtime.status());
  runtime.resume = (token, options = {}) => serial(async () => {
    if (token !== void 0 && !runtime.holds.has(token)) throw new Error("Unknown resource pause token.");
    if (token === void 0 && runtime.holds.size) throw new Error("Resource collection is held by an administrative transaction.");
    runtime.discardHistoryOnResume || (runtime.discardHistoryOnResume = !!options.discardHistory);
    if (token !== void 0) runtime.holds.delete(token);
    if (runtime.holds.size || runtime.stopped || resetPending()) {
      if (resetPending()) clearTimer();
      return runtime.status();
    }
    runtime.epoch++;
    operationEpoch = runtime.epoch;
    clearTimer();
    const discardHistory = runtime.discardHistoryOnResume;
    return restart({ discardHistory });
  });
  runtime.stop = () => {
    runtime.stopped = true;
    runtime.epoch++;
    clearTimer();
    runtime.pending.clear();
    invalidateAll();
  };
  runtime.event = (kind, file, oldPath) => {
    if (runtime.stopped) return;
    let configured;
    try {
      configured = roots();
    } catch (error) {
      fail2(error);
      return;
    }
    const path = file?.path;
    const touches = (target) => path === target || oldPath === target || file instanceof deps.TFolder && kind !== "create" && [path, oldPath].some((parent3) => parent3 && target.startsWith(parent3 + "/"));
    if (touches(configured.index)) {
      runtime.indexDirty = true;
      runtime.indexGeneration++;
      if (!indexWriting) suspendIndexEvidence();
      schedule();
    }
    if (touches(configured.session)) {
      runtime.reviewDirty = true;
      runtime.reviewGeneration++;
      invalidateAll();
      schedule();
    }
    const contentRelated = (value) => value && (value === configured.content || value.startsWith(configured.content + "/") || configured.content.startsWith(value + "/"));
    if (file instanceof deps.TFolder) {
      if (!contentRelated(path) && !contentRelated(oldPath)) return;
      invalidateAll();
      for (const previous of [...runtime.paths.keys()]) {
        if (!vault.getAbstractFileByPath(previous) || oldPath && previous.startsWith(oldPath + "/")) releasePath(previous);
      }
      runtime.scanDirty = true;
      schedule();
      return;
    }
    if (!plugin.isCasePath(path || "") && !plugin.isCasePath(oldPath || "")) return;
    if (oldPath && oldPath !== path) {
      invalidatePath(oldPath);
      releasePath(oldPath);
    }
    const known = runtime.paths.has(path);
    invalidatePath(path);
    if (kind === "delete") releasePath(path);
    else {
      if (!known) {
        invalidateAll();
        runtime.scanDirty = true;
      }
      enqueue(path, file);
    }
    schedule();
  };
  runtime.status = () => ({
    running: !suspended() && !runtime.error,
    paused: runtime.holds.size > 0 || resetPending(),
    stopped: runtime.stopped,
    resetNeedsReview: resetPending(),
    pauseReasons: [...runtime.holds].map((token) => token.reason).concat(resetPending() ? ["Reset recovery requires review"] : []),
    busy: runtime.busy,
    pending: runtime.pending.size,
    error: runtime.error,
    reviewExcluded: runtime.reviewPaths.size,
    reviewPending: runtime.reviewDirty,
    ambiguousIdentities: [...runtime.claims.values()].filter((paths) => paths.size > 1).length,
    ai: "disconnected",
    aliases: runtime.state.aliases.length,
    resources: runtime.collector.resources().map((entry) => ({ ...entry, hidden: runtime.state.hidden.includes(entry.key) }))
  });
  runtime.previewChange = (change) => {
    active();
    let validated;
    if (change.type === "alias") validated = { type: "alias", alias: validateResourceAlias(change.alias) };
    else if (change.type === "remove-alias") {
      const alias = runtime.state.aliases.find((a) => a.section === change.section && resourcePhraseKey(a.raw) === resourcePhraseKey(change.raw));
      if (!alias) throw new Error("This alias is no longer present.");
      validated = { type: "remove-alias", alias };
    } else if (change.type === "visibility" && runtime.collector.catalog.has(change.key)) {
      validated = { type: "visibility", key: change.key, hidden: !!change.hidden };
    } else throw new Error("Invalid resource grooming action.");
    const preview = Object.freeze({
      change: JSON.stringify(validated),
      file: runtime.indexFile,
      text: runtime.indexText,
      path: roots().index,
      rootKey: runtime.rootKey,
      epoch: runtime.epoch
    });
    previews.add(preview);
    return preview;
  };
  runtime.applyChange = (preview) => serial(async () => {
    active();
    if (!preview || !previews.has(preview) || preview.epoch !== runtime.epoch || preview.rootKey !== runtime.rootKey || preview.path !== roots().index || preview.file !== runtime.indexFile || preview.text !== runtime.indexText) throw conflict();
    previews.delete(preview);
    if (preview.file) {
      fileAt(preview.file, preview.path);
      if (await vault.read(preview.file) !== preview.text) throw conflict();
    } else if (vault.getAbstractFileByPath(preview.path)) throw conflict();
    const change = JSON.parse(preview.change), before = runtime.state;
    const next = { ...before, aliases: [...before.aliases], hidden: [...before.hidden] };
    if (change.type === "alias" || change.type === "remove-alias") {
      const alias = validateResourceAlias(change.alias);
      next.aliases = next.aliases.filter((a) => !(a.section === alias.section && (resourcePhraseKey(a.raw) === resourcePhraseKey(alias.raw) || alias.identityKey && a.identityKey === alias.identityKey)));
      if (change.type === "alias") next.aliases.push(alias);
      next.aliases.sort((a, b) => a.section.localeCompare(b.section) || resourcePhraseKey(a.raw).localeCompare(resourcePhraseKey(b.raw)));
      invalidateAll();
    } else {
      next.hidden = next.hidden.filter((key4) => key4 !== change.key);
      if (change.hidden) next.hidden.push(change.key);
    }
    runtime.state = next;
    try {
      await persist();
    } catch (error) {
      runtime.state = before;
      fail2(error);
      throw error;
    }
    if (change.type !== "visibility") {
      runtime.collector = new ResourceCollector({ catalog: runtime.collector.snapshot().catalog, aliases: next.aliases });
      scan();
    }
    return true;
  });
  async function confirm(preview) {
    if (!deps.Modal) throw new Error("Resource confirmation dialog is unavailable.");
    const change = JSON.parse(preview.change);
    return new Promise((resolve) => {
      class Confirmation extends deps.Modal {
        onOpen() {
          const el = this.contentEl;
          el.createEl("h2", { text: "Preview resource library change" });
          el.createEl("pre", { text: JSON.stringify(change, null, 2) });
          el.createEl("p", { text: "This changes the local terminology library or its visibility. Case wording is preserved. Existing library data is backed up. Alias changes recheck current case evidence; they do not establish clinical correctness." });
          el.createEl("p", { text: "Sync changes to the library while this preview is open cancel the save." });
          el.createEl("button", { text: "Cancel" }).onclick = () => this.close();
          el.createEl("button", { text: "Confirm change" }).onclick = () => {
            this.accepted = true;
            this.close();
          };
        }
        onClose() {
          resolve(!!this.accepted);
          this.contentEl.empty();
        }
      }
      new Confirmation(plugin.app).open();
    });
  }
  runtime.render = (el) => {
    el.empty();
    const status = runtime.status();
    el.createEl("h2", { text: "Resource library" });
    el.createEl("p", { text: "AI disconnected. Local semantics only. No provider, model, credentials or uploads are configured." });
    el.createEl("p", { text: "Resources are learned from Mayo, Basin, Sutures and Dressings in current case notes. Examples, internal notes, Needs Review sections and cases awaiting migration review are excluded. Verified means two distinct current parent notes, not clinical validation." });
    el.createEl("p", { text: status.error || (status.paused ? "Collection paused: " + status.pauseReasons.join(", ") : status.running ? (status.busy ? "Collecting" : "Ready") + " · " + status.pending + " queued · " + status.aliases + " aliases · " + status.ambiguousIdentities + " duplicate identities excluded · " + status.reviewExcluded + " awaiting migration review" : "Collection stopped") });
    const actions = el.createDiv({ cls: "cst-actions" });
    const refresh = actions.createEl("button", { text: "Refresh status" });
    refresh.onclick = () => runtime.render(el);
    const resume = actions.createEl("button", { text: "Resume / rescan cases" });
    resume.disabled = status.paused;
    const message = el.createEl("p", { text: "" });
    const perform = async (fn) => {
      try {
        await fn();
        runtime.render(el);
      } catch (error) {
        message.textContent = error.message || "Resource change could not be saved.";
      }
    };
    resume.onclick = () => {
      const preview = el.createDiv();
      preview.createEl("p", { text: "Rescan reads eligible case notes and updates the Backend resource library." });
      preview.createEl("button", { text: "Cancel" }).onclick = () => preview.remove();
      preview.createEl("button", { text: "Confirm rescan" }).onclick = () => perform(() => runtime.start());
    };
    el.createEl("h3", { text: "Local semantics" });
    const form = el.createDiv();
    function input(label, value = "") {
      const wrapper = form.createEl("label", { text: label + " " });
      const field = wrapper.createEl("input", { type: "text", value });
      field.setAttribute("aria-label", label);
      return field;
    }
    const raw = input("Alias / resource phrase");
    const canonical = input("Canonical name");
    const section = form.createEl("select");
    section.setAttribute("aria-label", "Source section");
    for (const name of sectionNames) section.createEl("option", { text: name, value: name });
    const kind = form.createEl("select");
    kind.setAttribute("aria-label", "Semantic kind");
    for (const name of kinds) kind.createEl("option", { text: name, value: name });
    const save = form.createEl("button", { text: "Preview alias" });
    save.onclick = () => perform(async () => {
      const preview = runtime.previewChange({ type: "alias", alias: {
        raw: raw.value,
        section: section.value,
        kind: kind.value,
        approved: true,
        suggestion: { label: canonical.value }
      } });
      if (await confirm(preview)) await runtime.applyChange(preview);
    });
    for (const alias of runtime.state.aliases) {
      const row = el.createDiv();
      row.createEl("span", { text: alias.raw + " → " + alias.suggestion.label + " · " + alias.kind + " · " + alias.section + " " });
      row.createEl("button", { text: "Edit" }).onclick = () => {
        raw.value = alias.raw;
        canonical.value = alias.suggestion.label;
        section.value = alias.section;
        kind.value = alias.kind;
        raw.focus();
      };
      row.createEl("button", { text: "Preview removal" }).onclick = () => perform(async () => {
        const preview = runtime.previewChange({ type: "remove-alias", raw: alias.raw, section: alias.section });
        if (await confirm(preview)) await runtime.applyChange(preview);
      });
    }
    el.createEl("h3", { text: "Collected candidates" });
    const search = el.createEl("input", { type: "search", placeholder: "Filter resources" });
    search.setAttribute("aria-label", "Filter resources");
    const results = el.createDiv();
    const draw = () => {
      results.empty();
      const entries = status.resources.filter((entry) => resourcePhraseKey(entry.label).includes(resourcePhraseKey(search.value || "")));
      results.createEl("p", { text: entries.length + " candidates · showing up to 100; filter to narrow the list" });
      for (const entry of entries.slice(0, 100)) {
        const row = results.createEl("details");
        row.createEl("summary", { text: entry.label + " · " + entry.kind + " · " + entry.status + " (" + entry.noteCount + " current notes)" + (entry.hidden ? " · hidden" : "") });
        row.createEl("p", { text: "Historical parent notes: " + entry.historicalNoteCount });
        for (const source of entry.sources) row.createEl("p", { text: source.path + " · " + source.section + " · " + (source.current ? "current" : "historical") + " · " + source.raw });
        row.createEl("button", { text: entry.hidden ? "Preview restore" : "Preview hide" }).onclick = () => perform(async () => {
          const preview = runtime.previewChange({ type: "visibility", key: entry.key, hidden: !entry.hidden });
          if (await confirm(preview)) await runtime.applyChange(preview);
        });
        row.createEl("button", { text: "Groom terminology" }).onclick = () => {
          raw.value = entry.raw;
          canonical.value = entry.label;
          section.value = entry.section;
          kind.value = entry.kind;
          raw.focus();
        };
      }
    };
    search.oninput = draw;
    draw();
  };
  return runtime;
}
function installResourceFeatures(plugin, deps) {
  if (plugin.resourceFeatures) return plugin.resourceFeatures;
  const runtime = createResourceRuntime(plugin, deps);
  plugin.resourceFeatures = runtime;
  plugin.renderResourceAdmin = (el) => runtime.render(el);
  plugin.startResourceCollection = (options) => runtime.start(options);
  plugin.cleanupResourceMarkers = () => runtime.cleanupLegacyMarkers();
  plugin.stripResourceMarkers = stripResourceMarkers;
  plugin.onResourceFileEvent = (kind, file, oldPath) => runtime.event(kind, file, oldPath);
  plugin.stopResourceCollection = () => runtime.stop();
  plugin.pauseResourceCollection = (reason) => runtime.pause(reason);
  plugin.drainResourceCollection = () => runtime.drain();
  plugin.resumeResourceCollection = (token, options) => runtime.resume(token, options);
  plugin.register?.(() => runtime.stop());
  return runtime;
}

// src/ui-preferences.mjs
var UI_PREFERENCES_REVISION = 1;
var MOBILE_TOOLBAR_COMMANDS = Object.freeze([
  "editor:undo",
  "editor:redo",
  "editor:attach-file",
  "editor:set-heading",
  "editor:toggle-bold",
  "editor:toggle-italics",
  "editor:toggle-strikethrough",
  "editor:toggle-highlight",
  "editor:toggle-bullet-list",
  "editor:toggle-numbered-list",
  "editor:indent-list",
  "editor:unindent-list",
  "editor:configure-toolbar"
]);
var STATE_KEY = "cst-notes-ui-preferences";
function mobileNavigationReady(app, pluginId = "cst-notes") {
  if (typeof app.vault?.getConfig !== "function") return false;
  const command = `${pluginId}:open-app`, ribbon = `${pluginId}:CST: Open App`;
  return app.vault.getConfig("mobilePullAction") === command && app.vault.getConfig("mobileQuickRibbonItem") === ribbon && typeof app.commands?.commands?.[command]?.callback === "function" && !!app.workspace?.leftRibbon?.items?.some((item) => item.id === ribbon && !item.hidden && typeof item.callback === "function");
}
async function applyUIPreferences(app, { mobile = false, pluginId = "cst-notes", revision = UI_PREFERENCES_REVISION } = {}) {
  const result = { updates: false, mobile: false, unsupported: [] };
  const saved = app.loadLocalStorage?.(STATE_KEY) || {};
  const next = { ...saved };
  try {
    if (saved.updates !== revision) {
      if (typeof app.plugins?.setAutomaticUpdateCheck !== "function") throw new Error("Automatic update checks");
      await app.plugins.setAutomaticUpdateCheck(true);
      if (app.plugins.autoCheckForUpdates !== true) throw new Error("Automatic update checks");
      next.updates = revision;
    }
    result.updates = app.plugins?.autoCheckForUpdates === true;
  } catch {
    result.unsupported.push("Automatic update checks");
  }
  if (mobile) {
    try {
      if (saved.mobile !== revision) {
        if (typeof app.vault?.setConfig !== "function" || typeof app.vault?.getConfig !== "function") throw new Error("Mobile preferences");
        const command = `${pluginId}:open-app`, ribbon = `${pluginId}:CST: Open App`;
        const leftRibbon = app.workspace?.leftRibbon;
        if (!app.commands?.commands?.[command] || !leftRibbon?.items?.some((item) => item.id === ribbon)) throw new Error("CST Notes shortcuts");
        if (typeof leftRibbon.onChange !== "function") throw new Error("Ribbon preference persistence");
        const commands = MOBILE_TOOLBAR_COMMANDS.filter((id2) => app.commands?.commands?.[id2]);
        const values = {
          mobilePullAction: command,
          mobileQuickRibbonItem: ribbon,
          autoFullScreen: true,
          floatingNavigation: true,
          slidingSidebar: true,
          mobileToolbarCommands: commands
        };
        for (const [key4, value] of Object.entries(values)) {
          await app.vault.setConfig(key4, value);
          if (JSON.stringify(app.vault.getConfig(key4)) !== JSON.stringify(value)) throw new Error(key4);
        }
        const items = leftRibbon.items;
        for (const title of ["CST: New Case", "CST: Open App", "CST: Open Admin"]) {
          const item = items.find((item2) => item2.id === `${pluginId}:${title}`);
          if (item) item.hidden = false;
        }
        await leftRibbon.onChange(true);
        app.mobileNavbar?.updateRibbonMenuItem?.();
        app.mobileToolbar?.update?.();
        if (!mobileNavigationReady(app, pluginId)) throw new Error("CST Notes shortcuts");
        next.mobile = revision;
      }
      result.mobile = mobileNavigationReady(app, pluginId);
    } catch {
      result.unsupported.push("Mobile navigation preferences");
    }
  }
  if (typeof app.saveLocalStorage === "function") app.saveLocalStorage(STATE_KEY, next);
  return result;
}
function formatStorageBytes(value) {
  const bytes2 = Math.max(0, Number(value) || 0), units = ["B", "KB", "MB", "GB"];
  let n = bytes2, i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i ? Number(n.toFixed(2)) : Math.round(n)} ${units[i]}`;
}
function exitSingleLineOnEnter(event) {
  if (event.key !== "Enter" || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return false;
  const input = event.target;
  if (String(input?.tagName || "").toLowerCase() !== "input" || !["text", "search", "number", "email", "url", "tel", "password"].includes(input.type || "text")) return false;
  if (input.getAttribute?.("aria-expanded") === "true") return false;
  event.preventDefault();
  input.blur();
  return true;
}

// src/admin-workspace.mjs
var ADMIN_DEVELOPER_PAGES = Object.freeze([
  "system",
  "metadata",
  "graph",
  "repair",
  "migrations",
  "diagnostics",
  "reset",
  "resources"
]);
var ADMIN_DEVELOPER_RENDERERS = Object.freeze({
  renderSystem: "system",
  renderMetadataAdmin: "metadata",
  renderGraphAdmin: "graph",
  renderRepairAdmin: "repair",
  renderMigrations: "migrations",
  renderResourceAdmin: "resources"
});
var ADMIN_DEVELOPER_COMMANDS = Object.freeze([
  "repair-backend",
  "rebuild-graph",
  "migrate-v011-header",
  "migrate-v012-mobile"
]);
var ADMIN_INTERNAL_ACTIONS = /* @__PURE__ */ new Set([
  "Repair Entire Backend",
  "Rebuild Graph",
  "Rebuild Generated Graph",
  "Apply Current Schema Safely",
  "Save Current Schema State"
]);
var ADMIN_INTERNAL_MIGRATIONS = /* @__PURE__ */ new Set([
  "v0.1.1-live-surgeon-header",
  "v0.1.2-mobile-registry-sidebar",
  "v0.1.3-app-migration-workspace"
]);
var ADMIN_RESET_CONFIRMATIONS = Object.freeze([
  "I have waited for Sync to finish on every device.",
  "I have reviewed the exact two CST roots below.",
  "Every file inside these roots, including attachments, will be archived.",
  "The active case database will be emptied.",
  "The active surgeon registry will be archived.",
  "Templates, resources, and backend history in these roots will be archived.",
  "I understand that other devices may sync these moves.",
  "I know the recovery archive location shown below.",
  "I will review recovery conflicts without overwriting newer content.",
  "I confirm this exact CST-only reset now."
]);
function validateAdminPath(value) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 220 || /[\\:\x00-\x1f<>"|?*]/.test(value) || value.startsWith("/") || value.split("/").some((p) => !p || p === "." || p === ".." || p.startsWith(".") || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new Error("Unsafe CST path: " + String(value));
  }
  return value;
}
function within(path, root) {
  return path === root || path.startsWith(root + "/");
}
function overlap(a, b) {
  return within(a.toLowerCase(), b.toLowerCase()) || within(b.toLowerCase(), a.toLowerCase());
}
function parent(path) {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}
function basename(path) {
  return path.split("/").at(-1);
}
function validateAdminRoots(settings, archiveRoot = "CST Recovery Archive") {
  const content = validateAdminPath(settings.contentRoot);
  const backend = validateAdminPath(settings.backendRoot);
  const archive = validateAdminPath(archiveRoot);
  if (overlap(content, backend) || overlap(content, archive) || overlap(backend, archive)) {
    throw new Error("CST content, backend, and recovery roots must be separate, non-nested folders.");
  }
  return { content, backend, archive };
}
function createAdminConfirmationSequence() {
  let count = 0, cancelled = false;
  return {
    get count() {
      return count;
    },
    get complete() {
      return !cancelled && count === ADMIN_RESET_CONFIRMATIONS.length;
    },
    confirm(expectedStep) {
      if (cancelled || count >= ADMIN_RESET_CONFIRMATIONS.length || expectedStep !== count) {
        throw new Error("Confirmation expired; start a new reset preview.");
      }
      count++;
    },
    cancel() {
      cancelled = true;
    }
  };
}
function installAdminWorkspace(plugin, deps) {
  if (plugin.adminWorkspace) return plugin.adminWorkspace;
  const { TFile: TFile2, TFolder: TFolder2, Modal: Modal2, parseFrontmatterObject: parseFrontmatterObject2 } = deps;
  const vault = plugin.app.vault;
  const plans = /* @__PURE__ */ new WeakSet(), guardedViews = /* @__PURE__ */ new Map();
  let busy = false, phase = "idle", initialization = null, modeSaving = false;
  let resetNeedsReview = plugin.settings.resetNeedsReview === true;
  const needsResetReview = () => resetNeedsReview || plugin.settings.resetNeedsReview === true;
  const isDeveloper = () => plugin.settings.developerMode === true;
  const roots = () => validateAdminRoots(plugin.settings, deps.resetArchiveRoot);
  const path = (value) => {
    validateAdminPath(value);
    deps.validatePortableVaultPath?.(value, "Admin workspace path");
    return value;
  };
  const get = (p) => vault.getAbstractFileByPath(p);
  const isFile = (f) => f instanceof TFile2;
  const isFolder = (f) => f instanceof TFolder2;
  const assertObject = (object2, expected) => {
    if (!object2 || object2.path !== expected || get(expected) !== object2) throw new Error(`Sync changed or replaced ${expected}. Preview again.`);
  };
  const files = () => vault.getFiles();
  const occupied = (p) => !!get(p) || vault.getAllLoadedFiles().some((f) => f.path.toLowerCase() === p.toLowerCase());
  async function capture(file) {
    const expected = path(file.path);
    assertObject(file, expected);
    const binary = file.extension !== "md" && file.extension !== "json";
    const content = binary ? new Uint8Array(await vault.readBinary(file)) : await vault.read(file);
    assertObject(file, expected);
    return { object: file, path: expected, binary, content };
  }
  function equal3(a, b) {
    return typeof a === "string" ? a === b : a.length === b.length && a.every((v, i) => v === b[i]);
  }
  async function check(entry, at = entry.path) {
    assertObject(entry.object, at);
    if (isFile(entry.object)) {
      const current = entry.binary ? new Uint8Array(await vault.readBinary(entry.object)) : await vault.read(entry.object);
      assertObject(entry.object, at);
      if (!equal3(entry.content, current)) throw new Error(`Content changed at ${at}. All detected content was retained.`);
    }
  }
  async function inventory(root) {
    const object2 = get(root);
    if (!isFolder(object2)) throw new Error(`Expected CST folder: ${root}`);
    const entries = [];
    const seen = /* @__PURE__ */ new Set();
    const walk = async (item) => {
      if (seen.has(item) || !within(item.path, root)) throw new Error("CST folder inventory is inconsistent. Wait for Sync.");
      seen.add(item);
      assertObject(item, item.path);
      entries.push(isFile(item) ? await capture(item) : { object: item, path: path(item.path) });
      if (isFolder(item)) for (const child of [...item.children]) await walk(child);
    };
    await walk(object2);
    return entries;
  }
  async function checkInventory(entries, originalRoot, currentRoot = originalRoot) {
    const live = await inventory(currentRoot);
    if (live.length !== entries.length) throw new Error("CST folder contents changed. Preview again after Sync.");
    for (const entry of entries) await check(entry, currentRoot + entry.path.slice(originalRoot.length));
  }
  function token(plan) {
    for (const name of ["source", "entry", "roots"]) if (plan[name]) Object.freeze(plan[name]);
    for (const name of ["content", "backend", "inventory", "affected"]) if (plan[name]) {
      plan[name].forEach(Object.freeze);
      Object.freeze(plan[name]);
    }
    Object.freeze(plan);
    plans.add(plan);
    return plan;
  }
  function consume(plan, kind) {
    if (!plans.has(plan) || plan.kind !== kind) throw new Error("Use a fresh preview from this workspace.");
    plans.delete(plan);
    if (JSON.stringify(roots()) !== plan.rootKey) throw new Error("Configured CST roots changed. Preview again.");
  }
  async function setDeveloperMode(value) {
    if (modeSaving) throw new Error("A mode preference is already being saved.");
    if (busy) throw new Error("Wait for the current admin operation before changing mode.");
    const settings = plugin.settings, previous = settings.developerMode;
    settings.developerMode = value === true;
    modeSaving = true;
    try {
      await plugin.saveSettings();
      refreshMode();
    } catch (error) {
      if (plugin.settings === settings && settings.developerMode === (value === true)) settings.developerMode = previous;
      throw error;
    } finally {
      modeSaving = false;
    }
  }
  async function exclusive(action, operation = "mutation") {
    if (busy) throw new Error("Another admin operation is running.");
    if (typeof deps.withAdminMutation !== "function") throw new Error("Admin mutations require the host automation pause/serialization hook.");
    busy = true;
    phase = "waiting";
    try {
      return await deps.withAdminMutation(async () => {
        phase = operation;
        return action();
      });
    } finally {
      busy = false;
      phase = "idle";
      initialization = null;
    }
  }
  async function ensureParents(target) {
    const parts = parent(target).split("/");
    let current = "";
    for (const part of parts) {
      if (!part) continue;
      current = current ? current + "/" + part : part;
      path(current);
      if (get(current) && !isFolder(get(current))) throw new Error(`A file blocks ${current}.`);
      if (!get(current)) {
        plugin.markInternalCreate?.(current);
        await vault.createFolder(current);
      }
    }
  }
  function unique(p) {
    if (!occupied(p)) return path(p);
    const dot = p.lastIndexOf(".");
    const ext = dot > p.lastIndexOf("/") ? p.slice(dot) : "";
    const stem = ext ? p.slice(0, -ext.length) : p;
    for (let i = 1; i < 1e4; i++) {
      const candidate = path(`${stem} (recovered ${i})${ext}`);
      if (!occupied(candidate)) return candidate;
    }
    throw new Error("No available recovered destination.");
  }
  function caseParts(target) {
    const r = roots();
    if (!within(target, r.content)) return null;
    const parts = target.slice(r.content.length + 1).split("/");
    return parts.length === 3 && /\.md$/i.test(parts[2]) ? parts : null;
  }
  async function listRecovery() {
    const r = roots(), backup = `${r.backend}/Admin/Backups`;
    const entries = [], problems = [];
    for (const file of files().filter((f) => within(f.path, backup))) {
      try {
        if (file.extension === "json" && parent(file.path) === `${backup}/Deleted Cases`) {
          const manifest = await capture(file), data = JSON.parse(manifest.content);
          if (data.version !== 1 || data.state !== "archived") continue;
          const source = path(data.archive_path), target = path(data.original_path);
          if (parent(source) !== `${backup}/Deleted Cases` || source.replace(/\.md$/, ".json") !== file.path || !caseParts(target)) throw new Error("Invalid deleted-case manifest scope.");
          if (!isFile(get(source))) throw new Error("Archived case file is missing.");
          entries.push({ kind: "deleted-case", source, target, manifest, label: basename(target), category: "Case" });
        } else if (file.name === "Manifest.md") {
          const manifest = await capture(file);
          const blocks = [...manifest.content.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
          if (blocks.length !== 1) throw new Error("Snapshot needs exactly one JSON manifest.");
          const data = JSON.parse(blocks[0][1]);
          if (data.version !== 1 || !Array.isArray(data.files)) throw new Error("Unsupported snapshot version.");
          const seen = /* @__PURE__ */ new Set(), staged = [];
          for (const item of data.files) {
            const relative = path(item.backup_file), target = path(item.original_path);
            if (!relative.startsWith("Files/") || ![r.content, r.backend].some((root) => target !== root && within(target, root)) || within(target, backup)) throw new Error("Snapshot entry is outside supported CST scope.");
            const source = path(parent(file.path) + "/" + relative);
            if (seen.has(target.toLowerCase()) || !isFile(get(source))) throw new Error("Duplicate destination or missing snapshot file.");
            seen.add(target.toLowerCase());
            staged.push({
              kind: "snapshot",
              source,
              target,
              manifest,
              characters: item.characters,
              label: basename(target),
              category: caseParts(target) ? "Case" : "Backend file"
            });
          }
          entries.push(...staged);
        }
      } catch (error) {
        problems.push({ path: file.path, message: error.message });
      }
    }
    for (const file of files().filter((f) => within(f.path, r.archive) && f.name === "Reset Manifest.json")) {
      try {
        const manifest = Object.freeze(await capture(file)), data = JSON.parse(manifest.content);
        if (data.version !== 1 || data.type !== "cst-workspace-reset" || data.content_root !== r.content || data.backend_root !== r.backend || !Array.isArray(data.entries) || !Array.isArray(data.roots) || data.roots.length !== 2) {
          throw new Error("Reset manifest does not match the configured CST roots.");
        }
        const mappings = [
          { original_path: r.content, archive_path: parent(file.path) + "/Content" },
          { original_path: r.backend, archive_path: parent(file.path) + "/Backend" }
        ];
        if (JSON.stringify(data.roots) !== JSON.stringify(mappings)) throw new Error("Invalid reset root mapping.");
        const seen = /* @__PURE__ */ new Set(), staged = [];
        for (const item of data.entries) {
          const target = path(item.original_path), mapping = mappings.find((m) => within(target, m.original_path));
          if (!mapping || !["folder", "file"].includes(item.kind) || seen.has(target.toLowerCase())) throw new Error("Invalid or duplicated reset manifest entry.");
          seen.add(target.toLowerCase());
          const source = path(mapping.archive_path + target.slice(mapping.original_path.length));
          const object2 = get(source);
          if (!object2 || (item.kind === "folder" ? !isFolder(object2) : !isFile(object2))) throw new Error("Reset archive has missing or replaced content.");
          const depth = target.slice(r.content.length + 1).split("/").length;
          const category = item.kind === "folder" && target !== r.content && within(target, r.content) ? depth === 1 ? "Specialty" : depth === 2 ? "Surgeon" : "Backend folder" : item.kind === "file" && caseParts(target) ? "Case" : item.kind === "folder" ? "Backend folder" : "Backend file";
          staged.push({
            kind: item.kind === "folder" ? "reset-folder" : "reset-file",
            source,
            target,
            manifest,
            label: basename(target),
            category
          });
        }
        for (const mapping of mappings) {
          const actual = await inventory(mapping.archive_path);
          const mapped = staged.filter((e) => within(e.source, mapping.archive_path));
          if (actual.length !== mapped.length || actual.some((e) => !mapped.some((m) => m.source === e.path))) throw new Error("Reset archive inventory changed since its manifest was recorded.");
        }
        entries.push(...staged);
      } catch (error) {
        problems.push({ path: file.path, message: error.message });
      }
    }
    return { entries, problems };
  }
  async function previewRecovery(entry) {
    const available = await listRecovery();
    const trusted = available.entries.find((e) => e.source === entry.source && e.target === entry.target && e.kind === entry.kind);
    if (!trusted) throw new Error("Recovery manifest is no longer available or valid.");
    if (!["Case", "Specialty", "Surgeon"].includes(trusted.category) && !isDeveloper()) throw new Error("Backend recovery requires Developer mode.");
    const folder = trusted.kind === "reset-folder";
    const normal = ["Case", "Specialty", "Surgeon"].includes(trusted.category);
    const target = normal ? unique(trusted.target) : trusted.target;
    if (occupied(target)) throw new Error("Backend target exists. Use purpose-specific repair; both versions were preserved.");
    const entries = folder ? await inventory(trusted.source) : [await capture(get(trusted.source))];
    if (trusted.characters !== void 0 && entries[0].content.length !== trusted.characters) throw new Error("Snapshot length differs from its manifest.");
    const identity = normal ? await prepareRecoveryIdentity(trusted, entries, target) : {};
    return token({
      kind: folder ? "recovery-folder" : "recovery",
      rootKey: JSON.stringify(roots()),
      entry: trusted,
      ...folder ? { inventory: entries } : { source: entries[0] },
      target,
      ...identity
    });
  }
  function recoveredText(text, fields) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    if (!match) throw new Error("Archived case needs a valid frontmatter block.");
    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    let header = match[1];
    for (const [key4, value] of Object.entries(fields)) {
      header = header.split(/\r?\n/).filter((line) => !new RegExp("^" + key4 + "\\s*:").test(line)).join(newline);
      header += newline + key4 + ": " + JSON.stringify(value);
    }
    return "---" + newline + header + newline + "---" + newline + text.slice(match[0].length);
  }
  async function prepareRecoveryIdentity(entry, entries, target) {
    const changes = /* @__PURE__ */ new Map(), restoredTexts = /* @__PURE__ */ new Map();
    let registry = null, savedRegistry = null, savedRecords = null;
    const registryPath = plugin.surgeonRegistryPath?.();
    if (registryPath && isFile(get(registryPath))) registry = Object.freeze(await capture(get(registryPath)));
    const activeIds = /* @__PURE__ */ new Set();
    for (const file of plugin.allCaseFiles()) activeIds.add(parseFrontmatterObject2(await vault.read(file)).cst_id);
    const batchIds = /* @__PURE__ */ new Set();
    async function savedRecord(oldParts) {
      if (entry.kind === "deleted-case") return JSON.parse(entry.manifest.content).surgeon_record;
      if (!entry.kind.startsWith("reset-")) return null;
      if (!savedRegistry) {
        if (!registryPath) throw new Error("Surgeon registry path is unavailable.");
        const savedPath = path(parent(entry.manifest.path) + "/Backend" + registryPath.slice(roots().backend.length));
        if (!isFile(get(savedPath))) throw new Error("Archived surgeon registry is missing.");
        savedRegistry = Object.freeze(await capture(get(savedPath)));
        const parsed = plugin.parseSurgeonRegistryText(savedRegistry.content);
        if (parsed.invalid) throw new Error("Archived surgeon registry is invalid.");
        savedRecords = parsed.registry.surgeons;
      }
      return savedRecords[plugin.surgeonKey(oldParts[0], oldParts[1])];
    }
    async function rememberSurgeon(oldParts, parts, expectedId) {
      const recipient = await plugin.getSurgeonData(parts[0], parts[1], { createIfMissing: false });
      if (recipient?.cst_id && recipient.cst_id !== expectedId) throw new Error("The recipient identity differs; recover its surgeon folder under a recovered name.");
      if (recipient?.cst_id) return;
      const record = await savedRecord(oldParts);
      if (!record || record.cst_id !== expectedId || !registry) throw new Error("Restore the matching surgeon registry first; saved identity is unavailable.");
      const data = plugin.adminRegistryRecord(record, parts[0], parts[1]);
      const currentRegistry = plugin.parseSurgeonRegistryText(registry.content);
      if (currentRegistry.invalid || Object.values(currentRegistry.registry.surgeons).some((r) => r.cst_id === expectedId)) throw new Error("Archived surgeon identity is already active elsewhere or current registry is invalid.");
      const key4 = plugin.surgeonKey(parts[0], parts[1]), previous = changes.get(key4);
      if (previous && previous.data.cst_id !== data.cst_id) throw new Error("Conflicting archived surgeon identities.");
      changes.set(key4, Object.freeze({ specialty: parts[0], surgeon: parts[1], expected: null, data: Object.freeze(data) }));
    }
    for (const item of entries.filter((e) => isFile(e.object))) {
      const original = entry.target + item.path.slice(entry.source.length);
      const destination = target + item.path.slice(entry.source.length);
      const oldParts = caseParts(original), parts = caseParts(destination);
      if (!oldParts) continue;
      const fm = parseFrontmatterObject2(item.content);
      if (!parts || fm.cst_type !== "case" || !fm.cst_id || !fm.surgeon_id || fm.specialty !== oldParts[0] || fm.surgeon !== oldParts[1]) throw new Error("Archive identity does not match its source hierarchy.");
      if (activeIds.has(fm.cst_id) || batchIds.has(fm.cst_id)) throw new Error("This case identity is already active or duplicated in the archive. Recover individual missing cases.");
      batchIds.add(fm.cst_id);
      await rememberSurgeon(oldParts, parts, fm.surgeon_id);
      if (parts[0] !== oldParts[0] || parts[1] !== oldParts[1]) {
        restoredTexts.set(item.path, recoveredText(item.content, {
          specialty: parts[0],
          surgeon: parts[1],
          graph_parent: "[[" + plugin.surgeonGraphPath(parts[0], parts[1]).replace(/\.md$/, "") + "|" + parts[1] + "]]"
        }));
      }
    }
    if (entry.kind === "reset-folder") for (const item of entries.filter((e) => isFolder(e.object))) {
      const original = entry.target + item.path.slice(entry.source.length);
      const oldParts = caseParts(original + "/_probe.md");
      if (!oldParts) continue;
      const destination = target + item.path.slice(entry.source.length), parts = caseParts(destination + "/_probe.md");
      if (!parts) throw new Error("Recovered surgeon folder is outside the case hierarchy.");
      if (typeof plugin.parseSurgeonRegistryText !== "function") continue;
      const saved = await savedRecord(oldParts);
      if (!saved?.cst_id) throw new Error("Archived surgeon folder has no saved profile.");
      await rememberSurgeon(oldParts, parts, saved.cst_id);
    }
    if (registry) await check(registry);
    return { registry, savedRegistry, changes: Object.freeze([...changes.values()]), restoredTexts: Object.freeze(Object.fromEntries(restoredTexts)) };
  }
  async function prepareRecoveryWrite(plan) {
    if (["Case", "Specialty", "Surgeon"].includes(plan.entry.category)) {
      const latest = await prepareRecoveryIdentity(plan.entry, plan.inventory || [plan.source], plan.target);
      if (JSON.stringify(latest.changes) !== JSON.stringify(plan.changes)) throw new Error("Recovery identity plan changed. Preview again.");
    }
    if (plan.registry) await check(plan.registry);
    if (plan.savedRegistry) await check(plan.savedRegistry);
    if (plan.changes?.length) {
      await plugin.snapshotFiles("admin-restore-surgeon-records", [plan.registry.object]);
      await check(plan.registry);
      if (plan.savedRegistry) await check(plan.savedRegistry);
    }
  }
  async function commitRecoveredProfiles(plan) {
    if (!plan.changes?.length) return;
    await check(plan.registry);
    if (plan.savedRegistry) await check(plan.savedRegistry);
    const expected = plugin.parseSurgeonRegistryText(plan.registry.content);
    await plugin.mutateSurgeonRegistry((registry) => {
      if (JSON.stringify(registry) !== JSON.stringify(expected.registry)) throw new Error("Surgeon registry changed during restoration; copied files and archive were retained.");
      for (const change of plan.changes) registry.surgeons[plugin.surgeonKey(change.specialty, change.surgeon)] = { ...change.data };
    }, { create: false });
  }
  async function restore(plan) {
    return exclusive(async () => {
      if (plan.kind === "recovery-folder") return restoreFolder(plan);
      consume(plan, "recovery");
      if (plan.entry.category !== "Case" && !isDeveloper()) throw new Error("Developer mode is required.");
      await check(plan.entry.manifest);
      await check(plan.source);
      if (occupied(plan.target)) throw new Error("Recovery destination changed after preview.");
      await prepareRecoveryWrite(plan);
      await ensureParents(plan.target);
      await check(plan.entry.manifest);
      await check(plan.source);
      if (occupied(plan.target)) throw new Error("Sync occupied the recovery destination.");
      const body = plan.restoredTexts?.[plan.source.path] ?? plan.source.content;
      const cleanBody = !plan.source.binary && plugin.stripResourceMarkers ? plugin.stripResourceMarkers(body) : body;
      const imagePlan = !plan.source.binary && /\.md$/i.test(plan.target) ? await plugin.attachmentRecovery?.prepareRestore({ text: cleanBody, originalPath: plan.entry.target, targetPath: plan.target }) : null;
      const restoredContent = imagePlan?.text ?? cleanBody;
      await imagePlan?.assertUnchanged();
      await check(plan.entry.manifest);
      await check(plan.source);
      if (occupied(plan.target)) throw new Error("Sync occupied the recovery destination during image recovery.");
      plugin.markInternalCreate?.(plan.target);
      const restored = plan.source.binary ? await vault.createBinary(plan.target, plan.source.content.slice().buffer) : await vault.create(plan.target, restoredContent);
      await check({ ...plan.source, content: restoredContent, object: restored }, plan.target);
      await imagePlan?.assertUnchanged();
      await commitRecoveredProfiles(plan);
      plugin.scheduleGraphRebuild?.(250);
      return restored;
    });
  }
  async function restoreFolder(plan) {
    consume(plan, "recovery-folder");
    if (!["Specialty", "Surgeon"].includes(plan.entry.category) && !isDeveloper()) throw new Error("Developer mode is required.");
    await check(plan.entry.manifest);
    await checkInventory(plan.inventory, plan.entry.source);
    if (occupied(plan.target)) throw new Error("Recovery folder destination changed after preview.");
    await prepareRecoveryWrite(plan);
    const created = [];
    try {
      for (const entry of plan.inventory) {
        const destination = path(plan.target + entry.path.slice(plan.entry.source.length));
        await check(plan.entry.manifest);
        await check(entry);
        await ensureParents(destination);
        await check(entry);
        if (occupied(destination)) throw new Error("Sync occupied " + destination);
        plugin.markInternalCreate?.(destination);
        if (isFolder(entry.object)) await vault.createFolder(destination);
        else {
          const body = plan.restoredTexts?.[entry.path] ?? entry.content;
          const cleanBody = !entry.binary && plugin.stripResourceMarkers ? plugin.stripResourceMarkers(body) : body;
          const imagePlan = !entry.binary && /\.md$/i.test(destination) ? await plugin.attachmentRecovery?.prepareRestore({ text: cleanBody, originalPath: plan.entry.target + entry.path.slice(plan.entry.source.length), targetPath: destination }) : null;
          const restoredContent = imagePlan?.text ?? cleanBody;
          await imagePlan?.assertUnchanged();
          await check(entry);
          await check(plan.entry.manifest);
          if (occupied(destination)) throw new Error("Sync occupied " + destination);
          const file = entry.binary ? await vault.createBinary(destination, entry.content.slice().buffer) : await vault.create(destination, restoredContent);
          await check({ ...entry, content: restoredContent, object: file }, destination);
          await imagePlan?.assertUnchanged();
        }
        created.push(destination);
      }
      await checkInventory(plan.inventory, plan.entry.source);
      await commitRecoveredProfiles(plan);
      plugin.scheduleGraphRebuild?.(250);
      return { path: plan.target, created };
    } catch (error) {
      throw new Error(error.message + " " + created.length + " restored items retained; original archive remains at " + plan.entry.source + ". Review before retrying.");
    }
  }
  async function previewRepair(kind = "backend") {
    if (!isDeveloper() || !["backend", "graph"].includes(kind)) throw new Error("Choose a supported repair in Developer mode.");
    if (!deps.withAdminMutation) throw new Error("Repair requires the host automation pause/serialization hook.");
    if (!await plugin.quickStructureCheck()) throw new Error("Wait for Sync and verify the complete CST structure before repair.");
    const r = roots(), targets = /* @__PURE__ */ new Map();
    for (const file of [
      ...plugin.allCaseFiles(),
      ...plugin.getSurgeonProfiles(),
      ...files().filter((f) => within(f.path, r.backend + "/_Graph")),
      get(plugin.surgeonRegistryPath())
    ]) {
      if (isFile(file)) targets.set(file.path, file);
    }
    const affected = [];
    for (const file of targets.values()) affected.push(await capture(file));
    const content = await inventory(r.content);
    const graphPaths = files().filter((f) => within(f.path, r.backend + "/_Graph")).map((f) => f.path).sort().join("\n");
    return token({ kind: "repair", repairKind: kind, affected, content, graphPaths, rootKey: JSON.stringify(r), roots: r });
  }
  async function repair(plan) {
    return exclusive(async () => {
      if (!isDeveloper()) throw new Error("Developer mode is required.");
      consume(plan, "repair");
      await checkInventory(plan.content, plan.roots.content);
      for (const entry of plan.affected) await check(entry);
      const backupPath = await plugin.snapshotFiles("admin-" + plan.repairKind + "-repair", plan.affected.map((e) => e.object));
      await checkInventory(plan.content, plan.roots.content);
      for (const entry of plan.affected) await check(entry);
      const graphPaths = files().filter((f) => within(f.path, plan.roots.backend + "/_Graph")).map((f) => f.path).sort().join("\n");
      if (graphPaths !== plan.graphPaths) throw new Error("Generated graph targets changed after backup. Preview again.");
      if (plan.repairKind === "graph") await plugin.rebuildGraph();
      else await plugin.repairAll(false);
      return { backupPath };
    });
  }
  async function previewReset() {
    if (!isDeveloper()) throw new Error("Reset requires Developer mode.");
    const r = roots();
    if (typeof deps.withAdminMutation !== "function") throw new Error("Reset is unavailable until the host connects its automation pause/serialization hook.");
    const content = await inventory(r.content), backend = await inventory(r.backend);
    const marker = get(`${r.backend}/_Config/System.md`);
    if (!isFile(marker) || parseFrontmatterObject2(await vault.read(marker)).cst_type !== "system-manifest") {
      throw new Error("Configured backend is not identified by a CST system manifest.");
    }
    const launcherPath = path(plugin.launcherPath?.() || plugin.settings.launcherPath || "CST App.md");
    if (overlap(launcherPath, r.archive) || overlap(launcherPath, r.content) || overlap(launcherPath, r.backend)) throw new Error("Launcher must be outside the reset and archive roots.");
    if (get(launcherPath) && !isFile(get(launcherPath))) throw new Error("Configured launcher path is occupied by a folder.");
    const launcher = isFile(get(launcherPath)) ? Object.freeze(await capture(get(launcherPath))) : null;
    const archivePath = unique(path(`${r.archive}/Reset-${Date.now()}`));
    for (const [index, entries] of [content, backend].entries()) {
      const source = index ? r.backend : r.content;
      for (const entry of entries) path(`${archivePath}/${index ? "Backend" : "Content"}${entry.path.slice(source.length)}`);
    }
    const plan = token({
      kind: "reset",
      rootKey: JSON.stringify(r),
      roots: r,
      archivePath,
      content,
      backend,
      launcherPath,
      launcher,
      confirmations: createAdminConfirmationSequence()
    });
    await checkInventory(content, r.content);
    await checkInventory(backend, r.backend);
    return plan;
  }
  async function reset(plan) {
    return exclusive(async () => {
      if (!isDeveloper() || !plan.confirmations.complete) throw new Error("Reset needs all ten explicit confirmations in Developer mode.");
      consume(plan, "reset");
      await checkInventory(plan.content, plan.roots.content);
      await checkInventory(plan.backend, plan.roots.backend);
      if (occupied(plan.archivePath)) throw new Error("Reset archive destination is occupied.");
      await persistResetReview(true, {
        contentRoot: plan.roots.content,
        backendRoot: plan.roots.backend,
        archivePath: plan.archivePath,
        startedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      await checkInventory(plan.content, plan.roots.content);
      await checkInventory(plan.backend, plan.roots.backend);
      if (JSON.stringify(roots()) !== plan.rootKey) throw new Error("Configured roots changed while saving the reset pause.");
      if (occupied(plan.archivePath)) throw new Error("Reset archive destination changed while saving the pause.");
      await ensureParents(plan.archivePath);
      plugin.markInternalCreate?.(plan.archivePath);
      await vault.createFolder(plan.archivePath);
      const moved = [];
      const manifest = {
        version: 1,
        type: "cst-workspace-reset",
        created: (/* @__PURE__ */ new Date()).toISOString(),
        content_root: plan.roots.content,
        backend_root: plan.roots.backend,
        roots: [
          { original_path: plan.roots.content, archive_path: plan.archivePath + "/Content" },
          { original_path: plan.roots.backend, archive_path: plan.archivePath + "/Backend" }
        ],
        entries: [...plan.content, ...plan.backend].map((e) => ({ original_path: e.path, kind: isFolder(e.object) ? "folder" : "file" }))
      };
      const manifestPath = plan.archivePath + "/Reset Manifest.json";
      const manifestFile = await vault.create(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      const manifestState = await capture(manifestFile);
      try {
        for (const [index, entries] of [plan.content, plan.backend].entries()) {
          const mapping = manifest.roots[index];
          await check(manifestState);
          await checkInventory(entries, mapping.original_path);
          if (occupied(mapping.archive_path)) throw new Error("Reset target changed during preparation.");
          try {
            await plugin.renameVaultItem(entries[0].object, mapping.archive_path, mapping.original_path);
          } finally {
            if (get(mapping.archive_path) === entries[0].object && entries[0].object.path === mapping.archive_path) moved.push({ mapping, entries });
          }
          await checkInventory(entries, mapping.original_path, mapping.archive_path);
          if (get(mapping.original_path)) throw new Error("Sync recreated a CST root during reset.");
        }
        await check(manifestState);
      } catch (error) {
        const retained = [];
        for (const { mapping, entries } of moved.reverse()) {
          try {
            await checkInventory(entries, mapping.original_path, mapping.archive_path);
            if (occupied(mapping.original_path)) throw new Error("Original path occupied");
            await plugin.renameVaultItem(entries[0].object, mapping.original_path, mapping.archive_path);
          } catch {
            retained.push(mapping.archive_path);
          }
        }
        throw new Error(`${error.message} ${retained.length ? "Recoverable data retained at " + retained.join(", ") : "Moved roots rolled back safely."}`);
      }
      let initialized = false, initializationError = "";
      resetNeedsReview = true;
      const request = Object.freeze({ roots: plan.roots, archivePath: plan.archivePath });
      initialization = { request, plan, manifestState, used: false, complete: false };
      try {
        await (deps.initializeAfterCSTReset ? deps.initializeAfterCSTReset(request) : initializeAfterReset(request));
        if (!initialization.complete) throw new Error("Initializer hook must call initializeAdminReset with this request.");
        await persistResetReview(false, null);
        initialized = true;
      } catch (error) {
        initializationError = error.message;
      } finally {
        initialization = null;
      }
      return { archivePath: plan.archivePath, initialized, initializationError };
    });
  }
  async function persistResetReview(required, review) {
    const settings = plugin.settings, previousReview = settings.resetReview;
    resetNeedsReview = true;
    settings.resetNeedsReview = required;
    settings.resetReview = review;
    const expected = JSON.stringify(settings);
    try {
      await plugin.saveSettings();
      if (plugin.settings !== settings || JSON.stringify(settings) !== expected) throw new Error("Reset review settings changed while saving.");
      resetNeedsReview = required;
    } catch (error) {
      plugin.settings.resetNeedsReview = true;
      if (!plugin.settings.resetReview) plugin.settings.resetReview = previousReview || review;
      if (!required) {
        try {
          await plugin.saveSettings();
        } catch {
          throw new Error(error.message + " The pause could not be re-saved; keep this session open and retry validation when settings can be saved.");
        }
      }
      throw error;
    }
  }
  async function validateResetReview() {
    const r = roots(), review = plugin.settings.resetReview;
    if (!needsResetReview()) throw new Error("No reset review is pending.");
    if (review && (review.contentRoot !== r.content || review.backendRoot !== r.backend)) throw new Error("Restore the configured roots associated with this pending reset before clearing its pause.");
    if (!plugin.settings.initialized) throw new Error("Complete CST setup before validating recovery.");
    for (const root of [r.content, r.backend]) if (!isFolder(get(root))) throw new Error("Restore or initialize the missing CST root: " + root);
    for (const required of [
      r.backend + "/_Config/System.md",
      r.backend + "/_Data/Surgeon Registry.md",
      r.backend + "/_Templates/Cases/_Default.md",
      r.backend + "/_Graph/Specialties.md"
    ]) {
      if (!isFile(get(required))) throw new Error("Complete setup or repair before resuming: " + required + " is missing.");
    }
    const system = parseFrontmatterObject2(await vault.read(get(r.backend + "/_Config/System.md")));
    if (system.cst_type !== "system-manifest" || system.content_root !== r.content || system.backend_root !== r.backend) throw new Error("System manifest does not match the configured CST roots.");
    if (!await plugin.quickStructureCheck({ quiet: true })) throw new Error("Recovery structure is incomplete or still syncing. Complete setup/repair, then validate again.");
    const health = await plugin.scanHealth();
    if (!Array.isArray(health?.issues) || health.issues.length) throw new Error("Recovery health validation found issues. Review Health and complete repair before resuming automation.");
    return health;
  }
  async function previewResetReview() {
    return exclusive(async () => {
      const r = roots(), settingsKey = JSON.stringify(plugin.settings);
      const content = await inventory(r.content), backend = await inventory(r.backend);
      const health = await validateResetReview();
      await checkInventory(content, r.content);
      await checkInventory(backend, r.backend);
      if (settingsKey !== JSON.stringify(plugin.settings)) throw new Error("Settings changed during recovery validation.");
      return token({
        kind: "reset-review",
        rootKey: JSON.stringify(r),
        roots: r,
        content,
        backend,
        settingsKey,
        summary: Object.freeze({ cases: health.cases, surgeons: health.surgeons, specialties: health.specialties })
      });
    }, "validating-recovery");
  }
  async function clearResetReview(plan, { confirmed = false } = {}) {
    if (!confirmed) throw new Error("Explicit recovery review confirmation is required.");
    return exclusive(async () => {
      consume(plan, "reset-review");
      if (plan.settingsKey !== JSON.stringify(plugin.settings)) throw new Error("Reset review or settings changed after validation. Validate again.");
      await checkInventory(plan.content, plan.roots.content);
      await checkInventory(plan.backend, plan.roots.backend);
      await validateResetReview();
      await checkInventory(plan.content, plan.roots.content);
      await checkInventory(plan.backend, plan.roots.backend);
      if (plan.settingsKey !== JSON.stringify(plugin.settings)) throw new Error("Settings changed while confirming recovery.");
      await persistResetReview(false, null);
      try {
        await checkInventory(plan.content, plan.roots.content);
        await checkInventory(plan.backend, plan.roots.backend);
        if (JSON.stringify(roots()) !== plan.rootKey) throw new Error("CST roots changed while clearing the pause.");
      } catch (error) {
        await persistResetReview(true, JSON.parse(plan.settingsKey).resetReview || null);
        throw error;
      }
      return { resumed: true };
    }, "clearing-recovery-pause");
  }
  async function initializeAfterReset(request) {
    const permit = initialization;
    if (!busy || !permit || permit.request !== request || permit.used) throw new Error("Reset initialization requires its current one-use archived plan.");
    permit.used = true;
    phase = "initializing";
    const { plan, manifestState } = permit;
    if (JSON.stringify(roots()) !== plan.rootKey) throw new Error("Configured CST roots changed before initialization.");
    await check(manifestState);
    await checkInventory(plan.content, plan.roots.content, plan.archivePath + "/Content");
    await checkInventory(plan.backend, plan.roots.backend, plan.archivePath + "/Backend");
    if (occupied(plan.roots.content) || occupied(plan.roots.backend)) throw new Error("Both CST roots must be absent before reset initialization.");
    const helpers = [
      "ensureFolder",
      "createDefaultTemplates",
      "ensureAllTemplateVersions",
      "createAdminNotes",
      "ensureSystemManifest",
      "ensureLauncherNote",
      "readSurgeonRegistry",
      "migrateV011",
      "migrateV012",
      "migrateV013",
      "repairAll",
      "upgradeTemplateDefaultsV016",
      "replaceFileTextExpected"
    ];
    for (const name of helpers) if (typeof plugin[name] !== "function") throw new Error("Missing reset creation helper: " + name);
    if (typeof vault.process !== "function") throw new Error("Reset initialization requires atomic vault.process.");
    const settings = plugin.settings, settingsText = JSON.stringify(settings);
    const scoped = Object.create(plugin), created = /* @__PURE__ */ new Map();
    scoped.settings = {
      ...JSON.parse(settingsText),
      initialized: false,
      completedMigrations: [],
      migrationFailures: {},
      templateDefaultsVersion: "",
      templateReviewCompleted: false,
      onboardingCompleted: {},
      onboardingCreatedCases: []
    };
    scoped.registryBootstrapPromise = null;
    scoped.graphRebuildPromise = null;
    scoped.registryMutationQueue = Promise.resolve();
    scoped.migrationSessionQueue = Promise.resolve();
    scoped.saveSettings = async () => {
    };
    const inRoots = (p) => within(p, plan.roots.content) || within(p, plan.roots.backend);
    const allowed = (p) => inRoots(p) || !plan.launcher && p === plan.launcherPath;
    const assertSettings = () => {
      if (plugin.settings !== settings || JSON.stringify(settings) !== settingsText) throw new Error("Settings changed during reset initialization.");
    };
    const verifyCreated = async () => {
      assertSettings();
      for (const item of vault.getAllLoadedFiles().filter((f) => inRoots(f.path))) {
        const entry = created.get(item.path);
        if (!entry) throw new Error("Sync introduced unexpected CST content: " + item.path);
        await check(entry);
      }
      for (const entry of created.values()) await check(entry);
    };
    const owned = async (file) => {
      const entry = created.get(file.path);
      if (!entry || entry.object !== file) throw new Error("Initializer can only update its own newly created files.");
      await check(entry);
      return entry;
    };
    const write = async (method, destination, content) => {
      path(destination);
      assertSettings();
      if (!allowed(destination) || occupied(destination)) throw new Error("Reset creation scope/collision: " + destination);
      await verifyCreated();
      if (occupied(destination)) throw new Error("Sync occupied " + destination);
      plugin.markInternalCreate?.(destination);
      const result = await vault[method](destination, content);
      const object2 = get(destination);
      assertObject(object2, destination);
      if (method === "createFolder") {
        if (!isFolder(object2)) throw new Error("Created folder was replaced.");
        created.set(destination, { object: object2, path: destination });
      } else {
        const entry = { object: object2, path: destination, binary: false, content };
        await check(entry);
        created.set(destination, entry);
      }
      return result || object2;
    };
    const scopedVault = new Proxy(vault, { get(target, key4) {
      if (key4 === "create" || key4 === "createFolder") return (p, text) => write(key4, p, text);
      if (key4 === "process" || key4 === "modify") return async (file, transform) => {
        const expected = await owned(file);
        assertSettings();
        let next;
        await vault.process(file, (current) => {
          assertObject(file, expected.path);
          assertSettings();
          if (current !== expected.content) throw new Error("Sync changed a freshly initialized file.");
          next = key4 === "modify" ? transform : transform(current);
          return next;
        });
        const entry = { ...expected, content: next };
        await check(entry);
        created.set(entry.path, entry);
        return next;
      };
      if (["delete", "trash", "rename", "createBinary", "modifyBinary", "adapter"].includes(key4)) {
        return () => {
          throw new Error("Unsupported mutation during fresh reset initialization.");
        };
      }
      if (["getFiles", "getMarkdownFiles", "getAllLoadedFiles"].includes(key4)) return () => target[key4]().filter((f) => inRoots(f.path));
      const value = target[key4];
      return typeof value === "function" ? value.bind(target) : value;
    } });
    scoped.app = {
      ...plugin.app,
      vault: scopedVault,
      metadataCache: new Proxy(plugin.app.metadataCache || {}, { get(target, key4) {
        if (key4 === "getFileCache") return () => null;
        const value = target[key4];
        return typeof value === "function" ? value.bind(target) : value;
      } }),
      fileManager: { processFrontMatter() {
        throw new Error("Use scoped atomic frontmatter updates.");
      } }
    };
    scoped.patchFrontmatter = async (file, patcher, expectedPath = file.path) => {
      const entry = await owned(file);
      assertObject(file, expectedPath);
      const fm = parseFrontmatterObject2(entry.content);
      patcher(fm);
      const header = Object.entries(fm).map(([key4, value]) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key4)) throw new Error("Unexpected generated metadata key.");
        return key4 + ": " + JSON.stringify(value);
      }).join("\n");
      const body = entry.content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
      await scoped.replaceFileTextExpected(file, entry.content, "---\n" + header + "\n---\n" + body, "Reset metadata changed.", expectedPath);
    };
    scoped.ensureLauncherNote = async () => {
      if (plan.launcher) {
        await check(plan.launcher);
        return plan.launcher.object;
      }
      return plugin.ensureLauncherNote.call(scoped);
    };
    const specialties = deps.defaultSpecialties || plan.content.filter((e) => isFolder(e.object) && e.path.startsWith(plan.roots.content + "/") && !e.path.slice(plan.roots.content.length + 1).includes("/")).map((e) => basename(e.path));
    if (!Array.isArray(specialties) || !specialties.length) throw new Error("Pass defaultSpecialties for an empty CST installation.");
    const folders = [
      plan.roots.content,
      plan.roots.backend,
      ...specialties.map((name) => {
        if (typeof name !== "string" || name.includes("/")) throw new Error("Invalid default specialty.");
        return path(plan.roots.content + "/" + name);
      }),
      ...[
        "Admin/Backend",
        "Admin/Data",
        "Admin/Logs",
        "Admin/Backups",
        "_Graph/Specialties",
        "_Graph/Surgeons",
        "_Templates/Cases/Spine",
        "_Data/Surgeons",
        "_Config",
        ...["Trays", "Instruments", "Sutures", "Dressings", "Medications", "Equipment", "Implants"].map((n) => "References/" + n)
      ].map((p) => path(plan.roots.backend + "/" + p))
    ];
    folders.forEach(path);
    for (const folder of folders) await scoped.ensureFolder(folder);
    for (const name of ["createDefaultTemplates", "ensureAllTemplateVersions", "createAdminNotes", "ensureSystemManifest", "ensureLauncherNote", "readSurgeonRegistry"]) {
      await verifyCreated();
      await scoped[name]();
      await verifyCreated();
    }
    const registry = await scoped.readSurgeonRegistry({ create: false });
    if (registry.invalid || registry.missing || Object.keys(registry.registry?.surgeons || {}).length) throw new Error("Fresh reset registry must be valid and empty.");
    for (const name of ["migrateV011", "migrateV012", "migrateV013", "repairAll", "upgradeTemplateDefaultsV016"]) {
      await verifyCreated();
      await scoped[name](false);
      await verifyCreated();
    }
    await check(manifestState);
    await checkInventory(plan.content, plan.roots.content, plan.archivePath + "/Content");
    await checkInventory(plan.backend, plan.roots.backend, plan.archivePath + "/Backend");
    await verifyCreated();
    if (plan.launcher) await check(plan.launcher);
    scoped.settings.initialized = true;
    assertSettings();
    plugin.settings = scoped.settings;
    try {
      await plugin.saveSettings();
    } catch (error) {
      if (plugin.settings === scoped.settings) plugin.settings = settings;
      throw error;
    }
    permit.complete = true;
    return { initialized: true, archivePath: plan.archivePath };
  }
  async function metrics() {
    const r = roots(), specialties = plugin.getSpecialties();
    const groups = specialties.map((specialty) => ({ specialty, surgeons: plugin.getSurgeons(specialty).length, cases: 0, examples: 0 }));
    let examples = 0, unverified = 0, recent = 0;
    const cases = plugin.allCaseFiles();
    for (const file of cases) {
      const fm = parseFrontmatterObject2(await vault.read(file));
      const context = plugin.caseContext(file), group = groups.find((g) => g.specialty === context?.specialty);
      if (fm.cst_example === true) {
        examples++;
        if (group) group.examples++;
        continue;
      }
      if (group) group.cases++;
      if (!fm.last_verified) unverified++;
      if (Number(file.stat?.mtime) >= Date.now() - 30 * 864e5) recent++;
    }
    const imageRoot = plugin.settings.imageFolder || [parent(r.content), "Images"].filter(Boolean).join("/");
    const managed = files().filter((f) => within(f.path, r.content) || within(f.path, r.backend) || within(f.path, r.archive) || within(f.path, imageRoot));
    const backupRoot = `${r.backend}/Admin/Backups`;
    return {
      groups,
      specialties: specialties.length,
      surgeons: groups.reduce((n, g) => n + g.surgeons, 0),
      cases: cases.length - examples,
      examples,
      unverified,
      recent,
      templates: managed.filter((f) => within(f.path, `${r.backend}/_Templates/Cases`) && f.extension === "md").length,
      resources: managed.filter((f) => within(f.path, `${r.backend}/References`) && f.extension === "md").length,
      images: managed.filter((f) => !within(f.path, backupRoot) && !within(f.path, r.archive) && /^(png|jpe?g|gif|webp|svg|avif|heic)$/i.test(f.extension)).length,
      archivedFiles: managed.filter((f) => within(f.path, backupRoot) || within(f.path, r.archive)).length,
      bytes: managed.reduce((n, f) => n + Number(f.stat?.size || 0), 0)
    };
  }
  function button(el, label, action) {
    const b = el.createEl("button", { text: label });
    b.type = "button";
    b.onclick = async () => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        await action();
      } catch (error) {
        el.createEl("p", { text: error.message, attr: { role: "alert" } });
      } finally {
        b.disabled = false;
      }
    };
    return b;
  }
  async function confirmPreview(title, lines, label = "Confirm restoration") {
    return new Promise((resolve) => {
      class Preview extends Modal2 {
        onOpen() {
          this.contentEl.createEl("h2", { text: title });
          for (const line of lines) this.contentEl.createEl("p", { text: line });
          const cancel = button(this.contentEl, "Cancel", () => this.close());
          button(this.contentEl, label, () => {
            resolve(true);
            this.close();
          });
          cancel.focus();
        }
        onClose() {
          resolve(false);
        }
      }
      new Preview(plugin.app).open();
    });
  }
  async function renderMetrics(el) {
    el.empty();
    el.createEl("h2", { text: "CST metrics" });
    const m = await metrics(), table = el.createEl("table", { cls: "cst-table" });
    for (const [label, value] of [
      ["Specialties", m.specialties],
      ["Surgeons", m.surgeons],
      ["Personal cases", m.cases],
      ["Example cases (excluded)", m.examples],
      ["Cases never verified", m.unverified],
      ["Cases changed in 30 days", m.recent],
      ["Templates", m.templates],
      ["Resources", m.resources],
      ["Images", m.images],
      ["Archived files", m.archivedFiles],
      ["CST storage (including backups)", formatStorageBytes(m.bytes)]
    ]) {
      const row = table.createEl("tr");
      row.createEl("th", { text: label });
      row.createEl("td", { text: String(value) });
    }
    const distribution = el.createEl("table", { cls: "cst-table" });
    const head = distribution.createEl("tr");
    for (const label of ["Specialty", "Surgeons", "Personal cases"]) head.createEl("th", { text: label });
    for (const g of m.groups) {
      const row = distribution.createEl("tr");
      for (const value of [g.specialty, g.surgeons, g.cases]) row.createEl("td", { text: String(value) });
    }
    if (isDeveloper()) button(el, "Inspect structural diagnostics", () => plugin.renderHealth(el));
  }
  async function renderRecovery(el) {
    el.empty();
    el.createEl("h2", { text: "Recovery" });
    if (needsResetReview()) {
      const review = el.createDiv();
      review.createEl("p", { text: "Background automation is paused pending reset recovery review. Restore missing content or finish setup/repair, wait for Sync, then validate the recovered workspace.", attr: { role: "status" } });
      button(review, "Validate and resume automation", async () => {
        const plan = await previewResetReview();
        if (!await confirmPreview("Confirm recovered workspace", [
          "Health and structure checks passed for " + plan.roots.content + " and " + plan.roots.backend + ".",
          plan.summary.cases + " cases and " + plan.summary.surgeons + " surgeons were checked.",
          "Confirm you reviewed the recovered content and waited for Sync. This clears the saved reset pause; archives are retained."
        ], "I reviewed recovery — resume automation")) return;
        await clearResetReview(plan, { confirmed: true });
        await plugin.renderRecoveryWorkspace(el);
      });
    }
    el.createEl("p", { text: "Preview one archived item before restoring. Existing files are preserved. Case conflicts use a recovered filename when the case identity is not already active." });
    const catalog = await listRecovery();
    const visible = catalog.entries.filter((e) => isDeveloper() || ["Case", "Specialty", "Surgeon"].includes(e.category));
    const groups = /* @__PURE__ */ new Map();
    for (const entry of visible) {
      const parts = caseParts(entry.target), key4 = parts ? parts[0] + "/" + parts[1] : entry.category;
      if (!groups.has(key4)) {
        const section = el.createEl("details"), summary = section.createEl("summary", { text: parts ? `${parts[0]} — ${parts[1]}` : entry.category });
        if (deps.setIcon) deps.setIcon(summary.createSpan(), parts ? "users" : "folder-archive");
        groups.set(key4, section);
      }
      const row = groups.get(key4).createDiv();
      const name = row.createEl("span", { text: entry.label });
      if (deps.setIcon) deps.setIcon(name.createSpan(), entry.category === "Specialty" ? "folder-heart" : entry.category === "Surgeon" ? "user-round" : "file-text");
      button(row, "Preview restore", async () => {
        const plan = await previewRecovery(entry);
        if (await confirmPreview("Restore " + entry.label, [
          "Archive: " + (plan.source?.path || plan.entry.source),
          "Destination: " + plan.target,
          plan.changes?.length ? plan.changes.length + " missing surgeon profiles will also be restored from the archive after backing up the current registry." : plan.kind === "recovery-folder" ? plan.inventory.length + " files/folders will be copied. Archive originals and partial restores are retained on conflicts." : "New files will be created. Original archives stay available; restored folder names update only routing metadata."
        ])) {
          await restore(plan);
          await plugin.renderRecoveryWorkspace(el);
        }
      });
    }
    if (!visible.length) el.createEl("p", { text: "No supported archived cases are available." });
    if (catalog.problems.length) el.createEl("p", { text: `${catalog.problems.length} archive manifest(s) need review; their content was retained.` });
    if (isDeveloper()) {
      for (const issue of catalog.problems) el.createEl("p", { text: `${issue.path}: ${issue.message}` });
      el.createEl("h3", { text: "All archived files and folders" });
      const r = roots();
      for (const item of vault.getAllLoadedFiles().filter((f) => within(f.path, `${r.backend}/Admin/Backups`) || within(f.path, r.archive))) {
        const row = el.createDiv();
        row.createEl("span", { text: item.path });
        if (isFile(item)) button(row, "Inspect", () => plugin.openFile(item));
      }
      el.createEl("p", { text: "Unmanifested archives and legacy migration Undo snapshots are inspection-only. Reset archives retain complete folders; restoring them requires matching the original roots and resolving live registry conflicts." });
    }
  }
  async function renderReset(el) {
    el.empty();
    el.createEl("h2", { text: "Protected CST reset" });
    if (!isDeveloper()) {
      el.createEl("p", { text: "Enable Developer mode in Admin to access reset." });
      return;
    }
    const r = roots();
    el.createEl("p", { text: `Scope: ${r.content} and ${r.backend}. Every descendant of these configured folders moves to ${r.archive}. The launcher, plugin settings, and notes outside these roots stay in place.` });
    if (!deps.withAdminMutation) {
      el.createEl("p", { text: "Reset is unavailable until automation pause integration is connected." });
      return;
    }
    button(el, "Preview CST-only reset", async () => {
      const plan = await previewReset();
      class ResetDialog extends Modal2 {
        onOpen() {
          this.draw();
        }
        onClose() {
          plan.confirmations.cancel();
        }
        draw() {
          const host = this.contentEl;
          host.empty();
          const step = plan.confirmations.count;
          host.createEl("h2", { text: `Reset confirmation ${step + 1} of 10` });
          host.createEl("p", { text: ADMIN_RESET_CONFIRMATIONS[step] });
          host.createEl("p", { text: `Move ${r.content} and ${r.backend} (${plan.content.length + plan.backend.length} files/folders) to ${plan.archivePath}.` });
          host.createEl("p", { text: plan.launcher ? "The existing launcher is preserved. A fresh CST base is initialized after archiving." : "A fresh CST base and missing launcher at " + plan.launcherPath + " will be created after archiving." });
          const actions = host.createDiv();
          actions.style.display = "flex";
          actions.style.flexWrap = "wrap";
          actions.style.justifyContent = ["flex-start", "center", "flex-end"][step % 3];
          const cancel = button(actions, "Cancel reset", () => this.close());
          const confirm = button(actions, step === 9 ? "Confirm 10 of 10 — archive CST roots" : `Confirm ${step + 1} of 10`, async () => {
            if (!isDeveloper()) throw new Error("Developer mode was disabled. Cancel and start again.");
            plan.confirmations.confirm(step);
            if (step < 9) {
              this.draw();
              return;
            }
            cancel.disabled = true;
            let result;
            try {
              result = await reset(plan);
            } catch (error) {
              cancel.disabled = false;
              throw error;
            }
            this.close();
            el.createEl("p", { text: `CST roots archived at ${result.archivePath}. ${result.initialized ? "Base tree initialized." : "Base tree requires initialization."} ${result.initializationError}`, attr: { role: "status" } });
          });
          confirm.style.order = String(step % 2 ? -1 : 1);
          cancel.focus();
        }
      }
      new ResetDialog(plugin.app).open();
    });
  }
  function refreshMode() {
    for (const [el, page] of guardedViews) {
      if (el.isConnected === false) guardedViews.delete(el);
      else if (!isDeveloper()) guard(page, el);
    }
  }
  function guard(page, el) {
    if (ADMIN_DEVELOPER_PAGES.includes(page)) guardedViews.set(el, page);
    if (!isDeveloper() && ADMIN_DEVELOPER_PAGES.includes(page)) {
      el.empty();
      el.createEl("p", { text: "This page is available in Developer mode. Open Admin to change the display mode." });
      return false;
    }
    return true;
  }
  async function renderRepair(el, kind = "backend") {
    el.empty();
    if (!guard("repair", el)) return;
    el.createEl("h2", { text: kind === "graph" ? "Repair generated graph" : "Repair managed backend" });
    button(el, kind === "graph" ? "Repair entire backend" : "Repair generated graph", () => renderRepair(el, kind === "graph" ? "backend" : "graph"));
    el.createEl("p", { text: "Rebuild managed targets from specialty/surgeon folders and the surgeon registry. Snapshot current cases, profiles, registry, and graph before repair. Editable templates and substantive case content remain source truth." });
    button(el, "Preview repair and backup", async () => {
      const plan = await previewRepair(kind);
      if (await confirmPreview("Review managed repair", [
        "Repair: " + kind,
        "Snapshot and validate these files:",
        ...plan.affected.map((e) => e.path)
      ], "Confirm backup and repair")) {
        const result = await repair(plan);
        el.createEl("p", { text: "Repair complete. Backup: " + result.backupPath, attr: { role: "status" } });
      }
    });
  }
  async function renderAdmin(el) {
    el.empty();
    el.createEl("h2", { text: "Admin" });
    el.createEl("p", { text: isDeveloper() ? "Developer mode shows internal tools. This display preference is not a security boundary." : "Manage your case workspace and recover archived content." });
    const enabling = !isDeveloper();
    let armed = false;
    const mode = el.createEl("button", { text: enabling ? "Enable developer mode" : "Disable developer mode", attr: { type: "button" } });
    mode.onclick = async () => {
      if (mode.disabled) return;
      if (enabling && !armed && !isDeveloper()) {
        armed = true;
        mode.textContent = "Are you sure?";
        mode.className = "cst-admin-mode-toggle is-confirming";
        return;
      }
      mode.disabled = true;
      try {
        if (isDeveloper() !== enabling) await setDeveloperMode(enabling);
        await plugin.renderAdminWorkspace(el);
      } catch (error) {
        el.createEl("p", { text: error.message, attr: { role: "alert" } });
      } finally {
        mode.disabled = false;
        resetMode();
      }
    };
    function resetMode() {
      armed = false;
      const label = enabling ? "Enable developer mode" : "Disable developer mode";
      if (mode.textContent !== label) mode.textContent = label;
      if (mode.className !== "cst-admin-mode-toggle") mode.className = "cst-admin-mode-toggle";
    }
    resetMode();
    mode.onblur = resetMode;
    mode.onkeydown = (event) => {
      if (event.key === "Escape") resetMode();
    };
    const nav = el.createDiv({ cls: "cst-admin-action-grid" }), body = el.createDiv();
    const pages = {
      settings: ["Settings", (target) => plugin.renderConfig(target)],
      tabs: ["Clear CST Notes tabs", () => plugin.clearCSTTabs()],
      navigation: ["Navigation", (target) => plugin.renderInterfaceStatus(target)],
      surgeons: ["Surgeons", (target) => plugin.renderSurgeonAdmin(target)],
      templates: ["Templates", (target) => plugin.renderTemplateAdmin(target)],
      import: ["Import", (target) => plugin.renderImportWorkspace(target)],
      resources: ["Resources", (target) => plugin.renderResourceAdmin(target)],
      images: ["Images", (target) => plugin.renderImageAdmin(target)],
      onboarding: ["Onboarding", (target) => plugin.renderOnboardingAdmin(target)],
      recovery: ["Recovery", renderRecovery],
      metrics: ["Metrics", renderMetrics],
      verification: ["Verification", (target) => plugin.renderVerification(target)],
      activity: ["Recent activity", (target) => plugin.renderActivity(target)],
      system: ["System", (target) => plugin.renderSystem(target)],
      metadata: ["Metadata", (target) => plugin.renderMetadataAdmin(target)],
      repair: ["Repair", renderRepair],
      migrations: ["Migrations", (target) => plugin.renderMigrations(target)],
      reset: ["Reset", renderReset]
    };
    for (const [id2, [label, fallback]] of Object.entries(pages)) {
      if (!isDeveloper() && ADMIN_DEVELOPER_PAGES.includes(id2)) continue;
      button(nav, label, async () => {
        resetMode();
        body.empty();
        if (!guard(id2, body)) return;
        const render = deps.adminPages?.[id2] || fallback;
        if (render) await render(body);
        else body.createEl("p", { text: `${label} is awaiting host page integration.` });
      });
    }
    await renderMetrics(body);
  }
  const api = {
    get developerMode() {
      return isDeveloper();
    },
    setDeveloperMode,
    get busy() {
      return busy;
    },
    get resetNeedsReview() {
      return needsResetReview();
    },
    get state() {
      return Object.freeze({ busy, phase });
    },
    guard,
    refreshMode,
    initializeAfterReset,
    previewResetReview,
    clearResetReview,
    async runDeveloperCommand(id2, action) {
      if (ADMIN_DEVELOPER_COMMANDS.includes(id2) && !isDeveloper()) {
        if (deps.Notice) new deps.Notice("Enable Developer mode to use this command.");
        return null;
      }
      try {
        return await action();
      } catch (error) {
        if (deps.Notice) new deps.Notice(error.message || String(error));
        return null;
      }
    },
    listRecovery,
    previewRecovery,
    restore,
    previewReset,
    reset,
    previewRepair,
    repair,
    renderRepair,
    metrics
  };
  plugin.adminWorkspace = api;
  plugin.renderAdminWorkspace = renderAdmin;
  plugin.renderRecoveryWorkspace = renderRecovery;
  plugin.renderMetricsWorkspace = renderMetrics;
  plugin.renderResetWorkspace = renderReset;
  for (const [name, page] of Object.entries(ADMIN_DEVELOPER_RENDERERS)) {
    const original = plugin[name];
    if (typeof original !== "function") continue;
    plugin[name] = async function(el, ...args) {
      if (!guard(page, el)) return;
      if (name === "renderGraphAdmin" || name === "renderRepairAdmin") return renderRepair(el, name === "renderGraphAdmin" ? "graph" : "backend");
      el.addEventListener?.("click", (event) => {
        if (!isDeveloper()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          guard(page, el);
        }
      }, { capture: true });
      await original.call(this, el, ...args);
      if (!isDeveloper()) guard(page, el);
    };
  }
  const originalHealth = plugin.renderHealth;
  if (typeof originalHealth === "function") plugin.renderHealth = async function(el) {
    return isDeveloper() ? originalHealth.call(this, el) : renderMetrics(el);
  };
  const originalAction = plugin.runAdminAction;
  if (typeof originalAction === "function") plugin.runAdminAction = async function(label, action, ...args) {
    if (ADMIN_INTERNAL_ACTIONS.has(label) && !isDeveloper()) {
      if (deps.Notice) new deps.Notice("Enable Developer mode to use this internal action.");
      return null;
    }
    if (["Repair Entire Backend", "Rebuild Graph", "Rebuild Generated Graph", "Apply Current Schema Safely"].includes(label)) {
      try {
        const plan = await previewRepair(label.includes("Graph") ? "graph" : "backend");
        if (!await confirmPreview(label, ["Snapshot and revalidate:", ...plan.affected.map((e) => e.path)], "Confirm backup and repair")) return null;
        return await repair(plan);
      } catch (error) {
        if (deps.Notice) new deps.Notice(error.message || String(error));
        return null;
      }
    }
    return originalAction.call(this, label, action, ...args);
  };
  const originalMigrationUI = plugin.runMigrationFromUI;
  if (typeof originalMigrationUI === "function") plugin.runMigrationFromUI = async function(...args) {
    if (ADMIN_INTERNAL_MIGRATIONS.has(args[0]) && !isDeveloper()) {
      if (deps.Notice) new deps.Notice("Enable Developer mode to run this internal schema migration.");
      return null;
    }
    return originalMigrationUI.apply(this, args);
  };
  return api;
}

// src/attachment-recovery.mjs
var ATTACHMENT_RESTORE_ROUTES = Object.freeze([
  "deleted-case",
  "admin-file",
  "admin-folder",
  "migration-undo"
]);
var key2 = (value) => value.normalize("NFC").toLowerCase();
var parent2 = (path) => path.split("/").slice(0, -1).join("/");
var leaf = (path) => path.split("/").at(-1);
var within2 = (path, root) => key2(path) === key2(root) || key2(path).startsWith(key2(root) + "/");
var image = (path) => /\.(?:png|jpe?g|gif|webp|avif|bmp|svg|heic|heif|tiff?)$/i.test(path);
var equal = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
function validateAttachmentPath(path) {
  if (typeof path !== "string" || !path || path.length > 1024 || path !== path.trim() || /[\\:%\x00-\x1f\x7f<>"|?*]/.test(path) || path.split("/").some((part) => !part || part.startsWith(".") || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error("Unsafe attachment recovery path: " + String(path));
  }
  return path;
}
async function attachmentSHA256(bytes2) {
  if (!globalThis.crypto?.subtle) throw new Error("Image recovery hashing is unavailable on this device.");
  const copy = new Uint8Array(bytes2).slice();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
function relativePath(note, target) {
  const from = parent2(note).split("/").filter(Boolean), to = target.split("/");
  while (from.length && to.length && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return "../".repeat(from.length) + to.join("/");
}
function linkPath(note, target) {
  if (/[\\:%\x00-\x1f\x7f]/.test(target) || target.startsWith("//")) throw new Error("Unsafe restored image link.");
  const parts = target.startsWith("/") ? [] : parent2(note).split("/").filter(Boolean);
  for (const part of target.replace(/^\//, "").split("/")) {
    if (part === "..") {
      if (!parts.length) throw new Error("Restored image link escapes the vault.");
      parts.pop();
    } else if (part !== ".") parts.push(part);
  }
  return validateAttachmentPath(parts.join("/"));
}
function installAttachmentRecovery(plugin, {
  TFile: TFile2,
  attachmentLinks: attachmentLinks2,
  replaceAttachmentLinks: replaceAttachmentLinks2,
  resetArchiveRoot = "CST Recovery Archive"
}) {
  if (plugin.attachmentRecovery) return plugin.attachmentRecovery;
  const vault = plugin.app.vault, routes = /* @__PURE__ */ new Set();
  let revision = 0;
  for (const name of ["create", "modify", "rename", "delete"]) {
    plugin.registerEvent(vault.on(name, () => {
      revision++;
    }));
  }
  const files = () => {
    const result = [], stack = [vault.getRoot()];
    while (stack.length) {
      const item = stack.pop();
      if (item instanceof TFile2) result.push(item);
      else stack.push(...item?.children || []);
    }
    return result;
  };
  const backupRoot = () => validateAttachmentPath(plugin.p("Admin/Backups"));
  const archiveRoot = validateAttachmentPath(resetArchiveRoot);
  const archived = (path) => within2(path, backupRoot()) || within2(path, archiveRoot);
  const manifestFiles = () => files().filter((file) => archived(file.path) && key2(leaf(file.path)) === "image moves.json");
  const assertObject = (file, path) => {
    if (!(file instanceof TFile2) || file.path !== path || vault.getAbstractFileByPath(path) !== file) {
      throw new Error("Image recovery file moved or was replaced by Sync: " + path);
    }
  };
  const exactFile = (path) => {
    const matches = files().filter((file) => key2(file.path) === key2(path));
    if (matches.length > 1 || matches.length === 1 && matches[0].path !== path) {
      throw new Error("Ambiguous image path spelling or Sync conflict: " + path);
    }
    const item = vault.getAbstractFileByPath(path);
    if (item && !(item instanceof TFile2)) throw new Error("Image path is occupied by a folder: " + path);
    return matches[0];
  };
  async function catalog() {
    const start = revision, rootKey = backupRoot(), states = /* @__PURE__ */ new Map(), binaries = /* @__PURE__ */ new Map();
    const manifests = manifestFiles().map((file) => ({ file, path: file.path }));
    const read = async (file, binary = false) => {
      const path = file.path, previous = states.get(path);
      if (previous) return previous.content;
      assertObject(file, path);
      const first = binary ? new Uint8Array(await vault.readBinary(file)).slice() : await vault.read(file);
      assertObject(file, path);
      const second = binary ? new Uint8Array(await vault.readBinary(file)).slice() : await vault.read(file);
      assertObject(file, path);
      if (binary ? !equal(first, second) : first !== second) throw new Error("Image recovery content changed while reading: " + path);
      states.set(path, { file, path, binary, content: first });
      return first;
    };
    const fingerprint = async (path) => {
      if (binaries.has(path)) return binaries.get(path);
      const file = exactFile(path);
      if (!file) return null;
      const bytes2 = await read(file, true);
      const result = { path, size: bytes2.length, hash: await attachmentSHA256(bytes2) };
      binaries.set(path, result);
      return result;
    };
    const records = [], byOriginal = /* @__PURE__ */ new Map(), byTarget = /* @__PURE__ */ new Map(), manifestResiduals = /* @__PURE__ */ new Map();
    for (const entry of manifests) {
      validateAttachmentPath(entry.path);
      if (leaf(entry.path) !== "Image Moves.json") throw new Error("Image move manifest spelling needs review.");
      const text = await read(entry.file);
      if (text.length > 8e6) throw new Error("Image move manifest is too large.");
      const data = JSON.parse(text), snapshot = parent2(entry.path);
      if (![1, 2].includes(data.version) || !Array.isArray(data.moves) || !data.moves.length || data.moves.length > 9999 || data.version === 2 && data.type !== "cst-image-moves") throw new Error("Unsupported image move manifest: " + entry.path);
      const originals = /* @__PURE__ */ new Set(), targets = /* @__PURE__ */ new Set(), backups = /* @__PURE__ */ new Set();
      for (const move of data.moves) {
        const original = validateAttachmentPath(move.original), target = validateAttachmentPath(move.target);
        const backup = validateAttachmentPath(move.backup);
        if (!image(original) || !image(target) || !/^Images\/[^/]+$/.test(backup) || !image(backup) || archived(original) || archived(target) || within2(original, plugin.p("")) || within2(target, plugin.p("")) || key2(original) === key2(target) || originals.has(key2(original)) || targets.has(key2(target)) || backups.has(key2(backup))) {
          throw new Error("Unsafe or duplicated image move entry: " + entry.path);
        }
        originals.add(key2(original));
        targets.add(key2(target));
        backups.add(key2(backup));
        const saved = await fingerprint(validateAttachmentPath(snapshot + "/" + backup));
        if (!saved) throw new Error("Image recovery backup is missing: " + snapshot + "/" + backup);
        if (data.version === 2 && (!/^[a-f0-9]{64}$/.test(move.sha256) || !Number.isSafeInteger(move.size) || move.size < 0 || saved.hash !== move.sha256 || saved.size !== move.size)) throw new Error("Image recovery backup hash/size mismatch: " + saved.path);
        const record = { original, target, backup: saved.path, hash: saved.hash, size: saved.size, legacy: data.version === 1 };
        const old = byOriginal.get(key2(original)), incoming = byTarget.get(key2(target));
        if (old && (old.target !== target || old.hash !== record.hash || old.original !== original) || incoming && incoming.original !== original) throw new Error("Conflicting image move history: " + original);
        if (!old) {
          byOriginal.set(key2(original), record);
          byTarget.set(key2(target), record);
          records.push(record);
        }
      }
      manifestResiduals.set(entry.path, JSON.stringify({
        ...data,
        moves: data.moves.map(({ original, target, backup, ...rest }) => rest)
      }));
    }
    const histories = /* @__PURE__ */ new Map();
    function history(path) {
      const existing = histories.get(key2(path));
      if (existing) return existing;
      const nodes = [], seen = /* @__PURE__ */ new Set();
      let cursor = path;
      while (byTarget.has(key2(cursor))) {
        if (seen.has(key2(cursor))) throw new Error("Cyclic image move history.");
        seen.add(key2(cursor));
        cursor = byTarget.get(key2(cursor)).original;
      }
      seen.clear();
      const chain = [];
      while (byOriginal.has(key2(cursor))) {
        if (seen.has(key2(cursor))) throw new Error("Cyclic image move history.");
        seen.add(key2(cursor));
        nodes.push(cursor);
        const record = byOriginal.get(key2(cursor));
        chain.push(record);
        cursor = record.target;
      }
      nodes.push(cursor);
      if (chain.some((record) => record.hash !== chain[0].hash)) throw new Error("Image bytes conflict across chained moves.");
      const result = { nodes, chain, terminal: cursor, hash: chain[0]?.hash };
      for (const node of nodes) histories.set(key2(node), result);
      return result;
    }
    for (const record of records) history(record.original);
    const resolutions = /* @__PURE__ */ new Map(), lookups = /* @__PURE__ */ new Map();
    const lookup = (path) => {
      const file = exactFile(path);
      lookups.set(path, file);
      return file;
    };
    async function resolvePath(path) {
      const chain = history(path);
      if (!chain.chain.length) return lookup(path) ? path : null;
      if (resolutions.has(chain)) return resolutions.get(chain);
      let latest = null;
      for (const node of chain.nodes) {
        lookup(node);
        const current = await fingerprint(node);
        if (current && current.hash !== chain.hash) throw new Error("Recovered image path contains different bytes; both versions were retained: " + node);
        if (current) latest = node;
      }
      if (!latest && chain.chain.some((record) => record.legacy)) throw new Error("Legacy image move needs an intact live image to verify its backup.");
      const target = latest || chain.chain.at(-1).backup;
      resolutions.set(chain, target);
      return target;
    }
    const names = /* @__PURE__ */ new Map();
    function pathsNamed(name) {
      return [.../* @__PURE__ */ new Set([
        ...records.flatMap((record) => [record.original, record.target]),
        ...files().filter((file) => image(file.path) && !archived(file.path)).map((file) => file.path)
      ])].filter((path) => key2(leaf(path)) === key2(name)).sort();
    }
    async function resolveLink(link, note, historicalOnly = false) {
      linkPath(note, link.target);
      const paths = [];
      if (!link.target.includes("/")) {
        const matches = pathsNamed(link.target);
        paths.push(...matches);
      } else {
        const relative = linkPath(note, link.target);
        paths.push(relative);
        if (!link.target.startsWith(".") && !link.target.startsWith("/")) paths.push(validateAttachmentPath(link.target));
      }
      const possible = [...new Set(paths)].filter((path) => byOriginal.has(key2(path)) || byTarget.has(key2(path)) || exactFile(path));
      if (historicalOnly && !possible.some((path) => byOriginal.has(key2(path)) || byTarget.has(key2(path)))) return null;
      if (!link.target.includes("/")) names.set(link.target, pathsNamed(link.target));
      for (const path of new Set(paths)) lookup(path);
      const groups = /* @__PURE__ */ new Map();
      for (const path of possible) {
        const chain = history(path), id2 = key2(chain.nodes[0]);
        if (!groups.has(id2)) groups.set(id2, path);
      }
      if (groups.size > 1) throw new Error("Ambiguous restored image link (duplicate basename or path): " + link.target);
      if (!groups.size) return null;
      const resolved = await resolvePath([...groups.values()][0]);
      const live = [...new Set(paths)].filter((path) => exactFile(path));
      const sameHistory = live.length === 1 && histories.get(key2(live[0])) && histories.get(key2(live[0])) === histories.get(key2(resolved));
      return { path: resolved, unchanged: live.length === 1 && (live[0] === resolved || !!sameHistory) };
    }
    async function checkStates(archiveOnly = false) {
      for (const state of states.values()) {
        if (archiveOnly && !archived(state.path)) continue;
        assertObject(state.file, state.path);
        const current = state.binary ? new Uint8Array(await vault.readBinary(state.file)) : await vault.read(state.file);
        assertObject(state.file, state.path);
        if (state.binary ? !equal(current, state.content) : current !== state.content) throw new Error("Image recovery content changed: " + state.path);
      }
    }
    async function assertUnchanged() {
      const before = revision;
      if (plugin.unloading || backupRoot() !== rootKey) throw new Error("Image recovery settings changed. Preview again.");
      const current = manifestFiles();
      if (current.length !== manifests.length || manifests.some((entry) => entry.file.path !== entry.path || !current.includes(entry.file))) {
        throw new Error("Image move manifests changed during recovery. Wait for Sync.");
      }
      for (const [path, file] of lookups) if (exactFile(path) !== file) throw new Error("Image recovery destination changed: " + path);
      for (const [name, paths] of names) if (JSON.stringify(pathsNamed(name)) !== JSON.stringify(paths)) throw new Error("Image basename resolution changed during recovery.");
      await checkStates();
      if (before !== revision) throw new Error("Sync changed the vault while validating image recovery.");
    }
    if (start !== revision) throw new Error("Sync changed the vault while reading image move history.");
    return {
      read,
      resolveLink,
      assertUnchanged,
      assertArchiveEvidence: () => checkStates(true),
      manifests,
      manifestResiduals,
      namesForPath: (path) => history(path).nodes.map(leaf)
    };
  }
  async function prepareRestore({ text, originalPath, targetPath = originalPath }) {
    validateAttachmentPath(originalPath);
    validateAttachmentPath(targetPath);
    if (typeof text !== "string") throw new Error("Restored image references require note text.");
    if (!attachmentLinks2(text).some((link) => image(link.target))) {
      return Object.freeze({ text, changedLinks: 0, references: Object.freeze([]), assertUnchanged: async () => {
      } });
    }
    return prepareWithState(await catalog(), { text, originalPath, targetPath }, true);
  }
  async function prepareWithState(state, { text, originalPath, targetPath = originalPath }, historicalOnly = false) {
    validateAttachmentPath(originalPath);
    validateAttachmentPath(targetPath);
    if (typeof text !== "string") throw new Error("Restored image references require note text.");
    const changes = [], references = [];
    for (const link of attachmentLinks2(text).filter((link2) => image(link2.target))) {
      const resolution = await state.resolveLink(link, originalPath, historicalOnly);
      if (!resolution?.path) continue;
      const resolved = resolution.path;
      references.push(Object.freeze({ ...link, path: resolved }));
      if (originalPath === targetPath && resolution.unchanged) continue;
      const path = link.wiki ? resolved : relativePath(targetPath, resolved);
      if (path !== link.target) changes.push({ ...link, path });
    }
    await state.assertUnchanged();
    return Object.freeze({
      text: replaceAttachmentLinks2(text, changes),
      changedLinks: changes.length,
      references: Object.freeze(references),
      assertUnchanged: state.assertUnchanged
    });
  }
  async function inspectArchives(documents) {
    const sourcePaths = /* @__PURE__ */ new Map(), metadata = /* @__PURE__ */ new Map(), problems = [], relocations = [], historicalOrigins = /* @__PURE__ */ new Map();
    let state;
    try {
      state = await catalog();
    } catch (error) {
      return { sourcePaths, metadata, problems: [error.message] };
    }
    const texts = new Map(documents.map((document2) => [document2.path, document2.original]));
    const mapped = (source, original) => {
      validateAttachmentPath(source);
      validateAttachmentPath(original);
      if (!texts.has(source)) throw new Error("Archived note is unavailable: " + source);
      if (sourcePaths.has(source) && sourcePaths.get(source) !== original) throw new Error("Conflicting archived source path.");
      sourcePaths.set(source, original);
    };
    const archivedDocuments = documents.filter((document2) => archived(document2.path)).sort((a, b) => Number(leaf(b.path) === "Reset Manifest.json") - Number(leaf(a.path) === "Reset Manifest.json"));
    for (const document2 of archivedDocuments) {
      const { path, original: text } = document2;
      try {
        if (leaf(path) === "Manifest.md") {
          const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
          if (blocks.length !== 1) throw new Error("Invalid snapshot mapping.");
          const data = JSON.parse(blocks[0][1]), staged = [], seen = /* @__PURE__ */ new Set();
          if (data.version !== 1 || !Array.isArray(data.files)) throw new Error("Invalid snapshot mapping.");
          for (const file of data.files) {
            const backup = validateAttachmentPath(file.backup_file), original = validateAttachmentPath(file.original_path);
            if (!/^Files\/[^/]+$/.test(backup) || seen.has(key2(original))) throw new Error("Unsafe/duplicate snapshot mapping.");
            seen.add(key2(original));
            const source = parent2(path) + "/" + backup;
            if (!texts.has(source) || !Number.isSafeInteger(file.characters) || texts.get(source).length !== file.characters) throw new Error("Incomplete snapshot mapping.");
            staged.push([source, original]);
          }
          for (const pair of staged) mapped(...pair);
          metadata.set(path, text.replace(blocks[0][0], JSON.stringify({
            ...data,
            files: data.files.map(({ original_path, backup_file, ...rest }) => rest)
          })));
        } else if (leaf(path) === "Reset Manifest.json") {
          const data = JSON.parse(text);
          if (data.version !== 1 || data.type !== "cst-workspace-reset" || !Array.isArray(data.entries) || !Array.isArray(data.roots) || data.roots.length !== 2) throw new Error("Invalid reset mapping.");
          const content = validateAttachmentPath(data.content_root), backend = validateAttachmentPath(data.backend_root);
          const expected = [
            { original_path: content, archive_path: parent2(path) + "/Content" },
            { original_path: backend, archive_path: parent2(path) + "/Backend" }
          ];
          if (JSON.stringify(data.roots) !== JSON.stringify(expected)) throw new Error("Unsafe reset mapping.");
          const seen = /* @__PURE__ */ new Set(), staged = [];
          for (const item of data.entries) {
            const original = validateAttachmentPath(item.original_path), mapping = expected.find((root) => within2(original, root.original_path));
            if (!mapping || seen.has(key2(original)) || !["file", "folder"].includes(item.kind)) throw new Error("Unsafe/duplicate reset mapping.");
            seen.add(key2(original));
            const source = mapping.archive_path + original.slice(mapping.original_path.length);
            if (item.kind === "file" && /\.md$/i.test(original) && !within2(original, backend + "/Admin/Backups")) staged.push([source, original]);
          }
          for (const pair of staged) if (!sourcePaths.has(pair[0])) mapped(...pair);
          relocations.push(...expected);
          metadata.set(path, JSON.stringify({
            ...data,
            roots: [],
            entries: data.entries.map(({ original_path, ...rest }) => rest)
          }));
        } else if (/\/Deleted Cases\/[^/]+\.json$/.test(path)) {
          const data = JSON.parse(text);
          const relocation = relocations.find((root) => within2(path, root.archive_path) && typeof data.archive_path === "string" && within2(data.archive_path, root.original_path));
          const source = relocation ? relocation.archive_path + data.archive_path.slice(relocation.original_path.length) : data.archive_path;
          if (data.version !== 1 || !["archived", "restored"].includes(data.state) || source !== path.replace(/\.json$/, ".md")) throw new Error("Invalid deleted-case mapping.");
          validateAttachmentPath(data.original_path);
          validateAttachmentPath(data.archive_path);
          for (const archivedPath of [source, data.archive_path]) {
            if (historicalOrigins.has(archivedPath) && historicalOrigins.get(archivedPath) !== data.original_path) throw new Error("Conflicting deleted-case origin.");
            historicalOrigins.set(archivedPath, data.original_path);
          }
          if (data.state === "archived" || texts.has(source)) mapped(source, data.original_path);
          const { original_path, archive_path, ...rest } = data;
          metadata.set(path, JSON.stringify(rest));
        }
      } catch (error) {
        problems.push(path + ": " + error.message);
      }
    }
    for (const [source, original] of sourcePaths) {
      let resolved = original;
      const seen = /* @__PURE__ */ new Set([source]);
      while (historicalOrigins.has(resolved) || sourcePaths.has(resolved)) {
        if (seen.has(resolved)) {
          problems.push(source + ": cyclic archive origin mapping.");
          break;
        }
        seen.add(resolved);
        resolved = historicalOrigins.get(resolved) || sourcePaths.get(resolved);
      }
      sourcePaths.set(source, resolved);
    }
    for (const [path, residual] of state.manifestResiduals) metadata.set(path, residual);
    await state.assertUnchanged();
    return {
      sourcePaths,
      metadata,
      problems,
      namesForPath: state.namesForPath,
      assertUnchanged: state.assertUnchanged,
      assertArchiveEvidence: state.assertArchiveEvidence,
      prepareRestore: (options) => prepareWithState(state, options)
    };
  }
  const api = Object.freeze({
    prepareRestore,
    inspectArchives,
    isArchivePath: archived,
    get archivesReady() {
      return ATTACHMENT_RESTORE_ROUTES.every((route) => routes.has(route));
    },
    get missingRoutes() {
      return ATTACHMENT_RESTORE_ROUTES.filter((route) => !routes.has(route));
    },
    registerRestoreRoute(route) {
      if (!ATTACHMENT_RESTORE_ROUTES.includes(route)) throw new Error("Unknown attachment restore route: " + route);
      routes.add(route);
    }
  });
  plugin.attachmentRecovery = api;
  return api;
}

// src/attachment-workspace.mjs
var IMAGE = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg|heic|heif|tiff?)$/i;
var DOCUMENT = /^(?:md|canvas|html?|json|txt|svg|xml|excalidraw|base)$/i;
var key3 = (path) => path.normalize("NFC").toLowerCase();
var below = (path, root) => key3(path) === key3(root) || key3(path).startsWith(key3(root) + "/");
function imagePath(path) {
  return IMAGE.test(path);
}
function maskCode(text) {
  let fence = null;
  return (String(text).match(/[^\n]*\n|[^\n]+$/g) || []).map((line) => {
    const mark = /^ {0,3}(\x60{3,}|~{3,})(.*)/.exec(line);
    if (fence) {
      if (mark && mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2].trim()) fence = null;
      return line.replace(/[^\n]/g, " ");
    }
    if (mark) {
      fence = mark[1];
      return line.replace(/[^\n]/g, " ");
    }
    return line.replace(/(\x60+)([^\n]*?)\1(?!\x60)/g, (value) => " ".repeat(value.length));
  }).join("");
}
function attachmentLinks(text) {
  const links = [], masked = maskCode(text);
  const pattern = /!?\[\[([^\]\n]+)\]\]|!?\[[^\]\n]*\]\((<[^>\n]+>|[^\s()]+)(?:\s+["'][^\n]*?["'])?\)/g;
  for (const match of masked.matchAll(pattern)) {
    let escapes = 0;
    for (let i = match.index - 1; i >= 0 && masked[i] === "\\"; i--) escapes++;
    if (escapes % 2) continue;
    const wiki = match[1] !== void 0;
    const raw = wiki ? match[1].split("|")[0] : match[2].replace(/^<|>$/g, "");
    const target = raw.split("#")[0];
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target) || /[\\\x00-\x1f]/.test(target)) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      continue;
    }
    const offset = match.index + (wiki ? match[0].indexOf("[[") + 2 : match[0].indexOf("](") + 2 + (match[2].startsWith("<") ? 1 : 0));
    links.push({
      target: decoded,
      start: offset,
      end: offset + target.length,
      wiki,
      matchStart: match.index,
      matchEnd: match.index + match[0].length
    });
  }
  return links;
}
function replaceAttachmentLinks(text, changes) {
  let next = text;
  for (const change of [...changes].sort((a, b) => b.start - a.start)) {
    const path = change.wiki ? change.path : encodeURI(change.path).replace(/#/g, "%23").replace(/&/g, "%26").replace(/\?/g, "%3F").replace(/\(/g, "%28").replace(/\)/g, "%29");
    next = next.slice(0, change.start) + path + next.slice(change.end);
  }
  return next;
}
function relativeTarget(note, target) {
  const source = note.split("/").slice(0, -1), dest = target.split("/");
  while (source.length && dest.length && source[0] === dest[0]) {
    source.shift();
    dest.shift();
  }
  return "../".repeat(source.length) + dest.join("/");
}
function referenceText(text) {
  let result = String(text);
  for (let i = 0; i < 3; i++) {
    result = result.replace(/(?:%[a-f0-9]{2})+/gi, (part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    }).replace(/\\u([a-f0-9]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/&#(?:x([a-f0-9]+)|(\d+));/gi, (all, hex, dec) => {
      const value = parseInt(hex || dec, hex ? 16 : 10);
      return value <= 1114111 ? String.fromCodePoint(value) : all;
    }).replace(
      /&(amp|sol|period|lowbar|num|percnt|lpar|rpar);/gi,
      (_, name) => ({ amp: "&", sol: "/", period: ".", lowbar: "_", num: "#", percnt: "%", lpar: "(", rpar: ")" })[name.toLowerCase()]
    ).replace(/\\([^\w\s])/g, "$1");
  }
  return key3(result);
}
function equalBytes(a, b) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
function installAttachmentFeatures(plugin, { TFile: TFile2, Modal: Modal2, Notice: Notice2, normalizePath: normalizePath2, validatePortableVaultPath: validatePortableVaultPath2, shortHash: shortHash2, withAdminMutation, resetArchiveRoot }) {
  const vault = plugin.app.vault, previews = /* @__PURE__ */ new WeakMap();
  const recovery = installAttachmentRecovery(plugin, { TFile: TFile2, attachmentLinks, replaceAttachmentLinks, resetArchiveRoot });
  let revision = 0;
  for (const event of ["create", "modify", "rename", "delete"]) {
    plugin.registerEvent(vault.on(event, () => {
      revision++;
    }));
  }
  const allItems = () => {
    const result = [], stack = [vault.getRoot()];
    while (stack.length) {
      const item = stack.pop();
      if (!item) continue;
      result.push(item);
      if (!(item instanceof TFile2)) stack.push(...item.children || []);
    }
    return result;
  };
  const files = () => allItems().filter((item) => item instanceof TFile2);
  const occupied = (path) => allItems().find((item) => key3(item.path) === key3(path));
  const root = () => {
    const parent3 = plugin.contentRoot.split("/").slice(0, -1).join("/");
    return plugin.settings.imageFolder || (parent3 ? parent3 + "/" : "") + "Images";
  };
  const safePath2 = (value, label) => {
    const path = String(value).trim();
    if (!path || path !== normalizePath2(path) || path.split("/").some((part) => !part || /^[._]/.test(part) || /[<>:"\\|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      throw new Error(label + " must be a portable relative vault path.");
    }
    validatePortableVaultPath2(path, label);
    return path;
  };
  const destinationRoot = (value) => {
    const path = safePath2(value, "Image folder");
    if (/[\[\]#%\x60^]/.test(path)) throw new Error("Image folder must be portable in both Markdown and wiki links.");
    if (below(path, plugin.contentRoot) || below(path, plugin.p("")) || below(plugin.contentRoot, path) || below(plugin.p(""), path) || recovery.isArchivePath(path)) {
      throw new Error("Choose a separate Images folder outside the case hierarchy, Backend, and recovery archives.");
    }
    assertFolderPath(path);
    return path;
  };
  const assertFolderPath = (path) => {
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const expected = parts.slice(0, i).join("/"), item = occupied(expected);
      if (item && (item instanceof TFile2 || item.path !== expected)) throw new Error("Image folder collision; use the existing folder's exact spelling.");
    }
  };
  const assertFile = (file, path) => plugin.assertVaultFilePath(file, path, "Image organization stopped: file changed, moved or was replaced. Preview again.");
  const readText = async (file, path) => {
    assertFile(file, path);
    const text = await vault.read(file);
    assertFile(file, path);
    return text;
  };
  const assertImage = (candidate) => {
    assertFile(candidate.file, candidate.path);
    if (candidate.file.stat?.size !== candidate.size || candidate.file.stat?.mtime !== candidate.mtime) {
      throw new Error("Image changed while reading; preview again.");
    }
  };
  const readImage = async (candidate) => {
    assertImage(candidate);
    const first = new Uint8Array(await vault.readBinary(candidate.file)).slice();
    assertImage(candidate);
    const second = new Uint8Array(await vault.readBinary(candidate.file)).slice();
    assertImage(candidate);
    if (!equalBytes(first, second) || candidate.bytes && !equalBytes(first, candidate.bytes)) {
      throw new Error("Image bytes changed while reading; preview again.");
    }
    return first;
  };
  plugin.previewImageOrganization = async () => {
    if (plugin.unloading || plugin.imageOrganizationBusy) throw new Error("Image organization is busy. Preview again when it finishes.");
    const destination = destinationRoot(root());
    const inventory = files().map((file) => ({ file, path: file.path }));
    const documents = [];
    for (const entry of inventory) if (DOCUMENT.test(entry.file.extension)) {
      const original = await readText(entry.file, entry.path);
      documents.push({ ...entry, original, changes: [] });
    }
    const cases = new Set(plugin.allCaseFiles()), candidates = /* @__PURE__ */ new Map();
    for (const document2 of documents) {
      if (!cases.has(document2.file)) continue;
      for (const link of attachmentLinks(document2.original)) {
        const image2 = plugin.app.metadataCache.getFirstLinkpathDest(link.target, document2.path);
        if (!(image2 instanceof TFile2) || !imagePath(image2.path) || below(image2.path, destination) || below(image2.path, plugin.p("")) || recovery.isArchivePath(image2.path)) continue;
        if (!candidates.has(image2.path)) candidates.set(image2.path, {
          file: image2,
          path: image2.path,
          size: image2.stat?.size,
          mtime: image2.stat?.mtime,
          refs: [],
          blocked: image2.extension.toLowerCase() === "svg" ? "SVG may contain relative resources; leave in place." : ""
        });
      }
    }
    const archiveCoverage = recovery.archivesReady ? await recovery.inspectArchives(documents) : null;
    const archiveChecks = archiveCoverage?.assertUnchanged ? [archiveCoverage] : [];
    for (const document2 of documents) {
      const markdown = document2.file.extension.toLowerCase() === "md";
      const archived = recovery.isArchivePath(document2.path);
      if (archived) {
        let residual2 = !archiveCoverage?.problems.length && archiveCoverage?.metadata.has(document2.path) ? archiveCoverage.metadata.get(document2.path) : document2.original;
        const originalPath = archiveCoverage?.sourcePaths.get(document2.path);
        if (originalPath && markdown && !archiveCoverage.problems.length) {
          try {
            const restored = await archiveCoverage.prepareRestore({ text: document2.original, originalPath });
            if (!archiveChecks.includes(archiveCoverage)) archiveChecks.push(archiveCoverage);
            for (const link of [...restored.references].sort((a, b) => b.matchStart - a.matchStart)) {
              if (!candidates.has(link.path)) continue;
              residual2 = residual2.slice(0, link.matchStart) + " ".repeat(link.matchEnd - link.matchStart) + residual2.slice(link.matchEnd);
            }
          } catch (error) {
            for (const candidate of candidates.values()) candidate.blocked = "Recovery archive needs review: " + error.message;
          }
        }
        const unknown2 = referenceText(residual2);
        for (const candidate of candidates.values()) {
          const aliases = archiveCoverage?.namesForPath?.(candidate.path) || [candidate.file.name];
          if (archiveCoverage?.problems.length || aliases.some((name) => unknown2.includes(key3(name))) || /&[a-z][a-z0-9]+;/i.test(unknown2)) {
            candidate.blocked = "Referenced by a recovery archive; " + (archiveCoverage?.problems.length ? "its recovery records need review." : "leave in place until its references can be restored safely.");
          }
        }
        continue;
      }
      const links = markdown ? attachmentLinks(document2.original) : [];
      let residual = markdown ? maskCode(document2.original) : document2.original;
      for (const link of [...links].reverse()) {
        const image2 = plugin.app.metadataCache.getFirstLinkpathDest(link.target, document2.path);
        const candidate = image2 && candidates.get(image2.path);
        if (!candidate || candidate.file !== image2) continue;
        candidate.refs.push({ document: document2, link });
        residual = residual.slice(0, link.matchStart) + " ".repeat(link.matchEnd - link.matchStart) + residual.slice(link.matchEnd);
      }
      const html = /<(?:img|a|source|object|video|audio|svg|image|picture)\b/i.test(document2.original);
      const unknown = referenceText(html ? document2.original : residual);
      for (const candidate of candidates.values()) {
        const ambiguousEntity = /&[a-z][a-z0-9]+;/i.test(unknown) && (html || /!?\[/.test(residual));
        if (unknown.includes(key3(candidate.file.name)) || ambiguousEntity) candidate.blocked = "Possible unsupported reference (Markdown, canvas, HTML or other text); leave in place.";
      }
    }
    const reserved2 = new Set(allItems().map((item) => key3(item.path)));
    for (const candidate of candidates.values()) {
      try {
        safePath2(candidate.path, "Original image path");
        validateAttachmentPath(candidate.path);
        const basename2 = candidate.file.name.replace(/[\[\]#|%^\x60]/g, "-");
        let target = destination + "/" + basename2;
        const hash = shortHash2(candidate.path).replace(/[^a-z0-9]/gi, "").slice(0, 12) || "image";
        for (let suffix = 1; reserved2.has(key3(target)) && suffix <= 9999; suffix++) {
          target = destination + "/" + hash + (suffix === 1 ? "" : "-" + suffix) + "-" + basename2;
        }
        if (reserved2.has(key3(target))) throw new Error("Destination already exists.");
        candidate.target = safePath2(target, "Image path");
        reserved2.add(key3(target));
      } catch (error) {
        candidate.blocked = error.message;
      }
      if (!candidate.refs.length) candidate.blocked = "No resolved links; leave in place.";
      if (!candidate.blocked) {
        candidate.bytes = await readImage(candidate);
        candidate.sha256 = await attachmentSHA256(candidate.bytes);
        for (const { document: document2, link } of candidate.refs) document2.changes.push({
          ...link,
          path: link.wiki ? candidate.target : relativeTarget(document2.path, candidate.target)
        });
      }
    }
    const plans = documents.filter((document2) => document2.changes.length).map((document2) => ({ ...document2, next: replaceAttachmentLinks(document2.original, document2.changes) }));
    const internal = {
      destination,
      candidates: [...candidates.values()],
      plans,
      documents,
      inventory,
      contentRoot: plugin.contentRoot,
      backendRoot: plugin.p(""),
      archiveChecks,
      createdAt: Date.now()
    };
    const preview = Object.freeze({
      destination,
      createdAt: internal.createdAt,
      candidates: Object.freeze(internal.candidates.map((candidate) => Object.freeze({
        path: candidate.path,
        target: candidate.target,
        blocked: candidate.blocked,
        references: candidate.refs.length
      }))),
      plans: Object.freeze(plans.map((plan) => Object.freeze({ path: plan.path, original: plan.original, next: plan.next })))
    });
    previews.set(preview, internal);
    for (const check of archiveChecks) await check.assertUnchanged();
    await validate(internal);
    return preview;
  };
  async function validate(plan, { owned = /* @__PURE__ */ new Map(), evidence = [], attempted = [], written = false, snapshot = "", readBinaries = true } = {}) {
    const before = revision;
    if (plugin.unloading || plan.destination !== destinationRoot(root()) || plan.contentRoot !== plugin.contentRoot || plan.backendRoot !== plugin.p("")) throw new Error("Image settings changed; preview again.");
    const expected = new Map(plan.inventory.map((entry) => [entry.path, entry.file]));
    for (const candidate of attempted) {
      expected.delete(candidate.path);
      expected.set(candidate.target, candidate.file);
    }
    const logPath = plugin.p("Admin/Logs/Automation.md");
    const logSafe = (text) => !plan.candidates.some((candidate) => referenceText(text).includes(key3(candidate.path.split("/").at(-1))));
    const current = files();
    for (const file of current) {
      if (owned.get(file.path) === file) continue;
      if (snapshot && file.path === logPath && !expected.has(logPath) && logSafe(await readText(file, file.path))) continue;
      if (expected.get(file.path) !== file) throw new Error("Vault files changed since preview (new, moved or replaced file). Preview again.");
    }
    for (const [path, file] of expected) assertFile(file, path);
    for (const document2 of plan.documents) {
      const text = await readText(document2.file, document2.path);
      const next = written ? plan.plans.find((entry) => entry.file === document2.file)?.next : void 0;
      if (text !== (next ?? document2.original) && !(snapshot && document2.path === logPath && text.startsWith(document2.original) && logSafe(text))) {
        throw new Error("A referring or previously unlinked note changed; preview again.");
      }
    }
    for (const candidate of plan.candidates.filter((candidate2) => !candidate2.blocked)) {
      if (attempted.includes(candidate)) {
        if (readBinaries) await readImage({ ...candidate, path: candidate.target });
        else assertImage({ ...candidate, path: candidate.target });
        continue;
      }
      for (const { document: document2, link } of candidate.refs) {
        if (plugin.app.metadataCache.getFirstLinkpathDest(link.target, document2.path) !== candidate.file) {
          throw new Error("Image link resolution changed; preview again.");
        }
      }
      if (readBinaries) await readImage(candidate);
      else assertImage(candidate);
      if (occupied(candidate.target)) throw new Error("Image destination changed; preview again.");
    }
    for (const check of plan.archiveChecks) await check.assertArchiveEvidence();
    for (const entry of evidence) {
      if (entry.bytes) {
        if (readBinaries && written) await readImage(entry);
        else assertImage(entry);
      } else if (await readText(entry.file, entry.path) !== entry.text) {
        throw new Error("Image recovery manifest changed during organization.");
      }
    }
    const finalFiles = files();
    if (revision !== before || current.length !== finalFiles.length || current.some((file, i) => file !== finalFiles[i])) {
      throw new Error("Vault files changed while reading; preview again.");
    }
  }
  plugin.applyImageOrganization = async (preview) => {
    if (plugin.imageOrganizationBusy) throw new Error("Image organization is already running.");
    const plan = previews.get(preview);
    if (!plan || Date.now() - plan.createdAt > 12e4) throw new Error("Preview expired or unavailable. Preview again before moving images.");
    if (typeof withAdminMutation !== "function") throw new Error("Image organization requires the serialized maintenance hook.");
    plugin.imageOrganizationBusy = true;
    previews.delete(preview);
    try {
      return await withAdminMutation(async () => {
        if (Date.now() - plan.createdAt > 12e4) throw new Error("Preview expired while waiting. Preview again.");
        const selected = plan.candidates.filter((candidate) => !candidate.blocked);
        const attempted = [], owned = /* @__PURE__ */ new Map(), evidence = [];
        let snapshot = "", written = false;
        const register = (file) => {
          assertFile(file, file.path);
          owned.set(file.path, file);
          return file;
        };
        const createBinary = async (path, bytes2) => {
          safePath2(path, "Image backup path");
          if (occupied(path)) throw new Error("Image backup or recovery collision: " + path);
          plugin.markInternalCreate?.(path);
          const file = await vault.createBinary(path, bytes2.slice().buffer);
          assertFile(file, path);
          await readImage({ file, path, size: file.stat?.size, mtime: file.stat?.mtime, bytes: bytes2 });
          return register(file);
        };
        try {
          await validate(plan);
          for (const check of plan.archiveChecks) await check.assertUnchanged();
          if (!selected.length) return { moved: 0 };
          const previousPaths = new Set(allItems().map((item) => key3(item.path)));
          snapshot = await plugin.snapshotFiles("image-organization", plan.plans.map((entry) => entry.file));
          safePath2(snapshot, "Image snapshot");
          if (previousPaths.has(key3(snapshot)) || !below(snapshot, plugin.p("Admin/Backups")) || plan.inventory.some((entry) => below(entry.path, snapshot))) {
            throw new Error("Image snapshot collision; existing backup preserved.");
          }
          for (const file of files().filter((file2) => below(file2.path, snapshot))) register(file);
          const imageBackup = snapshot + "/Images";
          if (occupied(imageBackup)) throw new Error("Image backup folder collision.");
          plugin.markInternalCreate?.(imageBackup);
          await vault.createFolder(imageBackup);
          for (let i = 0; i < selected.length; i++) {
            await readImage(selected[i]);
            const file = await createBinary(imageBackup + "/" + i + "." + selected[i].file.extension, selected[i].bytes);
            evidence.push({ file, path: file.path, size: file.stat?.size, mtime: file.stat?.mtime, bytes: selected[i].bytes });
          }
          const manifestPath = snapshot + "/Image Moves.json";
          if (occupied(manifestPath)) throw new Error("Image backup manifest collision.");
          plugin.markInternalCreate?.(manifestPath);
          const manifestText = JSON.stringify({
            version: 2,
            type: "cst-image-moves",
            recovery: "Keep both original and target images if any link write conflicts; never overwrite an occupied path.",
            moves: selected.map((candidate, i) => ({
              original: candidate.path,
              target: candidate.target,
              backup: "Images/" + i + "." + candidate.file.extension,
              sha256: candidate.sha256,
              size: candidate.bytes.length
            }))
          }, null, 2);
          const manifest = await vault.create(manifestPath, manifestText);
          assertFile(manifest, manifestPath);
          register(manifest);
          if (await readText(manifest, manifestPath) !== manifestText) throw new Error("Image move manifest changed before moving images.");
          evidence.push({ file: manifest, path: manifestPath, text: manifestText });
          for (const entry of evidence.filter((entry2) => entry2.bytes)) await readImage(entry);
          await validate(plan, { owned, evidence, snapshot, readBinaries: false });
          await plugin.ensureFolder(plan.destination);
          for (const candidate of selected) {
            await validate(plan, { owned, evidence, snapshot, attempted, readBinaries: false });
            const beforeRead = revision;
            await readImage(candidate);
            if (revision !== beforeRead || occupied(candidate.target)) throw new Error("Vault changed before the image move; preview again.");
            attempted.push(candidate);
            await plugin.renameVaultItem(candidate.file, candidate.target, candidate.path);
            assertFile(candidate.file, candidate.target);
          }
          await validate(plan, { owned, evidence, snapshot, attempted });
          await plugin.applyExpectedTextPlans(plan.plans, "Image link update");
          written = true;
          await validate(plan, { owned, evidence, snapshot, attempted, written });
          new Notice2("Images organized. Backup: " + snapshot);
          return { moved: selected.length, snapshot };
        } catch (error) {
          const conflicts = [];
          for (const candidate of attempted) for (const path of [candidate.path, candidate.target]) {
            try {
              const existing = occupied(path);
              if (existing) {
                if (existing !== candidate.file) conflicts.push(path + " is occupied; kept unchanged");
                continue;
              }
              assertFolderPath(path.split("/").slice(0, -1).join("/"));
              await plugin.ensureFolder(path.split("/").slice(0, -1).join("/"));
              await createBinary(path, candidate.bytes);
            } catch (recovery2) {
              conflicts.push(path + ": " + (recovery2.message || recovery2));
            }
          }
          throw new Error(String(error.message || error) + (snapshot ? " Backup: " + snapshot + "." : "") + (attempted.length ? " Recovery copies retained at both image paths where available." : "") + (conflicts.length ? " Review recovery conflicts: " + conflicts.join("; ") : ""));
        }
      });
    } finally {
      plugin.imageOrganizationBusy = false;
    }
  };
  plugin.renderImageAdmin = (el) => {
    el.empty();
    el.createEl("h2", { text: "Images" });
    el.createEl("p", { text: "Organize newly added and older local case images after reviewing the moves below. Shared notes are checked and their supported links are updated. Unsupported references stay in place. A backup is created before moving images." });
    const label = el.createEl("label", { text: "Image folder " });
    const input = label.createEl("input", { type: "text" });
    input.value = root();
    const save = el.createEl("button", { text: "Save image folder" });
    save.onclick = () => plugin.navigateFromUI("Save image folder", async () => {
      if (plugin.imageOrganizationBusy) throw new Error("Wait for image organization to finish before changing its folder.");
      const path = destinationRoot(input.value);
      const previous = plugin.settings.imageFolder;
      plugin.settings.imageFolder = path;
      try {
        await plugin.saveSettings();
      } catch (error) {
        plugin.settings.imageFolder = previous;
        throw error;
      }
      new Notice2("Image folder saved. Use Preview to organize case images.");
    });
    const previewButton = el.createEl("button", { text: "Preview image organization" });
    previewButton.onclick = () => plugin.navigateFromUI("Preview images", async () => {
      const plan = await plugin.previewImageOrganization();
      class ImagePreview extends Modal2 {
        onOpen() {
          const box = this.contentEl;
          box.createEl("h2", { text: "Review image moves" });
          box.createEl("p", { text: "Destination: " + plan.destination });
          const moving = plan.candidates.filter((item) => !item.blocked), skipped = plan.candidates.filter((item) => item.blocked);
          box.createEl("p", { text: moving.length + " images ready to move; " + skipped.length + " skipped; " + plan.plans.length + " referring notes to update. Cancel makes no changes." });
          for (const item of moving) box.createEl("p", { text: item.path + " → " + item.target });
          if (skipped.length) {
            const details = box.createEl("details");
            details.createEl("summary", { text: "Skipped images (" + skipped.length + ")" });
            for (const item of skipped) details.createEl("p", { text: item.path + " — " + item.blocked });
          }
          if (!plan.candidates.length) box.createEl("p", { text: "No unorganized local case images found." });
          const cancel = box.createEl("button", { text: "Cancel" });
          cancel.onclick = () => this.close();
          cancel.focus();
          const move = box.createEl("button", { text: "Back up and move images", cls: "mod-cta" });
          move.disabled = !plan.candidates.some((candidate) => !candidate.blocked);
          move.onclick = async () => {
            move.disabled = true;
            try {
              await plugin.applyImageOrganization(plan);
              this.close();
            } catch (error) {
              new Notice2(error.message || String(error));
              this.close();
            }
          };
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      new ImagePreview(plugin.app).open();
    });
  };
}

// src/launcher-workspace.mjs
var pending = /* @__PURE__ */ new WeakMap();
async function revealLauncher(plugin, file) {
  const workspace = plugin.app.workspace, path = plugin.launcherPath();
  const current = () => !plugin.unloading && file && file.path === path && plugin.launcherPath() === path && plugin.app.vault.getAbstractFileByPath(path) === file;
  if (!current()) return false;
  let changed2 = false;
  for (const leaf2 of workspace.getLeavesOfType("markdown")) {
    if (!current()) break;
    const view = leaf2.view;
    if (view?.file !== file || view.getMode?.() === "preview" || pending.has(leaf2)) continue;
    const state = leaf2.getViewState();
    if (state.type !== "markdown" || state.state?.file !== path || state.state?.mode === "preview") continue;
    if (!current() || leaf2.view !== view || view.file !== file || !workspace.getLeavesOfType("markdown").includes(leaf2)) continue;
    pending.set(leaf2, true);
    try {
      await leaf2.setViewState({ ...state, state: { ...state.state, mode: "preview" } });
      if (current() && leaf2.view === view && view.file === file && workspace.getLeavesOfType("markdown").includes(leaf2)) changed2 = true;
    } finally {
      pending.delete(leaf2);
    }
  }
  return changed2;
}
function installLauncherFeatures(plugin) {
  if (plugin.revealLauncher) return;
  plugin.revealLauncher = (file) => revealLauncher(plugin, file);
  const reveal = (file) => plugin.dispatchVaultEvent("launcher rendering", () => plugin.revealLauncher(file));
  plugin.registerEvent(plugin.app.workspace.on("file-open", reveal));
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", (leaf2) => reveal(leaf2?.view?.file)));
  plugin.app.workspace.onLayoutReady(() => {
    for (const leaf2 of plugin.app.workspace.getLeavesOfType("markdown")) reveal(leaf2.view?.file);
  });
}

// src/feature-workspace.mjs
var FEATURE_PAGES = Object.freeze({
  "Admin/Admin.md": ["CST Notes Admin", "cst-admin-workspace", "renderAdminWorkspace"],
  "Admin/Recovery.md": ["Recovery", "cst-admin-recovery", "renderRecoveryWorkspace"],
  "Admin/Metrics.md": ["Metrics", "cst-admin-metrics", "renderMetricsWorkspace"],
  "Admin/Import.md": ["Import", "cst-admin-import", "renderImportWorkspace"],
  "Admin/Transfer.md": ["CST Notes transfer", "cst-admin-transfer", "renderTransferAdmin"],
  "Admin/External Import.md": ["External notes import", "cst-admin-external-import", "renderExternalImport"],
  "Admin/Resources.md": ["Resources", "cst-admin-resources", "renderResourceAdmin"],
  "Admin/Images.md": ["Images", "cst-admin-images", "renderImageAdmin"],
  "Admin/Reset.md": ["Reset CST Notes", "cst-admin-reset", "renderResetWorkspace"]
});
function installFeatures(plugin, deps) {
  if (plugin.featuresInstalled) return;
  plugin.featuresInstalled = true;
  plugin.backgroundOperations = /* @__PURE__ */ new Set();
  plugin.featureMutationActive = false;
  plugin.runBackground = (operation) => {
    if (plugin.unloading || plugin.featureMutationActive || plugin.settings.resetNeedsReview || plugin.adminWorkspace?.resetNeedsReview) return Promise.resolve();
    const run = Promise.resolve().then(() => {
      if (!plugin.unloading && !plugin.featureMutationActive && !plugin.settings.resetNeedsReview && !plugin.adminWorkspace?.resetNeedsReview) return operation();
    });
    plugin.backgroundOperations.add(run);
    const cleanup = () => plugin.backgroundOperations.delete(run);
    run.then(cleanup, cleanup);
    return run;
  };
  plugin.featureMutationQueue = Promise.resolve();
  const serializeFeature = (operation) => {
    const run = plugin.featureMutationQueue.catch(() => {
    }).then(async () => {
      await plugin.adminMutationQueue;
      return operation();
    });
    plugin.featureMutationQueue = run.catch(() => {
    });
    return run;
  };
  plugin.withFeatureMutation = (operation) => serializeFeature(async () => {
    if (plugin.unloading) throw new Error("CST Notes is unloading.");
    plugin.featureMutationActive = true;
    const runtime = plugin.resourceFeatures;
    const backendBefore = plugin.app.vault.getAbstractFileByPath(plugin.p());
    const reviewBefore = !!(plugin.settings.resetNeedsReview || plugin.adminWorkspace?.resetNeedsReview);
    let pauseToken;
    try {
      if (runtime?.pause) {
        pauseToken = runtime.pause("CST Notes data transaction");
        await runtime.drain?.();
      } else plugin.stopResourceCollection?.();
      for (const name of ["graphRebuildTimer", "registryBacklogTimer"]) {
        if (plugin[name]) clearTimeout(plugin[name]);
        plugin[name] = null;
      }
      for (const timers of [plugin.verifyTimers, plugin.templateVersionTimers]) {
        for (const timer of timers?.values() || []) clearTimeout(timer);
        timers?.clear();
      }
      await Promise.allSettled([
        ...plugin.backgroundOperations,
        plugin.createRoutingQueue,
        plugin.registryMutationQueue,
        plugin.migrationSessionQueue,
        plugin.graphRebuildPromise,
        ...plugin.templateVersionQueues?.values() || []
      ].filter(Boolean));
      if (plugin.unloading) throw new Error("CST Notes unloaded before the operation started.");
      return await operation();
    } finally {
      plugin.featureMutationActive = false;
      try {
        const needsReview = plugin.settings.resetNeedsReview || plugin.adminWorkspace?.resetNeedsReview;
        if (needsReview) runtime?.stop();
        if (runtime?.resume && pauseToken !== void 0) {
          const replacedBackend = backendBefore && plugin.app.vault.getAbstractFileByPath(plugin.p()) !== backendBefore;
          await runtime.resume(pauseToken, { discardHistory: !!replacedBackend });
        } else if (!needsReview && !plugin.unloading && plugin.settings.initialized) await plugin.startResourceCollection?.();
        if (reviewBefore && !needsReview && !plugin.unloading && plugin.settings.initialized) await plugin.startResourceCollection?.();
        if (!needsReview && !plugin.unloading && plugin.settings.initialized) {
          plugin.scheduleRegistryBacklogRetry?.(750);
          await plugin.findExampleCase?.();
        }
      } catch (error) {
        new deps.Notice("CST Notes background refresh paused: " + (error.message || error));
      }
    }
  });
  const supplied = { ...deps, withAdminMutation: plugin.withFeatureMutation };
  installTransferFeatures(plugin, supplied);
  installResourceFeatures(plugin, supplied);
  installAttachmentFeatures(plugin, supplied);
  installLauncherFeatures(plugin);
  plugin.renderImportWorkspace = (el) => {
    el.empty();
    el.createEl("h2", { text: "Import" });
    el.createEl("p", { text: "Choose where your notes came from. Shared CST Notes exports and external notes use separate import flows." });
    const actions = el.createDiv({ cls: "cst-admin-action-grid" });
    const fromCST = actions.createEl("button", { text: "Import from CST Notes", attr: { type: "button" } });
    fromCST.onclick = () => plugin.navigateFromUI("Import from CST Notes", () => plugin.openCSTImport());
    const external = actions.createEl("button", { text: "Import external notes", attr: { type: "button" } });
    external.onclick = () => plugin.navigateFromUI("Import external notes", () => plugin.openPath(plugin.p("Admin/External Import.md")));
    el.createEl("p", { text: "From CST Notes: use Import from clipboard or choose the sender's export file, then review the destination and surgeon profile before importing." });
    el.createEl("p", { text: "From another app: use Obsidian Importer to convert your notes, then sort them into CST Notes. The external-import guide walks you through each step." });
  };
  installAdminWorkspace(plugin, { ...supplied, adminPages: {
    import: (el) => plugin.renderImportWorkspace(el),
    resources: (el) => plugin.renderResourceAdmin(el),
    images: (el) => plugin.renderImageAdmin(el)
  } });
  for (const route of ["deleted-case", "admin-file", "admin-folder", "migration-undo"]) plugin.attachmentRecovery?.registerRestoreRoute(route);
  plugin.registerMarkdownCodeBlockProcessor("cst-resource-data", async (_source, el) => {
    el.empty();
    el.createEl("p", { text: "CST Notes resource library — managed locally. Open Admin → Resources to review terms and sources." });
  });
  const addCommand = plugin.addCommand.bind(plugin);
  plugin.addCommand = (command) => {
    if (ADMIN_DEVELOPER_COMMANDS.includes(command.id) && command.callback) {
      const callback = command.callback;
      return addCommand({ ...command, callback: (...args) => plugin.adminWorkspace.runDeveloperCommand(command.id, () => callback(...args)) });
    }
    return addCommand(command);
  };
  const featurePageHosts = /* @__PURE__ */ new WeakSet();
  for (const [, processor, renderer] of Object.values(FEATURE_PAGES)) {
    const render = plugin[renderer];
    plugin[renderer] = async function(el, ...args) {
      let parent3 = el.parentElement;
      while (parent3 && !featurePageHosts.has(parent3)) parent3 = parent3.parentElement;
      const nested = !!parent3;
      featurePageHosts.add(el);
      try {
        return await render.call(this, el, ...args);
      } finally {
        if (renderer !== "renderImageAdmin" && !nested && !el.querySelector?.(".cst-app-home-nav")) {
          plugin.addHomeButton(el);
          el.prepend?.(el.lastElementChild);
        }
      }
    };
    plugin.registerMarkdownCodeBlockProcessor(processor, async (_source, el) => {
      await plugin[renderer](el);
    });
  }
  plugin.addCommand({ id: "import-cst-notes", name: "Import CST Notes", callback: () => plugin.openCSTImport() });
  plugin.addCommand({ id: "export-cst-notes", name: "Export current case to CST Notes", checkCallback: (checking) => {
    const file = plugin.app.workspace.getActiveFile();
    if (!plugin.caseContext(file)) return false;
    if (!checking) plugin.openCSTExport(file);
    return true;
  } });
  plugin.addCommand({ id: "external-import", name: "Import external notes", callback: () => plugin.navigateFromUI("External import", () => plugin.openPath(plugin.p("Admin/External Import.md"))) });
  plugin.app.workspace.onLayoutReady(() => {
    if (plugin.unloading) return;
    for (const event of ["create", "modify", "rename", "delete"]) {
      plugin.registerEvent(plugin.app.vault.on(event, (file, oldPath) => {
        if (!plugin.featureMutationActive && !plugin.unloading) plugin.onResourceFileEvent(event, file, oldPath);
      }));
    }
  });
  plugin.ensureFeaturePages = async function(legacyPages = {}) {
    const plugin2 = this;
    const plans = [];
    for (const [relative, [title, processor]] of Object.entries(FEATURE_PAGES)) {
      const path = plugin2.p(relative);
      deps.validatePortableVaultPath(path, "Feature page");
      const next = `# ${title}

\`\`\`${processor}
\`\`\`
`;
      const file = plugin2.app.vault.getAbstractFileByPath(path);
      if (!file) {
        await plugin2.ensureTextFile(path, next);
        continue;
      }
      if (!(file instanceof deps.TFile)) throw new Error("Admin page path is occupied: " + path);
      const original = await plugin2.app.vault.read(file);
      plugin2.assertVaultFilePath(file, path, "Admin page moved while upgrading.");
      if (original.includes("```" + processor)) continue;
      const legacy = legacyPages[relative];
      const generated = typeof legacy === "string" && original.replace(/\r\n/g, "\n").trim() === legacy.replace(/\r\n/g, "\n").trim();
      plans.push({ file, path, original, next: generated ? next : next + original });
    }
    if (plans.length) {
      await plugin2.snapshotFiles("v019-admin-workspace", plans.map((p) => p.file));
      await plugin2.applyExpectedTextPlans(plans, "Admin workspace upgrade");
    }
  };
}

// src/kelly-icon.mjs
var KELLY_ICON = '<defs><filter id="cst-kelly-alpha" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 .34 1.144 .116 0 -.35" result="cutout"/><feFlood flood-color="currentColor" result="ink"/><feComposite in="ink" in2="cutout" operator="in"/></filter></defs><g transform="translate(100 0) scale(-1 1)"><image x="-27" y="-24" width="152" height="152" href="data:image/jpeg;base64,/9j/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAEAAQADASIAAhEBAxEB/8QAHAABAQEAAgMBAAAAAAAAAAAAAAEHBQYCBAgD/8QAPhAAAgEDAwIDBAcECQUAAAAAAAECAwQFBgcRITESQVETImFxCBQjQlKBkTJicqEWFyQzQ5KiscEVJjSC0f/EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A+dwAAKQAVAhQAbAAEKQAXkgAFIAKEAAA4HAAgKBC8ggFAIBWAQCghQCABAABRAABSAAAABSFQ4AEKQAAAABQIUEAoIUAQrIBQCAUgCAArIAKQoAhQwIAAAAAAAAAUCAACkBQIEXgAAQAGCkAAAACkApAABUQoEBSAVBgARFIUAwQAAAAAAAAAAAAKQcgUMIMCAAAAAABQABGAAAAqIAKCAACgAQAAChgOCAoEKByBAAB7eFsKuUzFljKE6dOrd3FOhCVR8QjKclFNvyXLOT19pTJ6L1Rc6fy3spXFBRkqlLl06sJLlSjyk+O6+DTRwUJShOM4ScJxalGS7prqmj6K3Fx0d29nsXrvFU1PPYmi6V9b01zOaj/AHsePVP7SPqpNAfOhTxX8igUAckEKQFFAAEAAFIUgAoQAEPIjAIDsOQABAKwiFAEKABCkApC8kYA5LS1vi7vUmNtc3dVbTGVrqnTuq9NLxU6bfDkuen/AMONAHet6dv7jb/VP1SE6lxiruLq2FzPhucfOEmunii/1TT8z2NjNxqu3+pXO5VSrhr3wwvaUOso8fs1Yr8UeX081yvQ0PaPU2D3J0b/AFYa3qf22nFLGXcpL2k1Fe6oyf8AiwXRL70enkzKNy9vdQaCyrt8rQ9rZ1JNWt9Si/ZV15fwy9Yvr811A03fDaWndW8teaBjTvsZeQ+s3FparxKKfV1aKXeD7uC6xfPC45SwQ0PaHdXN6Au/YcSyGEqT8VaxlPjwN950pfdl8Oz8/U1bVO3mi93MRV1Zt/fW9llZPm5pSj4Kc6j+7VprrSm/xLo/j3A+ZinI6kwWX05lquKzdhWsbyn3p1F3XlKL7Si/JrlHGgCgAQoAAhQBAUAQqAAAAAAAIUBgQoAAhRwBAAAKAAIUAWnOdKpGrTnKE4SUoyi2nFrqmmuz+JvO3u+NlfYtaZ3QsoZOxqRVN30qKqeJeXtqf3n+/Hr8OepggA+idR7E6f1LYvO7aaitZW9XrG2q1fa0OfSNRcyh8ppmX1cTuNtVnYZR2V/ia1N+FXUI+0t6sfwuS5hKL9H/ACOr6fzuZ0/fxv8AB5S7x1yvv29Rx5+a7SXwaZsujvpG5i2pqz1diKGXt5Lwzr26VKq15+KD9yf+kDtmmNc6F3kw9LTWtbG3sc3JeG3fi8KlJ/et6r6xl+4+/wC8Y9u/tdk9vshBzu6N9jbhy+rV4tRqpLuqlPnlcfiXMfiuxrtOw2F3Jn4rOpQwuVrdoU5fUa3i/gf2c38uTt+jLS30hhtWXGayV5no4upG2+s3kIzuJ20KEJwpdeji5VZcc9Hzy/gHxmDe9xNoaeRustc6fxP9H8tjqELy8xDuFcUKlGp42p0JxScZLwT5ptcdPd7rnNdR7Z61wdtC9rYSteY+pTjVp3th/aKMoSXKlzHqk00+qQHTgPNrzXRr0HmAYAABgoEDBALyCGq6E2yxa0zDWu42Wng9PVFza0qf/kXj8vCuG0n5cJtrr0XUDKg+nc2KpuDtPjJO3wu01ve0Y+6q+Rrp1Jr14am1+p7FpkNkNb1FY3uDutDZCq+Kd3b1VK2UvJS+6l84pfFAYqU7XudoLM6CzULDJ+zr21xF1LO8pf3dxD1XpJcrmPlyu6aZ1MCjgAgMFIABAUUAAAykIBCshQBQBO64a5XxOwaW1jqLTl99ax+RqSjKl7Ctb3H21CvR680pwl0lHq+nlz04OvgD652I3F0RmqH/AEqxsLfT2brSUqtrKo5RuJJcJ06k23LhdFBvlLok0eGv9V6w2oaqWeBsstpB1WrepGc6day8Um/Yza5XhTbUG1xxxF9UfJUZOLUotpp8pp8NP1Ny2s30q21stO7g03lcVVh7D65OHtKlODXDjVj/AIsOPP8AaXxA5W73P2b1jHw6v0ZXsrmfSVzChGcov19pScZ/qmcXcbX7Wall/wBlbk29rcS/Ztb+al+XveCf+56G720VLHY/+mGgqqyunK8fbSpUZ+1lbRf3otdZ0/8AVHz9TGnw1w0pL49QNR1BsPuHi06lnYWuaod1UsLhSbX8MvC/05M+zOFzGFqull8VfWE104uaEqf82uD9sHqbUWCl4sNnclYfChcyjH/Lzx/I75iN+dwLSmqGRuMfm7ftKnf2kZeJfOPH/IGWp8rlPlF5Nge5G2WdbeqtqrWhVl+1cYmsqcvnwvD/ALs8o6d2Hz/TGazzOnK0u1PI0vFBP05a4/1AY4DaX9H++yFJ19La207mqLXMfDNxk/8AL40cJf7EbmWrfGFtrlLzt76k+fyk0wOs7UadhqvcTC4KtHm3uLhSuF60oJzmvzUePzOd+kLqevqDci/s4SdPG4eo7Gyt49IU1D3ZyS9XJP8AJJeRsH0ctqMxpHLXOpNS0qVvfOi7e0to1FUlTUmvHOTXTlpJJJvpzyYxv7pq705uflvbUZRtchXne2lTj3akJvlpP1jJtP8AL1A6CAANq0vdz1p9HPUuHyUncXulXC8sK0+sqdHhvwJ+iSqR+TXojFjZ9JW8tIfRy1Nnb37G61POFjYUpdJTpdU5pejTqP5JPzMY7sATkvAAIAAAAAABAACKAAAApGAQAAgKQDum125GoNA5Dx4+r9Zx1SXNxYVpP2VT1lH8E/3l+aZ3/VehtN7k4evrHa9xpZGPv5HAy4hOMn3cI9lJ+i92Xlw+hhhyWms7ltOZihl8Le1bO8ov3akH3XnGS7Si/NPowPQr0qtCtOjWpzpVacnGcJxcZRku6afVNeh4G8SWlt9LRzTtdO7gUqfbtQyKiv1b/WUf3o9sW1Bhcpp/LV8VmbGrZXlB8TpVF1+DT7OL8mujA9AIADzoValCsq1CpOjUXadOTjJfmupuv0e9U67yFxkKTzuUv7S3pwUKEo0bycZtvqqdWpGpKPCfPs3zzwYOdv0Xr/I6YxNfExxGDylhWqus6WQslUlCo0l4ozXEl2XTnyA0HXm+Wt8drKvaYu8x8bWxfsZU3j5QjWmv23OFT7SDT93w89ODkZbxaH15h44bczTVW2UX4qV3Yt1FSnxx44/fg/XjxJ+aZgNWc6tSVWcnKc5OUm31bfc8ANkntXoLJv6zp/dzDRt5PlU7+MYVIr0fvR6/kj9bPSuzujJK/wBSayjq65pe9DG42n9nUl5KTTfK+ckvmYs+vdJ/MeXAHcd1NfZLXuap3VzRhZWFrD2VjY0n7lCH/MnwuXx5JLhI6eiFAoIABSFA8ShAAAwAAIBQAgKAQgpH3AKCKCMBwQoAtGrVoVoVqFSdKrTkpwnCTjKMl2aa6pr1Ns05rLTm6GJt9JbmVIWeYpLwYvPwSjLxPtGo+3V+vuy/dl1eIjgDs+4mhs/obMvH5m2fspt/Vrqmm6VxFecX5P1i+q/mdZRsO1+5mMvcPHQe5tJZPAVeIW95Wbc7N9o8y7+FeUl1j8V0Xpbk7L53Tl9G7wtSGVwFxJOle+JcW0JNcOu10UFyn7Re7x16AZX8uBwbVudjdNad26tsPc4u2q5GnBQsq0oxoXtCcn4pTlOHNO7t5e94akXyuYp9e2LAQBgAQoAAAAGAABCgAEABCgAAEAAAAAAUgAFIwABCgAQrIAPob6JOs8rcZKvom9qO4x8LSdzaOfWVDwyipQT/AAPxdvJ9u588+Zu239zbbSbSy1vcUKdxqLUn2OLoVO1OiuqlLz8P336+4gO27u7KV9RZqGRxOfx+IxcKfhhY3MJqjbyb5m6fD8MVJ9WkkuTNM1sHrezs6l5iqmKz1CC5/sFz77+UZJc/JMz3U+o85qbIzv8APZS5v6833qz92K9Ix/ZivgkfjgM3l8BfU77CZK6x9xTfMZ29Rx/Vdmvg00B619a3Njd1bS9t61tcUZeGpSqwcJwfo0+qPx5N6tLiy300hd297bW1rr3EW/taFzTiorIUl91r59OPutpro2jBWmm1JOLT4aa6p+gAcgAAAQAABH3BQUAQpAAABAeYKAAABgAQqAYApAAAAAhSASfPglx34fBs30k348Rt7VtnF494CCoeFe6pcQ8X8vCY0bXt5c4zczbintplr2nZ5/GSlVwFzV6RqR6/ZN+fdrju1w1y48AYoDmNV6ZzulcnUx2exteyrQfClOP2dResJ/syXxTOLtqVW6rwoWtOdxVm+IU6UXOUn6JLqwND+jRVuaW9WA+rKXvutCp4fwOlLnn4dEdW3FjQhuDqKNs4ugspcqn4e3HtZdjW9EYj+prSV7rjU0IUdTX9vK2wuOk050/F3nNeXk3+FLjvLgwirOdWrOrUk51Jyc5yfeUm+W/1AgCAAAEAAFAAEBIcAFABkAoCBAA5IUUEL5gAAwABQICkIAYBRDyhKUJxnCUoSi04yi+GmuzT8mQAahp7fLWmOx0cblIY7UVnFceDJ0PHPj+NdX/7Js5Gpv3lrWjKOntH6YwlaS616Fv4pJ+q7L9eTHggOS1JnsxqPKTyecyNe/u59HUqy54X4YrtFfBcI40AAAAAAAjKCAUEHJAKAUAByAQIAAAAoAAADkAEABSAEAAFAAAAAQAAUAAQAAAABRAABQAAHABAHAKURgMACkHIAAAAAAAAAAEBgFKIUACAAgFICgAwAIVAgAMgFIAUVALuABScgAByAHAKQAAxyAA5AAAAAAAKQcgUEAADkAAB5gAAABSAACAf/9k=" filter="url(#cst-kelly-alpha)"/></g>';

// src/onboarding.mjs
var EXAMPLE_CASE_ID = "cst-example-general-v1";
var EXAMPLE_TEMPLATE_REL = "_Templates/Cases/Example.md";
var EXAMPLE_TITLE = "Laparoscopic Cholecystectomy — Example";
var EXAMPLE_BODY = `## Case

*Insert anatomy reference photos.*

1. Abdominal access and insufflation.
2. Camera and working ports placed.
3. Gallbladder exposed and anatomy identified.
4. Surgeon confirms safe identification before securing and dividing the cystic duct and artery.
5. Gallbladder separated from the liver bed.
6. Gallbladder retrieved in a specimen bag.
7. Operative site inspected.
8. Ports removed and incisions closed.

## PA

Jordan: 8B/8W XL

## Tips

- Confirm trocar sizes and clip-applier compatibility before opening.
- Keep the specimen retrieval bag accessible.
- Confirm whether cholangiography equipment is needed.

## Drape

- 4 Towels
- Laparoscopic abdominal drape

## Mayo

- Knife handle with blade
- Adson forceps
- Kelly x2
- Metzenbaum scissors
- CVD Mayo scissors
- Needle driver

## Basin

- Bovie
- Suction
- Insufflation tubing

## Back Table

*Insert photo of your completed back table.*

- Set up on the right
- Group laparoscopic instruments together.
- Keep clips, specimen bag, and closure supplies organized.

## Trays

- General instrument tray
- Laparoscopic cholecystectomy tray

## Equipment

- Laparoscopic tower
- Electrosurgical unit
- Suction

## Mayo Flow

- Entry: knife, forceps, access instruments
- Laparoscopic portion: camera, graspers, dissector, clip applier
- Specimen removal: retrieval bag, Kelly x2
- Closure: needle driver, forceps, suture scissors

## Sutures

- 0 Vicryl UR-6
- 2-0 Vicryl SH
- 4-0 Monocryl SH

## Dressings

- Dermabond

## Notes

If aspirating:

- Open lap aspiration needle
- 30cc L/L syringe
- Kidney basin
- Towel
`;
var EXAMPLE_TEMPLATE_BODY = `## Case

## PA

*Add assistant names, glove sizes, and gown preferences.*

## Tips

*Add useful setup reminders and surgeon preferences.*

## Drape

*List the towels and drapes needed.*

## Mayo

*List instruments and supplies for the Mayo stand.*

## Basin

*List basin items, tubing, and cords.*

## Back Table

*Add a setup photo and describe your back table layout.*

## Trays

*List instrument trays and sets.*

## Equipment

*List equipment and setup preferences.*

## Mayo Flow

*Describe how the Mayo setup changes during the case.*

## Sutures

*List suture sizes, types, and needles.*

## Dressings

*List dressings and closure supplies.*

## Notes

*Add other case preparation notes.*
`;
var ONBOARDING_CLEANUP_VERSION = 1;
var templateMarker = (token) => `<!-- cst-example-template: ${token} -->`;
var canCleanOwnedExamples = (plugin) => {
  const owned = plugin.settings.onboardingExample;
  return owned?.version === 1 && typeof owned.token === "string" && !!owned.token && typeof owned.surgeonId === "string" && !!owned.surgeonId && owned.state === "ready" && owned.caseId === EXAMPLE_CASE_ID && owned.folderPath === `${plugin.contentRoot}/General/Dr. Example` && owned.templatePath === plugin.p(EXAMPLE_TEMPLATE_REL);
};
var runMutation = (plugin, action) => plugin.withFeatureMutation ? plugin.withFeatureMutation(action) : plugin.serializedAdminMutation(action);
async function createOnboardingExample(plugin, deps) {
  const { TFile: TFile2, TFolder: TFolder2, id: id2, yamlString: yamlString2, parseFrontmatterObject: parseFrontmatterObject2, validatePortableVaultPath: validatePortableVaultPath2 } = deps;
  return runMutation(plugin, async () => {
    if (plugin.settings.resetNeedsReview || plugin.unloading) throw new Error("Onboarding is paused until CST Notes is ready.");
    await plugin.findExampleCase();
    if (plugin.exampleCase()) return plugin.exampleCase();
    const specialty = "General", surgeon2 = "Dr. Example";
    const folderPath = `${plugin.contentRoot}/${specialty}/${surgeon2}`;
    const casePath = `${folderPath}/${EXAMPLE_TITLE}.md`;
    const templatePath = plugin.p(EXAMPLE_TEMPLATE_REL);
    for (const path of [folderPath, casePath, templatePath, plugin.surgeonGraphPath(specialty, surgeon2)]) validatePortableVaultPath2(path, "Onboarding example");
    const vault = plugin.app.vault;
    let owned = plugin.settings.onboardingExample;
    const reusable = owned?.version === 1 && owned.casePath === casePath && owned.templatePath === templatePath && owned.folderPath === folderPath && owned.state === "creating";
    let registry = await plugin.getRegistrySurgeon(specialty, surgeon2, { create: false });
    if (!reusable) {
      const history = vault.getAbstractFileByPath(plugin.templateVersionRoot(templatePath));
      if (registry.data || history && (!(history instanceof TFolder2) || history.children.length) || [folderPath, casePath, templatePath].some((path) => vault.getAbstractFileByPath(path))) {
        throw new Error("An example destination is already in use. Existing notes, templates, and surgeon information were preserved.");
      }
      owned = {
        version: 1,
        token: id2("example"),
        caseId: EXAMPLE_CASE_ID,
        surgeonId: id2("surgeon"),
        specialty,
        surgeon: surgeon2,
        folderPath,
        casePath,
        templatePath,
        state: "creating"
      };
      plugin.settings.onboardingExample = owned;
      await plugin.saveSettings();
    }
    if (registry.data && registry.data.cst_id !== owned.surgeonId) throw new Error("The example surgeon identity changed. Existing data was preserved.");
    await plugin.ensureFolder(`${plugin.contentRoot}/${specialty}`);
    let folder = vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      plugin.markInternalCreate(folderPath);
      folder = await vault.createFolder(folderPath);
    }
    if (!(folder instanceof TFolder2)) throw new Error("The example surgeon path is not a folder.");
    if (!registry.data) {
      if (folder.children.length) throw new Error("The example folder gained content. It was preserved.");
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const data = plugin.adminRegistryRecord({
        cst_id: owned.surgeonId,
        gloves: "8B/8W",
        gown: "XL",
        music: "",
        aliases: [],
        created: now,
        last_verified: now
      }, specialty, surgeon2);
      await plugin.applyAdminRegistryChanges([{ specialty, surgeon: surgeon2, expected: null, data }]);
      registry = await plugin.getRegistrySurgeon(specialty, surgeon2, { create: false });
    }
    const assertFolder = () => {
      if (vault.getAbstractFileByPath(folderPath) !== folder || folder.path !== folderPath) throw new Error("The example folder moved or was replaced. Retry after Sync finishes.");
    };
    assertFolder();
    await plugin.ensureSpecialtyNode(specialty);
    await plugin.ensureSurgeonGraphNode(specialty, surgeon2, owned.surgeonId, registry.data);
    await plugin.ensureFolder(templatePath.slice(0, templatePath.lastIndexOf("/")));
    let template = vault.getAbstractFileByPath(templatePath);
    if (!template) {
      plugin.markInternalCreate(templatePath);
      template = await vault.create(templatePath, `${templateMarker(owned.token)}

${EXAMPLE_TEMPLATE_BODY}`);
    }
    if (!(template instanceof TFile2) || !(await vault.read(template)).startsWith(templateMarker(owned.token) + "\n")) {
      throw new Error("The Example template is not owned by this onboarding session. It was preserved.");
    }
    const version = await plugin.ensureTemplateVersion(template, false, templatePath);
    assertFolder();
    let file = vault.getAbstractFileByPath(casePath);
    if (!file) {
      const graph = `[[${plugin.surgeonGraphPath(specialty, surgeon2).replace(/\.md$/, "")}|${surgeon2}]]`;
      const created = (/* @__PURE__ */ new Date()).toISOString();
      const content = `---
cst_type: case
cst_example: true
cst_example_owner: ${yamlString2(owned.token)}
cst_id: ${EXAMPLE_CASE_ID}
specialty: General
surgeon: Dr. Example
surgeon_id: ${yamlString2(owned.surgeonId)}
graph_parent: ${yamlString2(graph)}
schema_version: 3
template: Example
template_version: v${version}
cst_created_template: Example
cst_created_template_version: v${version}
template_initialized: true
created: ${yamlString2(created)}
last_verified: ${yamlString2(created)}
---

# ${EXAMPLE_TITLE}

\`\`\`cst-surgeon-header
\`\`\`

${EXAMPLE_BODY}`;
      plugin.markInternalCreate(casePath);
      file = await vault.create(casePath, content);
    }
    if (!(file instanceof TFile2)) throw new Error("The example case path is occupied.");
    const fm = parseFrontmatterObject2(await vault.read(file));
    assertFolder();
    if (file.path !== casePath || vault.getAbstractFileByPath(casePath) !== file || fm.cst_id !== EXAMPLE_CASE_ID || fm.cst_example_owner !== owned.token) {
      throw new Error("The example case changed identity. Existing content was preserved.");
    }
    owned.state = "ready";
    plugin.exampleFile = file;
    plugin.settings.onboardingCompleted = {};
    plugin.settings.onboardingCreatedCases = [];
    plugin.settings.onboardingDismissed = false;
    delete plugin.settings.onboardingCompletionChoice;
    plugin.onboardingWelcomeUntil = 0;
    plugin.showCompletedOnboarding = false;
    await plugin.saveSettings();
    plugin.scheduleGraphRebuild(250);
    plugin.refreshOnboarding();
    return file;
  });
}
var changed = () => new Error("Example ownership or content changed during cleanup. Retry after editing and Sync finish.");
var recordKey = (data) => JSON.stringify(data || null);
var sameEntries = (a, b) => a.length === b.length && a.every((entry, i) => entry.path === b[i].path && entry.file === b[i].file && entry.text === b[i].text);
async function previewOnboardingCleanup(plugin, deps) {
  const { TFile: TFile2, TFolder: TFolder2, parseFrontmatterObject: parseFrontmatterObject2 } = deps;
  if (!canCleanOwnedExamples(plugin)) throw new Error("These examples belong to an earlier version or their ownership or locations changed. Automatic cleanup is unavailable.");
  if (plugin.settings.resetNeedsReview || plugin.unloading) throw new Error("Example cleanup is paused until CST Notes is ready.");
  const owned = plugin.settings.onboardingExample, ownership = recordKey(owned);
  const choice = plugin.settings.onboardingCompletionChoice;
  const vault = plugin.app.vault;
  const assertContext = () => {
    if (plugin.settings.onboardingExample !== owned || recordKey(owned) !== ownership || plugin.settings.onboardingCompletionChoice !== choice || plugin.settings.resetNeedsReview || plugin.unloading) throw changed();
  };
  const registry = await plugin.getRegistrySurgeon("General", "Dr. Example", { create: false });
  assertContext();
  const folder = vault.getAbstractFileByPath(owned.folderPath);
  const progress = owned.cleanupProgress;
  const retiredFolder = progress?.version === ONBOARDING_CLEANUP_VERSION && typeof progress.folderArchivePath === "string" && progress.folderArchivePath.startsWith(plugin.p("Admin/Backups/Quarantined Empty Folders") + "/") ? vault.getAbstractFileByPath(progress.folderArchivePath) : null;
  const resuming = !folder && !registry.data && retiredFolder instanceof TFolder2 && retiredFolder.children.length === 0;
  if (!resuming && (!(folder instanceof TFolder2) || registry.data?.cst_id !== owned.surgeonId)) {
    throw new Error("The owned example surgeon folder and registry identity are not both available. Existing content was preserved; retry after Sync finishes.");
  }
  const readEntry = async (file) => {
    const path = file.path, text = await vault.read(file);
    plugin.assertVaultFilePath(file, path, "An example file moved or was replaced.");
    assertContext();
    return { file, path, text };
  };
  const cases = [];
  let ownedExampleCount = 0;
  for (const file of plugin.allCaseFiles()) {
    const entry = await readEntry(file), fm = parseFrontmatterObject2(entry.text);
    const example = fm.cst_example === true && fm.cst_id === owned.caseId && fm.cst_example_owner === owned.token;
    if (example) ownedExampleCount++;
    if (!file.path.startsWith(owned.folderPath + "/")) continue;
    cases.push({ ...entry, example, caseId: typeof fm.cst_id === "string" ? fm.cst_id : "" });
  }
  cases.sort((a, b) => a.path.localeCompare(b.path));
  if (ownedExampleCount > 1) throw new Error("Duplicate example identities were found. No examples were removed.");
  const caseProgress = progress?.version === ONBOARDING_CLEANUP_VERSION && progress.caseStageStarted;
  const receipts = caseProgress && Array.isArray(progress.archivedCases) ? progress.archivedCases : [];
  const archivedPaths = /* @__PURE__ */ new Set();
  if (caseProgress && cases.length) {
    const archiveRoot = plugin.p("Admin/Backups/Deleted Cases");
    for (const file of plugin.filesWithin(archiveRoot, "json")) {
      const entry = await readEntry(file);
      let manifest;
      try {
        manifest = JSON.parse(entry.text);
      } catch {
        continue;
      }
      if (manifest.version === 1 && manifest.state === "archived" && manifest.surgeon_record?.cst_id === owned.surgeonId && typeof manifest.archive_path === "string" && manifest.archive_path.startsWith(archiveRoot + "/") && manifest.archive_path.replace(/\.md$/, ".json") === entry.path && typeof manifest.original_path === "string" && manifest.original_path.startsWith(owned.folderPath + "/")) {
        archivedPaths.add(manifest.original_path);
      }
    }
  }
  const candidates = cases.filter((entry) => !archivedPaths.has(entry.path) && !receipts.some((receipt) => receipt.path === entry.path || entry.caseId && receipt.caseId === entry.caseId));
  const exampleCount = candidates.filter((entry) => entry.example).length;
  const marker = templateMarker(owned.token);
  const hasMarker = (text) => text.replace(/\r\n/g, "\n").startsWith(marker + "\n");
  const revisions = plugin.templateVersionFilesReadOnly(owned.templatePath).map((entry) => entry.file);
  const backendPaths = [
    plugin.surgeonGraphPath("General", "Dr. Example"),
    plugin.surgeonDataPath("General", "Dr. Example"),
    plugin.legacySurgeonDataPath("General", "Dr. Example")
  ];
  const observed = [owned.templatePath, ...revisions.map((file) => file.path), ...backendPaths].map((path) => ({ path, file: vault.getAbstractFileByPath(path) }));
  const templates = [], backend = [];
  for (const item of observed) {
    if (!(item.file instanceof TFile2)) continue;
    const entry = await readEntry(item.file);
    if (!backendPaths.includes(item.path)) {
      if (hasMarker(entry.text)) templates.push(entry);
      continue;
    }
    let fm;
    try {
      fm = item.file.extension === "json" ? JSON.parse(entry.text) : parseFrontmatterObject2(entry.text);
    } catch {
      continue;
    }
    const graph = item.path === backendPaths[0];
    if (graph ? fm.cst_type === "surgeon-node" && fm.generated === true && fm.surgeon_id === owned.surgeonId : fm.cst_id === owned.surgeonId && fm.specialty === "General" && fm.surgeon === "Dr. Example") backend.push(entry);
  }
  const current = await plugin.getRegistrySurgeon("General", "Dr. Example", { create: false });
  assertContext();
  if (recordKey(current.data) !== recordKey(registry.data) || current.file !== registry.file || vault.getAbstractFileByPath(owned.folderPath) !== folder) throw changed();
  return {
    owned,
    choice,
    registry,
    folder,
    retiredFolder,
    resuming,
    cases,
    candidates,
    templates,
    backend,
    observed,
    children: (folder?.children || []).map((file) => ({ file, path: file.path })),
    revisions,
    caseCount: candidates.length,
    practiceCaseCount: candidates.length - exampleCount,
    retainedCaseCount: cases.length - candidates.length,
    casePaths: candidates.map((entry) => entry.path),
    templatePaths: templates.map((entry) => entry.path),
    backendPaths: backend.map((entry) => entry.path)
  };
}
async function cleanOwnedExamples(plugin, deps, confirmed) {
  const plan = await previewOnboardingCleanup(plugin, deps);
  if (confirmed && (plan.owned !== confirmed.owned || plan.choice !== confirmed.choice || plan.folder !== confirmed.folder || recordKey(plan.registry.data) !== recordKey(confirmed.registry.data) || !sameEntries(plan.candidates, confirmed.candidates) || !sameEntries(plan.templates, confirmed.templates) || !sameEntries(plan.backend, confirmed.backend))) {
    throw new Error("The cleanup preview changed. Review the updated case list and choose Start fresh again.");
  }
  const { owned, registry, folder, candidates, templates, backend } = plan;
  const vault = plugin.app.vault, removed = /* @__PURE__ */ new Set();
  let surgeonRemoved = plan.resuming;
  const identity = () => recordKey([owned.version, owned.token, owned.caseId, owned.surgeonId, owned.folderPath, owned.templatePath, owned.state]);
  const expectedIdentity = identity();
  const assertContext = () => {
    if (plugin.settings.onboardingExample !== owned || identity() !== expectedIdentity || plugin.settings.onboardingCompletionChoice !== plan.choice || plugin.settings.resetNeedsReview || plugin.unloading) throw changed();
  };
  const assertState = async () => {
    assertContext();
    const current = await plugin.getRegistrySurgeon("General", "Dr. Example", { create: false });
    assertContext();
    if (current.file !== registry.file || recordKey(current.data) !== recordKey(surgeonRemoved ? null : registry.data)) throw changed();
    if (vault.getAbstractFileByPath(owned.folderPath) !== (surgeonRemoved ? null : folder)) throw changed();
    if (surgeonRemoved && (folder || plan.retiredFolder)?.children.length) throw changed();
    const cases = plugin.allCaseFiles().filter((file) => file.path.startsWith(owned.folderPath + "/"));
    if (cases.length !== plan.cases.filter((entry) => !removed.has(entry.file)).length || cases.some((file) => !plan.cases.some((entry) => entry.file === file && entry.path === file.path && !removed.has(file)))) throw changed();
    const revisions = plugin.templateVersionFilesReadOnly(owned.templatePath).map((entry) => entry.file);
    if (revisions.length !== plan.revisions.filter((file) => !removed.has(file)).length || revisions.some((file) => !plan.revisions.includes(file))) throw changed();
    for (const item of plan.observed) {
      if (vault.getAbstractFileByPath(item.path) !== (removed.has(item.file) ? null : item.file)) throw changed();
    }
    if (!surgeonRemoved && (folder.children.length !== plan.children.filter((entry) => !removed.has(entry.file)).length || folder.children.some((file) => !plan.children.some((entry) => entry.file === file && entry.path === file.path && !removed.has(file))))) throw changed();
  };
  const verifyEntry = async (entry) => {
    plugin.assertVaultFilePath(entry.file, entry.path, "Example cleanup paused because a file moved or was replaced.");
    const text = await vault.read(entry.file);
    await assertState();
    plugin.assertVaultFilePath(entry.file, entry.path, "Example cleanup paused because a file moved or was replaced.");
    if (text !== entry.text) throw changed();
  };
  await assertState();
  const canRetireSurgeon = surgeonRemoved || folder.children.every((file) => candidates.some((entry) => entry.file === file));
  const entries = [...candidates, ...templates, ...canRetireSurgeon ? backend : []];
  if (entries.length || !surgeonRemoved && canRetireSurgeon) {
    await plugin.snapshotFiles("Onboarding examples", entries.map((entry) => entry.file).concat(registry.file || []));
  }
  await assertState();
  for (const entry of entries) await verifyEntry(entry);
  if (!owned.cleanupProgress?.caseStageStarted || owned.cleanupProgress.version !== ONBOARDING_CLEANUP_VERSION) {
    owned.cleanupProgress = {
      ...owned.cleanupProgress?.version === ONBOARDING_CLEANUP_VERSION ? owned.cleanupProgress : {},
      version: ONBOARDING_CLEANUP_VERSION,
      caseStageStarted: true,
      archivedCases: []
    };
    await plugin.saveSettings();
    await assertState();
  }
  for (const entry of candidates) {
    await verifyEntry(entry);
    await plugin.archiveCaseDeletion(entry.file, entry.path, entry.text);
    removed.add(entry.file);
    assertContext();
    owned.cleanupProgress.archivedCases = [...owned.cleanupProgress.archivedCases || [], { path: entry.path, caseId: entry.caseId }];
    await plugin.saveSettings();
    await assertState();
    await plugin.cleanupDeletedCaseState?.(entry.path);
  }
  if (owned.cleanupProgress.caseStageVersion !== ONBOARDING_CLEANUP_VERSION) {
    owned.cleanupProgress.caseStageVersion = ONBOARDING_CLEANUP_VERSION;
    await plugin.saveSettings();
    await assertState();
  }
  for (const entry of templates) {
    await verifyEntry(entry);
    await plugin.quarantineManagedFile(entry.file, entry.path, "Onboarding example template");
    removed.add(entry.file);
    await assertState();
  }
  await assertState();
  if (!surgeonRemoved && folder.children.length === 0) {
    const target = await plugin.quarantineEmptySurgeonFolder(folder, owned.folderPath, "Onboarding example surgeon");
    try {
      assertContext();
      if (folder.children.length || vault.getAbstractFileByPath(owned.folderPath)) throw changed();
      owned.cleanupProgress = { ...owned.cleanupProgress, version: ONBOARDING_CLEANUP_VERSION, folderArchivePath: target, surgeonRecord: registry.data };
      await plugin.saveSettings();
      assertContext();
      if (folder.children.length || vault.getAbstractFileByPath(owned.folderPath)) throw changed();
      await plugin.applyAdminRegistryChanges([{ specialty: "General", surgeon: "Dr. Example", expected: registry.data, data: null }]);
      surgeonRemoved = true;
      await assertState();
    } catch (error) {
      const current = await plugin.getRegistrySurgeon("General", "Dr. Example", { create: false });
      if (!current.data) await plugin.applyAdminRegistryChanges([{ specialty: "General", surgeon: "Dr. Example", expected: null, data: registry.data }]);
      if (!vault.getAbstractFileByPath(owned.folderPath)) await plugin.renameVaultItem(folder, owned.folderPath, target);
      throw error;
    }
  }
  try {
    if (surgeonRemoved) for (const entry of backend) {
      await verifyEntry(entry);
      await plugin.quarantineManagedFile(entry.file, entry.path, "Onboarding example backend");
      removed.add(entry.file);
      await assertState();
    }
    await plugin.findExampleCase();
    await assertState();
    const result = {
      surgeonKept: !surgeonRemoved,
      templateKept: !!vault.getAbstractFileByPath(owned.templatePath),
      caseKept: !!plugin.exampleCase(),
      archivedCaseCount: candidates.length,
      retainedCaseCount: plan.retainedCaseCount,
      caseStageComplete: owned.cleanupProgress.caseStageVersion === ONBOARDING_CLEANUP_VERSION,
      complete: surgeonRemoved
    };
    if (result.complete) {
      const previous = owned.cleanupVersion;
      owned.cleanupVersion = ONBOARDING_CLEANUP_VERSION;
      try {
        await plugin.saveSettings();
        await assertState();
      } catch (error) {
        if (previous === void 0) delete owned.cleanupVersion;
        else owned.cleanupVersion = previous;
        await plugin.saveSettings();
        throw error;
      }
    }
    plugin.scheduleGraphRebuild(250);
    return result;
  } catch (error) {
    const liveFolder = vault.getAbstractFileByPath(owned.folderPath);
    const retired = folder || plan.retiredFolder;
    const record = registry.data || owned.cleanupProgress?.surgeonRecord;
    if (surgeonRemoved && (liveFolder instanceof deps.TFolder || retired?.children.length) && record?.cst_id === owned.surgeonId) {
      const current = await plugin.getRegistrySurgeon("General", "Dr. Example", { create: false });
      if (!current.data) await plugin.applyAdminRegistryChanges([{ specialty: "General", surgeon: "Dr. Example", expected: null, data: record }]);
      if (!liveFolder && retired?.children.length) await plugin.renameVaultItem(retired, owned.folderPath, retired.path);
    }
    throw error;
  }
}
async function cleanOnboardingExamples(plugin, deps, confirmed = null) {
  return runMutation(plugin, () => cleanOwnedExamples(plugin, deps, confirmed));
}
async function migrateExampleTemplate(plugin, deps) {
  if (!canCleanOwnedExamples(plugin) || plugin.settings.resetNeedsReview || plugin.unloading) return false;
  const owned = plugin.settings.onboardingExample, vault = plugin.app.vault;
  const file = vault.getAbstractFileByPath(owned.templatePath);
  if (!(file instanceof deps.TFile)) return false;
  const expected = `${templateMarker(owned.token)}

${EXAMPLE_BODY}`;
  const text = await vault.read(file);
  plugin.assertVaultFilePath(file, owned.templatePath, "Example template moved during migration.");
  if (text.replace(/\r\n/g, "\n") !== expected) return false;
  await plugin.snapshotFiles("Onboarding template update", [file]);
  await plugin.ensureTemplateVersion(file, false, owned.templatePath);
  if (plugin.settings.onboardingExample !== owned || !canCleanOwnedExamples(plugin) || plugin.settings.resetNeedsReview || plugin.unloading) throw changed();
  await plugin.replaceFileTextExpected(
    file,
    text,
    `${templateMarker(owned.token)}

${EXAMPLE_TEMPLATE_BODY}`,
    "Example template changed during migration. User edits were preserved.",
    owned.templatePath
  );
  await plugin.ensureTemplateVersion(file, false, owned.templatePath);
  return true;
}
async function updateOnboardingExamples(plugin, deps) {
  return runMutation(plugin, async () => {
    const choice = plugin.settings.onboardingCompletionChoice;
    const owned = plugin.settings.onboardingExample;
    if (choice === "fresh" && owned?.cleanupVersion === ONBOARDING_CLEANUP_VERSION) return { cleanup: "already-complete", templateMigrated: false };
    try {
      if (choice === "fresh" && plugin.onboardingTasks().every(([key4]) => plugin.settings.onboardingCompleted?.[key4] === true)) {
        const result = await cleanOwnedExamples(plugin, deps, null);
        return { ...result, cleanup: result.complete ? "complete" : "pending", templateMigrated: false };
      }
      const templateMigrated = await migrateExampleTemplate(plugin, deps);
      return { cleanup: "skipped", reason: choice === "continue" ? "continue" : "incomplete-or-unknown-choice", templateMigrated };
    } catch (error) {
      return { cleanup: "pending", templateMigrated: false, reason: error.message || String(error) };
    }
  });
}
async function finishOnboarding(plugin, choice, deps, confirmed = null) {
  if (plugin.onboardingFinishing || plugin.settings.onboardingCompletionChoice || !plugin.onboardingDone()) return false;
  if (!["fresh", "continue"].includes(choice)) throw new Error("Choose Start fresh or Continue from here.");
  plugin.onboardingFinishing = true;
  try {
    await plugin.onboardingSave;
    if (plugin.settings.onboardingCompletionChoice || !plugin.onboardingDone()) return false;
    const result = choice === "fresh" ? await cleanOnboardingExamples(plugin, deps, confirmed) : null;
    plugin.settings.onboardingCompletionChoice = choice;
    plugin.showCompletedOnboarding = false;
    try {
      await plugin.saveSettings();
    } catch (error) {
      delete plugin.settings.onboardingCompletionChoice;
      throw error;
    }
    if (result && !result.complete) plugin.scheduleOnboardingUpdate?.();
    plugin.onboardingWelcomeUntil = Date.now() + 1e4;
    await plugin.activateSidebar({ specialty: "", surgeon: "", query: "" });
    plugin.refreshOnboarding();
    if (result) {
      const retained = [result.caseKept && "the example case", result.templateKept && "Example template", result.surgeonKept && "Dr. Example"].filter(Boolean);
      if (retained.length) new deps.Notice(`Example cleanup finished. Kept ${retained.join(", ")} because it contains other content or its ownership changed.`);
    }
    return true;
  } finally {
    plugin.onboardingFinishing = false;
  }
}
function openOnboardingCompletion(plugin, deps) {
  if (plugin.onboardingCompletionPrompt || plugin.onboardingFinishing || plugin.settings.onboardingCompletionChoice || plugin.unloading) return;
  const { Modal: Modal2, Notice: Notice2 } = deps;
  class CompletionModal extends Modal2 {
    onOpen() {
      this.contentEl.createEl("h2", { text: "You’re ready to start!" });
      this.contentEl.createEl("p", { text: "Start fresh to remove all cases in the owned General / Dr. Example folder, including cases you created for practice and edits you made. This also removes the owned Example template, its revisions, and the example surgeon profile and backend when the folder is empty. Or keep the examples to continue practicing." });
      this.contentEl.createEl("p", { text: "General, shared images, and cases outside this example surgeon are kept. Removed content remains recoverable in Admin → Recovery.", cls: "cst-muted" });
      const canClean = canCleanOwnedExamples(plugin);
      if (!canClean) this.contentEl.createEl("p", { text: "These examples were added by an earlier version or their locations have changed. Continue from here to keep them; remove unwanted cases individually using Delete. Automatic cleanup is unavailable so your notes and surgeon information stay safe.", cls: "cst-muted" });
      const actions = this.contentEl.createDiv({ cls: "cst-actions" });
      const fresh = actions.createEl("button", { text: "Start fresh", cls: "mod-cta" });
      fresh.disabled = true;
      fresh.setAttribute("aria-describedby", "cst-onboarding-recommended");
      if (canClean) this.contentEl.createEl("p", { text: "Recommended: start fresh with your own cases.", attr: { id: "cst-onboarding-recommended" }, cls: "cst-muted" });
      const keep = actions.createEl("button", { text: "Continue from here" });
      const previewEl = this.contentEl.createDiv({ cls: "cst-onboarding-cleanup-preview" });
      const loadPreview = async () => {
        this.preview = null;
        fresh.disabled = true;
        previewEl.empty();
        if (!canClean) return;
        previewEl.createEl("p", { text: "Checking the cases included in Start fresh…" });
        try {
          const preview = await previewOnboardingCleanup(plugin, deps);
          if (plugin.onboardingCompletionPrompt !== this) return;
          this.preview = preview;
          previewEl.empty();
          previewEl.createEl("p", { text: `Start fresh will archive ${preview.caseCount} case${preview.caseCount === 1 ? "" : "s"}, including ${preview.practiceCaseCount} practice case${preview.practiceCaseCount === 1 ? "" : "s"}:` });
          const list = previewEl.createEl("ul");
          for (const path of preview.casePaths) list.createEl("li", { text: path });
          if (preview.retainedCaseCount) previewEl.createEl("p", { text: `${preview.retainedCaseCount} previously archived case${preview.retainedCaseCount === 1 ? "" : "s"} now restored will be kept.` });
          fresh.disabled = this.running || false;
        } catch (error) {
          if (plugin.onboardingCompletionPrompt !== this) return;
          previewEl.empty();
          previewEl.createEl("p", { text: error.message || String(error), cls: "cst-muted" });
        }
      };
      const choose = async (choice) => {
        if (this.running || choice === "fresh" && !this.preview) return;
        this.running = true;
        fresh.disabled = keep.disabled = true;
        try {
          await finishOnboarding(plugin, choice, deps, this.preview);
          this.running = false;
          this.close();
        } catch (error) {
          new Notice2("Onboarding completion paused: " + (error.message || error));
          await loadPreview();
        } finally {
          this.running = false;
          fresh.disabled = !this.preview;
          keep.disabled = false;
        }
      };
      fresh.onclick = () => choose("fresh");
      keep.onclick = () => choose("continue");
      this.previewReady = loadPreview();
      return this.previewReady;
    }
    close() {
      if (!this.running) super.close();
    }
    onClose() {
      plugin.onboardingCompletionPrompt = null;
      this.contentEl.empty();
    }
  }
  const modal = new CompletionModal(plugin.app);
  plugin.onboardingCompletionPrompt = modal;
  modal.open();
}

// src/glove-settings.mjs
var glove_settings_exports = {};
__export(glove_settings_exports, {
  DEFAULT_GLOVE_LABELS: () => DEFAULT_GLOVE_LABELS,
  DEFAULT_GLOVE_SIZES: () => DEFAULT_GLOVE_SIZES,
  DEFAULT_GLOVE_TYPES: () => DEFAULT_GLOVE_TYPES,
  GloveValidationError: () => GloveValidationError,
  createGloveSettingsDraft: () => createGloveSettingsDraft,
  gloveHelpText: () => gloveHelpText,
  gloveLegend: () => gloveLegend,
  initializeGloveSettings: () => initializeGloveSettings,
  installGloveSettingsRuntime: () => installGloveSettingsRuntime,
  migrateGloveRegistry: () => migrateGloveRegistry,
  migrateGloveValue: () => migrateGloveValue,
  normalizeGloveConfig: () => normalizeGloveConfig,
  normalizeGloveLabels: () => normalizeGloveLabels,
  normalizeGloveSizes: () => normalizeGloveSizes,
  normalizeGloveTypes: () => normalizeGloveTypes,
  normalizeGloves: () => normalizeGloves,
  parseGloves: () => parseGloves,
  prepareGloveSettingsSave: () => prepareGloveSettingsSave,
  renderGloveSettingsEditor: () => renderGloveSettingsEditor
});
var DEFAULT_GLOVE_SIZES = Object.freeze(["5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5"]);
var DEFAULT_GLOVE_LABELS = Object.freeze({ O: "Ortho", B: "Blue", W: "White" });
var GOWNS = Object.freeze(["XL", "XL-Long", "2X", "2X-Long", "Unknown"]);
var LEGACY_ALIASES = Object.freeze({ O: ["ortho", "othro", "orthopedic"], B: ["blue"], W: ["white"] });
var DEFAULT_GLOVE_TYPES = Object.freeze(Object.entries(DEFAULT_GLOVE_LABELS).map(([code, label]) => Object.freeze({ code, label, aliases: Object.freeze([...LEGACY_ALIASES[code]]) })));
var own2 = (object2, key4) => Object.prototype.hasOwnProperty.call(object2, key4);
var equal2 = (left, right) => JSON.stringify(left) === JSON.stringify(right);
var phraseKey = (value) => value.trim().replace(/\s+/g, " ").normalize("NFKC").toUpperCase().toLowerCase();
var escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var reserved = /* @__PURE__ */ new Set(["x", "unknown", "two", "three", "four"]);
var GloveValidationError = class extends Error {
  constructor(message, input, field = "gloves") {
    super(message);
    this.name = "GloveValidationError";
    this.input = input;
    this.field = field;
  }
};
function invalid(message, input, field) {
  throw new GloveValidationError(message, input, field);
}
function decimalSize(value) {
  if (typeof value !== "string" && typeof value !== "number") invalid("Glove sizes must be positive decimal numbers.", value, "gloveSizes");
  const raw = String(value).trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) invalid(`Invalid glove size: "${raw}". Use a positive decimal number.`, value, "gloveSizes");
  const [whole, fraction = ""] = raw.split(".");
  const integer = whole.replace(/^0+/, "") || "0";
  const decimal = fraction.replace(/0+$/, "");
  const normalized = integer + (decimal ? `.${decimal}` : "");
  if (!Number.isFinite(Number(normalized)) || Number(normalized) <= 0 || Number(normalized) > Number.MAX_SAFE_INTEGER) {
    invalid(`Invalid glove size: "${raw}". Use a finite positive decimal number.`, value, "gloveSizes");
  }
  return normalized;
}
function compareDecimals(left, right) {
  const [li, lf = ""] = left.split("."), [ri, rf = ""] = right.split(".");
  if (li.length !== ri.length) return li.length - ri.length;
  if (li !== ri) return li < ri ? -1 : 1;
  const width = Math.max(lf.length, rf.length);
  const lp = lf.padEnd(width, "0"), rp = rf.padEnd(width, "0");
  return lp === rp ? 0 : lp < rp ? -1 : 1;
}
function normalizeGloveSizes(input = DEFAULT_GLOVE_SIZES) {
  let values;
  if (Array.isArray(input)) values = [...input];
  else if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed || /(?:^|,)\s*(?:,|$)/.test(trimmed)) invalid("Enter glove sizes separated by commas or spaces; a size is missing.", input, "gloveSizes");
    values = trimmed.split(/[\s,]+/);
  } else invalid("Glove sizes must be a list of decimal numbers.", input, "gloveSizes");
  if (!values.length) invalid("Enter at least one glove size.", input, "gloveSizes");
  try {
    return [...new Set(values.map(decimalSize))].sort(compareDecimals);
  } catch (error) {
    if (error instanceof GloveValidationError) error.input = input;
    throw error;
  }
}
function typeCode(value) {
  if (typeof value !== "string" || !/^[a-z]+$/i.test(value.trim()) || reserved.has(value.trim().toLowerCase())) {
    invalid("Glove type codes must contain letters only; X, Unknown, Two, Three and Four are reserved.", value, "gloveTypes");
  }
  return value.trim().toUpperCase();
}
function inputPhrase(value) {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f,;/+&|#]/.test(value) || /^[\d.]/.test(value.trim()) || /\d/.test(value) || reserved.has(phraseKey(value))) {
    invalid("Glove labels and aliases must be nonempty text without numbers, list separators or reserved quantity words.", value, "gloveTypes");
  }
  return value.trim().replace(/\s+/g, " ");
}
function displayLabel(value) {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    invalid("Enter a nonempty, single-line glove display label.", value, "gloveTypes");
  }
  return value.trim().replace(/\s+/g, " ");
}
function labelAliases(label) {
  try {
    return [inputPhrase(label)];
  } catch (error) {
    if (error instanceof GloveValidationError) return [];
    throw error;
  }
}
function uniqueAliases(values) {
  const seen = /* @__PURE__ */ new Set();
  return values.filter((value) => {
    const key4 = phraseKey(value);
    if (seen.has(key4)) return false;
    seen.add(key4);
    return true;
  });
}
function makeTypeIndex(types) {
  const index = /* @__PURE__ */ new Map();
  for (const type of types) {
    for (const phrase of [type.code, ...labelAliases(type.label), ...type.aliases]) {
      const key4 = phraseKey(phrase);
      const previous = index.get(key4);
      if (previous && previous.code !== type.code) invalid(`Ambiguous glove code or label "${phrase}" belongs to both ${previous.code} and ${type.code}.`, phrase, "gloveTypes");
      index.set(key4, { phrase, code: type.code });
    }
  }
  for (const key4 of index.keys()) {
    if (/x$/.test(key4) && (index.has(key4.slice(0, -1).trim()) || reserved.has(key4.slice(0, -1).trim()))) {
      invalid(`Glove code or label "${index.get(key4).phrase}" is ambiguous with the quantity marker x.`, key4, "gloveTypes");
    }
    const suffix = /\s+(?:two|three|four|unknown)$/.exec(key4);
    if (suffix && index.has(key4.slice(0, suffix.index))) {
      invalid(`Glove label "${index.get(key4).phrase}" is ambiguous with another glove entry or quantity.`, key4, "gloveTypes");
    }
  }
  return [...index.values()].sort((left, right) => right.phrase.length - left.phrase.length).map((entry) => ({
    ...entry,
    pattern: new RegExp(`^${escapeRegex(entry.phrase).replace(/ /g, "\\s+")}`, "iu")
  }));
}
function normalizeGloveTypes(input = DEFAULT_GLOVE_TYPES) {
  if (!Array.isArray(input)) invalid("Glove types must be a list of codes and display labels.", input, "gloveTypes");
  const seen = /* @__PURE__ */ new Set();
  const types = input.map((row) => {
    if (!isObject(row)) invalid("Invalid glove type row.", row, "gloveTypes");
    const code = typeCode(row.code), label = displayLabel(row.label);
    if (seen.has(code)) invalid(`Duplicate glove type code: ${code}.`, row.code, "gloveTypes");
    seen.add(code);
    const aliases = row.aliases === void 0 ? LEGACY_ALIASES[code] || [] : row.aliases;
    if (!Array.isArray(aliases)) invalid(`Aliases for ${code} must be a list.`, aliases, "gloveTypes");
    return { code, label, aliases: uniqueAliases(aliases.map(inputPhrase)) };
  });
  makeTypeIndex(types);
  return types;
}
function normalizeGloveConfig(settings = {}) {
  if (!isObject(settings)) invalid("Invalid glove settings.", settings, "settings");
  let types = settings.gloveTypes;
  if (types === void 0) {
    if (settings.gloveLabels !== void 0 && !isObject(settings.gloveLabels)) invalid("Invalid glove labels.", settings.gloveLabels, "gloveTypes");
    const labels = { ...DEFAULT_GLOVE_LABELS, ...settings.gloveLabels };
    types = Object.entries(labels).map(([code, label]) => ({ code, label: label || DEFAULT_GLOVE_LABELS[code] }));
  }
  const gloveTypes = normalizeGloveTypes(types);
  return {
    gloveSizes: normalizeGloveSizes(settings.gloveSizes),
    gloveTypes,
    gloveLabels: Object.fromEntries(gloveTypes.map(({ code, label }) => [code, label]))
  };
}
function normalizeGloveLabels(labels) {
  return normalizeGloveConfig(labels === void 0 ? {} : { gloveLabels: labels }).gloveLabels;
}
function parseDetailed(input, config) {
  if (input !== void 0 && input !== null && typeof input !== "string") invalid("Gloves must be text.", input);
  const raw = input ?? "";
  if (!raw.trim()) return [{ unknown: true }];
  const index = makeTypeIndex(config.gloveTypes), sizes = new Set(config.gloveSizes);
  const entries = [];
  let offset = 0;
  const fail2 = () => invalid(`Could not normalize glove entry: "${raw}" (near "${raw.slice(offset)}").`, raw);
  const skipSpace = () => {
    offset += /^\s*/.exec(raw.slice(offset))[0].length;
  };
  while (offset < raw.length) {
    offset += /^[\s,;/+&|]*/.exec(raw.slice(offset))[0].length;
    if (offset === raw.length) break;
    const unknown = /^unknown(?![\p{L}\p{M}_])/iu.exec(raw.slice(offset));
    if (unknown) {
      entries.push({ unknown: true });
      offset += unknown[0].length;
      continue;
    }
    const sizeMatch = /^#?\s*(?:\d+(?:\.\d+)?|\.\d+)/.exec(raw.slice(offset));
    if (!sizeMatch) fail2();
    let size;
    try {
      size = decimalSize(sizeMatch[0].replace(/^#?\s*/, ""));
    } catch {
      fail2();
    }
    if (!sizes.has(size)) fail2();
    offset += sizeMatch[0].length;
    skipSpace();
    let code = "", typeStart = offset, typeEnd = offset;
    for (const entry of index) {
      const match = entry.pattern.exec(raw.slice(offset));
      if (!match) continue;
      const rest = raw.slice(offset + match[0].length);
      if (/^[\p{L}\p{M}_]/u.test(rest) && !/^x\s*\d/i.test(rest)) continue;
      code = entry.code;
      offset += match[0].length;
      typeEnd = offset;
      break;
    }
    skipSpace();
    let quantity = 1;
    const count = /^x\s*(\d+)/i.exec(raw.slice(offset));
    const word = /^(two|three|four)(?![\p{L}\p{M}\d_])/iu.exec(raw.slice(offset));
    if (count) {
      quantity = Number(count[1]);
      offset += count[0].length;
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99 || raw[offset] === ".") fail2();
    } else if (word) {
      quantity = { two: 2, three: 3, four: 4 }[word[1].toLowerCase()];
      offset += word[0].length;
    }
    entries.push({ size, code, quantity, typeStart, typeEnd });
    if (raw[offset] === ".") fail2();
  }
  if (!entries.length) fail2();
  return entries;
}
function parseGloves(input, settings = {}) {
  return parseDetailed(input, normalizeGloveConfig(settings)).map((entry) => entry.unknown ? { unknown: true } : { size: entry.size, code: entry.code, quantity: entry.quantity });
}
function normalizeGloves(input, settings = {}) {
  return parseGloves(input, settings).map((entry) => entry.unknown ? "Unknown" : `${entry.size}${entry.code}${entry.quantity > 1 ? `x${entry.quantity}` : ""}`).join(" / ");
}
function gloveLegend(value, settings = {}) {
  const config = normalizeGloveConfig(settings);
  const used = new Set(parseDetailed(value, config).filter((entry) => !entry.unknown).map((entry) => entry.code));
  return config.gloveTypes.filter((type) => used.has(type.code)).map((type) => `${type.code} = ${type.label}`).join(" · ");
}
function gloveHelpText(settings = {}) {
  const config = normalizeGloveConfig(settings);
  return {
    legend: config.gloveTypes.map((type) => `${type.code} = ${type.label}`).join(" · "),
    sizes: config.gloveSizes.join(", "),
    example: `${config.gloveSizes[0]}${config.gloveTypes[0]?.code || ""}x2`,
    description: "Enter size, optional type code, and optional x quantity (1–99). Use / between entries. Unknown is always available."
  };
}
function createGloveSettingsDraft(settings = {}, { includeOrdinarySettings = false } = {}) {
  const config = normalizeGloveConfig(settings);
  return {
    gloveSizes: config.gloveSizes.join(", "),
    gloveTypes: config.gloveTypes.map((type) => ({ ...type, aliases: [...type.aliases], originalCode: type.code })),
    ...includeOrdinarySettings ? { defaultGown: settings.defaultGown ?? "XL" } : {},
    ...includeOrdinarySettings && settings.developerMode === true ? { verificationDebounceSeconds: String((settings.verificationDebounceMs ?? 45e3) / 1e3) } : {}
  };
}
function validateOrdinaryValue(key4, value) {
  if (key4 === "defaultGown" && GOWNS.includes(value)) return value;
  if (key4 === "verificationDebounceMs" && Number.isSafeInteger(value) && value >= 5e3 && value <= 2147483647) return value;
  invalid(key4 === "defaultGown" ? "Choose a supported default gown." : "Verification debounce must be at least 5 seconds and within the timer limit.", value, key4);
}
function ordinaryValue(settings, key4) {
  return settings?.[key4] ?? (key4 === "defaultGown" ? "XL" : 45e3);
}
function ordinaryChanges(baseline, current, draft) {
  const changes = {};
  const set = (key4, value) => {
    validateOrdinaryValue(key4, value);
    const before = ordinaryValue(current, key4);
    const merged = mergeField(ordinaryValue(baseline, key4), value, before, key4);
    if (!equal2(merged, before)) changes[key4] = { before, value: merged };
  };
  if (own2(draft, "defaultGown")) set("defaultGown", draft.defaultGown);
  if (own2(draft, "verificationDebounceSeconds")) {
    const text = String(draft.verificationDebounceSeconds).trim();
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) invalid("Enter a valid verification debounce in seconds.", draft.verificationDebounceSeconds, "verificationDebounceMs");
    const [seconds, rawFraction = ""] = text.split(".");
    const fraction = rawFraction.replace(/0+$/, "");
    if (fraction.length > 3) invalid("Verification debounce supports millisecond precision (three decimal places).", draft.verificationDebounceSeconds, "verificationDebounceMs");
    const value = Number(seconds || "0") * 1e3 + Number(fraction.padEnd(3, "0"));
    if (current?.developerMode !== true && value !== ordinaryValue(baseline, "verificationDebounceMs")) {
      invalid("Developer mode is required to change verification debounce.", text, "verificationDebounceMs");
    }
    set("verificationDebounceMs", value);
  }
  return changes;
}
function resolveOrdinaryChanges(changes, current) {
  const patch = {};
  for (const [key4, change] of Object.entries(changes || {})) {
    validateOrdinaryValue(key4, change.value);
    patch[key4] = mergeField(change.before, change.value, ordinaryValue(current, key4), key4);
  }
  return patch;
}
function conflict2(field) {
  invalid(`Glove ${field} changed in another window or device. Reload settings before saving.`, field, "conflict");
}
function mergeField(base, draft, current, field) {
  if (equal2(base, draft)) return current;
  if (!equal2(base, current) && !equal2(draft, current)) conflict2(field);
  return draft;
}
function prepareGloveSettingsSave({ baselineSettings, currentSettings = baselineSettings, draft }) {
  const base = normalizeGloveConfig(baselineSettings), current = normalizeGloveConfig(currentSettings);
  if (!isObject(draft) || !Array.isArray(draft.gloveTypes)) invalid("Invalid glove settings draft.", draft, "settings");
  const ordinary = ordinaryChanges(baselineSettings, currentSettings, draft);
  const desiredSizes = normalizeGloveSizes(draft.gloveSizes);
  const gloveSizes = mergeField(base.gloveSizes, desiredSizes, current.gloveSizes, "sizes");
  const desired = draft.gloveTypes.map((row) => ({ ...normalizeGloveTypes([row])[0], originalCode: row.originalCode }));
  const baselineRows = new Map(base.gloveTypes.map((row) => [row.code, row]));
  const latestRows = new Map(current.gloveTypes.map((row) => [row.code, { ...row, aliases: [...row.aliases] }]));
  const seen = /* @__PURE__ */ new Set(), renames = {};
  for (const row of desired) {
    if (row.originalCode == null) {
      if (baselineRows.has(row.code) || latestRows.has(row.code)) conflict2(`type code ${row.code}`);
      latestRows.set(row.code, { code: row.code, label: row.label, aliases: [...row.aliases] });
      continue;
    }
    const original = row.originalCode;
    if (!baselineRows.has(original) || seen.has(original)) invalid("Invalid or duplicate original glove type row.", original, "gloveTypes");
    seen.add(original);
    const before = baselineRows.get(original), latest = latestRows.get(original);
    const requested = { code: row.code, label: row.label, aliases: row.aliases };
    if (equal2(before, requested)) continue;
    if (!latest) conflict2(`type ${original}`);
    const merged = {
      code: mergeField(before.code, row.code, latest.code, `code ${original}`),
      label: mergeField(before.label, row.label, latest.label, `label ${original}`),
      aliases: mergeField(before.aliases, row.aliases, latest.aliases, `aliases ${original}`)
    };
    if (merged.code !== original && (baselineRows.has(merged.code) || latestRows.has(merged.code))) {
      invalid(`Code ${merged.code} already belongs to another glove type; choose an unused code.`, merged.code, "gloveTypes");
    }
    merged.aliases = uniqueAliases([
      ...merged.aliases,
      ...merged.code !== original ? [original] : [],
      ...merged.label !== latest.label ? labelAliases(latest.label) : []
    ]);
    if (merged.code === original) latestRows.set(original, merged);
    else {
      const ordered = [...latestRows].map(([key4, value]) => key4 === original ? [merged.code, merged] : [key4, value]);
      latestRows.clear();
      for (const [key4, value] of ordered) latestRows.set(key4, value);
    }
    if (merged.code !== original) renames[original] = merged.code;
  }
  for (const before of base.gloveTypes) {
    if (seen.has(before.code)) continue;
    const latest = latestRows.get(before.code);
    if (latest && !equal2(before, latest)) conflict2(`type ${before.code}`);
    latestRows.delete(before.code);
  }
  const config = normalizeGloveConfig({ gloveSizes, gloveTypes: [...latestRows.values()] });
  const settingsPatch = resolveOrdinaryChanges(ordinary, currentSettings);
  if (!equal2(current.gloveSizes, config.gloveSizes)) settingsPatch.gloveSizes = config.gloveSizes;
  if (!equal2(current.gloveTypes, config.gloveTypes)) {
    settingsPatch.gloveTypes = config.gloveTypes;
    settingsPatch.gloveLabels = config.gloveLabels;
  }
  const remaining = new Set(config.gloveTypes.map((type) => type.code));
  const migrationRequired = Object.keys(renames).length > 0 || current.gloveSizes.some((size) => !config.gloveSizes.includes(size)) || current.gloveTypes.some((type) => !remaining.has(type.code) || type.aliases.some((alias) => !config.gloveTypes.find((row) => row.code === type.code)?.aliases.includes(alias)));
  return { settingsPatch, ordinaryChanges: ordinary, config, previousConfig: current, renames, migrationRequired, changed: Object.keys(settingsPatch).length > 0 };
}
function migrationContext(plan) {
  const previousConfig = normalizeGloveConfig(plan.previousConfig), config = normalizeGloveConfig(plan.config);
  if (!isObject(plan.renames)) invalid("Invalid glove code migration map.", plan.renames, "migration");
  const oldCodes = new Set(previousConfig.gloveTypes.map((type) => type.code));
  const newCodes = new Set(config.gloveTypes.map((type) => type.code));
  const targets = /* @__PURE__ */ new Set();
  for (const [from, to] of Object.entries(plan.renames)) {
    if (!oldCodes.has(from) || !newCodes.has(to) || targets.has(to) || from !== to && oldCodes.has(to)) {
      invalid("Glove code migrations require distinct existing source codes and unused destination codes.", plan.renames, "migration");
    }
    targets.add(to);
  }
  return { previousConfig, config, renames: plan.renames, newCodes };
}
function migrateValue(value, context) {
  const { previousConfig, config, renames, newCodes } = context;
  let entries, parsedCurrent = false;
  try {
    entries = parseDetailed(value, previousConfig);
  } catch (previousError) {
    try {
      entries = parseDetailed(value, { ...config, gloveSizes: [.../* @__PURE__ */ new Set([...previousConfig.gloveSizes, ...config.gloveSizes])] });
      parsedCurrent = true;
    } catch {
      throw previousError;
    }
  }
  const previousIndex = parsedCurrent ? makeTypeIndex(previousConfig.gloveTypes) : [];
  let next = value;
  for (const entry of [...entries].reverse()) {
    if (entry.unknown) continue;
    let sourceCode = entry.code;
    if (parsedCurrent && entry.code) {
      const spelling = value.slice(entry.typeStart, entry.typeEnd);
      const previous = previousIndex.find((type) => type.pattern.exec(spelling)?.[0].length === spelling.length);
      if (previous && own2(renames, previous.code)) sourceCode = previous.code;
    }
    const code = own2(renames, sourceCode) ? renames[sourceCode] : entry.code;
    if (code && !newCodes.has(code)) invalid(`Glove type ${entry.code} is still used by a profile. Keep it or rename it before saving.`, value, "migration");
    if (!config.gloveSizes.includes(entry.size)) invalid(`Glove size ${entry.size} is still used by a profile. Keep it before saving.`, value, "migration");
    if (code !== sourceCode) next = next.slice(0, entry.typeStart) + code + next.slice(entry.typeEnd);
  }
  parseDetailed(next, config);
  return next;
}
function migrateGloveValue(value, plan) {
  return migrateValue(value, migrationContext(plan));
}
function migrateGloveRegistry(registry, plan) {
  if (!isObject(registry) || !isObject(registry.surgeons)) invalid("Invalid surgeon registry; glove migration stopped.", registry, "registry");
  const context = migrationContext(plan), changedKeys = [];
  const surgeons = Object.fromEntries(Object.entries(registry.surgeons).map(([key4, record]) => {
    if (!isObject(record)) invalid(`Invalid surgeon record: ${key4}.`, record, "registry");
    if (!own2(record, "gloves")) return [key4, record];
    let gloves;
    try {
      gloves = migrateValue(record.gloves, context);
    } catch (error) {
      error.recordKey = key4;
      throw error;
    }
    if (gloves === record.gloves) return [key4, record];
    changedKeys.push(key4);
    return [key4, { ...record, gloves }];
  }));
  return { registry: changedKeys.length ? { ...registry, surgeons } : registry, changedKeys };
}
function bridgeConfig(plan) {
  const renamed = new Set(Object.keys(plan.renames));
  const retained = new Set(plan.config.gloveTypes.map((type) => type.code));
  return normalizeGloveConfig({
    gloveSizes: [...plan.previousConfig.gloveSizes, ...plan.config.gloveSizes],
    gloveTypes: [...plan.config.gloveTypes, ...plan.previousConfig.gloveTypes.filter((type) => !renamed.has(type.code) && !retained.has(type.code))]
  });
}
function initializeGloveSettings(plugin) {
  try {
    Object.assign(plugin.settings, normalizeGloveConfig(plugin.settings));
    plugin.gloveSettingsError = "";
  } catch (error) {
    plugin.gloveSettingsError = error.message;
  }
}
async function persistGlovePatch(plugin, patch) {
  if (plugin.unloading) throw new Error("CST Notes is unloading. Retry the glove update after reopening it.");
  const before = Object.fromEntries(Object.keys(patch).map((key4) => [key4, { present: own2(plugin.settings, key4), value: plugin.settings[key4] }]));
  Object.assign(plugin.settings, patch);
  try {
    await plugin.saveSettings();
  } catch (error) {
    for (const [key4, previous] of Object.entries(before)) {
      if (!equal2(plugin.settings[key4], patch[key4])) continue;
      if (previous.present) plugin.settings[key4] = previous.value;
      else delete plugin.settings[key4];
    }
    throw error;
  }
}
function installGloveSettingsRuntime(plugin, { refresh = async () => {
} } = {}) {
  if (plugin.gloveSettingsRuntimeInstalled) return;
  plugin.gloveSettingsRuntimeInstalled = true;
  const mutate = plugin.mutateSurgeonRegistry.bind(plugin);
  plugin.mutateSurgeonRegistry = (mutator, options) => mutate((registry) => {
    const previous = new Map(Object.entries(registry.surgeons).map(([key4, record]) => [key4, record?.gloves]));
    const result = mutator(registry);
    for (const [key4, record] of Object.entries(registry.surgeons)) {
      if (record && record.gloves !== previous.get(key4)) {
        const config = plugin.settings.gloveMigration?.config || plugin.settings;
        normalizeGloves(record.gloves, config);
      }
    }
    return result;
  }, options);
  const reload = async () => {
    if (plugin.unloading) throw new Error("CST Notes is unloading. Retry the glove update after reopening it.");
    const saved = await plugin.loadData();
    if (saved && typeof saved === "object") {
      Object.assign(plugin.settings, saved);
      for (const key4 of ["gloveTypes", "gloveSizes", "gloveLabels", "gloveMigration"]) {
        if (!own2(saved, key4)) delete plugin.settings[key4];
      }
    }
    initializeGloveSettings(plugin);
  };
  const refreshAfterSave = async () => {
    try {
      await refresh();
    } catch (error) {
      plugin.gloveDisplayRefreshError = error.message || String(error);
    }
  };
  const finish = async (plan) => {
    const state = await plugin.readSurgeonRegistry({ create: false });
    if (state.invalid) throw new Error(`Glove settings stopped: ${state.error}`);
    if (state.missing && plugin.settings.initialized) throw new Error("The surgeon registry is missing. Wait for Sync before retrying the glove update.");
    if (!state.missing) {
      await plugin.mutateSurgeonRegistry((registry) => {
        if (plugin.unloading) throw new Error("CST Notes is unloading. Retry the glove update after reopening it.");
        if (!equal2(plugin.settings.gloveMigration, plan)) conflict2("pending update");
        const migrated = migrateGloveRegistry(registry, plan);
        registry.surgeons = migrated.registry.surgeons;
        return migrated.changedKeys;
      }, { create: false });
    }
    await reload();
    if (!equal2(plugin.settings.gloveMigration, plan) || !equal2(normalizeGloveConfig(plugin.settings), bridgeConfig(plan))) conflict2("pending update");
    await persistGlovePatch(plugin, { ...plan.config, ...resolveOrdinaryChanges(plan.ordinaryChanges, plugin.settings), gloveMigration: null });
    initializeGloveSettings(plugin);
    await refreshAfterSave();
    return plugin.settings;
  };
  plugin.resumeGloveConfiguration = () => plugin.serializedAdminMutation(async () => {
    await reload();
    const plan = plugin.settings.gloveMigration;
    if (!plan) return plugin.settings;
    if (plan.version !== 1) throw new Error("Unsupported pending glove update. Keep the saved settings for review.");
    migrationContext(plan);
    return finish(plan);
  });
  plugin.saveGloveConfiguration = (draft, baselineSettings) => plugin.serializedAdminMutation(async () => {
    await reload();
    if (plugin.settings.gloveMigration) throw new Error("A glove update is pending. Use Retry glove update before making more changes.");
    const plan = prepareGloveSettingsSave({ baselineSettings, currentSettings: plugin.settings, draft });
    if (!plan.changed) return plugin.settings;
    if (!plan.migrationRequired) {
      await persistGlovePatch(plugin, plan.settingsPatch);
      initializeGloveSettings(plugin);
      await refreshAfterSave();
      return plugin.settings;
    }
    const state = await plugin.readSurgeonRegistry({ create: false });
    if (state.invalid) throw new Error(`Glove settings stopped: ${state.error}`);
    if (state.missing && plugin.settings.initialized) throw new Error("The surgeon registry is missing. Wait for Sync before changing glove types or sizes.");
    if (!state.missing) migrateGloveRegistry(state.registry, plan);
    const journal = { version: 1, previousConfig: plan.previousConfig, config: plan.config, renames: plan.renames, ordinaryChanges: plan.ordinaryChanges };
    await persistGlovePatch(plugin, { ...bridgeConfig(plan), gloveMigration: journal });
    return finish(journal);
  });
}
function renderGloveSettingsEditor(parent3, plugin, { rows = [] } = {}) {
  const root = parent3.createDiv({ cls: "cst-glove-settings cst-settings-editor" });
  let baseline, draft;
  try {
    baseline = { ...plugin.settings, ...normalizeGloveConfig(plugin.settings) };
    draft = createGloveSettingsDraft(baseline, { includeOrdinarySettings: true });
  } catch (error2) {
    root.createEl("p", { text: `Glove settings need correction: ${error2.message}`, cls: "cst-warning" });
    return root;
  }
  const controls = [];
  const input = (parentEl, value, name) => {
    const field = parentEl.createEl("input", { type: "text", attr: { "aria-label": name } });
    field.value = value;
    field.onkeydown = exitSingleLineOnEnter;
    controls.push(field);
    return field;
  };
  const table = root.createEl("table", { cls: "cst-table" });
  const summary = (name, value) => {
    const row = table.createEl("tr");
    row.createEl("th", { text: name });
    return row.createEl("td", { text: value });
  };
  for (const [name, value] of rows) summary(name, String(value));
  const gown = summary("Default gown", "").createEl("select", { attr: { "aria-label": "Default gown" } });
  for (const value of GOWNS) gown.createEl("option", { value, text: value });
  gown.value = draft.defaultGown;
  gown.onchange = () => {
    draft.defaultGown = gown.value;
  };
  controls.push(gown);
  let debounce;
  if (own2(draft, "verificationDebounceSeconds")) {
    debounce = input(summary("Verification debounce (seconds)", ""), draft.verificationDebounceSeconds, "Verification debounce (seconds)");
    debounce.oninput = () => {
      draft.verificationDebounceSeconds = debounce.value;
    };
  }
  const sizeCell = summary("Glove sizes", "");
  const sizes = input(sizeCell, draft.gloveSizes, "Glove sizes");
  sizes.oninput = () => {
    draft.gloveSizes = sizes.value;
  };
  const typeSummary = summary("Glove types", gloveHelpText(baseline).legend);
  typeSummary.setAttribute("aria-readonly", "true");
  root.createEl("p", { text: "Edit type codes and labels below. X is reserved for quantities. Unknown is always available. Changes apply only when you select Save.", cls: "cst-muted" });
  const editor = root.createDiv({ cls: "cst-glove-type-editor" });
  const renderTypes = () => {
    editor.empty();
    for (const row of draft.gloveTypes) {
      const line = editor.createDiv({ cls: "cst-modal-grid" });
      const code = input(line, row.code, "Glove type code");
      code.oninput = () => {
        row.code = code.value;
      };
      const label = input(line, row.label, "Glove display label");
      label.oninput = () => {
        row.label = label.value;
      };
      const remove = line.createEl("button", { text: "Remove type" });
      controls.push(remove);
      remove.onclick = () => {
        draft.gloveTypes.splice(draft.gloveTypes.indexOf(row), 1);
        renderTypes();
      };
    }
  };
  renderTypes();
  const add = root.createEl("button", { text: "Add label" });
  controls.push(add);
  add.onclick = () => {
    draft.gloveTypes.push({ originalCode: null, code: "", label: "", aliases: [] });
    renderTypes();
  };
  const error = root.createEl("p", { cls: "cst-warning", attr: { role: "alert", "aria-live": "polite" } });
  const save = root.createEl("button", { text: "Save", cls: "mod-cta" });
  controls.push(save);
  const retry = root.createEl("button", { text: "Retry glove update" });
  const updatePending = () => {
    retry.hidden = !plugin.settings.gloveMigration;
    for (const control of controls) control.disabled = !!plugin.settings.gloveMigration;
  };
  updatePending();
  if (plugin.settings.gloveMigration) error.setText("A glove update is pending. Select Retry glove update to finish before editing these settings.");
  const persist = async (action) => {
    if (root.gloveSaveBusy) return;
    root.gloveSaveBusy = true;
    for (const control of controls) control.disabled = true;
    retry.disabled = true;
    error.setText("");
    try {
      const saved = await action();
      baseline = { ...saved, ...normalizeGloveConfig(saved) };
      draft = createGloveSettingsDraft(baseline, { includeOrdinarySettings: true });
      gown.value = draft.defaultGown;
      if (debounce) debounce.value = draft.verificationDebounceSeconds ?? String((saved.verificationDebounceMs ?? 45e3) / 1e3);
      sizes.value = draft.gloveSizes;
      typeSummary.setText(gloveHelpText(baseline).legend);
      renderTypes();
      error.setText("Settings saved.");
    } catch (failure) {
      error.setText(`${failure.message || failure}${plugin.settings.gloveMigration ? " The compatible settings were retained. Select Retry glove update to finish." : ""}`);
    } finally {
      root.gloveSaveBusy = false;
      for (const control of controls) control.disabled = false;
      retry.disabled = false;
      updatePending();
    }
  };
  save.onclick = () => save.disabled ? void 0 : persist(() => plugin.saveGloveConfiguration(draft, baseline));
  retry.onclick = () => retry.disabled ? void 0 : persist(() => plugin.resumeGloveConfiguration());
  return root;
}

// src/main.js
var {
  Plugin,
  Modal: ObsidianModal,
  Notice,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  MarkdownView,
  ItemView,
  Platform,
  normalizePath,
  moment,
  parseYaml,
  setIcon,
  addIcon
} = require("obsidian");
var PLUGIN_VERSION = "0.1.11";
var Modal = class extends ObsidianModal {
  constructor(...args) {
    super(...args);
    this.modalEl?.addClass?.("cst-accessible-modal");
    this.contentEl?.addEventListener?.("keydown", exitSingleLineOnEnter);
  }
  open() {
    const result = super.open();
    this.cstViewport?.removeEventListener?.("resize", this.cstResize);
    const viewport = this.cstViewport = this.modalEl?.ownerDocument?.defaultView?.visualViewport;
    this.cstResize = () => this.modalEl?.style?.setProperty?.("--cst-dialog-height", `${viewport?.height || this.modalEl?.ownerDocument?.defaultView?.innerHeight || 800}px`);
    this.cstResize();
    viewport?.addEventListener?.("resize", this.cstResize);
    return result;
  }
  close() {
    this.cstViewport?.removeEventListener?.("resize", this.cstResize);
    this.cstViewport = null;
    this.cstResize = null;
    return super.close();
  }
};
var SCHEMA_VERSION = 3;
var DEFAULT_GLOVE_LABELS2 = Object.freeze({ O: "Ortho", B: "Blue", W: "White" });
var GOWNS2 = ["XL", "XL-Long", "2X", "2X-Long", "Unknown"];
var CASE_HEADER_LANG = "cst-surgeon-header";
var CASE_HEADER_BLOCK = "```cst-surgeon-header\n```";
var MIGRATION_V011 = "v0.1.1-live-surgeon-header";
var MIGRATION_V012 = "v0.1.2-mobile-registry-sidebar";
var MIGRATION_V013 = "v0.1.3-app-migration-workspace";
var LAUNCHER_LANG = "cst-launcher";
var MIGRATION_STATE_LANG = "cst-migration-state";
var VIEW_TYPE_CST_SIDEBAR = "cst-notes-sidebar";
var MIGRATION_AUTOFILL_ENGINE_VERSION = 4;
var VERIFICATION_BUCKET_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_SPECIALTIES = ["Ortho", "Spine", "General", "GU", "GYN", "ENT", "Vascular", "Plastics"];
var DEFAULT_SETTINGS = {
  initialized: false,
  contentRoot: "CST Notes/Specialties",
  backendRoot: "Backend",
  defaultGown: "XL",
  verificationDebounceMs: 45e3,
  schemaVersion: SCHEMA_VERSION,
  pluginVersion: "",
  autoOpenSidebar: true,
  autoOpenDefaultVersion: "",
  gloveLabels: DEFAULT_GLOVE_LABELS2,
  templateDefaultsVersion: "",
  templateReviewCompleted: false,
  onboardingCompleted: {},
  onboardingDismissed: false,
  launcherPath: "CST App.md",
  completedMigrations: [],
  migrationFailures: {}
};
function cleanPath(...parts) {
  return normalizePath(parts.filter(Boolean).join("/").replace(/\/+/g, "/"));
}
function id(prefix) {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function") return `${prefix}-${c.randomUUID()}`;
    throw new Error("randomUUID unavailable");
  } catch (_) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
function yamlString(v) {
  return JSON.stringify(String(v ?? ""));
}
function nowISO() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function verificationISO(timestamp = Date.now()) {
  const value = Number(timestamp);
  const safe = Number.isFinite(value) ? value : Date.now();
  return new Date(Math.floor(safe / VERIFICATION_BUCKET_MS) * VERIFICATION_BUCKET_MS).toISOString();
}
function versionAtLeast(value, minimum) {
  const parts = (input) => String(input || "").split(/[.-]/).slice(0, 3).map((part) => {
    const number = Number.parseInt(part, 10);
    return Number.isFinite(number) ? number : 0;
  });
  const current = parts(value);
  const required = parts(minimum);
  for (let index = 0; index < 3; index++) {
    if ((current[index] || 0) !== (required[index] || 0)) {
      return (current[index] || 0) > (required[index] || 0);
    }
  }
  return true;
}
function frontmatterBlock(text) {
  const value = String(text || "");
  const match = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(value);
  return match ? { text: match[0], end: match[0].length } : null;
}
function frontmatterScalar(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return yamlString(value);
}
function setFrontmatterScalars(text, fields, removeKeys = []) {
  const value = String(text || "");
  const block = frontmatterBlock(value);
  const newline = (block?.text || value).includes("\r\n") ? "\r\n" : "\n";
  const bom = value.startsWith("\uFEFF") ? "\uFEFF" : "";
  let lines = [];
  let tail = value.slice(bom.length);
  if (block) {
    const blockLines = block.text.slice(bom.length).split(/\r?\n/);
    while (blockLines.length && blockLines[blockLines.length - 1] === "") blockLines.pop();
    if (blockLines.shift() !== "---" || blockLines.pop() !== "---") {
      throw new Error("Case frontmatter is incomplete.");
    }
    lines = blockLines;
    tail = value.slice(block.end);
  }
  const entries = new Map(Object.entries(fields || {}));
  const removals = new Set(removeKeys || []);
  const seen = /* @__PURE__ */ new Set();
  lines = lines.flatMap((line) => {
    const match = /^([A-Za-z0-9_-]+)\s*:/.exec(line);
    if (match && removals.has(match[1])) return [];
    if (!match || !entries.has(match[1])) return [line];
    seen.add(match[1]);
    return [`${match[1]}: ${frontmatterScalar(entries.get(match[1]))}`];
  });
  for (const [key4, fieldValue] of entries) {
    if (!seen.has(key4)) lines.push(`${key4}: ${frontmatterScalar(fieldValue)}`);
  }
  return `${bom}---${newline}${lines.join(newline)}${lines.length ? newline : ""}---${newline}${tail}`;
}
function frontmatterTopLevelScalar(text, key4) {
  const block = frontmatterBlock(text);
  if (!block) return "";
  for (const line of block.text.replace(/^\uFEFF?---\r?\n/, "").split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!match || match[1] !== key4) continue;
    const value = String(match[2] || "").trim();
    return /^(?:null|~|""|'')$/i.test(value) ? "" : value;
  }
  return "";
}
function fallbackYamlScalar(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "~" || /^null$/i.test(raw)) return null;
  if (/^(?:true|false)$/i.test(raw)) return /^true$/i.test(raw);
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch (_) {
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => fallbackYamlScalar(part));
  }
  return raw.replace(/\s+#.*$/, "").trim();
}
function parseFrontmatterObject(text) {
  const block = frontmatterBlock(text);
  if (!block) return {};
  const yaml = block.text.replace(/^\uFEFF?---\r?\n/, "").replace(/\r?\n---(?:\r?\n|$)$/, "");
  if (typeof parseYaml === "function") {
    try {
      const parsed2 = parseYaml(yaml);
      if (parsed2 && typeof parsed2 === "object" && !Array.isArray(parsed2)) return parsed2;
    } catch (_) {
    }
  }
  const parsed = {};
  let listKey = "";
  for (const line of yaml.split(/\r?\n/)) {
    const top = /^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (top) {
      listKey = top[2] ? "" : top[1];
      parsed[top[1]] = top[2] ? fallbackYamlScalar(top[2]) : [];
      continue;
    }
    const item = listKey ? /^\s+-\s*(.*?)\s*$/.exec(line) : null;
    if (item) parsed[listKey].push(fallbackYamlScalar(item[1]));
    else if (line.trim() && !/^\s*#/.test(line)) listKey = "";
  }
  return parsed;
}
async function copyText(text) {
  const value = String(text ?? "");
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch (_) {
    return false;
  }
}
function safeFileName(name) {
  let value = String(name || "");
  try {
    value = value.normalize("NFC");
  } catch (_) {
  }
  value = value.replace(/[\u0000-\u001f\\/:*?"<>|]/g, "-").replace(/[#\[\]^]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "");
  if (!value || value === "." || value === "..") return "";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) value = `_${value}`;
  return value;
}
function validatedPathSegment(name, label, { person = false } = {}) {
  const normalized = person ? canonicalPersonName(name) : String(name || "").trim().replace(/\s+/g, " ");
  const safe = safeFileName(normalized);
  if (!safe) throw new Error(`Enter a ${label.toLowerCase()}.`);
  if (safe !== normalized) throw new Error(`${label} contains a character or reserved name that cannot sync safely across iOS, macOS, and Windows. Try "${safe}".`);
  if (/^[._]/.test(safe)) throw new Error(`${label} cannot start with "." or "_" because hidden names do not appear in the CST app.`);
  const bytes2 = typeof TextEncoder === "function" ? new TextEncoder().encode(safe).length : safe.length;
  if (bytes2 > 120) throw new Error(`${label} is too long. Keep it under 120 UTF-8 bytes.`);
  return safe;
}
function validatePortableVaultPath(path, label = "Vault path") {
  const normalized = normalizePath(String(path || ""));
  const bytes2 = typeof TextEncoder === "function" ? new TextEncoder().encode(normalized).length : normalized.length;
  if (bytes2 > 180) {
    throw new Error(`${label} is too long for reliable iOS, macOS, and Windows sync. Shorten the names in this path (${bytes2}/180 UTF-8 bytes).`);
  }
  return normalized;
}
function validateConfiguredVaultRoot(value, label) {
  const normalized = normalizePath(String(value || "").trim());
  if (!normalized) throw new Error(`${label} is required.`);
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error(`${label} must be a relative vault folder path.`);
  }
  for (const part of parts) validatedPathSegment(part, label);
  return validatePortableVaultPath(normalized, label);
}
function vaultPathsOverlap(first, second) {
  const a = normalizePath(String(first || ""));
  const b = normalizePath(String(second || ""));
  return !!a && !!b && (a === b || a.startsWith(b + "/") || b.startsWith(a + "/"));
}
var controlSequence = 0;
function associatePreviousLabel(parent3, control) {
  const previous = control?.previousElementSibling || parent3?.lastElementChild;
  if (previous?.tagName === "LABEL" && !previous.htmlFor) {
    if (!control.id) control.id = `cst-control-${++controlSequence}`;
    previous.htmlFor = control.id;
  }
  return control;
}
function makeInput(parent3, opts = {}) {
  const input = associatePreviousLabel(parent3, parent3.createEl("input"));
  input.type = opts.type || "text";
  if (opts.value != null) input.value = String(opts.value);
  if (opts.placeholder) input.placeholder = String(opts.placeholder);
  if (opts.ariaLabel) input.setAttribute("aria-label", String(opts.ariaLabel));
  else if (opts.placeholder && !input.labels?.length) input.setAttribute("aria-label", String(opts.placeholder));
  input.addEventListener("keydown", exitSingleLineOnEnter);
  return input;
}
function blurOnEnter(input) {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    input.blur();
  });
  return input;
}
function makeSelect(parent3, ariaLabel = "") {
  const select = associatePreviousLabel(parent3, parent3.createEl("select"));
  if (ariaLabel && !select.labels?.length) select.setAttribute("aria-label", ariaLabel);
  return select;
}
function wireTextareaSearch(input, editor, button, status) {
  let nextStart = 0;
  const locate = (advance = false) => {
    const query = String(input.value || "");
    if (!query) {
      nextStart = 0;
      status.setText("");
      return -1;
    }
    const haystack = String(editor.value || "").toLowerCase();
    const needle = query.toLowerCase();
    let index = haystack.indexOf(needle, advance ? nextStart : 0);
    if (index < 0 && advance && nextStart > 0) index = haystack.indexOf(needle, 0);
    if (index < 0) {
      status.setText("No matches.");
      nextStart = 0;
      return -1;
    }
    const line = haystack.slice(0, index).split("\n").length;
    nextStart = advance ? index + Math.max(needle.length, 1) : 0;
    status.setText(`Match on line ${line}. Press Enter or Find Next to jump.`);
    return index;
  };
  const jump = () => {
    const index = locate(true);
    if (index < 0) return;
    editor.focus();
    editor.setSelectionRange(index, index + input.value.length);
  };
  input.oninput = () => {
    nextStart = 0;
    locate(false);
  };
  input.onkeydown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    jump();
  };
  button.onclick = jump;
}
function addOption(select, value, text = value) {
  const option = select.createEl("option", { text: String(text) });
  option.value = String(value);
  return option;
}
function canonicalPersonName(name) {
  let s = String(name || "").trim().replace(/\s+/g, " ");
  if (/^(dr\.?|doctor)\s+example$/i.test(s)) return "Dr. Example";
  s = s.replace(/^(dr\.?|doctor)\s+/i, "");
  if (!s) return "";
  return s.split(" ").map((p) => p ? p[0].toUpperCase() + p.slice(1) : "").join(" ");
}
function shortHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h << 5) + h ^ text.charCodeAt(i);
  return `v-${(h >>> 0).toString(16).padStart(8, "0")}`;
}
function normalizeGloves2(input, settings = {}) {
  return glove_settings_exports.normalizeGloves(input, settings);
}
function formatGloves(value) {
  return String(value || "Unknown").replace(/x(\d+)/gi, " x$1");
}
function gloveLegend2(value, settings) {
  try {
    return glove_settings_exports.gloveLegend(value, settings);
  } catch (_) {
    return "Glove value needs review";
  }
}
function addGloveHelp(parent3, settings) {
  const help = parent3.createDiv({ cls: "cst-field-help cst-glove-help" });
  try {
    const guidance = glove_settings_exports.gloveHelpText(settings);
    help.createDiv({ text: guidance.legend });
    help.createDiv({ text: `Sizes: ${guidance.sizes}. ${guidance.description} Example: "${guidance.example}".` });
  } catch (error) {
    help.createDiv({ text: error.message || String(error) });
  }
  return help;
}
function contextFromPath(path, root) {
  path = normalizePath(path);
  root = normalizePath(root);
  if (!path.startsWith(root + "/")) return null;
  const rel = path.slice(root.length + 1);
  const parts = rel.split("/").filter(Boolean);
  if (!parts.length) return null;
  return {
    specialty: parts[0],
    surgeon: parts.length >= 2 ? parts[1] : null,
    depth: parts.length,
    parts
  };
}
function sectionBody(templateName, extras = {}) {
  const lines = [];
  const push = (heading, hint = "") => {
    lines.push(`## ${heading}`, "");
    if (hint) lines.push(`<!-- ${hint} -->`, "");
    const extra = extras[heading];
    if (extra) {
      for (const h of extra) lines.push(`### ${h}`, "", "");
    }
  };
  if (templateName === "General") lines.push("#### PA", "");
  push("Case", `${templateName} case-specific overview`);
  push("Position");
  push("Tips");
  push("Drape");
  push("Mayo");
  push("Basin");
  push("Back Table");
  push("Trays", "", extras);
  push("Sutures");
  push("Mayo Flow");
  push("Dressings");
  push("Notes");
  return lines.join("\n").trim() + "\n";
}
function defaultTemplates() {
  return {
    "_Default.md": sectionBody("Default"),
    "Ortho.md": sectionBody("Ortho", {
      "Trays": ["Power", "Fluoro", "Navigation / Robot", "Implants"]
    }),
    "General.md": sectionBody("General", {
      "Trays": ["Equipment"]
    }),
    "GU.md": sectionBody("GU", {
      "Basin": ["Scope / Camera", "Irrigation"],
      "Trays": ["Equipment", "Specimens", "Drains / Catheters"]
    }),
    "GYN.md": sectionBody("GYN", {
      "Drape": ["Vaginal Setup", "Abdominal / Robotic Setup"],
      "Trays": ["Equipment", "Specimens", "Drains / Catheters"]
    }),
    "ENT.md": sectionBody("ENT", {
      "Position": ["Head / Facial Setup"],
      "Trays": ["Scope / Microscope", "Equipment", "Specimens", "Packing / Drains"]
    }),
    "Vascular.md": sectionBody("Vascular", {
      "Trays": ["Vascular Setup", "Equipment", "Vessels / Grafts / Patches", "Drains"]
    }),
    "Plastics.md": sectionBody("Plastics", {
      "Trays": ["Equipment", "Specimens / Tissue", "Drains"]
    }),
    "Spine/Cervical.md": sectionBody("Spine Cervical", {
      "Trays": ["Retractors", "Kerrisons", "Karlins", "Power", "Fluoro / Navigation", "Implants"]
    }),
    "Spine/Lumbar.md": sectionBody("Spine Lumbar", {
      "Trays": ["Retractors", "Kerrisons", "Karlins", "Power", "Fluoro / Navigation", "Implants"]
    }),
    "Spine/Thoracic.md": sectionBody("Spine Thoracic", {
      "Trays": ["Retractors", "Kerrisons", "Karlins", "Power", "Fluoro / Navigation", "Implants"]
    })
  };
}
function upgradeTemplateBodyV016(templatePath, text) {
  const source = String(text || "");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const normalized = source.replace(/\r\n/g, "\n");
  const hadFinalNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (hadFinalNewline) lines.pop();
  const sections2 = [{ label: "", heading: "", lines: [] }];
  let current = sections2[0];
  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      current = { label: match[1].trim(), heading: line, lines: [] };
      sections2.push(current);
    } else {
      current.lines.push(line);
    }
  }
  const labelKey = (section) => String(section.label || "").toLowerCase();
  const trimBlankLines = (values) => {
    const copy = [...values];
    while (copy.length && !copy[0].trim()) copy.shift();
    while (copy.length && !copy[copy.length - 1].trim()) copy.pop();
    return copy;
  };
  const singular = sections2.filter((section) => labelKey(section) === "dressing");
  const plural = sections2.find((section) => labelKey(section) === "dressings");
  let updated = sections2;
  if (singular.length && plural) {
    const moved = singular.map((section) => trimBlankLines(section.lines)).filter((body) => body.length);
    const existing = trimBlankLines(plural.lines);
    plural.lines = [
      "",
      ...moved.flatMap((body, index) => [...index ? [""] : [], ...body]),
      ...moved.length && existing.length ? [""] : [],
      ...existing,
      ""
    ];
    updated = sections2.filter((section) => !singular.includes(section));
  } else if (singular.length) {
    const first = singular[0];
    first.label = "Dressings";
    first.heading = "## Dressings";
    for (const extra of singular.slice(1)) {
      const body = trimBlankLines(extra.lines);
      if (body.length) first.lines.push("", ...body);
    }
    updated = sections2.filter((section) => !singular.slice(1).includes(section));
  }
  const isGeneral = /(^|\/)General\.md$/i.test(normalizePath(String(templatePath || "")));
  if (isGeneral && !updated.some((section) => labelKey(section) === "pa")) {
    const tipsIndex = updated.findIndex((section) => labelKey(section) === "tips");
    const insertAt = tipsIndex >= 0 ? tipsIndex : Math.min(1, updated.length);
    updated.splice(insertAt, 0, { label: "PA", heading: "## PA", lines: [""] });
  }
  const output = updated.flatMap((section) => section.heading ? [section.heading, ...section.lines] : section.lines).join("\n");
  return (output + (hadFinalNewline ? "\n" : "")).replace(/\n/g, newline);
}
function generalPAFirst(templatePath, text) {
  if (!/(?:^|\/)General\.md$/i.test(templatePath)) return text;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = text.replace(/\r\n/g, "\n");
  const fm = normalized.match(/^---\n[\s\S]*?\n---(?:\n|$)/)?.[0] || "";
  const lines = normalized.slice(fm.length).split("\n");
  const kept = [], content = [];
  let inPA = false, paDepth = 0, fence = null;
  for (const line of lines) {
    const token = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
    if (token) {
      if (!fence) fence = token;
      else if (token[0] === fence[0] && token.length >= fence.length && line.trim() === token) fence = null;
      (inPA ? content : kept).push(line);
      continue;
    }
    const heading = !fence && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading && inPA && heading[1].length <= paDepth) inPA = false;
    if (heading && /^PA\s*:?$/i.test(heading[2])) {
      inPA = true;
      paDepth = heading[1].length;
      continue;
    }
    (inPA ? content : kept).push(line);
  }
  const body = content.join("\n").trim();
  return (fm + "#### PA\n\n" + (body ? body + "\n\n" : "") + kept.join("\n").replace(/^\n+/, "")).replace(/\n/g, newline);
}
function compareCSTNames(a, b) {
  const left = String(a), right = String(b);
  return left.localeCompare(right, "en", { sensitivity: "base", numeric: false }) || left.localeCompare(right, "en");
}
var CSTNotesPlugin = class extends Plugin {
  async onload() {
    const loadedSettings = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    glove_settings_exports.initializeGloveSettings(this);
    glove_settings_exports.installGloveSettingsRuntime(this, { refresh: () => this.refreshGloveSettingsDisplays() });
    this.unloading = false;
    this.onboardingCaseBodies = /* @__PURE__ */ new Map();
    this.verifyTimers = /* @__PURE__ */ new Map();
    this.templateVersionTimers = /* @__PURE__ */ new Map();
    this.templateVersionQueues = /* @__PURE__ */ new Map();
    this.ignoreModifyUntil = /* @__PURE__ */ new Map();
    this.ignoreCreateUntil = /* @__PURE__ */ new Map();
    this.ignoreRenameUntil = /* @__PURE__ */ new Map();
    this.createRoutingQueue = Promise.resolve();
    this.registryMutationQueue = Promise.resolve();
    this.adminMutationQueue = Promise.resolve();
    this.migrationSessionQueue = Promise.resolve();
    this.graphRebuildPromise = null;
    this.graphRebuildRequested = false;
    this.graphRebuildTimer = null;
    this.startupTimer = null;
    this.sidebarActivationPromise = null;
    this.sidebarActivationTarget = null;
    this.sidebarActivationTargetRevision = 0;
    this.pendingSidebarRoutes = /* @__PURE__ */ new WeakMap();
    this.updateManagedBodyClass();
    installFeatures(this, {
      TFile,
      TFolder,
      Modal,
      Notice,
      normalizePath,
      validatePortableVaultPath,
      validatedPathSegment,
      parseFrontmatterObject,
      id,
      yamlString,
      normalizeGloves: (value) => normalizeGloves2(value, this.settings),
      CASE_HEADER_BLOCK,
      LegacyTemplateMigrationModal,
      shortHash,
      setIcon,
      defaultSpecialties: DEFAULT_SPECIALTIES
    });
    this.registerView(VIEW_TYPE_CST_SIDEBAR, (leaf2) => new CSTSidebarView(leaf2, this));
    addIcon?.("cst-open-kelly", KELLY_ICON);
    this.addRibbonIcon("plus-circle", "CST: New Case", () => this.openNewCase());
    this.addRibbonIcon("cst-open-kelly", "CST: Open App", () => this.navigateFromUI("Open CST app", () => this.activateSidebar()));
    this.addRibbonIcon("settings", "CST: Open Admin", () => this.navigateFromUI("Open CST Admin", () => this.openAdmin()));
    this.addCommand({ id: "new-case", name: "New Case", callback: () => this.openNewCase() });
    this.addCommand({ id: "quick-case", name: "Quick Case", callback: () => new QuickCaseModal(this).open() });
    this.addCommand({ id: "new-surgeon", name: "New Surgeon", callback: () => this.openNewSurgeon() });
    this.addCommand({ id: "new-specialty", name: "New Specialty", callback: () => new NewSpecialtyModal(this).open() });
    this.addCommand({
      id: "delete-current-case",
      name: "Delete current case",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available = !!this.caseContext(file);
        if (available && !checking) this.deleteCase(file).catch((error) => new Notice(error.message || String(error)));
        return available;
      }
    });
    this.addCommand({ id: "initialize", name: "Initialize / repair installation", callback: () => new SetupModal(this, true).open() });
    this.addCommand({ id: "open-admin", name: "Open Admin", callback: () => this.navigateFromUI("Open CST Admin", () => this.openAdmin()) });
    this.addCommand({ id: "open-app", name: "Open CST app", callback: () => this.navigateFromUI("Open CST app", () => this.activateSidebar()) });
    this.addCommand({ id: "rebuild-graph", name: "Rebuild graph", callback: () => this.runAdminAction("Rebuild Graph", async () => {
      if (!await this.quickStructureCheck()) return false;
      await this.rebuildGraph();
      new Notice("CST graph rebuilt.");
      return true;
    }, { stage: "command graph rebuild" }) });
    this.addCommand({ id: "database-health", name: "Open Database Health", callback: () => this.navigateFromUI("Open Database Health", () => this.openPath(this.p("Admin/Database Health.md"))) });
    this.addCommand({ id: "verification-report", name: "Open Verification Report", callback: () => this.navigateFromUI("Open Verification Report", () => this.openPath(this.p("Admin/Verification.md"))) });
    this.addCommand({ id: "repair-backend", name: "Repair managed backend", callback: async () => this.runAdminAction("Repair Entire Backend", () => this.repairAll(true), { stage: "backend repair" }) });
    this.addCommand({ id: "repair-live-headers", name: "Repair Live Surgeon Headers", callback: () => new HeaderRepairModal(this).open() });
    this.addCommand({ id: "create-reference", name: "Create Reference", callback: () => new ReferenceModal(this).open() });
    this.addCommand({ id: "import-section", name: "Import Section From Case", callback: () => new ImportSectionModal(this).open() });
    this.addCommand({ id: "migrate-v011-header", name: "Run v0.1.1 live header migration", callback: async () => this.runMigrationFromUI(MIGRATION_V011, "v0.1.1 live surgeon header migration", () => this.migrateV011()) });
    this.addCommand({ id: "migrate-v012-mobile", name: "Run v0.1.2 mobile data migration", callback: async () => this.runMigrationFromUI(MIGRATION_V012, "v0.1.2 mobile registry/header repair", () => this.migrateV012()) });
    this.addCommand({ id: "legacy-template-migration", name: "Legacy Template Migration", callback: () => new LegacyTemplateMigrationModal(this).open() });
    this.addSettingTab(new CSTSettingsTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("cst-onboarding", async (_src, el) => this.renderOnboardingAdmin(el));
    this.registerMarkdownPostProcessor(async (el, ctx) => {
      const path = normalizePath(ctx.sourcePath || "");
      if (path === this.p("Admin/Images.md")) return;
      if (!path.startsWith(this.p() + "/") || path.startsWith(this.p("Admin/Backups") + "/") || path.startsWith(this.p("_Graph/Surgeons") + "/")) return;
      const section = ctx.getSectionInfo?.(el);
      if (!section || el.querySelector(".cst-admin-home")) return;
      if (section.lineStart !== 0) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return;
        const stamp = `${file.stat?.mtime}:${file.stat?.size}`;
        this.homeNavSourceCache || (this.homeNavSourceCache = /* @__PURE__ */ new WeakMap());
        let cached = this.homeNavSourceCache.get(file);
        if (!cached || cached.stamp !== stamp) {
          const text = (await this.app.vault.cachedRead(file)).replace(/\r\n/g, "\n");
          if (file.path !== path || this.app.vault.getAbstractFileByPath(path) !== file) return;
          const prefix = /^(?:\uFEFF)?(?:---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$))?(?:(?:[ \t]*\n)|(?:[ \t]*<!--[\s\S]*?-->[ \t]*(?:\n|$)))*[ \t]*/.exec(text)?.[0] || "";
          cached = { stamp, firstLine: prefix.split("\n").length - 1 };
          this.homeNavSourceCache.set(file, cached);
        }
        if (cached.firstLine < section.lineStart || cached.firstLine > (section.lineEnd ?? section.lineStart)) return;
      }
      if (this.unloading || el.querySelector(".cst-admin-home")) return;
      const nav = el.createDiv({ cls: "cst-admin-home" });
      el.prepend(nav);
      this.addHomeButton(nav);
      if (path === this.p("Admin/Admin.md")) {
        const onboarding = nav.createEl("button", { text: "Onboarding" });
        onboarding.onclick = () => this.navigateFromUI("Onboarding", () => this.openPath(this.p("Admin/Onboarding.md")));
      }
    });
    this.registerMarkdownCodeBlockProcessor(CASE_HEADER_LANG, async (_src, el, ctx) => this.renderCaseHeaderBlock(el, ctx));
    this.registerMarkdownCodeBlockProcessor(LAUNCHER_LANG, async (_src, el) => this.renderLauncher(el));
    this.registerMarkdownCodeBlockProcessor("cst-registry-data", async (_src, el) => {
      el.empty();
      el.createEl("p", { text: "CST surgeon registry — managed automatically.", cls: "cst-muted" });
    });
    this.registerMarkdownCodeBlockProcessor("cst-root-dashboard", async (_src, el) => this.renderRootDashboard(el));
    this.registerMarkdownCodeBlockProcessor("cst-specialty-dashboard", async (_src, el, ctx) => this.renderSpecialtyDashboard(el, ctx));
    this.registerMarkdownCodeBlockProcessor("cst-surgeon-profile", async (_src, el, ctx) => this.renderSurgeonProfile(el, ctx));
    this.registerMarkdownCodeBlockProcessor("cst-case-list", async (_src, el, ctx) => this.renderCaseList(el, ctx));
    this.registerMarkdownCodeBlockProcessor("cst-admin-health", async (_src, el) => this.renderHealth(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-verification", async (_src, el) => this.renderVerification(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-activity", async (_src, el) => this.renderActivity(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-system", async (_src, el) => this.renderSystem(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-surgeons", async (_src, el) => this.renderSurgeonAdmin(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-cases", async (_src, el) => this.renderCaseAdmin(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-templates", async (_src, el) => this.renderTemplateAdmin(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-references", async (_src, el) => this.renderReferenceAdmin(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-graph", async (_src, el) => this.renderGraphAdmin(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-repair", async (_src, el) => this.renderRepairAdmin(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-metadata", async (_src, el) => this.renderMetadataAdmin(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-migrations", async (_src, el) => this.renderMigrations(el));
    this.registerMarkdownCodeBlockProcessor("cst-admin-config", async (_src, el) => this.renderConfig(el));
    this.registerEvent(this.app.workspace.on("file-open", () => this.updateManagedBodyClass()));
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      this.trackOnboardingFile(file).catch((error) => console.error("CST onboarding", error));
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.updateManagedBodyClass();
      this.refreshOnboarding();
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.updateManagedBodyClass()));
    this.app.workspace.onLayoutReady(() => {
      if (this.unloading) return;
      this.dispatchVaultEvent("interface preferences", async () => {
        const result = await applyUIPreferences(this.app, { mobile: Platform.isMobile, pluginId: this.manifest?.id || "cst-notes" });
        this.uiPreferencesStatus = result;
        this.refreshNavigationPreference();
        if (result.unsupported.length) console.warn("CST Notes retained navigation fallback:", result.unsupported.join(", "));
      });
      this.registerEvent(this.app.vault.on("config-changed", () => this.refreshNavigationPreference()));
      for (const doc of this.workspaceDocuments()) {
        this.registerDomEvent?.(doc, "keydown", (event) => {
          if (event.target?.closest?.(".cst-profile-card, .cst-live-header, .cst-settings-editor, .cst-app-view, .cst-managed-leaf")) exitSingleLineOnEnter(event);
        });
      }
      this.registerEvent(this.app.vault.on("create", (file) => this.dispatchVaultEvent("create", () => this.onCreated(file))));
      this.registerEvent(this.app.vault.on("modify", (file) => this.onModified(file)));
      this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.dispatchVaultEvent("rename", () => this.onRenamed(file, oldPath))));
      this.registerEvent(this.app.vault.on("delete", (file) => this.dispatchVaultEvent("delete", () => this.onDeleted(file))));
      const refreshExample = (file) => {
        if (this.onboardingUpdatePending) this.scheduleOnboardingUpdate();
        if (file === this.exampleFile || !this.exampleCase() && file instanceof TFile && this.isCasePath(file.path)) {
          if (this.exampleRefreshTimer) window.clearTimeout(this.exampleRefreshTimer);
          this.exampleRefreshTimer = window.setTimeout(() => this.dispatchVaultEvent("example presence", () => this.findExampleCase()), 300);
        }
        this.refreshOnboarding();
      };
      for (const event of ["create", "delete", "rename", "modify"]) this.registerEvent(this.app.vault.on(event, refreshExample));
      this.startupTimer = window.setTimeout(async () => {
        this.startupTimer = null;
        if (this.unloading) return;
        this.onboardingStartupRunning = true;
        try {
          if (this.settings.resetNeedsReview) {
            new Notice("CST Notes reset needs review. Open Admin → Recovery before resuming automatic work.");
            return;
          }
          if (!this.settings.initialized) new SetupModal(this, false).open();
          else {
            const ready = await this.quickStructureCheck({ allowMissingRegistryForMigration: true });
            if (this.unloading) return;
            if (!ready) {
              this.onboardingUpgradePending = true;
              this.onboardingStartupPending = "resources";
              this.scheduleOnboardingUpdate();
              return;
            }
            const upgraded = await this.runUpgradeMigrations();
            if (upgraded) {
              const status = await this.startResourceCollection({ cleanupLegacyMarkers: this.settings.resourceMarkerCleanupRevision !== 1 });
              if (!status?.error && this.resourceFeatures?.lastMarkerCleanup && !this.resourceFeatures.lastMarkerCleanup.skipped?.length) {
                this.settings.resourceMarkerCleanupRevision = 1;
                await this.saveSettings();
              }
            }
            await this.findExampleCase();
            if (!this.unloading && this.settings.autoOpenSidebar) await this.activateSidebar();
          }
        } catch (error) {
          console.error("CST startup", error);
          if (!this.unloading) new Notice(`CST startup paused safely: ${error.message || error}`);
        } finally {
          this.onboardingStartupRunning = false;
        }
      }, 600);
    });
  }
  onunload() {
    if (this.onboardingUpdateTimer) window.clearTimeout(this.onboardingUpdateTimer);
    this.onboardingUpdateTimer = null;
    for (const doc of this.workspaceDocuments()) doc.body?.classList?.remove("cst-mobile-shortcuts-ready");
    this.unloading = true;
    this.stopResourceCollection?.();
    for (const doc of this.workspaceDocuments()) {
      doc.body?.classList.remove("cst-managed-active", "cst-platform-phone", "cst-platform-tablet");
      doc.querySelectorAll?.(".cst-managed-leaf").forEach((el) => el.classList.remove("cst-managed-leaf"));
    }
    if (this.onboardingTimer) window.clearTimeout(this.onboardingTimer);
    if (this.exampleRefreshTimer) window.clearTimeout(this.exampleRefreshTimer);
    if (this.startupTimer) window.clearTimeout(this.startupTimer);
    if (this.graphRebuildTimer) window.clearTimeout(this.graphRebuildTimer);
    if (this.registryBacklogTimer) window.clearTimeout(this.registryBacklogTimer);
    for (const timer of this.verifyTimers.values()) window.clearTimeout(timer);
    for (const timer of this.templateVersionTimers.values()) window.clearTimeout(timer);
    this.startupTimer = null;
    this.graphRebuildTimer = null;
    this.registryBacklogTimer = null;
  }
  async onExternalSettingsChange() {
    const loadedSettings = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    glove_settings_exports.initializeGloveSettings(this);
    this.adminWorkspace?.refreshMode?.();
    if (this.settings.initialized) this.scheduleOnboardingUpdate();
    this.refreshOnboarding();
    if (this.settings.initialized && !this.featureMutationActive && !this.onboardingStartupPending) await this.startResourceCollection?.();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CST_SIDEBAR);
    for (const leaf2 of leaves) {
      if (leaf2.view instanceof CSTSidebarView) leaf2.view.queueRender();
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  exampleCase() {
    const file = this.exampleFile;
    return file instanceof TFile && this.isCasePath(file.path) && this.app.vault.getAbstractFileByPath(file.path) === file ? file : null;
  }
  onboardingTasks() {
    const exampleFile = this.exampleCase();
    const example = exampleFile instanceof TFile ? this.caseContext(exampleFile) : null;
    const specialty = example?.specialty || "General", surgeon2 = example?.surgeon || "Dr. Example";
    const exampleTemplate = this.app?.vault?.getAbstractFileByPath?.(this.p("_Templates/Cases/Example.md"));
    return [
      ["home", "Open CST Notes", "Tap a Home button or search for CST Notes: Open CST app."],
      ["hierarchy", `Explore a specialty (e.g., ${specialty})`, `From Home, tap ${specialty}, then ${surgeon2}.`],
      ["profile", "View a surgeon profile", `Open ${surgeon2} to see the live surgeon profile.`],
      ["templateEdit", "View and edit a template", exampleTemplate instanceof TFile ? "Tap Templates, open Example template, and make an edit." : "Tap Templates, open a template, and make an edit."],
      ["caseEdit", "Create and edit a case", "Open a specialty and surgeon, tap New case, then edit your case."],
      ["admin", "Open Admin", "Tap Admin at the bottom of the CST Notes app screen."]
    ];
  }
  onboardingCompletionState() {
    const choice = this.settings.onboardingCompletionChoice;
    const keptExamples = choice === "continue";
    const checklistComplete = this.onboardingTasks().every(([key4]) => this.settings.onboardingCompleted?.[key4] === true);
    return { completed: keptExamples || choice === "fresh" && checklistComplete, keptExamples, checklistComplete };
  }
  onboardingDone() {
    const state = this.onboardingCompletionState();
    return state.keptExamples || state.checklistComplete;
  }
  async findExampleCase() {
    const revision = this.exampleLookupRevision = (this.exampleLookupRevision || 0) + 1;
    let found = null;
    for (const file of this.allCaseFiles()) {
      const path = file.path;
      let text;
      try {
        text = await this.app.vault.read(file);
      } catch (error) {
        if (this.app.vault.getAbstractFileByPath(path) !== file) continue;
        throw error;
      }
      if (file.path !== path || this.app.vault.getAbstractFileByPath(path) !== file) continue;
      const fm = parseFrontmatterObject(text);
      if (fm.cst_example === true && ["cst-example-general-v1", "cst-example-lumbar-v1"].includes(fm.cst_id) && this.isCasePath(file.path)) {
        found = file;
        break;
      }
    }
    if (revision !== this.exampleLookupRevision) return;
    this.exampleFile = found;
    this.refreshOnboarding();
  }
  completeOnboarding(key4) {
    if (!this.exampleCase() || this.onboardingDone() || this.settings.onboardingCompleted?.[key4]) return;
    this.settings.onboardingCompleted = { ...this.settings.onboardingCompleted, [key4]: true };
    this.onboardingSave = (this.onboardingSave || Promise.resolve()).catch(() => {
    }).then(() => this.saveSettings());
    this.onboardingSave.catch((error) => console.error("CST onboarding progress could not be saved", error));
    this.refreshOnboarding();
  }
  refreshOnboarding() {
    if (this.onboardingRefreshing || this.unloading) return;
    this.onboardingRefreshing = true;
    try {
      const present = !!this.exampleCase();
      const done = this.onboardingDone();
      const welcome = (this.onboardingWelcomeUntil || 0) > Date.now();
      const keptExamples = this.onboardingCompletionState().keptExamples;
      const mode = welcome ? "welcome" : present && !this.settings.onboardingDismissed && (!done || this.showCompletedOnboarding) ? keptExamples ? "completed-kept" : "checklist" : "hidden";
      for (const host of this.onboardingHosts || []) {
        if (host.isConnected === false) {
          this.onboardingHosts.delete(host);
          continue;
        }
        if (host.cstOnboardingMode !== mode) {
          host.empty();
          this.renderOnboarding(host);
        }
      }
      const count = this.onboardingTasks().filter(([key4]) => this.settings.onboardingCompleted?.[key4]).length;
      for (const card of this.onboardingCards || []) {
        if (card.isConnected === false) {
          this.onboardingCards.delete(card);
          continue;
        }
        card.hidden = mode === "hidden";
        if (mode !== "checklist") continue;
        const heading = card.querySelector("h3");
        if (heading) heading.textContent = `Getting started — ${count} of 6 complete`;
        const progress = card.querySelector("progress");
        if (progress) progress.value = count;
        for (const [key4, label, hint] of this.onboardingTasks()) {
          const row = card.querySelector(`[data-onboarding-task="${key4}"]`);
          if (row) row.textContent = `${this.settings.onboardingCompleted?.[key4] ? "✓" : "○"} ${label} — ${hint}`;
        }
      }
      if (this.onboardingTimer) window.clearTimeout(this.onboardingTimer);
      this.onboardingTimer = null;
      if (welcome) {
        this.onboardingTimer = window.setTimeout(() => this.refreshOnboarding(), Math.max(1, this.onboardingWelcomeUntil - Date.now()));
      } else if (present && done && !this.settings.onboardingDismissed && !this.showCompletedOnboarding) {
        openOnboardingCompletion(this, { Modal, Notice, TFile, TFolder, parseFrontmatterObject });
      } else if (present && !done && !this.settings.onboardingDismissed) {
        this.onboardingTimer = window.setTimeout(async () => {
          this.onboardingTimer = null;
          try {
            await this.trackOnboardingFile(this.app.workspace.getActiveFile(), true);
          } catch (error) {
            console.error("CST onboarding refresh", error);
          }
          this.refreshOnboarding();
        }, 750);
      }
    } finally {
      this.onboardingRefreshing = false;
    }
  }
  async trackOnboardingFile(file, modified = false) {
    if (!this.exampleCase() || this.onboardingDone() || this.settings.onboardingDismissed) return;
    if (!(file instanceof TFile) || file.extension !== "md") return;
    if (file.path === this.p("Admin/Admin.md")) this.completeOnboarding("admin");
    const template = this.isTemplatePath(file.path);
    if (!template && !this.caseContext(file)) return;
    const path = file.path;
    const text = await this.app.vault.read(file);
    if (file.path !== path || !this.exampleCase() || this.app.vault.getAbstractFileByPath && this.app.vault.getAbstractFileByPath(path) !== file) return;
    const body = this.stripFrontmatter(text).replace(/<!--[\s\S]*?-->/g, "");
    this.onboardingCaseBodies || (this.onboardingCaseBodies = /* @__PURE__ */ new Map());
    const previous = this.onboardingCaseBodies.get(path);
    if (previous !== void 0 && previous !== body && modified && !((this.ignoreModifyUntil?.get(path) || 0) > Date.now())) {
      if (template) this.completeOnboarding("templateEdit");
      else {
        const fm = parseFrontmatterObject(text);
        if (this.settings.onboardingCreatedCases?.includes(fm.cst_id)) this.completeOnboarding("caseEdit");
      }
    }
    if (this.onboardingCaseBodies.size >= 100) this.onboardingCaseBodies.delete(this.onboardingCaseBodies.keys().next().value);
    this.onboardingCaseBodies.set(path, body);
  }
  renderOnboarding(el) {
    this.onboardingHosts || (this.onboardingHosts = /* @__PURE__ */ new Set());
    this.onboardingHosts.add(el);
    const welcome = (this.onboardingWelcomeUntil || 0) > Date.now();
    const keptExamples = this.onboardingCompletionState().keptExamples;
    el.cstOnboardingMode = welcome ? "welcome" : !this.exampleCase() || this.settings.onboardingDismissed || this.onboardingDone() && !this.showCompletedOnboarding ? "hidden" : keptExamples ? "completed-kept" : "checklist";
    if (el.cstOnboardingMode === "hidden") return;
    const card = el.createDiv({ cls: "cst-onboarding-card" });
    this.onboardingCards || (this.onboardingCards = /* @__PURE__ */ new Set());
    this.onboardingCards.add(card);
    if (welcome) {
      card.setAttribute("role", "status");
      card.createEl("h3", { text: "Welcome to CST Notes!" });
      card.createEl("p", { text: "I suggest going through the templates and making them your own!" });
      this.refreshOnboarding();
      return;
    }
    if (keptExamples) {
      card.createEl("h3", { text: "Completed — Kept examples" });
      card.createEl("p", { text: "You finished onboarding and chose to keep the examples for practice." });
      const hide = card.createDiv({ cls: "cst-actions" }).createEl("button", { text: "Hide checklist" });
      hide.onclick = () => new OnboardingHideModal(this).open();
      this.refreshOnboarding();
      return;
    }
    card.createEl("h3");
    const progress = card.createEl("progress");
    progress.max = 6;
    progress.setAttribute("aria-label", "Getting started progress");
    card.createEl("p", { text: 'Reopen CST Notes using the available Home buttons or swipe down and search for "CST Notes: Open CST app".' });
    card.createEl("p", { text: "Steps complete as you use the app.", cls: "cst-muted" });
    const list = card.createEl("ul");
    for (const [key4] of this.onboardingTasks()) list.createEl("li").setAttribute("data-onboarding-task", key4);
    const actions = card.createDiv({ cls: "cst-actions" });
    const template = actions.createEl("button", { text: "Explore templates" });
    template.onclick = () => this.navigateFromUI("Open templates", () => this.openPath(this.p("Admin/Backend/Templates.md")));
    const dismiss = actions.createEl("button", { text: "Hide checklist" });
    dismiss.onclick = () => new OnboardingHideModal(this).open();
    this.refreshOnboarding();
  }
  addHomeButton(el) {
    const nav = el.createDiv({ cls: "cst-app-home-nav" });
    const home = nav.createEl("button", { text: "Home" });
    home.onclick = () => this.navigateFromUI("Home", () => this.activateSidebar({ specialty: "", surgeon: "", query: "" }));
    return home;
  }
  refreshNavigationPreference() {
    const ready = Platform.isMobile && mobileNavigationReady(this.app, this.manifest?.id || "cst-notes");
    for (const doc of this.workspaceDocuments()) doc.body?.classList?.toggle("cst-mobile-shortcuts-ready", !!ready);
  }
  scheduleOnboardingUpdate(delay = 1500) {
    if (this.unloading || !this.settings.initialized || this.settings.resetNeedsReview) return;
    this.onboardingUpdatePending = true;
    if (this.onboardingUpdateTimer) window.clearTimeout(this.onboardingUpdateTimer);
    this.onboardingUpdateTimer = window.setTimeout(() => {
      this.onboardingUpdateTimer = null;
      if (this.unloading || !this.settings.initialized || this.settings.resetNeedsReview || !this.onboardingUpdatePending) return;
      if (this.featureMutationActive || this.onboardingStartupRunning || this.onboardingUpdateRun) {
        this.scheduleOnboardingUpdate();
        return;
      }
      const run = Promise.resolve().then(async () => {
        if (!await this.quickStructureCheck({ quiet: true, allowMissingRegistryForMigration: !!this.onboardingUpgradePending })) {
          this.scheduleOnboardingUpdate(3e3);
          return;
        }
        if (this.unloading || !this.settings.initialized || this.settings.resetNeedsReview) return;
        if (this.featureMutationActive) {
          this.scheduleOnboardingUpdate();
          return;
        }
        if (this.onboardingUpgradePending) {
          const upgraded = await this.runUpgradeMigrations();
          this.onboardingUpgradePending = !upgraded;
          if (!upgraded) this.onboardingUpdatePending = true;
        } else {
          const result = await updateOnboardingExamples(this, { TFile, TFolder, parseFrontmatterObject });
          this.onboardingUpdatePending = result.cleanup === "pending";
        }
        if (this.onboardingStartupPending && !this.onboardingUpgradePending) {
          if (this.unloading || !this.settings.initialized || this.settings.resetNeedsReview) return;
          if (this.featureMutationActive) {
            this.scheduleOnboardingUpdate();
            return;
          }
          if (this.onboardingStartupPending === "resources") {
            const status = await this.startResourceCollection({ cleanupLegacyMarkers: this.settings.resourceMarkerCleanupRevision !== 1 });
            if (this.unloading || !this.settings.initialized || this.settings.resetNeedsReview) return;
            if (status?.error || status?.paused || status?.stopped) {
              this.scheduleOnboardingUpdate(3e3);
              return;
            }
            this.onboardingStartupPending = "marker-revision";
          }
          if (this.featureMutationActive) {
            this.scheduleOnboardingUpdate();
            return;
          }
          if (this.onboardingStartupPending === "marker-revision") {
            if (this.resourceFeatures?.lastMarkerCleanup && !this.resourceFeatures.lastMarkerCleanup.skipped?.length) {
              const previous = this.settings.resourceMarkerCleanupRevision;
              this.settings.resourceMarkerCleanupRevision = 1;
              try {
                await this.saveSettings();
              } catch (error) {
                this.settings.resourceMarkerCleanupRevision = previous;
                throw error;
              }
            }
            this.onboardingStartupPending = "navigation";
          }
          if (this.unloading || !this.settings.initialized || this.settings.resetNeedsReview) return;
          await this.findExampleCase();
          if (this.unloading || !this.settings.initialized || this.settings.resetNeedsReview) return;
          if (this.featureMutationActive) {
            this.scheduleOnboardingUpdate();
            return;
          }
          if (this.settings.autoOpenSidebar) await this.activateSidebar();
          this.onboardingStartupPending = null;
        }
        this.refreshOnboarding();
      }).catch((error) => {
        this.onboardingUpdatePending = true;
        if (this.onboardingStartupPending) this.scheduleOnboardingUpdate(3e3);
        console.warn("CST example cleanup deferred", error);
      }).finally(() => {
        if (this.onboardingUpdateRun === run) this.onboardingUpdateRun = null;
      });
      this.onboardingUpdateRun = run;
      return run;
    }, delay);
  }
  renderInterfaceStatus(el) {
    el.createEl("h2", { text: "Navigation and updates" });
    const status = this.uiPreferencesStatus;
    el.createEl("p", { text: status?.updates ? "Community plugin update checks are enabled. Updates are not installed automatically." : "Automatic update checks could not be confirmed. Enable them in Obsidian Settings → Community plugins." });
    el.createEl("p", { text: Platform.isMobile && status?.mobile ? "The ribbon shortcut and swipe-down action open CST Notes. Home stays available in its navigation panel." : "Home buttons remain available. On mobile, set the ribbon quick-access item and swipe-down Quick Action to Open CST Notes in Obsidian's Interface settings." });
    el.createEl("p", { text: "CST Notes applies its navigation defaults once on this device for this update. Later manual changes are preserved until a new navigation-defaults update." });
  }
  async renderOnboardingAdmin(el) {
    el.createEl("h2", { text: "Onboarding" });
    const completion = this.onboardingCompletionState();
    if (completion.completed) el.createEl("p", { text: completion.keptExamples ? "Completed — Kept examples" : "Completed — Start fresh chosen", attr: { role: "status" } });
    el.createEl("p", { text: "The checklist is available while the example case is in your CST Notes library." });
    const add = el.createEl("button", { text: "Add example case" });
    add.disabled = !!this.exampleCase();
    add.onclick = () => this.navigateFromUI("Add example case", async () => {
      add.disabled = true;
      try {
        await this.addExampleCase();
        await this.openFile(this.exampleCase());
      } finally {
        add.disabled = !!this.exampleCase();
        show.disabled = !this.exampleCase();
      }
    });
    const show = el.createEl("button", { text: "Show onboarding checklist" });
    show.disabled = !this.exampleCase();
    show.onclick = () => this.navigateFromUI("Show onboarding checklist", async () => {
      if (!this.exampleCase()) return;
      this.settings.onboardingDismissed = false;
      this.showCompletedOnboarding = this.onboardingDone();
      await this.saveSettings();
      await this.activateSidebar({ specialty: "", surgeon: "", query: "" });
      this.refreshOnboarding();
    });
  }
  async addExampleCase() {
    if (this.exampleCreation) return this.exampleCreation;
    this.exampleCreation = createOnboardingExample(this, {
      TFile,
      TFolder,
      id,
      yamlString,
      parseFrontmatterObject,
      validatePortableVaultPath
    });
    try {
      return await this.exampleCreation;
    } finally {
      this.exampleCreation = null;
    }
  }
  p(rel = "") {
    return cleanPath(this.settings.backendRoot, rel);
  }
  get contentRoot() {
    return normalizePath(this.settings.contentRoot);
  }
  isManagedPath(path) {
    path = normalizePath(path);
    return path === this.contentRoot || path.startsWith(this.contentRoot + "/");
  }
  detectExistingCSTArtifacts() {
    const paths = [];
    const candidates = [
      this.contentRoot,
      normalizePath(this.settings.backendRoot || "Backend"),
      this.surgeonRegistryPath(),
      this.migrationSessionPath(),
      normalizePath(this.settings.launcherPath || "CST App.md")
    ];
    for (const path of candidates) {
      if (path && this.app.vault.getAbstractFileByPath(path)) paths.push(path);
    }
    for (const file of this.app.vault.getMarkdownFiles()) {
      const type = String(this.app.metadataCache.getFileCache(file)?.frontmatter?.cst_type || "");
      if (type && (type === "case" || type.startsWith("surgeon") || type.startsWith("specialty") || type.startsWith("legacy-migration"))) {
        paths.push(file.path);
        if (paths.length >= 12) break;
      }
    }
    return { exists: paths.length > 0, paths: [...new Set(paths)] };
  }
  caseContext(file) {
    if (!(file instanceof TFile) || file.extension !== "md") return null;
    const c = contextFromPath(file.path, this.contentRoot);
    if (!c || !c.surgeon || c.depth !== 3) return null;
    return { ...c, file };
  }
  async caseIdentityStatus(file) {
    const context = this.caseContext(file);
    if (!context) return null;
    const frontmatter = await this.fileFrontmatter(file);
    const storedSpecialty = String(frontmatter.specialty || "").trim();
    const storedSurgeon = String(frontmatter.surgeon || "").trim();
    const missingMetadata = !storedSpecialty || !storedSurgeon;
    const mismatch = !!(storedSpecialty && storedSpecialty !== context.specialty || storedSurgeon && storedSurgeon !== context.surgeon);
    return {
      file,
      context,
      frontmatter,
      storedSpecialty,
      storedSurgeon,
      missingMetadata,
      mismatch,
      usable: !missingMetadata && !mismatch
    };
  }
  async caseEntries(files = null) {
    const source = files || this.allCaseFiles();
    return (await Promise.all(source.map((file) => this.caseIdentityStatus(file)))).filter(Boolean);
  }
  workspaceDocuments() {
    const documents = /* @__PURE__ */ new Set();
    if (typeof document !== "undefined") documents.add(document);
    try {
      this.app.workspace.iterateAllLeaves((leaf2) => {
        const doc = leaf2?.view?.containerEl?.ownerDocument || leaf2?.containerEl?.ownerDocument;
        if (doc) documents.add(doc);
      });
    } catch (_) {
    }
    return documents;
  }
  isCSTInterfacePath(path) {
    path = normalizePath(String(path || ""));
    const backend = normalizePath(this.settings.backendRoot || "Backend");
    const launcher = normalizePath(this.settings.launcherPath || "CST App.md");
    return !!path && (this.isManagedPath(path) || path === launcher || path === backend || path.startsWith(backend + "/"));
  }
  updateManagedBodyClass() {
    const documents = this.workspaceDocuments();
    for (const doc of documents) {
      doc.querySelectorAll?.(".cst-managed-leaf").forEach((el) => el.classList.remove("cst-managed-leaf"));
    }
    try {
      this.app.workspace.iterateAllLeaves((leaf2) => {
        const doc = leaf2?.view?.containerEl?.ownerDocument || leaf2?.containerEl?.ownerDocument;
        const path = leaf2?.view?.file?.path || "";
        const source = leaf2?.view?.containerEl || leaf2?.containerEl;
        const container = source?.closest?.(".workspace-leaf") || (source?.matches?.(".workspace-leaf") ? source : null);
        if (doc && container && this.isCSTInterfacePath(path)) container.classList.add("cst-managed-leaf");
      });
    } catch (_) {
      const active = this.app.workspace.getActiveFile();
      if (typeof document !== "undefined" && this.isCSTInterfacePath(active?.path || "")) {
        document.querySelector?.(".workspace-leaf.mod-active")?.classList.add("cst-managed-leaf");
      }
    }
    for (const doc of documents) {
      if (!doc.body) continue;
      doc.body.classList.toggle("cst-platform-phone", !!Platform.isPhone);
      doc.body.classList.toggle("cst-platform-tablet", !!Platform.isTablet);
      doc.body.classList.remove("cst-managed-active");
    }
  }
  async ensureFolder(path) {
    path = normalizePath(path);
    if (!path) return null;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return existing;
    if (existing) throw new Error(`Path exists and is not a folder: ${path}`);
    const parts = path.split("/");
    let built = "";
    for (const part of parts) {
      built = built ? `${built}/${part}` : part;
      const item = this.app.vault.getAbstractFileByPath(built);
      if (!item) {
        this.markInternalCreate(built);
        try {
          await this.app.vault.createFolder(built);
        } catch (error) {
          const raced = this.app.vault.getAbstractFileByPath(built);
          if (!(raced instanceof TFolder)) throw error;
        }
      } else if (!(item instanceof TFolder)) throw new Error(`Cannot create folder over file: ${built}`);
    }
    return this.app.vault.getAbstractFileByPath(path);
  }
  async ensureTextFile(path, content) {
    path = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    if (existing) throw new Error(`Path exists and is not a file: ${path}`);
    await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
    const raced = this.app.vault.getAbstractFileByPath(path);
    if (raced instanceof TFile) return raced;
    if (raced) throw new Error(`Path exists and is not a file: ${path}`);
    this.markInternalCreate(path);
    try {
      return await this.app.vault.create(path, content);
    } catch (error) {
      const created = this.app.vault.getAbstractFileByPath(path);
      if (created instanceof TFile) return created;
      throw error;
    }
  }
  async writeGenerated(path, content) {
    path = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const current = await this.app.vault.read(existing);
      const block = frontmatterBlock(current);
      const type = block ? /^cst_type\s*:\s*["']?([^"'#\r\n]+)["']?\s*$/mi.exec(block.text)?.[1]?.trim() || "" : "";
      const generated = !!block && (/* @__PURE__ */ new Set(["graph-root", "specialty-node", "surgeon-node"])).has(type) && /^generated\s*:\s*true\s*$/mi.test(block.text);
      if (generated) {
        if (current === content) return existing;
        await this.replaceFileTextExpected(
          existing,
          current,
          content,
          `Generated graph file changed during rebuild: ${path}. Retry after Sync settles.`,
          path
        );
        return existing;
      }
      throw new Error(`Generated graph path is occupied by a non-generated file: ${path}. The file was preserved; move it or resolve the collision before rebuilding.`);
    }
    const created = await this.ensureTextFile(path, content);
    if (await this.app.vault.read(created) === content) return created;
    return await this.writeGenerated(path, content);
  }
  async suppress(file, fn) {
    const path = normalizePath(String(file?.path || ""));
    this.ignoreModifyUntil.set(path, Date.now() + 1500);
    try {
      return await fn();
    } finally {
      window.setTimeout(() => {
        if ((this.ignoreModifyUntil.get(path) || 0) <= Date.now()) this.ignoreModifyUntil.delete(path);
      }, 1700);
    }
  }
  markInternalCreate(path) {
    path = normalizePath(path);
    this.ignoreCreateUntil.set(path, Date.now() + 2500);
    window.setTimeout(() => {
      if ((this.ignoreCreateUntil.get(path) || 0) <= Date.now()) this.ignoreCreateUntil.delete(path);
    }, 2700);
  }
  isInternalCreate(path) {
    return (this.ignoreCreateUntil.get(normalizePath(path)) || 0) > Date.now();
  }
  markInternalRename(oldPath, newPath) {
    const key4 = `${normalizePath(oldPath)}\0${normalizePath(newPath)}`;
    this.ignoreRenameUntil.set(key4, Date.now() + 5e3);
    window.setTimeout(() => {
      if ((this.ignoreRenameUntil.get(key4) || 0) <= Date.now()) this.ignoreRenameUntil.delete(key4);
    }, 5200);
  }
  isInternalRename(oldPath, newPath) {
    const key4 = `${normalizePath(oldPath)}\0${normalizePath(newPath)}`;
    const internal = (this.ignoreRenameUntil.get(key4) || 0) > Date.now();
    if (internal) this.ignoreRenameUntil.delete(key4);
    return internal;
  }
  async fileFrontmatter(file, expectedPath = "") {
    if (!(file instanceof TFile)) return {};
    expectedPath = normalizePath(String(expectedPath || file.path || ""));
    this.assertVaultFilePath(file, expectedPath, `Frontmatter read stopped because ${expectedPath} moved or was replaced.`);
    const raw = await this.app.vault.read(file);
    this.assertVaultFilePath(file, expectedPath, `Frontmatter read stopped because ${expectedPath} moved or was replaced.`);
    return Object.assign(
      {},
      this.app.metadataCache.getFileCache(file)?.frontmatter || {},
      parseFrontmatterObject(raw)
    );
  }
  async patchFrontmatter(file, patcher, expectedPath = "") {
    if (!(file instanceof TFile)) return;
    expectedPath = normalizePath(String(expectedPath || file.path || ""));
    const assertExpectedPath = () => this.assertVaultFilePath(
      file,
      expectedPath,
      `Frontmatter update stopped because ${expectedPath} moved or was replaced.`
    );
    assertExpectedPath();
    const result = await this.suppress(file, async () => {
      assertExpectedPath();
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        assertExpectedPath();
        patcher(fm);
      });
    });
    assertExpectedPath();
    return result;
  }
  assertVaultFilePath(file, expectedPath, conflictMessage = "") {
    expectedPath = normalizePath(String(expectedPath || ""));
    const actualPath = file instanceof TFile ? normalizePath(String(file.path || "")) : "";
    const current = expectedPath ? this.app.vault.getAbstractFileByPath(expectedPath) : null;
    if (!(file instanceof TFile) || !expectedPath || actualPath !== expectedPath || current !== file) {
      throw new Error(conflictMessage || `The vault file moved or was replaced in another window or device.`);
    }
    return expectedPath;
  }
  async replaceFileTextExpected(file, expectedText, nextText, conflictMessage, expectedPath = "") {
    if (!(file instanceof TFile)) throw new Error("Cannot update a missing vault file.");
    const immutablePath = normalizePath(String(expectedPath || file.path || ""));
    const assertExpectedPath = () => this.assertVaultFilePath(
      file,
      immutablePath,
      conflictMessage || `The file moved or was replaced in another window or device.`
    );
    assertExpectedPath();
    expectedText = String(expectedText ?? "");
    nextText = String(nextText ?? "");
    const transform = (currentText) => {
      assertExpectedPath();
      if (String(currentText) !== expectedText) {
        throw new Error(conflictMessage || "The file changed in another window or device.");
      }
      return nextText;
    };
    if (typeof this.app.vault.process === "function") {
      await this.suppress(file, async () => {
        assertExpectedPath();
        return await this.app.vault.process(file, transform);
      });
    } else {
      assertExpectedPath();
      const currentText = await this.app.vault.read(file);
      assertExpectedPath();
      const replacement = transform(currentText);
      if (replacement !== currentText) {
        await this.suppress(file, async () => {
          assertExpectedPath();
          return await this.app.vault.modify(file, replacement);
        });
      }
    }
    assertExpectedPath();
    return expectedText !== nextText;
  }
  async appendFileTextAtPath(file, expectedPath, suffix, conflictMessage = "") {
    expectedPath = normalizePath(String(expectedPath || ""));
    suffix = String(suffix ?? "");
    const assertExpectedPath = () => this.assertVaultFilePath(
      file,
      expectedPath,
      conflictMessage || `Append stopped because ${expectedPath} moved or was replaced.`
    );
    assertExpectedPath();
    const transform = (current) => {
      assertExpectedPath();
      return String(current ?? "") + suffix;
    };
    if (typeof this.app.vault.process === "function") {
      await this.suppress(file, async () => {
        assertExpectedPath();
        return await this.app.vault.process(file, transform);
      });
    } else {
      const current = await this.app.vault.read(file);
      assertExpectedPath();
      const next = transform(current);
      await this.suppress(file, async () => {
        assertExpectedPath();
        return await this.app.vault.modify(file, next);
      });
    }
    assertExpectedPath();
  }
  async applyExpectedTextPlans(plans, label = "Maintenance") {
    const applied = [];
    try {
      for (const plan of plans || []) {
        if (!(plan.file instanceof TFile) || plan.next === plan.original) continue;
        const expectedPath = normalizePath(String(plan.path || plan.file.path || ""));
        await this.replaceFileTextExpected(
          plan.file,
          plan.original,
          plan.next,
          `${label} stopped because ${expectedPath} changed or moved in another window or device.`,
          expectedPath
        );
        applied.push({ ...plan, path: expectedPath });
      }
      return applied.length;
    } catch (error) {
      const rollbackErrors = [];
      for (const plan of [...applied].reverse()) {
        try {
          await this.replaceFileTextExpected(
            plan.file,
            plan.next,
            plan.original,
            `${label} rollback stopped because ${plan.path} was edited or moved after the maintenance write.`,
            plan.path
          );
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      if (rollbackErrors.length) {
        throw new Error(`${error.message || error} Rollback needs review: ${rollbackErrors.join(" | ")}`);
      }
      throw error;
    }
  }
  async importSurgeonRecordIfNewer(specialty, surgeon2, data) {
    const sourceRecord = this.adminRegistryRecord(data, specialty, surgeon2);
    const key4 = this.surgeonKey(specialty, surgeon2);
    const result = await this.mutateSurgeonRegistry((registry) => {
      const current = registry.surgeons[key4] || null;
      const before = current ? JSON.parse(JSON.stringify(current)) : null;
      const sourceTime = Date.parse(sourceRecord.last_verified || sourceRecord.created || 0) || 0;
      const currentTime = Date.parse(current?.last_verified || current?.created || 0) || 0;
      if (current && sourceTime <= currentTime) {
        return { changed: false, before, record: before };
      }
      const record = JSON.parse(JSON.stringify(sourceRecord));
      registry.surgeons[key4] = record;
      return { changed: true, before, record: JSON.parse(JSON.stringify(record)) };
    });
    return { imported: !!result.value?.changed, ...result.value };
  }
  async seedSurgeonGlovesIfUnknown(specialty, surgeon2, gloves, verified = "") {
    const canonical = normalizeGloves2(gloves, this.settings);
    const key4 = this.surgeonKey(specialty, surgeon2);
    const result = await this.mutateSurgeonRegistry((registry) => {
      const current = registry.surgeons[key4] || null;
      const before = current ? JSON.parse(JSON.stringify(current)) : null;
      const timestamp = verified || nowISO();
      const base = current ? this.adminRegistryRecord(current, specialty, surgeon2) : this.adminRegistryRecord({
        cst_id: id("surgeon"),
        aliases: [],
        gloves: "Unknown",
        gown: GOWNS2.includes(this.settings.defaultGown) ? this.settings.defaultGown : "Unknown",
        schema_version: SCHEMA_VERSION,
        created: timestamp,
        last_verified: timestamp
      }, specialty, surgeon2);
      if (base.gloves && base.gloves !== "Unknown") {
        return { changed: false, before, record: JSON.parse(JSON.stringify(base)) };
      }
      const next = JSON.parse(JSON.stringify(base));
      next.gloves = canonical;
      next.last_verified = timestamp;
      next.schema_version = SCHEMA_VERSION;
      registry.surgeons[key4] = next;
      return { changed: true, before, record: JSON.parse(JSON.stringify(next)) };
    });
    return result.value;
  }
  async ensureMigrationSurgeonRecord(specialty, surgeon2) {
    const key4 = this.surgeonKey(specialty, surgeon2);
    const result = await this.mutateSurgeonRegistry((registry) => {
      const current = registry.surgeons[key4] || null;
      if (current) {
        const record2 = this.adminRegistryRecord(current, specialty, surgeon2);
        return { changed: false, before: JSON.parse(JSON.stringify(current)), record: record2 };
      }
      const timestamp = nowISO();
      const record = this.adminRegistryRecord({
        cst_id: id("surgeon"),
        aliases: [],
        gloves: "Unknown",
        gown: GOWNS2.includes(this.settings.defaultGown) ? this.settings.defaultGown : "Unknown",
        schema_version: SCHEMA_VERSION,
        created: timestamp,
        last_verified: timestamp
      }, specialty, surgeon2);
      registry.surgeons[key4] = JSON.parse(JSON.stringify(record));
      return { changed: true, before: null, record: JSON.parse(JSON.stringify(record)) };
    });
    return result.value;
  }
  rememberRegistryMutation(mutations, specialty, surgeon2, result) {
    if (!result?.changed) return;
    const key4 = this.surgeonKey(specialty, surgeon2);
    const existing = mutations.get(key4);
    if (existing) {
      existing.expected = JSON.parse(JSON.stringify(result.record));
      return;
    }
    mutations.set(key4, {
      specialty,
      surgeon: surgeon2,
      expected: JSON.parse(JSON.stringify(result.record)),
      data: result.before == null ? null : JSON.parse(JSON.stringify(result.before))
    });
  }
  async rollbackRegistryMutations(mutations, label) {
    const changes = [...mutations?.values?.() || []];
    if (!changes.length) return;
    try {
      await this.applyAdminRegistryChanges(changes);
    } catch (error) {
      throw new Error(`${label} registry rollback stopped to preserve a newer edit: ${error.message || error}`);
    }
  }
  async compensateUnexpectedVaultRename(item, oldPath, newPath) {
    const atOldPath = this.app.vault.getAbstractFileByPath(oldPath);
    const atNewPath = this.app.vault.getAbstractFileByPath(newPath);
    if (atOldPath || atNewPath !== null && !(atNewPath instanceof TFile) && !(atNewPath instanceof TFolder) || !atNewPath || atNewPath === item || normalizePath(String(atNewPath.path || "")) !== newPath) {
      return { attempted: false, restored: false };
    }
    const suppressionKey = `${newPath}\0${oldPath}`;
    this.markInternalRename(newPath, oldPath);
    try {
      await this.app.vault.rename(atNewPath, oldPath);
    } catch (error) {
      this.ignoreRenameUntil.delete(suppressionKey);
      return { attempted: true, restored: false, error };
    }
    const restored = this.app.vault.getAbstractFileByPath(oldPath) === atNewPath && !this.app.vault.getAbstractFileByPath(newPath) && normalizePath(String(atNewPath.path || "")) === oldPath;
    if (!restored) this.ignoreRenameUntil.delete(suppressionKey);
    return { attempted: true, restored, item: atNewPath };
  }
  async renameVaultItem(item, newPath, expectedPath = "") {
    if (!(item instanceof TFile) && !(item instanceof TFolder)) throw new Error("Cannot rename a missing vault item.");
    const immutableSourcePath = normalizePath(String(expectedPath || ""));
    if (!immutableSourcePath) {
      throw new Error("Vault rename requires the immutable source path captured before any asynchronous work.");
    }
    const oldPath = validatePortableVaultPath(
      immutableSourcePath,
      "Source path"
    );
    newPath = normalizePath(newPath);
    validatePortableVaultPath(newPath, "Destination path");
    if (oldPath === newPath) return item;
    const assertSource = () => {
      const current = this.app.vault.getAbstractFileByPath(oldPath);
      if (current !== item || normalizePath(String(item.path || "")) !== oldPath) {
        throw new Error(`Vault rename stopped because ${oldPath} moved or was replaced.`);
      }
    };
    assertSource();
    if (this.app.vault.getAbstractFileByPath(newPath)) {
      throw new Error(`Vault rename stopped because the destination already exists: ${newPath}`);
    }
    const suppressionKey = `${oldPath}\0${newPath}`;
    this.markInternalRename(oldPath, newPath);
    try {
      await this.app.vault.rename(item, newPath);
    } catch (error) {
      this.ignoreRenameUntil.delete(suppressionKey);
      throw error;
    }
    const moved = this.app.vault.getAbstractFileByPath(newPath);
    if (this.app.vault.getAbstractFileByPath(oldPath) || moved !== item || normalizePath(String(item.path || "")) !== newPath) {
      this.ignoreRenameUntil.delete(suppressionKey);
      const compensation = await this.compensateUnexpectedVaultRename(item, oldPath, newPath);
      if (compensation.restored) {
        throw new Error(
          `Vault rename stopped because a queued Sync replacement moved from ${oldPath} instead of the selected item. The replacement was restored exactly; no backend state was committed.`
        );
      }
      if (compensation.attempted) {
        throw new Error(
          `Vault rename could not prove the exact item moved from ${oldPath} to ${newPath}, and automatic restoration could not be verified. No backend state was committed; let Sync settle and review both paths.`
        );
      }
      throw new Error(`Vault rename could not prove the exact item moved from ${oldPath} to ${newPath}. No backend state was committed; let Sync settle and review both paths.`);
    }
    return moved;
  }
  async quarantineManagedFile(file, expectedPath, label = "Managed file") {
    expectedPath = validatePortableVaultPath(normalizePath(String(expectedPath || "")), `${label} path`);
    const backendRoot = normalizePath(String(this.settings.backendRoot || ""));
    if (!backendRoot || expectedPath !== backendRoot && !expectedPath.startsWith(backendRoot + "/")) {
      throw new Error(`${label} quarantine refused because ${expectedPath} is outside the CST backend.`);
    }
    this.assertVaultFilePath(file, expectedPath, `${label} moved or was replaced before quarantine.`);
    const quarantineRoot = this.p("Admin/Backups/Quarantined Items");
    await this.ensureFolder(quarantineRoot);
    this.assertVaultFilePath(file, expectedPath, `${label} moved or was replaced while quarantine was being prepared.`);
    const extension = (safeFileName(file.extension || "bin").replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "bin").toLowerCase();
    const stem = (safeFileName(file.basename || "managed") || "managed").slice(0, 28);
    const originHash = shortHash(expectedPath).replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
    for (let attempt = 0; attempt < 1e3; attempt++) {
      const nonce = id("quarantine").replace(/[^A-Za-z0-9]/g, "").slice(-14);
      const suffix = attempt ? `-${attempt + 1}` : "";
      const target = validatePortableVaultPath(
        cleanPath(quarantineRoot, `${stem}-${originHash}-${nonce}${suffix}.${extension}`),
        `${label} quarantine target`
      );
      if (this.app.vault.getAbstractFileByPath(target)) continue;
      this.assertVaultFilePath(file, expectedPath, `${label} moved or was replaced immediately before quarantine.`);
      const moved = await this.renameVaultItem(file, target, expectedPath);
      if (moved !== file || this.app.vault.getAbstractFileByPath(target) !== file || normalizePath(file.path) !== target) {
        throw new Error(`${label} quarantine could not prove the exact file reached ${target}.`);
      }
      return target;
    }
    throw new Error(`${label} quarantine could not allocate a unique destination.`);
  }
  async quarantineEmptySurgeonFolder(folder, expectedPath, label = "Surgeon folder") {
    expectedPath = validatePortableVaultPath(normalizePath(String(expectedPath || "")), `${label} path`);
    const relative = expectedPath.startsWith(this.contentRoot + "/") ? expectedPath.slice(this.contentRoot.length + 1).split("/").filter(Boolean) : [];
    if (relative.length !== 2) {
      throw new Error(`${label} quarantine refused because ${expectedPath} is not an exact CST surgeon folder.`);
    }
    const assertEmptyAtSource = () => {
      const current = this.app.vault.getAbstractFileByPath(expectedPath);
      if (!(folder instanceof TFolder) || current !== folder || normalizePath(folder.path) !== expectedPath) {
        throw new Error(`${label} moved or was replaced before empty-folder quarantine.`);
      }
      if (folder.children.length) {
        throw new Error(`${label} gained content from another window or device and was preserved.`);
      }
    };
    assertEmptyAtSource();
    const quarantineRoot = this.p("Admin/Backups/Quarantined Empty Folders");
    await this.ensureFolder(quarantineRoot);
    assertEmptyAtSource();
    const stem = (safeFileName(relative[1]) || "surgeon").slice(0, 28);
    const originHash = shortHash(expectedPath).replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
    for (let attempt = 0; attempt < 1e3; attempt++) {
      const nonce = id("empty").replace(/[^A-Za-z0-9]/g, "").slice(-14);
      const suffix = attempt ? `-${attempt + 1}` : "";
      const target = validatePortableVaultPath(
        cleanPath(quarantineRoot, `${stem}-${originHash}-${nonce}${suffix}`),
        `${label} quarantine target`
      );
      if (this.app.vault.getAbstractFileByPath(target)) continue;
      assertEmptyAtSource();
      const moved = await this.renameVaultItem(folder, target, expectedPath);
      const quarantined = this.app.vault.getAbstractFileByPath(target);
      if (moved !== folder || quarantined !== folder || normalizePath(folder.path) !== target) {
        throw new Error(`${label} quarantine could not prove the exact folder reached ${target}.`);
      }
      if (folder.children.length) {
        const occupiedSource = this.app.vault.getAbstractFileByPath(expectedPath);
        if (!occupiedSource) {
          await this.renameVaultItem(folder, expectedPath, target);
          const restored = this.app.vault.getAbstractFileByPath(expectedPath);
          if (restored !== folder || normalizePath(folder.path) !== expectedPath) {
            throw new Error(`${label} gained content during quarantine and needs review at ${target}.`);
          }
          throw new Error(`${label} gained content during quarantine; the folder and its content were restored and preserved.`);
        }
        throw new Error(`${label} gained content during quarantine and was preserved at ${target}; the original path was also re-created by Sync.`);
      }
      return target;
    }
    throw new Error(`${label} quarantine could not allocate a unique destination.`);
  }
  async initializeSystem({ existingVaultConfirmed = false } = {}) {
    const existing = this.detectExistingCSTArtifacts();
    const freshInstall = !this.settings.initialized && !existing.exists;
    if ((this.settings.initialized || existing.exists) && !existingVaultConfirmed) {
      throw new Error("Existing CST data was detected. Verify that Sync is complete before running Initialize / Repair.");
    }
    if (existingVaultConfirmed && !await this.quickStructureCheck({
      allowRegistryMismatch: true,
      allowMissingSessionPaths: true,
      allowMissingRegistryForMigration: true
    })) {
      throw new Error("The vault changed after verification. Wait for Sync and verify the complete vault again.");
    }
    const folders = [
      this.contentRoot,
      ...DEFAULT_SPECIALTIES.map((specialty) => cleanPath(this.contentRoot, specialty)),
      this.p("Admin/Backend"),
      this.p("Admin/Data"),
      this.p("Admin/Logs"),
      this.p("Admin/Backups"),
      this.p("References/Trays"),
      this.p("References/Instruments"),
      this.p("References/Sutures"),
      this.p("References/Dressings"),
      this.p("References/Medications"),
      this.p("References/Equipment"),
      this.p("References/Implants"),
      this.p("_Graph/Specialties"),
      this.p("_Graph/Surgeons"),
      this.p("_Templates/Cases/Spine"),
      this.p("_Data/Surgeons"),
      this.p("_Config")
    ];
    const initializationTargets = new Set(folders);
    const adminFiles = [
      "Admin/Admin.md",
      "Admin/Database Health.md",
      "Admin/Verification.md",
      "Admin/Activity.md",
      "Admin/Metadata.md",
      "Admin/System.md",
      "Admin/Recovery.md",
      "Admin/Backend/Repair.md",
      "Admin/Backend/Surgeons.md",
      "Admin/Backend/Cases.md",
      "Admin/Backend/Templates.md",
      "Admin/Backend/References.md",
      "Admin/Backend/Graph.md",
      "Admin/Backend/Migrations.md",
      "Admin/Backend/Configuration.md",
      "Admin/Data/Migrations.md",
      "Admin/Data/Pending Review.md",
      "Admin/Logs/Automation.md",
      "_Config/System.md",
      "_Graph/Specialties.md"
    ];
    for (const rel of adminFiles) initializationTargets.add(this.p(rel));
    initializationTargets.add(this.surgeonRegistryPath());
    initializationTargets.add(this.migrationSessionPath());
    initializationTargets.add(this.launcherPath());
    for (const rel of Object.keys(defaultTemplates())) {
      const templatePath = this.p(`_Templates/Cases/${rel}`);
      initializationTargets.add(templatePath);
      initializationTargets.add(cleanPath(this.templateVersionRoot(templatePath), "v1.md"));
    }
    for (const specialty of /* @__PURE__ */ new Set([...DEFAULT_SPECIALTIES, ...this.getSpecialties()])) {
      initializationTargets.add(this.specialtyGraphPath(specialty));
      for (const surgeon2 of this.getSurgeons(specialty)) {
        initializationTargets.add(this.surgeonGraphPath(specialty, surgeon2));
      }
    }
    initializationTargets.add(this.p("Admin/Logs/v0.1.2 Migration 20000101-000000.md"));
    initializationTargets.add(this.p("Admin/Backups/20000101-000000-000-xxxxxxxxxxxxxxxxxxxxxxxx-abcdefghij-9999/Files/9999-abcdefghijkl.abcdefghijkl"));
    initializationTargets.add(this.p("Admin/Backups/Legacy Template Migration/xxxxxxxxxxxxxxxxxxxxxxxx-abcdefghij/_Undo/pre-xxxxxxxxxxxxxxxx-abcdefghij-100.abcdefghijkl"));
    for (const target of initializationTargets) validatePortableVaultPath(target, "Initialization path");
    for (const f of folders) await this.ensureFolder(f);
    await this.createDefaultTemplates();
    await this.ensureAllTemplateVersions();
    await this.createAdminNotes();
    await this.ensureSystemManifest();
    await this.ensureLauncherNote();
    await this.readSurgeonRegistry();
    if (existingVaultConfirmed) await this.reconcileSurgeonRegistryFolders();
    await this.migrateV011();
    await this.migrateV012();
    await this.migrateV013();
    await this.repairAll(false);
    this.settings.initialized = true;
    this.settings.schemaVersion = SCHEMA_VERSION;
    this.settings.pluginVersion = PLUGIN_VERSION;
    this.settings.autoOpenSidebar = true;
    this.settings.autoOpenDefaultVersion = "0.1.6";
    await this.upgradeTemplateDefaultsV016();
    if (freshInstall) await this.addExampleCase();
    await this.saveSettings();
    await this.appendLog("Initialize", `CST Notes ${PLUGIN_VERSION} initialized.`);
    await this.startResourceCollection?.();
  }
  async createDefaultTemplates() {
    const defs = defaultTemplates();
    for (const [rel, body] of Object.entries(defs)) {
      const path = this.p(`_Templates/Cases/${rel}`);
      await this.ensureTextFile(path, body);
    }
  }
  async upgradeTemplateDefaultsV016() {
    if (this.settings.templateDefaultsVersion === "0.1.7") return 0;
    const prefix = this.p("_Templates/Cases") + "/";
    const files = this.filesWithin(this.p("_Templates/Cases"), "md").filter((file) => file.path.startsWith(prefix) && this.isTemplatePath(file.path)).sort((a, b) => a.path.localeCompare(b.path));
    const plans = [];
    for (const file of files) {
      const original = await this.app.vault.read(file);
      const next = generalPAFirst(file.path, upgradeTemplateBodyV016(file.path, original));
      if (next !== original) plans.push({ file, path: file.path, original, next });
    }
    if (plans.length) {
      await this.snapshotFiles("v0.1.7-template-update", plans.map((plan) => plan.file));
      await this.applyExpectedTextPlans(plans, "v0.1.7 template update");
      for (const plan of plans) await this.ensureTemplateVersion(plan.file, false, plan.path);
    }
    this.settings.templateDefaultsVersion = "0.1.7";
    return plans.length;
  }
  async createAdminNotes() {
    const pages = {
      "Admin/Onboarding.md": "# Onboarding\n\n```cst-onboarding\n```\n",
      "Admin/Admin.md": `# CST Notes Admin

## Database
- [[${this.p("Admin/Database Health")}|Database Health]]
- [[${this.p("Admin/Verification")}|Verification]]
- [[${this.p("Admin/Activity")}|Activity]]
- [[${this.p("Admin/Metadata")}|Metadata]]

## Backend
- [[${this.p("Admin/Backend/Repair")}|Repair]]
- [[${this.p("Admin/Backend/Surgeons")}|Surgeons]]
- [[${this.p("Admin/Backend/Cases")}|Cases]]
- [[${this.p("Admin/Backend/Templates")}|Templates]]
- [[${this.p("Admin/Backend/References")}|References]]
- [[${this.p("Admin/Backend/Graph")}|Graph]]
- [[${this.p("Admin/Backend/Migrations")}|Migrations]]
- [[${this.p("Admin/Backend/Configuration")}|Configuration]]

## System
- [[${this.p("Admin/System")}|System]]
- [[${this.p("Admin/Recovery")}|Recovery]]
`,
      "Admin/Database Health.md": "# Database Health\n\n```cst-admin-health\n```\n",
      "Admin/Verification.md": "# Verification\n\nOldest verified items are shown first.\n\n```cst-admin-verification\n```\n",
      "Admin/Activity.md": "# Recent CST Activity\n\n```cst-admin-activity\n```\n",
      "Admin/Metadata.md": "# Metadata\n\n```cst-admin-metadata\n```\n",
      "Admin/System.md": "# CST Notes System\n\n```cst-admin-system\n```\n",
      "Admin/Recovery.md": `# Recovery

If CST automation stops working:

1. Do **not** delete \`${this.contentRoot}/\`.
2. Disable the CST Notes plugin if necessary. Your cases remain ordinary Markdown.
3. Restore the plugin/configuration from backup if needed.
4. Enable CST Notes and open **System**.
5. Run **Backend Repair**.
6. Rebuild \`${this.p("_Graph")}/\` from the Admin Graph page.

## Source-of-truth priority

1. \`${this.contentRoot}/\` — handwritten CST case content
2. \`${this.p("_Data")}/\` — reusable surgeon data
3. \`${this.p("_Templates")}/\` and plugin configuration
4. \`${this.p("_Graph")}/\` — generated and rebuildable

Obsidian Sync transports the vault; it is not required for local operation.
`,
      "Admin/Backend/Repair.md": "# Backend Repair\n\n```cst-admin-repair\n```\n",
      "Admin/Backend/Surgeons.md": "# Surgeon Admin\n\n```cst-admin-surgeons\n```\n",
      "Admin/Backend/Cases.md": "# Case Admin\n\n```cst-admin-cases\n```\n",
      "Admin/Backend/Templates.md": "# Template Admin\n\n```cst-admin-templates\n```\n",
      "Admin/Backend/References.md": "# Reference Admin\n\n```cst-admin-references\n```\n",
      "Admin/Backend/Graph.md": "# Graph Admin\n\n```cst-admin-graph\n```\n",
      "Admin/Backend/Migrations.md": "# Migrations\n\n```cst-admin-migrations\n```\n",
      "Admin/Backend/Configuration.md": "# Configuration\n\n```cst-admin-config\n```\n"
    };
    for (const [rel, body] of Object.entries(pages)) await this.ensureTextFile(this.p(rel), body);
    await this.ensureFeaturePages?.(pages);
    await this.ensureTextFile(this.p("Admin/Data/Migrations.md"), `---
cst_type: "migration-ledger"
schema_version: ${SCHEMA_VERSION}
completed: []
---

# Migration Ledger

Machine-managed record of completed CST schema migrations.
`);
  }
  async ensureSystemManifest() {
    const path = this.p("_Config/System.md");
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      const content = `---
cst_type: "system-manifest"
plugin_version: ${yamlString(PLUGIN_VERSION)}
schema_version: ${SCHEMA_VERSION}
content_root: ${yamlString(this.contentRoot)}
backend_root: ${yamlString(this.settings.backendRoot)}
installed: ${yamlString(nowISO())}
---

# CST Notes System Manifest

Machine-managed installation information.
`;
      file = await this.ensureTextFile(path, content);
    } else {
      await this.patchFrontmatter(file, (fm) => {
        fm.cst_type = "system-manifest";
        fm.plugin_version = PLUGIN_VERSION;
        fm.schema_version = SCHEMA_VERSION;
        fm.content_root = this.contentRoot;
        fm.backend_root = this.settings.backendRoot;
        if (!fm.installed) fm.installed = nowISO();
      });
    }
    return file;
  }
  launcherPath() {
    return normalizePath(this.settings.launcherPath || "CST App.md");
  }
  async ensureLauncherNote() {
    const path = this.launcherPath();
    validatePortableVaultPath(path, "Launcher path");
    const marker = "```" + LAUNCHER_LANG;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      file = await this.ensureTextFile(path, `${marker}
\`\`\`
`);
    }
    const text = await this.app.vault.read(file);
    if (!text.includes(marker)) {
      const next = `${text.replace(/\s*$/, "")}

${marker}
\`\`\`
`;
      await this.replaceFileTextExpected(
        file,
        text,
        next,
        "Launcher update stopped because the note changed or moved in another window or device.",
        path
      );
    }
    return file;
  }
  async renderLauncher(el) {
    el.empty();
    const card = el.createDiv({ cls: "cst-launcher-card" });
    card.createEl("div", { text: "CST Notes", cls: "cst-launcher-title" });
    card.createEl("div", { text: "Case workspace", cls: "cst-muted" });
    const open = card.createEl("button", { text: "Open CST App", cls: "mod-cta cst-launcher-open" });
    open.onclick = () => this.navigateFromUI("Open CST app", () => this.activateSidebar());
    const actions = card.createDiv({ cls: "cst-launcher-actions" });
    const add = actions.createEl("button", { text: "+ New Case" });
    add.onclick = () => this.openNewCase();
    const quick = actions.createEl("button", { text: "Templates" });
    quick.onclick = () => this.navigateFromUI("Templates", () => this.openPath(this.p("Admin/Backend/Templates.md")));
  }
  isTemplatePath(path) {
    const root = this.p("_Templates/Cases") + "/";
    path = normalizePath(path || "");
    return path.startsWith(root) && path.endsWith(".md") && !path.includes("/_Versions/");
  }
  templateVersionRoot(templatePath) {
    const segments = String(templatePath || "").replace(/\\/g, "/").split("/");
    if (segments.some((segment) => segment === "." || segment === "..")) throw new Error("Template path must stay within its managed folder.");
    if (!this.isTemplatePath(templatePath)) throw new Error("Template history requires an editable CST template path.");
    const root = this.p("_Templates/Cases") + "/";
    const rel = normalizePath(templatePath).slice(root.length).replace(/\.md$/i, "");
    return validatePortableVaultPath(this.p(`_Templates/_Versions/${rel}`), "Template history path");
  }
  async templateVersionFiles(templatePath) {
    const root = this.templateVersionRoot(templatePath);
    await this.ensureFolder(root);
    return this.templateVersionFilesReadOnly(templatePath);
  }
  templateVersionFilesReadOnly(templatePath) {
    const root = this.templateVersionRoot(templatePath);
    const folder = this.app.vault.getAbstractFileByPath(root);
    if (!folder) return [];
    if (!(folder instanceof TFolder)) throw new Error(`Template version path is not a folder: ${root}`);
    return folder.children.filter((x) => x instanceof TFile && /^v[1-9]\d*\.md$/.test(x.name)).map((file) => {
      this.assertVaultFilePath(file, cleanPath(root, file.name), "Template revision history moved or was replaced.");
      return { file, n: Number(/^v(\d+)\.md$/.exec(file.name)[1]) };
    }).filter((x) => Number.isSafeInteger(x.n) && x.n > 0).sort((a, b) => a.n - b.n);
  }
  async pruneTemplateVersions(file, version, text) {
    const path = file.path;
    const { pruneTemplateRevisions: pruneTemplateRevisions2 } = await Promise.resolve().then(() => (init_template_lifecycle(), template_lifecycle_exports));
    this.assertVaultFilePath(file, path, "Template moved before revision cleanup.");
    return pruneTemplateRevisions2(this, file, version, text);
  }
  async caseTemplateProvenance(file) {
    const { describeTemplateProvenance: describeTemplateProvenance2 } = await Promise.resolve().then(() => (init_template_lifecycle(), template_lifecycle_exports));
    return describeTemplateProvenance2(this, file);
  }
  async ensureTemplateVersion(file, announce = false, expectedPath = "") {
    if (!(file instanceof TFile)) return 0;
    const path = normalizePath(String(expectedPath || file.path || ""));
    if (!this.isTemplatePath(path)) return 0;
    this.assertVaultFilePath(file, path, `Template versioning stopped because ${path} moved or was replaced.`);
    if (!this.templateVersionQueues) this.templateVersionQueues = /* @__PURE__ */ new Map();
    const previous = this.templateVersionQueues.get(path) || Promise.resolve();
    const operation = previous.catch(() => {
    }).then(() => this.ensureTemplateVersionUnlocked(file, announce, path));
    this.templateVersionQueues.set(path, operation);
    try {
      return await operation;
    } finally {
      if (this.templateVersionQueues.get(path) === operation) this.templateVersionQueues.delete(path);
    }
  }
  async ensureTemplateVersionUnlocked(file, announce = false, expectedPath = "") {
    const path = normalizePath(String(expectedPath || file?.path || ""));
    const assertTemplate = () => this.assertVaultFilePath(
      file,
      path,
      `Template versioning stopped because ${path} moved or was replaced.`
    );
    assertTemplate();
    const current = await this.app.vault.read(file);
    assertTemplate();
    const finish = async (version) => {
      assertTemplate();
      await this.pruneTemplateVersions(file, version, current);
      assertTemplate();
      return version;
    };
    const root = this.templateVersionRoot(path);
    await this.ensureFolder(root);
    assertTemplate();
    for (let attempt = 0; attempt < 1e3; attempt++) {
      const versions = await this.templateVersionFiles(path);
      assertTemplate();
      const latest = versions[versions.length - 1] || null;
      if (latest) {
        const latestPath = cleanPath(root, latest.file.name);
        this.assertVaultFilePath(latest.file, latestPath, `Template version history changed while reading ${latestPath}.`);
        const latestText = await this.app.vault.read(latest.file);
        assertTemplate();
        this.assertVaultFilePath(latest.file, latestPath, `Template version history changed while reading ${latestPath}.`);
        if (latestText === current) return finish(latest.n);
      }
      const next = (latest?.n || 0) + 1;
      if (!Number.isSafeInteger(next)) throw new Error("Template revision number exceeds the safe numeric range.");
      const target = cleanPath(root, `v${next}.md`);
      const existing = this.app.vault.getAbstractFileByPath(target);
      if (existing instanceof TFile) {
        const existingText = await this.app.vault.read(existing);
        assertTemplate();
        this.assertVaultFilePath(existing, target, `Template version history changed while reading ${target}.`);
        if (existingText === current) return finish(next);
        continue;
      }
      if (existing) throw new Error(`Template version target is not a file: ${target}`);
      try {
        assertTemplate();
        this.markInternalCreate(target);
        await this.app.vault.create(target, current);
        assertTemplate();
      } catch (error) {
        const collided = this.app.vault.getAbstractFileByPath(target);
        if (!(collided instanceof TFile)) throw error;
        const collidedText = await this.app.vault.read(collided);
        assertTemplate();
        this.assertVaultFilePath(collided, target, `Template version collision changed while reading ${target}.`);
        if (collidedText === current) return finish(next);
        continue;
      }
      const created = this.app.vault.getAbstractFileByPath(target);
      if (!(created instanceof TFile)) throw new Error(`Template version disappeared after creation: ${target}`);
      const createdText = await this.app.vault.read(created);
      assertTemplate();
      this.assertVaultFilePath(created, target, `Template version changed immediately after creation: ${target}`);
      if (createdText !== current) continue;
      if (next > 1) await this.appendLog("Template version", `${path} → v${next}`);
      assertTemplate();
      if (announce) new Notice(`${file.basename} template saved as v${next}.`);
      return finish(next);
    }
    throw new Error(`Template versioning could not settle after repeated Sync collisions for ${path}.`);
  }
  scheduleTemplateVersion(file) {
    if (this.featureMutationActive || this.unloading || this.settings.resetNeedsReview) return;
    if (!(file instanceof TFile)) return;
    const path = normalizePath(String(file.path || ""));
    if (!this.isTemplatePath(path)) return;
    if ((this.ignoreModifyUntil.get(path) || 0) > Date.now()) return;
    const old = this.templateVersionTimers.get(path);
    if (old) window.clearTimeout(old);
    const timer = window.setTimeout(async () => {
      this.templateVersionTimers.delete(path);
      const current = this.app.vault.getAbstractFileByPath(path);
      if (!(current instanceof TFile)) return;
      try {
        await (this.runBackground ? this.runBackground(() => this.ensureTemplateVersion(current, true, path)) : this.ensureTemplateVersion(current, true, path));
      } catch (e) {
        console.error("CST template versioning", e);
      }
    }, 5e3);
    this.templateVersionTimers.set(path, timer);
  }
  async ensureAllTemplateVersions() {
    const root = this.p("_Templates/Cases") + "/";
    for (const file of this.filesWithin(this.p("_Templates/Cases"), "md")) {
      if (file.path.startsWith(root) && this.isTemplatePath(file.path)) await this.ensureTemplateVersion(file, false);
    }
  }
  getSpecialties() {
    const root = this.app.vault.getAbstractFileByPath(this.contentRoot);
    if (!(root instanceof TFolder)) return [];
    return root.children.filter((x) => x instanceof TFolder && !x.name.startsWith(".") && !x.name.startsWith("_")).map((x) => x.name).sort(compareCSTNames);
  }
  getSurgeons(specialty) {
    const folder = this.app.vault.getAbstractFileByPath(cleanPath(this.contentRoot, specialty));
    if (!(folder instanceof TFolder)) return [];
    return folder.children.filter((x) => x instanceof TFolder && !x.name.startsWith(".") && !x.name.startsWith("_")).map((x) => x.name).sort(compareCSTNames);
  }
  // Enumerate only the requested managed subtree, never unrelated vault folders.
  filesWithin(rootPath, extension = "") {
    const path = normalizePath(String(rootPath || ""));
    if (!path || path === "/" || path === ".") return [];
    const root = this.app.vault.getAbstractFileByPath(path);
    if (!(root instanceof TFolder)) return [];
    const files = [];
    const pending2 = [...root.children];
    const seen = /* @__PURE__ */ new Set();
    while (pending2.length) {
      const item = pending2.pop();
      if (!item || seen.has(item) || !item.path.startsWith(path + "/")) continue;
      seen.add(item);
      if (item instanceof TFolder) pending2.push(...item.children);
      else if (item instanceof TFile && (!extension || item.extension === extension)) files.push(item);
    }
    return files;
  }
  allCaseFiles() {
    return this.filesWithin(this.contentRoot, "md").filter((f) => !!this.caseContext(f));
  }
  specialtyGraphPath(specialty) {
    return this.p(`_Graph/Specialties/${safeFileName(specialty)}.md`);
  }
  surgeonGraphPath(specialty, surgeon2) {
    return this.p(`_Graph/Surgeons/${safeFileName(specialty)}/${safeFileName(canonicalPersonName(surgeon2))}.md`);
  }
  isCasePath(path) {
    const c = contextFromPath(path, this.contentRoot);
    return !!c && c.depth === 3 && !!c.specialty && !!c.surgeon && /\.md$/i.test(String(path || ""));
  }
  surgeonDataPath(specialty, surgeon2) {
    return this.p(`_Data/Surgeons/${safeFileName(specialty)}/${safeFileName(surgeon2)}.json`);
  }
  legacySurgeonDataPath(specialty, surgeon2) {
    return this.p(`_Data/Surgeons/${safeFileName(specialty)}/${safeFileName(surgeon2)}.md`);
  }
  surgeonRegistryPath() {
    return this.p("_Data/Surgeon Registry.md");
  }
  surgeonKey(specialty, surgeon2) {
    return `${String(specialty || "").trim()}\0${canonicalPersonName(surgeon2)}`;
  }
  surgeonRecordFingerprint(data) {
    if (!data) return shortHash("null");
    return shortHash(JSON.stringify([
      data.cst_id || data.id || "",
      data.specialty || "",
      data.surgeon || "",
      Array.isArray(data.aliases) ? data.aliases : [],
      data.gloves || "Unknown",
      data.gown || "Unknown",
      data.music || "",
      Number(data.schema_version) || 0,
      data.created || "",
      data.last_verified || ""
    ]));
  }
  portableSurgeonRecord(data, specialty = "", surgeon2 = "") {
    if (!data) return null;
    return {
      cst_type: "surgeon-data",
      cst_id: data.cst_id || data.id || "",
      specialty: data.specialty || specialty,
      surgeon: data.surgeon || surgeon2,
      aliases: Array.isArray(data.aliases) ? [...data.aliases] : [],
      gloves: data.gloves || "Unknown",
      gown: data.gown || "Unknown",
      music: String(data.music || data.music_preferences || "").trim(),
      schema_version: Number(data.schema_version) || SCHEMA_VERSION,
      created: data.created || "",
      last_verified: data.last_verified || ""
    };
  }
  defaultRegistry() {
    return { version: 1, schema_version: SCHEMA_VERSION, surgeons: {} };
  }
  registryText(registry) {
    const body = JSON.stringify(registry, null, 2);
    return `---
cst_type: "surgeon-registry"
schema_version: ${SCHEMA_VERSION}
---

# CST Surgeon Registry

This machine-managed Markdown file keeps surgeon glove/gown data portable across desktop and mobile without requiring Obsidian Sync to sync JSON files.

\`\`\`cst-registry-data
${body}
\`\`\`
`;
  }
  parseSurgeonRegistryText(text) {
    const match = /```cst-registry-data\s*\r?\n([\s\S]*?)\r?\n```/m.exec(String(text || ""));
    if (!match) return { registry: this.defaultRegistry(), invalid: true, error: "the cst-registry-data block is missing or incomplete" };
    try {
      const registry = JSON.parse(match[1]);
      if (!registry || typeof registry !== "object") throw new Error("invalid registry");
      if (!registry.surgeons || typeof registry.surgeons !== "object") registry.surgeons = {};
      registry.version = registry.version || 1;
      registry.schema_version = SCHEMA_VERSION;
      return { registry };
    } catch (error) {
      return { registry: this.defaultRegistry(), invalid: true, error: `the cst-registry-data block is invalid JSON (${error.message || error})` };
    }
  }
  async readSurgeonRegistry({ create = true } = {}) {
    const path = this.surgeonRegistryPath();
    if (create) await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      if (!create) return { file: null, registry: this.defaultRegistry(), missing: true };
      if (!this.registryBootstrapPromise) {
        const bootstrap = (async () => {
          const current = this.app.vault.getAbstractFileByPath(path);
          if (current instanceof TFile) return current;
          const registry = this.defaultRegistry();
          this.markInternalCreate(path);
          try {
            return await this.app.vault.create(path, this.registryText(registry));
          } catch (error) {
            this.ignoreCreateUntil.delete(normalizePath(path));
            const raced = this.app.vault.getAbstractFileByPath(path);
            if (raced instanceof TFile) return raced;
            throw error;
          }
        })();
        this.registryBootstrapPromise = bootstrap;
        const clearBootstrap = () => {
          if (this.registryBootstrapPromise === bootstrap) this.registryBootstrapPromise = null;
        };
        bootstrap.then(clearBootstrap, clearBootstrap);
      }
      file = await this.registryBootstrapPromise;
    }
    this.assertVaultFilePath(file, path, "CST surgeon registry read refused because the registry moved or was replaced.");
    const text = await this.app.vault.read(file);
    this.assertVaultFilePath(file, path, "CST surgeon registry read refused because the registry moved or was replaced.");
    const parsed = this.parseSurgeonRegistryText(text);
    if (parsed.invalid) console.error("CST surgeon registry parse error", parsed.error);
    return { file, ...parsed };
  }
  async mutateSurgeonRegistry(mutator, { create = true } = {}) {
    const operation = async () => {
      const path = this.surgeonRegistryPath();
      const state = await this.readSurgeonRegistry({ create });
      if (state.missing) {
        throw new Error("CST surgeon registry write refused: the registry is missing. Wait for Sync before retrying.");
      }
      if (state.invalid) throw new Error(`CST surgeon registry write refused: ${state.error}. The existing registry was left unchanged; restore or repair it before retrying.`);
      let value;
      let finalRegistry = state.registry;
      const assertRegistryPath = () => this.assertVaultFilePath(
        state.file,
        path,
        "CST surgeon registry write refused because the registry moved or was replaced in another window or device."
      );
      assertRegistryPath();
      const transform = (currentText) => {
        assertRegistryPath();
        const latest = this.parseSurgeonRegistryText(currentText);
        if (latest.invalid) throw new Error(`CST surgeon registry write refused: ${latest.error}. The existing registry was left unchanged; restore or repair it before retrying.`);
        const before = JSON.stringify(latest.registry);
        value = mutator(latest.registry);
        latest.registry.version = latest.registry.version || 1;
        latest.registry.schema_version = SCHEMA_VERSION;
        finalRegistry = latest.registry;
        return JSON.stringify(latest.registry) === before ? currentText : this.registryText(latest.registry);
      };
      if (typeof this.app.vault.process === "function") {
        await this.suppress(state.file, async () => {
          assertRegistryPath();
          return await this.app.vault.process(state.file, transform);
        });
      } else {
        assertRegistryPath();
        const currentText = await this.app.vault.read(state.file);
        assertRegistryPath();
        const nextText = transform(currentText);
        if (nextText !== currentText) {
          await this.suppress(state.file, async () => {
            assertRegistryPath();
            return await this.app.vault.modify(state.file, nextText);
          });
        }
      }
      assertRegistryPath();
      return { file: state.file, registry: finalRegistry, value };
    };
    const run = (this.registryMutationQueue || Promise.resolve()).catch(() => {
    }).then(operation);
    this.registryMutationQueue = run.catch(() => {
    });
    return await run;
  }
  async getRegistrySurgeon(specialty, surgeon2, options = {}) {
    const state = await this.readSurgeonRegistry(options);
    const { file, registry } = state;
    const key4 = this.surgeonKey(specialty, surgeon2);
    return { ...state, file, registry, key: key4, data: registry.surgeons[key4] || null };
  }
  async writeSurgeonRecord(specialty, surgeon2, data) {
    specialty = safeFileName(specialty);
    surgeon2 = canonicalPersonName(surgeon2);
    const key4 = this.surgeonKey(specialty, surgeon2);
    const result = await this.mutateSurgeonRegistry((registry) => {
      const previous = registry.surgeons[key4] || {};
      const normalized = {
        cst_type: "surgeon-data",
        cst_id: data.cst_id || data.id || previous.cst_id || id("surgeon"),
        specialty,
        surgeon: surgeon2,
        aliases: Array.isArray(data.aliases) ? data.aliases : Array.isArray(previous.aliases) ? previous.aliases : [],
        gloves: data.gloves || previous.gloves || "Unknown",
        gown: GOWNS2.includes(data.gown) ? data.gown : GOWNS2.includes(previous.gown) ? previous.gown : this.settings.defaultGown,
        music: String(data.music ?? data.music_preferences ?? previous.music ?? "").trim(),
        schema_version: SCHEMA_VERSION,
        created: data.created || previous.created || nowISO(),
        last_verified: data.last_verified || previous.last_verified || nowISO()
      };
      registry.surgeons[key4] = normalized;
      return normalized;
    });
    return { file: result.file, surgeonId: result.value.cst_id, data: result.value };
  }
  async removeSurgeonRecord(specialty, surgeon2) {
    const key4 = this.surgeonKey(specialty, surgeon2);
    await this.mutateSurgeonRegistry((registry) => {
      const existed = !!registry.surgeons[key4];
      if (existed) delete registry.surgeons[key4];
      return existed;
    });
  }
  async reconcileSurgeonRegistryFolders() {
    const state = await this.readSurgeonRegistry({ create: false });
    if (state.missing) return { foldersCreated: 0, recordsCreated: 0 };
    if (state.invalid) throw new Error(`Registry reconciliation stopped: ${state.error}.`);
    const physical = /* @__PURE__ */ new Map();
    for (const specialty of this.getSpecialties()) {
      for (const surgeon2 of this.getSurgeons(specialty)) {
        physical.set(this.surgeonKey(specialty, surgeon2), { specialty, surgeon: surgeon2 });
      }
    }
    const foldersToCreate = [];
    for (const [key4, record] of Object.entries(state.registry.surgeons || {})) {
      const specialty = validatedPathSegment(record?.specialty, "Registry specialty");
      const surgeon2 = validatedPathSegment(record?.surgeon, "Registry surgeon", { person: true });
      if (this.surgeonKey(specialty, surgeon2) !== key4) {
        throw new Error(`Registry reconciliation stopped because ${specialty} / ${surgeon2} has a mismatched key. No folders or records were changed.`);
      }
      const path = validatePortableVaultPath(cleanPath(this.contentRoot, specialty, surgeon2), "Recovered surgeon folder path");
      if (!physical.has(key4)) foldersToCreate.push({ path, specialty, surgeon: surgeon2 });
    }
    const recordsToCreate = [...physical.entries()].filter(([key4]) => !Object.prototype.hasOwnProperty.call(state.registry.surgeons || {}, key4)).map(([, value]) => value);
    for (const item of foldersToCreate) await this.ensureFolder(item.path);
    for (const item of recordsToCreate) {
      await this.ensureSurgeonData(item.specialty, item.surgeon, {}, { updateGraph: false });
    }
    return { foldersCreated: foldersToCreate.length, recordsCreated: recordsToCreate.length };
  }
  async readJson(file) {
    if (!(file instanceof TFile)) return null;
    try {
      return JSON.parse(await this.app.vault.read(file));
    } catch (_) {
      return null;
    }
  }
  async ensureSurgeonData(specialty, surgeon2, initial = {}, options = {}) {
    specialty = safeFileName(specialty);
    surgeon2 = canonicalPersonName(surgeon2);
    const state = await this.getRegistrySurgeon(specialty, surgeon2);
    let data = state.data ? Object.assign({}, state.data) : null;
    if (!data) {
      const json = this.app.vault.getAbstractFileByPath(this.surgeonDataPath(specialty, surgeon2));
      if (json instanceof TFile) data = await this.readJson(json);
    }
    if (!data) {
      const legacy = this.app.vault.getAbstractFileByPath(this.legacySurgeonDataPath(specialty, surgeon2));
      const fm = legacy instanceof TFile ? Object.assign(
        {},
        this.app.metadataCache.getFileCache(legacy)?.frontmatter || {},
        parseFrontmatterObject(await this.app.vault.read(legacy))
      ) : null;
      if (fm) data = {
        cst_id: fm.cst_id,
        aliases: fm.aliases,
        gloves: fm.gloves,
        gown: fm.gown,
        music: fm.music || fm.music_preferences,
        created: fm.created,
        last_verified: fm.last_verified
      };
    }
    if (!data) {
      const graph = this.app.vault.getAbstractFileByPath(this.surgeonGraphPath(specialty, surgeon2));
      const fm = graph instanceof TFile ? Object.assign(
        {},
        this.app.metadataCache.getFileCache(graph)?.frontmatter || {},
        parseFrontmatterObject(await this.app.vault.read(graph))
      ) : null;
      if (fm && (fm.gloves || fm.gown || fm.music || fm.music_preferences || fm.surgeon_id)) data = {
        cst_id: fm.surgeon_id,
        gloves: fm.gloves,
        gown: fm.gown,
        music: fm.music || fm.music_preferences,
        created: fm.created,
        last_verified: fm.last_verified
      };
    }
    if (!data && options.restoreIdentity && initial.cst_id) data = { ...initial };
    let gloves = initial.gloves || data?.gloves || "Unknown";
    try {
      gloves = normalizeGloves2(gloves, this.settings);
    } catch (_) {
      gloves = String(gloves || "Unknown");
    }
    const gownCandidate = initial.gown || data?.gown || this.settings.defaultGown;
    const gown = GOWNS2.includes(gownCandidate) ? gownCandidate : this.settings.defaultGown;
    const record = {
      cst_type: "surgeon-data",
      cst_id: data?.cst_id || id("surgeon"),
      specialty,
      surgeon: surgeon2,
      aliases: Array.isArray(data?.aliases) ? data.aliases : [],
      gloves,
      gown,
      music: String(initial.music ?? data?.music ?? data?.music_preferences ?? "").trim(),
      schema_version: SCHEMA_VERSION,
      created: data?.created || nowISO(),
      last_verified: data?.last_verified || nowISO()
    };
    const existingComparable = state.data ? {
      cst_type: state.data.cst_type,
      cst_id: state.data.cst_id,
      specialty: state.data.specialty,
      surgeon: state.data.surgeon,
      aliases: Array.isArray(state.data.aliases) ? state.data.aliases : [],
      gloves: state.data.gloves,
      gown: state.data.gown,
      music: String(state.data.music || state.data.music_preferences || "").trim(),
      schema_version: state.data.schema_version,
      created: state.data.created,
      last_verified: state.data.last_verified
    } : null;
    const written = existingComparable && JSON.stringify(existingComparable) === JSON.stringify(record) ? { file: state.file, surgeonId: record.cst_id, data: record } : await this.writeSurgeonRecord(specialty, surgeon2, record);
    if (options.updateGraph !== false) await this.ensureSurgeonGraphNode(specialty, surgeon2, written.surgeonId, written.data);
    return written;
  }
  surgeonDataFromRegistry(registry, specialty, surgeon2, file = null) {
    const d = registry?.surgeons?.[this.surgeonKey(specialty, surgeon2)];
    if (!d) return null;
    return {
      file,
      id: d.cst_id || "",
      cst_id: d.cst_id || "",
      surgeon: d.surgeon || surgeon2,
      specialty: d.specialty || specialty,
      gloves: d.gloves || "Unknown",
      gown: d.gown || "Unknown",
      music: String(d.music || d.music_preferences || "").trim(),
      last_verified: d.last_verified || "",
      aliases: Array.isArray(d.aliases) ? d.aliases : [],
      created: d.created || "",
      schema_version: d.schema_version || SCHEMA_VERSION
    };
  }
  async getSurgeonData(specialty, surgeon2, { createIfMissing = true } = {}) {
    const state = await this.getRegistrySurgeon(specialty, surgeon2, { create: createIfMissing });
    if (!state.data && createIfMissing) return (await this.ensureSurgeonData(specialty, surgeon2)).data;
    if (!state.data) {
      return {
        file: state.file || null,
        id: "",
        cst_id: "",
        surgeon: surgeon2,
        specialty,
        gloves: "Unknown",
        gown: "Unknown",
        music: "",
        last_verified: "",
        aliases: [],
        created: "",
        schema_version: SCHEMA_VERSION,
        unavailable: true,
        missingRecord: !state.invalid
      };
    }
    return this.surgeonDataFromRegistry(state.registry, specialty, surgeon2, state.file);
  }
  async saveSurgeonData(specialty, surgeon2, gloves, gown) {
    const ensured = await this.ensureSurgeonData(specialty, surgeon2);
    const canonical = normalizeGloves2(gloves, this.settings);
    if (!GOWNS2.includes(gown)) throw new Error("Invalid gown.");
    const data = Object.assign({}, ensured.data, {
      gloves: canonical,
      gown,
      last_verified: nowISO(),
      schema_version: SCHEMA_VERSION
    });
    const written = await this.writeSurgeonRecord(specialty, surgeon2, data);
    await this.ensureSurgeonGraphNode(specialty, surgeon2, written.surgeonId, written.data);
    this.refreshSurgeonHeaderDisplays(specialty, surgeon2, written.data);
    return canonical;
  }
  async updateSurgeonProfileExpected(specialty, surgeon2, updates, expectedFingerprint) {
    const dirtyGloves = !!updates?.dirtyGloves;
    const dirtyGown = !!updates?.dirtyGown;
    const dirtyMusic = !!updates?.dirtyMusic;
    const canonicalGloves = dirtyGloves ? normalizeGloves2(updates.gloves, this.settings) : "";
    const music = dirtyMusic ? String(updates.music || "").trim() : "";
    if (dirtyGown && !GOWNS2.includes(updates.gown)) throw new Error("Invalid gown.");
    const key4 = this.surgeonKey(specialty, surgeon2);
    const result = await this.mutateSurgeonRegistry((registry) => {
      const current = registry.surgeons[key4];
      if (!current) throw new Error("Surgeon registry record not found.");
      if (expectedFingerprint && this.surgeonRecordFingerprint(current) !== expectedFingerprint) {
        throw new Error("This surgeon profile changed in another window or device. Reload the card before saving.");
      }
      const next = JSON.parse(JSON.stringify(current));
      if (dirtyGloves) next.gloves = canonicalGloves;
      if (dirtyGown) next.gown = updates.gown;
      if (dirtyMusic) next.music = music;
      next.last_verified = nowISO();
      next.schema_version = SCHEMA_VERSION;
      registry.surgeons[key4] = next;
      return next;
    });
    try {
      await this.ensureSurgeonGraphNode(specialty, surgeon2, result.value.cst_id || "", result.value);
    } catch (error) {
      console.error("CST profile graph refresh", error);
      this.scheduleGraphRebuild(500);
      new Notice("Surgeon profile saved; generated graph refresh is pending.");
    }
    try {
      this.refreshSurgeonHeaderDisplays(specialty, surgeon2, result.value);
    } catch (error) {
      console.error("CST profile display refresh", error);
    }
    return result.value;
  }
  async ensureSurgeonGraphNode(specialty, surgeon2, surgeonId, surgeonData = null) {
    await this.ensureFolder(this.p(`_Graph/Surgeons/${specialty}`));
    const path = this.surgeonGraphPath(specialty, surgeon2);
    const sd = surgeonData || (await this.getRegistrySurgeon(specialty, surgeon2)).data || {};
    const content = `---
cst_type: "surgeon-node"
generated: true
specialty: ${yamlString(specialty)}
surgeon: ${yamlString(surgeon2)}
surgeon_id: ${yamlString(surgeonId)}
gloves: ${yamlString(sd.gloves || "Unknown")}
gown: ${yamlString(sd.gown || this.settings.defaultGown)}
music_preferences: ${yamlString(sd.music || "")}
last_verified: ${yamlString(sd.last_verified || "")}
graph_parent: ${yamlString(`[[${this.specialtyGraphPath(specialty).replace(/\.md$/, "")}|${specialty}]]`)}
schema_version: ${SCHEMA_VERSION}
---

# ${surgeon2}

\`\`\`cst-surgeon-profile
\`\`\`

## Cases

\`\`\`cst-case-list
\`\`\`
`;
    await this.writeGenerated(path, content);
    return path;
  }
  async ensureSpecialtyNode(specialty) {
    const path = this.specialtyGraphPath(specialty);
    const surgeons = this.getSurgeons(specialty);
    const content = `---
cst_type: "specialty-node"
generated: true
specialty: ${yamlString(specialty)}
graph_parent: ${yamlString(`[[${this.p("_Graph/Specialties").replace(/\.md$/, "")}|Specialties]]`)}
schema_version: ${SCHEMA_VERSION}
---

# ${specialty}

\`\`\`cst-specialty-dashboard
\`\`\`
`;
    await this.writeGenerated(path, content);
  }
  async readGraphRegistrySnapshot() {
    const contentRoot = this.app.vault.getAbstractFileByPath(this.contentRoot);
    if (!(contentRoot instanceof TFolder)) {
      throw new Error(`Graph rebuild paused: ${this.contentRoot} is missing. Wait for Sync before retrying.`);
    }
    const specialties = this.getSpecialties();
    if (!specialties.length) {
      throw new Error("Graph rebuild paused: no specialty folders are available. Wait for Sync before retrying.");
    }
    const registryPath = this.surgeonRegistryPath();
    const file = this.app.vault.getAbstractFileByPath(registryPath);
    if (!(file instanceof TFile)) {
      throw new Error("Graph rebuild paused: the surgeon registry is missing. Wait for Sync before retrying.");
    }
    this.assertVaultFilePath(file, registryPath, "Graph rebuild paused because the surgeon registry moved or was replaced.");
    let raw;
    try {
      raw = await this.app.vault.read(file);
    } catch (error) {
      throw new Error(`Graph rebuild paused: the surgeon registry could not be read (${error.message || error}).`);
    }
    this.assertVaultFilePath(file, registryPath, "Graph rebuild paused because the surgeon registry moved or was replaced.");
    const parsed = this.parseSurgeonRegistryText(raw);
    if (parsed.invalid) {
      throw new Error(`Graph rebuild paused: ${parsed.error}. The registry and graph were not changed.`);
    }
    const physical = /* @__PURE__ */ new Map();
    const surgeonsBySpecialty = /* @__PURE__ */ new Map();
    for (const specialty of specialties) {
      const surgeons = this.getSurgeons(specialty);
      surgeonsBySpecialty.set(specialty, surgeons);
      for (const surgeon2 of surgeons) {
        const key4 = this.surgeonKey(specialty, surgeon2);
        if (physical.has(key4)) {
          throw new Error(`Graph rebuild paused: duplicate physical surgeon identity ${specialty} / ${surgeon2}.`);
        }
        physical.set(key4, { specialty, surgeon: surgeon2 });
      }
    }
    const records = parsed.registry.surgeons || {};
    const registeredKeys = Object.keys(records);
    const missingFolders = registeredKeys.filter((key4) => !physical.has(key4));
    const missingRecords = [...physical.keys()].filter((key4) => !Object.prototype.hasOwnProperty.call(records, key4));
    if (missingFolders.length || missingRecords.length) {
      throw new Error(`Graph rebuild paused: surgeon folders and registry records differ (${missingFolders.length} folder${missingFolders.length === 1 ? "" : "s"} missing, ${missingRecords.length} record${missingRecords.length === 1 ? "" : "s"} missing). Wait for Sync or run explicit Initialize / Repair after verification.`);
    }
    for (const [key4, item] of physical) {
      const record = records[key4];
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error(`Graph rebuild paused: the registry record for ${item.specialty} / ${item.surgeon} is invalid.`);
      }
      const recordSpecialty = String(record.specialty || "").trim();
      const recordSurgeon = canonicalPersonName(record.surgeon || "");
      if (recordSpecialty !== item.specialty || recordSurgeon !== item.surgeon || this.surgeonKey(recordSpecialty, recordSurgeon) !== key4) {
        throw new Error(`Graph rebuild paused: the registry identity for ${item.specialty} / ${item.surgeon} does not match its exact folder key.`);
      }
      if (!String(record.cst_id || record.id || "").trim()) {
        throw new Error(`Graph rebuild paused: the surgeon ID is missing for ${item.specialty} / ${item.surgeon}. Run explicit Initialize / Repair after verification.`);
      }
    }
    return {
      file,
      raw,
      registry: parsed.registry,
      specialties,
      surgeonsBySpecialty,
      keys: [...physical.keys()].sort()
    };
  }
  async rebuildGraph() {
    this.graphRebuildRequested = true;
    if (this.graphRebuildPromise) return await this.graphRebuildPromise;
    const operation = (async () => {
      do {
        this.graphRebuildRequested = false;
        await this.rebuildGraphOnce();
      } while (this.graphRebuildRequested && !this.unloading);
    })();
    this.graphRebuildPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.graphRebuildPromise === operation) this.graphRebuildPromise = null;
    }
  }
  scheduleGraphRebuild(delay = 250) {
    if (this.featureMutationActive || this.unloading || this.settings.resetNeedsReview) return;
    if (this.graphRebuildTimer) window.clearTimeout(this.graphRebuildTimer);
    this.graphRebuildTimer = window.setTimeout(async () => {
      this.graphRebuildTimer = null;
      if (this.unloading) return;
      try {
        if (!await this.quickStructureCheck({ quiet: true })) {
          throw new Error("vault structure is incomplete or still syncing");
        }
        await this.rebuildGraph();
      } catch (error) {
        console.error("CST scheduled graph rebuild", error);
        new Notice(`CST graph refresh is pending: ${error.message || error}. Run Rebuild graph from the Command Palette.`);
      }
    }, Math.max(0, Number(delay) || 0));
  }
  async rebuildGraphOnce() {
    if (this.unloading) return;
    const graphState = await this.readGraphRegistrySnapshot();
    const graphRootPath = this.p("_Graph");
    const specialtiesFolder = this.p("_Graph/Specialties");
    const surgeonsFolder = this.p("_Graph/Surgeons");
    await this.ensureFolder(specialtiesFolder);
    await this.ensureFolder(surgeonsFolder);
    const specialties = graphState.specialties;
    const expectedFiles = /* @__PURE__ */ new Set();
    const root = `---
cst_type: "graph-root"
generated: true
schema_version: ${SCHEMA_VERSION}
---

# Specialties

\`\`\`cst-root-dashboard
\`\`\`
`;
    const rootPath = this.p("_Graph/Specialties.md");
    expectedFiles.add(rootPath);
    await this.writeGenerated(rootPath, root);
    for (const specialty of specialties) {
      expectedFiles.add(this.specialtyGraphPath(specialty));
      await this.ensureSpecialtyNode(specialty);
      for (const surgeon2 of graphState.surgeonsBySpecialty.get(specialty) || []) {
        const surgeonData = graphState.registry.surgeons[this.surgeonKey(specialty, surgeon2)];
        expectedFiles.add(this.surgeonGraphPath(specialty, surgeon2));
        await this.ensureSurgeonGraphNode(specialty, surgeon2, surgeonData.cst_id || surgeonData.id || "", surgeonData);
      }
    }
    const revalidated = await this.readGraphRegistrySnapshot();
    if (revalidated.raw !== graphState.raw || JSON.stringify(revalidated.keys) !== JSON.stringify(graphState.keys)) {
      throw new Error("Graph rebuild paused because surgeon folders or registry data changed while the graph was being generated. Retry after Sync completes.");
    }
    const loadedFiles = this.filesWithin(graphRootPath);
    const graphPrefix = graphRootPath + "/";
    const generatedTypes = /* @__PURE__ */ new Set(["graph-root", "specialty-node", "surgeon-node"]);
    for (const file of loadedFiles) {
      const candidatePath = normalizePath(String(file?.path || ""));
      if (!(file instanceof TFile) || !candidatePath.startsWith(graphPrefix) || expectedFiles.has(candidatePath)) continue;
      let generated = false;
      let current = this.app.vault.getAbstractFileByPath(candidatePath);
      if (current === file && normalizePath(String(current.path || "")) === candidatePath && current.extension === "md") {
        try {
          const block = frontmatterBlock(await this.app.vault.read(current));
          if (block) {
            const type = /^cst_type\s*:\s*["']?([^"'#\r\n]+)["']?\s*$/mi.exec(block.text)?.[1]?.trim() || "";
            generated = generatedTypes.has(type) && /^generated\s*:\s*true\s*$/mi.test(block.text);
          }
        } catch (_) {
        }
      }
      if (!generated) continue;
      current = this.app.vault.getAbstractFileByPath(candidatePath);
      if (current !== file || normalizePath(String(current?.path || "")) !== candidatePath || !candidatePath.startsWith(graphPrefix) || expectedFiles.has(candidatePath)) continue;
      const latestBlock = frontmatterBlock(await this.app.vault.read(current));
      const latestType = latestBlock ? /^cst_type\s*:\s*["']?([^"'#\r\n]+)["']?\s*$/mi.exec(latestBlock.text)?.[1]?.trim() || "" : "";
      if (!generatedTypes.has(latestType) || !/^generated\s*:\s*true\s*$/mi.test(latestBlock.text)) continue;
      const latestState = await this.readGraphRegistrySnapshot();
      if (latestState.raw !== graphState.raw || JSON.stringify(latestState.keys) !== JSON.stringify(graphState.keys)) {
        throw new Error("Graph cleanup paused because surgeon folders or registry data changed during the rebuild.");
      }
      this.assertVaultFilePath(current, candidatePath, `Graph cleanup paused because ${candidatePath} moved or was replaced.`);
      await this.quarantineManagedFile(current, candidatePath, "Stale generated graph file");
    }
  }
  async getTemplate(specialty, variant = "") {
    let key4 = specialty;
    let path;
    if (specialty.toLowerCase() === "spine") {
      if (!["Cervical", "Lumbar", "Thoracic"].includes(variant)) throw new Error("Choose a Spine template: Cervical, Lumbar, or Thoracic.");
      const v = variant;
      key4 = `Spine-${v}`;
      path = this.p(`_Templates/Cases/Spine/${v}.md`);
    } else {
      path = this.p(`_Templates/Cases/${specialty}.md`);
    }
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      path = this.p("_Templates/Cases/_Default.md");
      file = this.app.vault.getAbstractFileByPath(path);
      key4 = `${specialty}-Default`;
    }
    if (!(file instanceof TFile)) throw new Error("No CST case template found.");
    for (let attempt = 0; attempt < 5; attempt++) {
      this.assertVaultFilePath(file, path, "Case template moved or was replaced while preparing the case.");
      const body = await this.app.vault.read(file);
      this.assertVaultFilePath(file, path, "Case template moved or was replaced while preparing the case.");
      const versionNumber = await this.ensureTemplateVersion(file, false, path);
      this.assertVaultFilePath(file, path, "Case template moved or was replaced while versioning.");
      const versions = await this.templateVersionFiles(path);
      const versionEntry = versions.find((entry) => entry.n === Number(versionNumber));
      if (!versionEntry?.file) continue;
      const versionBody = await this.app.vault.read(versionEntry.file);
      const latestBody = await this.app.vault.read(file);
      this.assertVaultFilePath(file, path, "Case template moved or was replaced while verifying its version.");
      if (body === latestBody && body === versionBody) {
        return { key: key4, path, body, version: `v${versionNumber || 1}`, legacyHash: shortHash(body) };
      }
    }
    throw new Error("The case template kept changing while its version was being captured. Wait for Sync to finish, then retry.");
  }
  async getTemplateReadOnly(specialty, variant = "") {
    let key4 = specialty;
    let path;
    if (specialty.toLowerCase() === "spine") {
      if (!["Cervical", "Lumbar", "Thoracic"].includes(variant)) {
        throw new Error("Cannot determine the Spine template variant.");
      }
      key4 = `Spine-${variant}`;
      path = this.p(`_Templates/Cases/Spine/${variant}.md`);
    } else {
      path = this.p(`_Templates/Cases/${specialty}.md`);
    }
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      path = this.p("_Templates/Cases/_Default.md");
      file = this.app.vault.getAbstractFileByPath(path);
      key4 = `${specialty}-Default`;
    }
    if (!(file instanceof TFile)) throw new Error("No CST case template found.");
    const body = await this.app.vault.read(file);
    const versions = this.templateVersionFilesReadOnly(file.path);
    const latest = versions[versions.length - 1] || null;
    if (!latest) throw new Error(`No saved template version history exists for ${file.path}.`);
    if (await this.app.vault.read(latest.file) !== body) {
      throw new Error(`Template changes in ${file.path} have not been recorded in version history yet.`);
    }
    return { key: key4, path, body, version: `v${latest.n}`, legacyHash: shortHash(body) };
  }
  async createCase({ specialty, surgeon: surgeon2, title, variant = "" }) {
    if (this.settings.initialized && !await this.quickStructureCheck()) {
      throw new Error("Case creation is paused until this device has a complete CST vault.");
    }
    specialty = validatedPathSegment(specialty, "Specialty");
    surgeon2 = validatedPathSegment(surgeon2, "Surgeon", { person: true });
    title = validatedPathSegment(title, "Case name");
    const canonicalSpecialty = this.getSpecialties().find((existing2) => existing2.normalize("NFC").toLocaleLowerCase() === specialty.normalize("NFC").toLocaleLowerCase());
    if (!canonicalSpecialty) throw new Error(`Specialty not found: ${specialty}`);
    specialty = canonicalSpecialty;
    validatePortableVaultPath(cleanPath(this.contentRoot, specialty, surgeon2), "Surgeon folder path");
    validatePortableVaultPath(cleanPath(this.contentRoot, specialty, surgeon2, `${title}.md`), "Case path");
    const canonicalSurgeon = this.getSurgeons(specialty).find((existing2) => existing2.normalize("NFC").toLocaleLowerCase() === surgeon2.normalize("NFC").toLocaleLowerCase());
    if (!canonicalSurgeon) throw new Error(`Surgeon not found in ${specialty}: ${surgeon2}. Wait for Sync or create the surgeon first.`);
    surgeon2 = canonicalSurgeon;
    const surgeonFolder = cleanPath(this.contentRoot, specialty, surgeon2);
    validatePortableVaultPath(surgeonFolder, "Surgeon folder path");
    const filePath = validatePortableVaultPath(cleanPath(surgeonFolder, `${title}.md`), "Case path");
    const folder = this.app.vault.getAbstractFileByPath(surgeonFolder);
    if (!(folder instanceof TFolder)) {
      throw new Error(`Surgeon folder is unavailable: ${surgeonFolder}. Wait for Sync before creating the case.`);
    }
    const surgeonData = await this.getSurgeonData(specialty, surgeon2, { createIfMissing: false });
    if (!surgeonData?.cst_id || surgeonData.unavailable) {
      throw new Error(`${surgeon2}'s registry profile is unavailable. Wait for Sync before creating the case.`);
    }
    const surgeonId = surgeonData.cst_id;
    const targetName = `${title}.md`;
    const foldedTarget = targetName.normalize("NFC").toLocaleLowerCase();
    const existing = folder instanceof TFolder ? folder.children.find((item) => item.name.normalize("NFC").toLocaleLowerCase() === foldedTarget) : this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      await this.openFile(existing);
      throw new Error(`"${title}" already exists for ${surgeon2}. Opened the existing case.`);
    }
    const t = await this.getTemplate(specialty, variant);
    const caseId = id("case");
    const created = nowISO();
    const graphNode = this.surgeonGraphPath(specialty, surgeon2).replace(/\.md$/i, "");
    const content = `---
cst_type: "case"
cst_id: ${yamlString(caseId)}
specialty: ${yamlString(specialty)}
surgeon: ${yamlString(surgeon2)}
surgeon_id: ${yamlString(surgeonId)}
graph_parent: ${yamlString(`[[${graphNode}|${surgeon2}]]`)}
template: ${yamlString(t.key)}
template_version: ${yamlString(t.version)}
cst_created_template: ${yamlString(t.key)}
cst_created_template_version: ${yamlString(t.version)}
template_initialized: true
schema_version: ${SCHEMA_VERSION}
created: ${yamlString(created)}
last_verified: ${yamlString(created)}
---

# ${title}

${CASE_HEADER_BLOCK}

${t.body.trim()}
`;
    this.markInternalCreate(filePath);
    let file;
    try {
      file = await this.app.vault.create(filePath, content);
    } catch (error) {
      this.ignoreCreateUntil.delete(normalizePath(filePath));
      const raced = this.app.vault.getAbstractFileByPath(filePath);
      if (!(raced instanceof TFile)) throw error;
      try {
        await this.openFile(raced);
      } catch (openError) {
        console.error("CST could not open the Sync-winning case.", openError);
      }
      throw new Error(`"${title}" was created by another window or device. The winning case was preserved and opened; review it after Sync finishes.`);
    }
    if (this.exampleCase() && !this.onboardingDone()) {
      this.settings.onboardingCreatedCases = [.../* @__PURE__ */ new Set([...this.settings.onboardingCreatedCases || [], caseId])];
      await this.saveSettings();
    }
    const warnings = [];
    try {
      await this.ensureSpecialtyNode(specialty);
      await this.ensureSurgeonGraphNode(specialty, surgeon2, surgeonId, surgeonData);
    } catch (error) {
      warnings.push(`graph refresh: ${error.message || error}`);
      this.scheduleGraphRebuild(500);
    }
    try {
      await this.appendLog("Create case", `${specialty} / ${surgeon2} / ${title} (${t.key} ${t.version})`);
    } catch (error) {
      warnings.push(`activity log: ${error.message || error}`);
    }
    try {
      await this.openFile(file);
    } catch (error) {
      warnings.push(`open case: ${error.message || error}`);
    }
    if (warnings.length) new Notice(`Case created successfully. Follow-up maintenance is pending (${warnings.join("; ")}).`);
    return file;
  }
  async routeManagedFile(file, isNew = false, options = {}) {
    const expectedPath = normalizePath(String(options.expectedPath || file?.path || ""));
    if (!(file instanceof TFile) || file.extension !== "md" || !this.isManagedPath(expectedPath)) return;
    this.assertVaultFilePath(file, expectedPath, `CST routing stopped because ${expectedPath} moved or was replaced.`);
    const ctx = contextFromPath(expectedPath, this.contentRoot);
    if (!ctx) return;
    if (ctx.depth > 3) {
      if (isNew) await this.addPendingReview(`Nested managed note left unchanged because CST cases must be exactly Specialty/Surgeon/Case.md:
- ${file.path}`);
      return;
    }
    if (!ctx.surgeon || ctx.depth < 3) {
      const current2 = await this.fileFrontmatter(file, expectedPath);
      const needsPatch2 = !current2.cst_type || !current2.cst_id || current2.specialty !== ctx.specialty || Number(current2.schema_version) !== SCHEMA_VERSION || !current2.created || !current2.last_verified;
      if (needsPatch2) {
        await this.patchFrontmatter(file, (fm) => {
          if (!fm.cst_type) fm.cst_type = "specialty-note";
          if (!fm.cst_id) fm.cst_id = id("note");
          fm.specialty = ctx.specialty;
          fm.schema_version = SCHEMA_VERSION;
          if (!fm.created) fm.created = nowISO();
          if (!fm.last_verified) fm.last_verified = verificationISO();
        }, expectedPath);
      }
      await this.ensureSpecialtyNode(ctx.specialty);
      return;
    }
    const surgeon2 = ctx.surgeon;
    const plannedSurgeon = options.surgeonData ? this.adminRegistryRecord(options.surgeonData, ctx.specialty, surgeon2) : null;
    const ensured = plannedSurgeon ? { surgeonId: plannedSurgeon.cst_id || "", data: plannedSurgeon } : await this.ensureSurgeonData(ctx.specialty, surgeon2, {}, { updateGraph: false });
    if (!ensured.surgeonId) throw new Error(`Surgeon registry ID is missing for ${ctx.specialty} / ${surgeon2}.`);
    const surgeonId = ensured.surgeonId;
    const graphNode = this.surgeonGraphPath(ctx.specialty, surgeon2).replace(/\.md$/, "");
    const expectedGraph = `[[${graphNode}|${surgeon2}]]`;
    const current = await this.fileFrontmatter(file, expectedPath);
    const hasLegacy = Object.prototype.hasOwnProperty.call(current, "surgeon_profile") || Object.prototype.hasOwnProperty.call(current, "gloves") || Object.prototype.hasOwnProperty.call(current, "gown");
    const needsPatch = current.cst_type !== "case" || !current.cst_id || current.specialty !== ctx.specialty || current.surgeon !== surgeon2 || current.surgeon_id !== surgeonId || current.graph_parent !== expectedGraph || Number(current.schema_version) !== SCHEMA_VERSION || !current.created || !current.last_verified || hasLegacy || isNew && !current.template;
    if (needsPatch) {
      await this.patchFrontmatter(file, (fm) => {
        fm.cst_type = "case";
        if (!fm.cst_id) fm.cst_id = id("case");
        fm.specialty = ctx.specialty;
        fm.surgeon = surgeon2;
        fm.surgeon_id = surgeonId;
        delete fm.surgeon_profile;
        delete fm.gloves;
        delete fm.gown;
        fm.graph_parent = expectedGraph;
        fm.schema_version = SCHEMA_VERSION;
        if (!fm.created) fm.created = nowISO();
        if (!fm.last_verified) fm.last_verified = verificationISO();
        if (isNew && !fm.template) fm.template = "manual";
      }, expectedPath);
    }
    await this.ensureSpecialtyNode(ctx.specialty);
    await this.ensureSurgeonGraphNode(ctx.specialty, surgeon2, surgeonId, ensured.data);
    if (isNew) await this.ensureCaseHeaderAnchor(file);
  }
  findCaseTitle(text) {
    const re = /^[ \t]{0,3}#\s+([^#\n].*)$/gm;
    let m;
    while (m = re.exec(text)) {
      const label = String(m[1] || "").trim().replace(/:$/, "");
      if (/^(gloves|tips|md|pa)$/i.test(label)) continue;
      return { index: m.index, end: m.index + m[0].length, text: m[0] };
    }
    return null;
  }
  parseLegacyGloveRegion(text) {
    const title = this.findCaseTitle(text);
    if (!title) return null;
    const rest = text.slice(title.end);
    const lineRe = /.*(?:\n|$)/g;
    let m, offset = title.end;
    let gloveStart = -1, gloveEnd = -1, mdStart = -1, mdEnd = -1, mdRaw = "", regionEnd = text.length;
    let seenGloves = false;
    while (m = lineRe.exec(rest)) {
      const raw = m[0];
      if (!raw) break;
      const line = raw.replace(/\r?\n$/, "");
      const absStart = offset + m.index;
      const absEnd = absStart + raw.length;
      const glove = /^\s*(?:#{1,6}\s*)?(?:\*\*)?Gloves(?:\*\*)?\s*:?\s*$/i.test(line);
      const md = /^\s*(?:#{1,6}\s*)?(?:\*\*)?MD(?:\*\*)?\s*:\s*(.+?)\s*$/i.exec(line);
      const sectionLike = /^\s*(?:#{1,6}\s+|\*\*).+?(?:\*\*)?\s*:?\s*$/.test(line);
      const pa = /^\s*(?:#{1,6}\s*)?(?:\*\*)?PA(?:\*\*)?\s*:/i.test(line);
      if (!seenGloves && glove) {
        seenGloves = true;
        gloveStart = absStart;
        gloveEnd = absEnd;
        continue;
      }
      if (seenGloves && md && mdStart < 0) {
        mdStart = absStart;
        mdEnd = absEnd;
        mdRaw = md[1].trim();
        continue;
      }
      if (seenGloves && !pa && sectionLike && !glove && !md) {
        regionEnd = absStart;
        break;
      }
    }
    if (!seenGloves || mdStart < 0) return null;
    return { title, mdRaw, gloveStart, gloveEnd, mdStart, mdEnd, regionEnd, tipsStart: regionEnd };
  }
  removeLegacyMdGlovePreamble(text, legacy = null) {
    legacy = legacy || this.parseLegacyGloveRegion(text);
    if (!legacy) return text;
    const removals = [[legacy.gloveStart, legacy.gloveEnd], [legacy.mdStart, legacy.mdEnd]].sort((a, b) => b[0] - a[0]);
    let out = String(text);
    for (const [a, b] of removals) out = out.slice(0, a) + out.slice(b);
    return out.replace(/\n{4,}/g, "\n\n\n");
  }
  caseTextWithHeaderAnchor(file, text) {
    if (!(file instanceof TFile)) return String(text || "");
    text = String(text || "");
    if (text.includes("```" + CASE_HEADER_LANG)) return text;
    let title = this.findCaseTitle(text);
    if (!title) {
      const fm = frontmatterBlock(text);
      const at = fm?.end || 0;
      const prefix = text.slice(0, at);
      const suffix = text.slice(at).replace(/^\s+/, "");
      text = `${prefix}${prefix && !prefix.endsWith("\n") ? "\n" : ""}# ${file.basename}

${CASE_HEADER_BLOCK}

${suffix}`;
    } else {
      text = `${text.slice(0, title.end).replace(/\s*$/, "")}

${CASE_HEADER_BLOCK}

${text.slice(title.end).replace(/^\s+/, "")}`;
    }
    return text;
  }
  async ensureCaseHeaderAnchor(file) {
    if (!(file instanceof TFile)) return false;
    const path = normalizePath(file.path);
    const original = await this.app.vault.read(file);
    const text = this.caseTextWithHeaderAnchor(file, original);
    if (text === original) return false;
    await this.replaceFileTextExpected(
      file,
      original,
      text,
      `Live-header insertion stopped because ${path} changed in another window or device. It may also have moved or been replaced.`,
      path
    );
    return true;
  }
  getLegacySurgeonDataFiles() {
    return this.filesWithin(this.p("_Data/Surgeons"), "md");
  }
  getSurgeonDataFiles() {
    const prefix = this.p("_Data/Surgeons") + "/";
    const files = this.filesWithin(this.p("_Data/Surgeons"), "json");
    return files.filter((f) => f instanceof TFile && f.extension === "json" && f.path.startsWith(prefix));
  }
  async migrationCompleted(migrationId) {
    const cached = Array.isArray(this.settings.completedMigrations) ? this.settings.completedMigrations : [];
    const path = this.p("Admin/Data/Migrations.md");
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;
    let completed = [];
    try {
      const raw = await this.app.vault.read(file);
      const fm = Object.assign(
        {},
        this.app.metadataCache.getFileCache(file)?.frontmatter || {},
        parseFrontmatterObject(raw)
      );
      if (Array.isArray(fm.completed)) completed.push(...fm.completed.map(String));
      const block = frontmatterBlock(raw)?.text || "";
      const lines = block.replace(/^\uFEFF?---\r?\n/, "").replace(/\r?\n---(?:\r?\n|$)$/, "").split(/\r?\n/);
      let inCompleted = false;
      for (const line of lines) {
        if (/^completed\s*:\s*\[\s*\]\s*$/.test(line)) {
          inCompleted = false;
          continue;
        }
        if (/^completed\s*:\s*$/.test(line)) {
          inCompleted = true;
          continue;
        }
        if (inCompleted) {
          const m = /^\s*-\s*["']?(.+?)["']?\s*$/.exec(line);
          if (m) completed.push(m[1]);
          else if (/^[A-Za-z_]/.test(line)) inCompleted = false;
        }
      }
    } catch (_) {
    }
    completed = [...new Set(completed)];
    if (completed.includes(migrationId)) {
      this.settings.completedMigrations = [.../* @__PURE__ */ new Set([...cached, ...completed])];
      await this.saveSettings();
      return true;
    }
    return false;
  }
  async migrationKnownComplete(migrationId) {
    const file = this.app.vault.getAbstractFileByPath(this.p("Admin/Data/Migrations.md"));
    if (!(file instanceof TFile)) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    if (Array.isArray(fm.completed) && fm.completed.map(String).includes(migrationId)) return true;
    try {
      const block = frontmatterBlock(await this.app.vault.read(file))?.text || "";
      const lines = block.replace(/^\uFEFF?---\r?\n/, "").replace(/\r?\n---(?:\r?\n|$)$/, "").split(/\r?\n/);
      let inCompleted = false;
      for (const line of lines) {
        if (/^completed\s*:\s*\[\s*\]\s*$/.test(line)) {
          inCompleted = false;
          continue;
        }
        if (/^completed\s*:\s*$/.test(line)) {
          inCompleted = true;
          continue;
        }
        if (!inCompleted) continue;
        const match = /^\s*-\s*["']?(.+?)["']?\s*$/.exec(line);
        if (match?.[1] === migrationId) return true;
        if (/^[A-Za-z_]/.test(line)) inCompleted = false;
      }
    } catch (_) {
    }
    return false;
  }
  async markMigrationCompleted(migrationId) {
    const path = this.p("Admin/Data/Migrations.md");
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      await this.createAdminNotes();
      file = this.app.vault.getAbstractFileByPath(path);
    }
    if (!(file instanceof TFile)) throw new Error("Migration ledger could not be created.");
    await this.patchFrontmatter(file, (fm) => {
      const completed = Array.isArray(fm.completed) ? fm.completed.map(String) : [];
      if (!completed.includes(migrationId)) completed.push(migrationId);
      fm.completed = completed;
      fm.schema_version = SCHEMA_VERSION;
    });
    const cached = Array.isArray(this.settings.completedMigrations) ? this.settings.completedMigrations : [];
    this.settings.completedMigrations = [.../* @__PURE__ */ new Set([...cached, migrationId])];
    if (this.settings.migrationFailures?.[migrationId]) delete this.settings.migrationFailures[migrationId];
    await this.saveSettings();
  }
  async setMigrationFailure(migrationId, diagnostic) {
    if (!this.settings.migrationFailures || typeof this.settings.migrationFailures !== "object") this.settings.migrationFailures = {};
    this.settings.migrationFailures[migrationId] = {
      at: nowISO(),
      diagnosticId: diagnostic?.id || "",
      summary: diagnostic?.summary || "Migration failed",
      diagnosticText: diagnostic?.text || ""
    };
    await this.saveSettings();
  }
  async clearMigrationFailure(migrationId) {
    if (this.settings.migrationFailures?.[migrationId]) {
      delete this.settings.migrationFailures[migrationId];
      await this.saveSettings();
    }
  }
  async migrationPreflight(migrationId) {
    const required = ["specialtyGraphPath", "surgeonGraphPath", "ensureSpecialtyNode", "ensureSurgeonGraphNode", "readSurgeonRegistry", "snapshotFiles"];
    const missing = required.filter((name) => typeof this[name] !== "function");
    if (missing.length) {
      const err = new Error(`Migration preflight failed. Missing CST method(s): ${missing.join(", ")}`);
      err.cstStage = "migration preflight";
      throw err;
    }
    this.specialtyGraphPath("__CST_PRECHECK__");
    this.surgeonGraphPath("__CST_PRECHECK__", "__CST_PRECHECK__");
    return true;
  }
  async runMigrationFromUI(migrationId, label, fn) {
    try {
      if (await this.migrationCompleted(migrationId)) {
        new Notice(`${label} is already complete.`);
        await this.clearMigrationFailure(migrationId);
        return true;
      }
      const mayBootstrapRegistry = migrationId === MIGRATION_V011 || migrationId === MIGRATION_V012;
      if (!await this.quickStructureCheck({ allowMissingRegistryForMigration: mayBootstrapRegistry })) {
        new Notice(`${label} paused because the CST vault is not fully available on this device yet.`);
        return false;
      }
      this.lastSnapshot = null;
      await this.migrationPreflight(migrationId);
      await fn();
      await this.clearMigrationFailure(migrationId);
      new Notice(`${label} completed.`);
      if (migrationId === MIGRATION_V011 && !await this.migrationCompleted(MIGRATION_V012)) {
        await this.runMigrationFromUI(MIGRATION_V012, "v0.1.2 mobile registry/header repair", () => this.migrateV012());
      } else if (migrationId === MIGRATION_V012 && !await this.migrationCompleted(MIGRATION_V013)) {
        await this.runMigrationFromUI(MIGRATION_V013, "v0.1.3 app/migration workspace setup", () => this.migrateV013());
      }
      return true;
    } catch (e) {
      let diagnostic;
      try {
        diagnostic = await this.createDiagnostic(label, e, { migrationId, stage: "manual Admin migration" });
      } catch (diagnosticError) {
        console.error("CST migration diagnostic fallback", diagnosticError);
        diagnostic = {
          id: `CST-INMEMORY-${Date.now()}`,
          path: "",
          summary: e?.message || String(e),
          text: `CST migration failed: ${label}

${e?.stack || e}

Diagnostic persistence also failed: ${diagnosticError?.stack || diagnosticError}`
        };
      }
      try {
        await this.setMigrationFailure(migrationId, diagnostic);
      } catch (settingsError) {
        console.error("CST could not persist migration failure state", settingsError);
      }
      try {
        new DiagnosticModal(this, diagnostic).open();
      } catch (modalError) {
        console.error("CST could not open migration diagnostic", modalError);
        new Notice(`${label} failed: ${diagnostic.summary}`);
      }
      return false;
    }
  }
  async runUpgradeMigrations() {
    if (!this.settings.initialized || this.settings.resetNeedsReview) return false;
    const chain = [
      [MIGRATION_V011, "v0.1.1 live surgeon header migration"],
      [MIGRATION_V012, "v0.1.2 mobile registry/header repair"],
      [MIGRATION_V013, "v0.1.3 app/migration workspace setup"]
    ];
    const pending2 = [];
    for (const [migrationId, label] of chain) {
      if (!await this.migrationKnownComplete(migrationId)) pending2.push(label);
    }
    if (pending2.length) {
      new Notice("CST Notes upgrade is ready. After Sync finishes, run it explicitly from Admin → Migrations.");
      return false;
    }
    let settingsChanged = false;
    if (this.settings.autoOpenDefaultVersion !== "0.1.6") {
      this.settings.autoOpenSidebar = true;
      this.settings.autoOpenDefaultVersion = "0.1.6";
      settingsChanged = true;
    }
    if (this.settings.templateDefaultsVersion !== "0.1.7") {
      await this.upgradeTemplateDefaultsV016();
      settingsChanged = true;
    }
    if (this.settings.pluginVersion !== PLUGIN_VERSION || Number(this.settings.schemaVersion) !== SCHEMA_VERSION) {
      this.settings.pluginVersion = PLUGIN_VERSION;
      this.settings.schemaVersion = SCHEMA_VERSION;
      settingsChanged = true;
    }
    if (this.settings.featurePagesVersion !== "0.1.10") {
      await this.createAdminNotes();
      this.settings.featurePagesVersion = "0.1.10";
      settingsChanged = true;
    }
    if (this.settings.navigationUpgradeVersion !== "0.1.10") {
      await this.createAdminNotes();
      await this.repairLiveHeaders(true);
      this.settings.navigationUpgradeVersion = "0.1.10";
      settingsChanged = true;
    }
    if (this.settings.templateRetentionVersion !== 1) {
      await this.ensureAllTemplateVersions();
      this.settings.templateRetentionVersion = 1;
      settingsChanged = true;
    }
    if (settingsChanged) {
      await this.saveSettings();
    }
    this.onboardingUpdatePending = true;
    const examples = await updateOnboardingExamples(this, { TFile, TFolder, parseFrontmatterObject });
    this.onboardingUpdatePending = examples.cleanup === "pending";
    return true;
  }
  async migrateV011() {
    if (await this.migrationCompleted(MIGRATION_V011)) return;
    const cases = this.allCaseFiles();
    await this.assertWellFormedLiveHeaderFences(cases, "v0.1.1 migration");
    const legacyDataFiles = this.getLegacySurgeonDataFiles();
    const casePlans = [];
    const legacyPlans = [];
    const gloveCandidates = /* @__PURE__ */ new Map();
    const affected = /* @__PURE__ */ new Map();
    const invalidGlovePaths = [];
    for (const file of cases) {
      const text = await this.app.vault.read(file);
      const legacy = this.parseLegacyGloveRegion(text);
      const headerCount = (text.match(/```cst-surgeon-header\s*\n?```/g) || []).length;
      const hasAnchor = headerCount === 1;
      const fm = parseFrontmatterObject(text);
      const c = this.caseContext(file);
      if (!c) continue;
      let canonical = null;
      if (legacy) {
        try {
          canonical = normalizeGloves2(legacy.mdRaw, this.settings);
        } catch (_) {
          invalidGlovePaths.push(file.path);
        }
      }
      casePlans.push({ file, path: file.path, text, legacy, hasAnchor, canonical, context: c, frontmatter: fm });
      if (legacy || !hasAnchor || fm.surgeon_profile) affected.set(file.path, file);
      if (canonical) {
        const key4 = `${c.specialty}\0${c.surgeon}`;
        if (!gloveCandidates.has(key4)) gloveCandidates.set(key4, []);
        gloveCandidates.get(key4).push({
          value: canonical,
          file,
          mtime: file.stat.mtime,
          verified: fm.last_verified || new Date(file.stat.mtime).toISOString()
        });
      }
    }
    for (const f of legacyDataFiles) affected.set(f.path, f);
    const dataFiles = this.getSurgeonDataFiles();
    for (const f of dataFiles) affected.set(f.path, f);
    for (const legacy of legacyDataFiles) {
      try {
        const raw = await this.app.vault.read(legacy);
        const fm = parseFrontmatterObject(raw);
        const rel = legacy.path.slice((this.p("_Data/Surgeons") + "/").length).replace(/\.md$/i, "");
        const parts = rel.split("/");
        if (parts.length < 2) throw new Error("legacy surgeon path is incomplete");
        const specialty = validatedPathSegment(fm.specialty || parts[0], "Legacy specialty");
        const surgeon2 = validatedPathSegment(fm.surgeon || parts.slice(1).join("/"), "Legacy surgeon", { person: true });
        const gloves = normalizeGloves2(fm.gloves || "Unknown", this.settings);
        const gown = fm.gown == null || fm.gown === "" ? this.settings.defaultGown : String(fm.gown);
        if (!GOWNS2.includes(gown)) throw new Error("invalid gown");
        const sourceTime = new Date(legacy.stat?.mtime || Date.now()).toISOString();
        const record = this.adminRegistryRecord({
          cst_id: fm.cst_id || id("surgeon"),
          aliases: Array.isArray(fm.aliases) ? fm.aliases.map(String) : [],
          gloves,
          gown,
          schema_version: SCHEMA_VERSION,
          created: fm.created || sourceTime,
          last_verified: fm.last_verified || fm.created || sourceTime
        }, specialty, surgeon2);
        legacyPlans.push({ file: legacy, path: legacy.path, raw, specialty, surgeon: surgeon2, record });
      } catch (_) {
        invalidGlovePaths.push(legacy.path);
      }
    }
    if (invalidGlovePaths.length) {
      const paths = [...new Set(invalidGlovePaths)];
      const error = new Error(`v0.1.1 migration stopped before writing because ${paths.length} legacy glove/profile value${paths.length === 1 ? " is" : "s are"} invalid. Correct the value or review it manually; no legacy block or profile note was removed.`);
      error.cstPaths = paths;
      throw error;
    }
    let backupRoot = "";
    if (affected.size) backupRoot = await this.snapshotFiles("v0.1.1-live-header-migration", [...affected.values()]);
    for (const plan of legacyPlans) {
      if (await this.app.vault.read(plan.file) !== plan.raw) {
        throw new Error(`v0.1.1 migration stopped because ${plan.file.path} changed while the snapshot was being created.`);
      }
    }
    const conflicts = [];
    let replacedLegacy = 0, insertedHeaders = 0, metadataFixed = 0;
    const caseWrites = [];
    for (const plan of casePlans) {
      let next = plan.text;
      if (plan.legacy) {
        next = this.removeLegacyMdGlovePreamble(plan.text, plan.legacy);
        next = next.replace(/\n?```cst-surgeon-header\s*\n?```\n?/g, "\n");
        const t = this.findCaseTitle(next);
        if (t) next = `${next.slice(0, t.end).replace(/\s*$/, "")}

${CASE_HEADER_BLOCK}

${next.slice(t.end).replace(/^\s+/, "")}`;
        replacedLegacy++;
      } else if (!plan.hasAnchor) {
        next = next.replace(/\n?```cst-surgeon-header\s*\n?```\n?/g, "\n");
        const title = this.findCaseTitle(next);
        if (title) next = `${next.slice(0, title.end).replace(/\s*$/, "")}

${CASE_HEADER_BLOCK}

${next.slice(title.end).replace(/^\s+/, "")}`;
        else {
          const fm = frontmatterBlock(next);
          const at = fm?.end || 0;
          next = `${next.slice(0, at)}# ${plan.file.basename}

${CASE_HEADER_BLOCK}

${next.slice(at).replace(/^\s+/, "")}`;
        }
        insertedHeaders++;
      }
      next = setFrontmatterScalars(next, { schema_version: SCHEMA_VERSION }, ["surgeon_profile"]);
      if (plan.frontmatter.surgeon_profile) metadataFixed++;
      caseWrites.push({ file: plan.file, path: plan.path, original: plan.text, next });
    }
    const registryMutations = /* @__PURE__ */ new Map();
    let importedLegacy = 0;
    try {
      for (const plan of legacyPlans) {
        const result = await this.importSurgeonRecordIfNewer(plan.specialty, plan.surgeon, plan.record);
        this.rememberRegistryMutation(registryMutations, plan.specialty, plan.surgeon, result);
        if (result.imported) importedLegacy++;
      }
      for (const [key4, candidates] of gloveCandidates.entries()) {
        const [specialty, surgeon2] = key4.split("\0");
        const unique = [...new Set(candidates.map((x) => x.value))];
        candidates.sort((a, b) => b.mtime - a.mtime);
        const selected = candidates[0];
        if (unique.length > 1) conflicts.push(`${specialty} / ${surgeon2}: ${unique.join(" | ")} → selected latest ${selected.value}`);
        const result = await this.seedSurgeonGlovesIfUnknown(specialty, surgeon2, selected.value, selected.verified);
        this.rememberRegistryMutation(registryMutations, specialty, surgeon2, result);
      }
      await this.applyExpectedTextPlans(caseWrites, "v0.1.1 migration");
    } catch (error) {
      try {
        await this.rollbackRegistryMutations(registryMutations, "v0.1.1 migration");
      } catch (rollback) {
        throw new Error(`${error.message || error} ${rollback.message || rollback}`);
      }
      throw error;
    }
    let retiredLegacy = 0;
    for (const plan of legacyPlans) {
      this.assertVaultFilePath(plan.file, plan.path, `v0.1.1 migration kept ${plan.path} because it moved or was replaced.`);
      const currentLegacyText = await this.app.vault.read(plan.file);
      if (currentLegacyText !== plan.raw) {
        throw new Error(`v0.1.1 migration stopped before retiring ${plan.path} because it changed after the snapshot.`);
      }
      const reg = await this.getRegistrySurgeon(plan.specialty, plan.surgeon, { create: false });
      if (!this.adminRegistryRecord(reg.data, plan.specialty, plan.surgeon)) {
        throw new Error(`v0.1.1 migration stopped before retiring ${plan.path} because its live registry record is missing or invalid.`);
      }
      this.assertVaultFilePath(plan.file, plan.path, `v0.1.1 migration kept ${plan.path} because it moved during registry validation.`);
      if (await this.app.vault.read(plan.file) !== plan.raw) {
        throw new Error(`v0.1.1 migration kept ${plan.path} because it changed immediately before retirement.`);
      }
      await this.quarantineManagedFile(plan.file, plan.path, "Legacy surgeon profile");
      retiredLegacy++;
    }
    await this.rebuildGraph();
    await this.markMigrationCompleted(MIGRATION_V011);
    const reportPath = this.p(`Admin/Logs/v0.1.1 Migration ${moment().format("YYYYMMDD-HHmmss")}.md`);
    const report = `# CST Notes v0.1.1 Migration

- Legacy glove blocks replaced: ${replacedLegacy}
- Missing live headers inserted: ${insertedHeaders}
- Old surgeon_profile links removed: ${metadataFixed}
- Legacy surgeon Markdown records imported/updated: ${importedLegacy}
- Legacy surgeon Markdown records safely retired: ${retiredLegacy}
- Backup: ${backupRoot || "No files required backup"}

## Glove conflicts

${conflicts.length ? conflicts.map((x) => `- ${x}`).join("\n") : "None"}
`;
    await this.ensureTextFile(reportPath, report);
    await this.appendLog("v0.1.1 migration", `${replacedLegacy} legacy glove blocks replaced; ${insertedHeaders} headers inserted; ${retiredLegacy} surgeon data notes safely retired.`);
    new Notice(`CST Notes v0.1.1 ready: ${replacedLegacy} legacy glove blocks replaced and live surgeon headers repaired.`);
  }
  async migrateV012() {
    if (await this.migrationCompleted(MIGRATION_V012)) return;
    const cases = this.allCaseFiles();
    await this.assertWellFormedLiveHeaderFences(cases, "v0.1.2 migration");
    const jsonFiles = this.getSurgeonDataFiles();
    const stagedJson = [];
    const stagedKeys = /* @__PURE__ */ new Set();
    const invalidJson = [];
    for (const file of jsonFiles) {
      const stagedPath = normalizePath(file.path);
      let raw = "";
      let data = null;
      try {
        this.assertVaultFilePath(file, stagedPath, `v0.1.2 migration stopped because ${stagedPath} moved or was replaced.`);
        raw = await this.app.vault.read(file);
        this.assertVaultFilePath(file, stagedPath, `v0.1.2 migration stopped because ${stagedPath} moved while being read.`);
        data = JSON.parse(raw);
      } catch (_) {
      }
      if (!data || typeof data.specialty !== "string" || !data.specialty.trim() || typeof data.surgeon !== "string" || !data.surgeon.trim()) {
        invalidJson.push(file.path);
        continue;
      }
      let record;
      try {
        const specialty = validatedPathSegment(data.specialty, "JSON specialty");
        const surgeon2 = validatedPathSegment(data.surgeon, "JSON surgeon", { person: true });
        const sourceTime = new Date(file.stat?.mtime || Date.now()).toISOString();
        record = this.adminRegistryRecord({
          cst_id: data.cst_id || data.id || id("surgeon"),
          aliases: Array.isArray(data.aliases) ? data.aliases.map(String) : [],
          gloves: normalizeGloves2(data.gloves || "Unknown", this.settings),
          gown: data.gown == null || data.gown === "" ? this.settings.defaultGown : String(data.gown),
          schema_version: SCHEMA_VERSION,
          created: data.created || sourceTime,
          last_verified: data.last_verified || data.created || sourceTime
        }, specialty, surgeon2);
      } catch (_) {
        invalidJson.push(file.path);
        continue;
      }
      const key4 = this.surgeonKey(record.specialty, record.surgeon);
      if (stagedKeys.has(key4)) {
        invalidJson.push(file.path);
        continue;
      }
      stagedKeys.add(key4);
      stagedJson.push({ file, path: stagedPath, raw, data: record, key: key4 });
    }
    if (invalidJson.length) {
      const error = new Error(`v0.1.2 migration stopped before writing because ${invalidJson.length} surgeon JSON file${invalidJson.length === 1 ? " is" : "s are"} invalid or duplicated.`);
      error.cstPaths = invalidJson;
      throw error;
    }
    const affected = /* @__PURE__ */ new Map();
    const casePlans = [];
    const invalidLegacyGlovePaths = [];
    for (const f of jsonFiles) affected.set(f.path, f);
    for (const f of cases) {
      const text = await this.app.vault.read(f);
      const headerCount = (text.match(/```cst-surgeon-header\s*\n?```/g) || []).length;
      const legacy = this.parseLegacyGloveRegion(text);
      let legacyGloves = "";
      if (legacy) {
        try {
          legacyGloves = normalizeGloves2(legacy.mdRaw, this.settings);
        } catch (_) {
          invalidLegacyGlovePaths.push(f.path);
        }
      }
      const fm = parseFrontmatterObject(text);
      const context = this.caseContext(f);
      const needsRepair = !!context && (headerCount !== 1 || !!legacy || !!fm.surgeon_profile || !!fm.gloves || !!fm.gown || fm.cst_type !== "case" || !fm.cst_id || fm.specialty !== context.specialty || fm.surgeon !== context.surgeon || !fm.surgeon_id || !fm.created || !fm.last_verified || Number(fm.schema_version || 0) < SCHEMA_VERSION);
      if (context && needsRepair) casePlans.push({ file: f, path: f.path, original: text, frontmatter: fm, context, legacy, legacyGloves, headerCount });
      if (needsRepair) affected.set(f.path, f);
    }
    if (invalidLegacyGlovePaths.length) {
      const error = new Error(`v0.1.2 migration stopped before writing because ${invalidLegacyGlovePaths.length} case${invalidLegacyGlovePaths.length === 1 ? " has" : "s have"} an invalid legacy glove value. No legacy block was removed.`);
      error.cstPaths = [...new Set(invalidLegacyGlovePaths)];
      throw error;
    }
    const registryState = await this.readSurgeonRegistry();
    affected.set(registryState.file.path, registryState.file);
    let backupRoot = "";
    if (affected.size) backupRoot = await this.snapshotFiles("v0.1.2-mobile-upgrade", [...affected.values()]);
    for (const entry of stagedJson) {
      if (await this.app.vault.read(entry.file) !== entry.raw) {
        throw new Error(`v0.1.2 migration stopped because ${entry.file.path} changed while the snapshot was being created.`);
      }
    }
    const registryMutations = /* @__PURE__ */ new Map();
    let repairedHeaders = 0;
    let removedLegacy = 0;
    const caseWrites = [];
    let imported = 0;
    try {
      for (const { data } of stagedJson) {
        const result = await this.importSurgeonRecordIfNewer(data.specialty, data.surgeon, data);
        this.rememberRegistryMutation(registryMutations, data.specialty, data.surgeon, result);
        if (result.imported) imported++;
      }
      for (const specialty of this.getSpecialties()) {
        for (const surgeon2 of this.getSurgeons(specialty)) {
          const result = await this.ensureMigrationSurgeonRecord(specialty, surgeon2);
          this.rememberRegistryMutation(registryMutations, specialty, surgeon2, result);
        }
      }
      const verifiedRegistry = await this.readSurgeonRegistry();
      const missingImports = stagedJson.filter((entry) => {
        const record = verifiedRegistry.registry.surgeons?.[entry.key];
        try {
          return !this.adminRegistryRecord(record, entry.data.specialty, entry.data.surgeon);
        } catch (_) {
          return true;
        }
      }).map((entry) => entry.file.path);
      if (missingImports.length) {
        const error = new Error(`v0.1.2 migration stopped because ${missingImports.length} surgeon record${missingImports.length === 1 ? " was" : "s were"} not verified in the Markdown registry. No JSON files were retired.`);
        error.cstPaths = missingImports;
        throw error;
      }
      for (const plan of casePlans) {
        if (plan.legacy) {
          const result = await this.seedSurgeonGlovesIfUnknown(
            plan.context.specialty,
            plan.context.surgeon,
            plan.legacyGloves,
            plan.frontmatter.last_verified || new Date(plan.file.stat?.mtime || Date.now()).toISOString()
          );
          this.rememberRegistryMutation(registryMutations, plan.context.specialty, plan.context.surgeon, result);
        }
      }
      for (const plan of casePlans) {
        const { file, context, frontmatter } = plan;
        const registry = await this.getRegistrySurgeon(context.specialty, context.surgeon, { create: false });
        const surgeonRecord = this.adminRegistryRecord(registry.data, context.specialty, context.surgeon);
        if (!surgeonRecord) throw new Error(`v0.1.2 migration cannot route ${file.path} without a surgeon registry record.`);
        let text = plan.original;
        if (plan.legacy) {
          text = this.removeLegacyMdGlovePreamble(text, plan.legacy);
          removedLegacy++;
        }
        text = text.replace(/\n?```cst-surgeon-header\s*\n?```\n?/g, "\n");
        const title = this.findCaseTitle(text);
        if (title) {
          text = `${text.slice(0, title.end).replace(/\s*$/, "")}

${CASE_HEADER_BLOCK}

${text.slice(title.end).replace(/^\s+/, "")}`;
        } else {
          const fmBlock = frontmatterBlock(text);
          const at = fmBlock?.end || 0;
          text = `${text.slice(0, at)}# ${file.basename}

${CASE_HEADER_BLOCK}

${text.slice(at).replace(/^\s+/, "")}`;
        }
        if (text !== plan.original) repairedHeaders++;
        const graphNode = this.surgeonGraphPath(context.specialty, context.surgeon).replace(/\.md$/, "");
        const created = frontmatter.created || new Date(file.stat?.ctime || file.stat?.mtime || Date.now()).toISOString();
        const lastVerified = frontmatter.last_verified || verificationISO(file.stat?.mtime || Date.now());
        const next = setFrontmatterScalars(text, {
          cst_type: "case",
          cst_id: frontmatter.cst_id || id("case"),
          specialty: context.specialty,
          surgeon: context.surgeon,
          surgeon_id: surgeonRecord.cst_id,
          graph_parent: `[[${graphNode}|${context.surgeon}]]`,
          schema_version: SCHEMA_VERSION,
          created,
          last_verified: lastVerified
        }, ["surgeon_profile", "gloves", "gown"]);
        caseWrites.push({ file, path: plan.path, original: plan.original, next });
      }
      await this.applyExpectedTextPlans(caseWrites, "v0.1.2 migration");
    } catch (error) {
      try {
        await this.rollbackRegistryMutations(registryMutations, "v0.1.2 migration");
      } catch (rollback) {
        throw new Error(`${error.message || error} ${rollback.message || rollback}`);
      }
      throw error;
    }
    for (const entry of stagedJson) {
      this.assertVaultFilePath(entry.file, entry.path, `v0.1.2 migration kept ${entry.path} because it moved or was replaced.`);
      if (await this.app.vault.read(entry.file) !== entry.raw) {
        throw new Error(`v0.1.2 migration stopped before retiring ${entry.path} because it changed after the snapshot.`);
      }
      const live = await this.getRegistrySurgeon(entry.data.specialty, entry.data.surgeon, { create: false });
      if (!this.adminRegistryRecord(live.data, entry.data.specialty, entry.data.surgeon)) {
        throw new Error(`v0.1.2 migration did not verify a live registry record for ${entry.path}.`);
      }
    }
    let retiredJson = 0;
    for (const entry of stagedJson) {
      this.assertVaultFilePath(entry.file, entry.path, `v0.1.2 migration kept ${entry.path} because it moved or was replaced.`);
      if (await this.app.vault.read(entry.file) !== entry.raw) {
        throw new Error(`v0.1.2 migration kept ${entry.path} because it changed immediately before retirement.`);
      }
      const live = await this.getRegistrySurgeon(entry.data.specialty, entry.data.surgeon, { create: false });
      if (!this.adminRegistryRecord(live.data, entry.data.specialty, entry.data.surgeon)) {
        throw new Error(`v0.1.2 migration kept ${entry.path} because its live registry record could not be revalidated.`);
      }
      this.assertVaultFilePath(entry.file, entry.path, `v0.1.2 migration kept ${entry.path} because it moved during registry validation.`);
      if (await this.app.vault.read(entry.file) !== entry.raw) {
        throw new Error(`v0.1.2 migration kept ${entry.path} because it changed during final registry validation.`);
      }
      await this.quarantineManagedFile(entry.file, entry.path, "Legacy surgeon JSON");
      retiredJson++;
    }
    await this.rebuildGraph();
    await this.markMigrationCompleted(MIGRATION_V012);
    const reportPath = this.p(`Admin/Logs/v0.1.2 Migration ${moment().format("YYYYMMDD-HHmmss")}.md`);
    const report = `# CST Notes v0.1.2 Migration

- Mobile-safe surgeon records imported: ${imported}
- Legacy JSON files retired: ${retiredJson}
- Case live headers repaired/positioned: ${repairedHeaders}
- Legacy glove regions removed: ${removedLegacy}
- Backup: ${backupRoot || "No files required backup"}

Surgeon glove/gown data now uses the Markdown registry at \`${this.surgeonRegistryPath()}\`, so iOS does not depend on syncing JSON file types.
`;
    await this.ensureTextFile(reportPath, report);
    await this.appendLog("v0.1.2 migration", `${repairedHeaders} live headers repaired; ${retiredJson} legacy JSON surgeon records retired.`);
    if (await this.migrationCompleted(MIGRATION_V013)) await this.migrateV013(true);
    new Notice(`CST Notes v0.1.2 ready: ${repairedHeaders} live headers repaired. Mobile registry enabled.`);
  }
  async migrateV013(force = false) {
    if (!force && await this.migrationCompleted(MIGRATION_V013)) return;
    await this.ensureLauncherNote();
    await this.ensureAllTemplateVersions();
    for (const file of this.allCaseFiles()) {
      const path = normalizePath(file.path);
      const original = await this.app.vault.read(file);
      let next = setFrontmatterScalars(
        original,
        { schema_version: SCHEMA_VERSION },
        ["surgeon_profile", "gloves", "gown"]
      );
      next = this.caseTextWithHeaderAnchor(file, next);
      if (next !== original) {
        await this.replaceFileTextExpected(
          file,
          original,
          next,
          `v0.1.3 migration stopped because ${path} changed or moved in another window or device.`,
          path
        );
      }
    }
    if (!await this.migrationCompleted(MIGRATION_V013)) await this.markMigrationCompleted(MIGRATION_V013);
    this.settings.pluginVersion = PLUGIN_VERSION;
    this.settings.schemaVersion = SCHEMA_VERSION;
    await this.saveSettings();
    await this.appendLog("v0.1.3 upgrade", `${force ? "Revalidated" : "Initialized"}: launcher, template version history, clean case metadata, and migration workspace.`);
  }
  async routeCreatedFolder(folder) {
    if (!(folder instanceof TFolder) || !this.isManagedPath(folder.path)) return;
    const ctx = contextFromPath(folder.path, this.contentRoot);
    if (!ctx) return;
    if (ctx.depth === 1) await this.ensureSpecialtyNode(ctx.specialty);
    if (ctx.depth === 2 && ctx.surgeon) {
      const state = await this.getRegistrySurgeon(ctx.specialty, ctx.surgeon, { create: false });
      if (!state.data) return false;
      await this.ensureSpecialtyNode(ctx.specialty);
      await this.ensureSurgeonGraphNode(ctx.specialty, ctx.surgeon, state.data.cst_id, state.data);
    }
    return true;
  }
  scheduleRegistryBacklogRetry(delay = 750) {
    if (this.featureMutationActive || this.unloading || this.settings.resetNeedsReview) return;
    if (this.registryBacklogTimer) window.clearTimeout(this.registryBacklogTimer);
    this.registryBacklogTimer = window.setTimeout(async () => {
      this.registryBacklogTimer = null;
      if (this.unloading) return;
      try {
        await (this.runBackground ? this.runBackground(() => this.retryRegistryBacklog()) : this.retryRegistryBacklog());
      } catch (error) {
        console.error("CST registry Sync backlog retry", error);
        new Notice(`CST routing is waiting for Sync: ${error.message || error}`);
      }
    }, Math.max(0, Number(delay) || 0));
  }
  async retryRegistryBacklog() {
    if (this.unloading || !this.settings.initialized) return false;
    let settled = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!await this.quickStructureCheck({ quiet: true })) return false;
      const state = await this.readSurgeonRegistry({ create: false });
      if (state.missing || state.invalid || !(state.file instanceof TFile)) {
        throw new Error("the surgeon registry is unavailable or invalid");
      }
      const registryPath = this.surgeonRegistryPath();
      this.assertVaultFilePath(state.file, registryPath, "Registry backlog retry paused because the registry moved or was replaced.");
      const beforeText = await this.app.vault.read(state.file);
      this.assertVaultFilePath(state.file, registryPath, "Registry backlog retry paused because the registry moved or was replaced.");
      for (const file of this.allCaseFiles()) {
        const expectedPath = normalizePath(file.path);
        const context = contextFromPath(expectedPath, this.contentRoot);
        if (!context || context.depth !== 3 || !context.surgeon) continue;
        const frontmatter = await this.fileFrontmatter(file, expectedPath);
        const identityMismatch = !!(frontmatter.specialty && frontmatter.specialty !== context.specialty || frontmatter.surgeon && frontmatter.surgeon !== context.surgeon);
        if (identityMismatch) continue;
        const surgeonData = state.registry.surgeons?.[this.surgeonKey(context.specialty, context.surgeon)] || null;
        if (!surgeonData) {
          throw new Error(`the surgeon registry record for ${context.specialty} / ${context.surgeon} is still syncing`);
        }
        await this.routeManagedFile(file, false, { surgeonData, expectedPath });
      }
      this.assertVaultFilePath(state.file, registryPath, "Registry backlog retry paused because the registry moved or was replaced.");
      const afterText = await this.app.vault.read(state.file);
      this.assertVaultFilePath(state.file, registryPath, "Registry backlog retry paused because the registry moved or was replaced.");
      if (afterText === beforeText) {
        settled = true;
        break;
      }
    }
    if (!settled) {
      throw new Error("the surgeon registry kept changing while deferred cases were being reconciled");
    }
    await this.rebuildGraph();
    return true;
  }
  async onCreated(file) {
    if (this.featureMutationActive || this.unloading || this.settings.resetNeedsReview) return;
    const createdPath = normalizePath(file?.path || "");
    if (file instanceof TFile && createdPath === this.surgeonRegistryPath()) {
      const suppressedUntil = this.ignoreCreateUntil.get(createdPath) || 0;
      this.scheduleRegistryBacklogRetry(Math.max(750, suppressedUntil - Date.now() + 100));
      return;
    }
    if (this.isInternalCreate(createdPath)) return;
    if (!this.createRoutingQueue) this.createRoutingQueue = Promise.resolve();
    const run = async () => {
      try {
        if (this.settings.initialized && !await this.quickStructureCheck({ quiet: true })) return;
        if (file instanceof TFolder) await this.routeCreatedFolder(file);
        else if (file instanceof TFile) await this.routeManagedFile(file, true);
      } catch (e) {
        console.error("CST create handler", e);
        new Notice(`CST routing error: ${e.message || e}`);
      }
    };
    const operation = this.createRoutingQueue.then(run, run);
    this.createRoutingQueue = operation.catch(() => {
    });
    return await operation;
  }
  onModified(file) {
    if (this.featureMutationActive || this.unloading || this.settings.resetNeedsReview) return;
    if (!(file instanceof TFile) || file.extension !== "md") return;
    const modifiedPath = normalizePath(file.path);
    if (modifiedPath === this.surgeonRegistryPath()) {
      const suppressedUntil = this.ignoreModifyUntil.get(modifiedPath) || 0;
      this.scheduleRegistryBacklogRetry(Math.max(750, suppressedUntil - Date.now() + 100));
      return;
    }
    if (this.isTemplatePath(file.path)) {
      this.trackOnboardingFile(file, true).catch((error) => console.error("CST onboarding template edit", error));
      this.scheduleTemplateVersion(file);
      return;
    }
    if (!this.isManagedPath(modifiedPath)) return;
    if ((this.ignoreModifyUntil.get(modifiedPath) || 0) > Date.now()) return;
    this.trackOnboardingFile(file, true).catch((error) => console.error("CST onboarding edit", error));
    const old = this.verifyTimers.get(modifiedPath);
    if (old) window.clearTimeout(old);
    const timer = window.setTimeout(async () => {
      this.verifyTimers.delete(modifiedPath);
      const current = this.app.vault.getAbstractFileByPath(modifiedPath);
      if (!(current instanceof TFile)) return;
      try {
        await (this.runBackground ? this.runBackground(() => this.verifyManagedFile(current)) : this.verifyManagedFile(current));
      } catch (e) {
        console.error("CST verification", e);
      }
    }, Math.max(5e3, Number(this.settings.verificationDebounceMs) || 45e3));
    this.verifyTimers.set(modifiedPath, timer);
  }
  async verifyManagedFile(file) {
    if (!(file instanceof TFile) || !this.caseContext(file)) return false;
    const expectedPath = normalizePath(file.path);
    if (this.settings.initialized && !await this.quickStructureCheck({ quiet: true })) return false;
    const fm = await this.fileFrontmatter(file, expectedPath);
    const bucket = verificationISO();
    const last = Date.parse(String(fm.last_verified || ""));
    const needsStamp = !Number.isFinite(last) || last < Date.parse(bucket);
    const needsSchema = Number(fm.schema_version) !== SCHEMA_VERSION;
    if (needsStamp || needsSchema) {
      await this.patchFrontmatter(file, (meta) => {
        if (needsStamp) meta.last_verified = bucket;
        if (needsSchema) meta.schema_version = SCHEMA_VERSION;
      }, expectedPath);
    }
    await this.validateBranch(file);
    return needsStamp || needsSchema;
  }
  async onRenamed(file, oldPath) {
    if (this.featureMutationActive || this.unloading || this.settings.resetNeedsReview) return;
    if (!this.settings.initialized) return;
    if (this.isInternalRename(oldPath, file?.path || "")) return;
    const folderEvent = file instanceof TFolder;
    if (!await this.quickStructureCheck({
      quiet: true,
      ignoreMissingPrefixes: [oldPath],
      allowRegistryMismatch: folderEvent
    })) return;
    const oldCtx = contextFromPath(oldPath, this.contentRoot);
    const newCtx = contextFromPath(file.path, this.contentRoot);
    try {
      if (file instanceof TFile && oldCtx && newCtx) {
        if (oldCtx.specialty === newCtx.specialty && oldCtx.surgeon === newCtx.surgeon) {
          await this.remapMigrationSessionPaths((path) => path === normalizePath(oldPath) ? normalizePath(file.path) : path);
          await this.routeManagedFile(file, false);
        } else {
          await this.remapMigrationSessionPaths(
            (path) => path === normalizePath(oldPath) ? normalizePath(file.path) : path,
            { invalidateLastSavedIfMapped: true, resetMappedWorking: true, updateLastSavedProfile: false }
          );
          await this.addPendingReview(`Managed note moved across database boundary:
- Old: ${oldPath}
- New: ${file.path}
- Any affected migration draft/Undo checkpoint was reset; immutable snapshots remain in Admin/Backups.`);
          new Notice("CST: move detected. Added to Admin review; metadata was not silently reassigned.");
        }
      } else if (file instanceof TFile && (oldCtx || newCtx)) {
        if (oldCtx && !newCtx) await this.pruneMigrationSessionPath(oldPath);
        await this.addPendingReview(`Managed note moved ${oldCtx ? "out of" : "into"} the CST database:
- Old: ${oldPath}
- New: ${file.path}
- Affected active migration state was retired; immutable snapshots were retained.`);
        new Notice("CST detected a note move across the managed-vault boundary. Review Admin/Pending Reviews.");
      } else if (file instanceof TFolder && (oldCtx || newCtx)) {
        if (oldCtx && newCtx) {
          await this.remapMigrationSessionPrefix(oldPath, file.path, {
            invalidateLastSavedIfMapped: true,
            resetMappedWorking: true,
            updateLastSavedProfile: false
          });
        } else if (oldCtx) {
          await this.pruneMigrationSessionPath(oldPath, { includeDescendants: true });
        }
        await this.addPendingReview(`Managed folder renamed or moved outside CST Admin:
- Old: ${oldPath}
- New: ${file.path}
- Affected migration drafts/Undo checkpoints were reset while immutable snapshots were retained.
- Automation is paused until Sync completes and the folder/registry mismatch is resolved with Initialize / Repair or the folder is moved back.`);
        new Notice("CST detected a folder move outside Admin. Case data was not reassigned silently; review Admin/Pending Reviews after Sync completes.");
      }
    } catch (e) {
      console.error("CST rename handler", e);
    }
  }
  async onDeleted(file) {
    if (this.featureMutationActive || this.unloading || this.settings.resetNeedsReview) return;
    if (!this.settings.initialized) return;
    const deletedPath = normalizePath(file?.path || "");
    if (!this.isManagedPath(deletedPath)) return;
    const folderEvent = file instanceof TFolder;
    if (!await this.quickStructureCheck({
      quiet: true,
      ignoreMissingPrefixes: [deletedPath],
      allowRegistryMismatch: folderEvent
    })) return;
    try {
      if (file instanceof TFile && this.isCasePath(deletedPath)) {
        await this.cleanupDeletedCaseState(deletedPath);
      } else if (file instanceof TFolder) {
        await this.addPendingReview(`Managed folder deleted outside CST Admin:
- ${deletedPath}
- Registry/profile data was retained. Automation is paused until Sync completes and Initialize / Repair restores the missing side.`);
        new Notice("CST retained surgeon data after an external folder deletion. Review Pending Reviews after Sync completes.");
      }
    } catch (e) {
      console.error("CST delete cleanup", e);
      const diagnostic = await this.createDiagnostic("Case deletion backend cleanup", e, { stage: "delete event", paths: [deletedPath] });
      new DiagnosticModal(this, diagnostic).open();
    } finally {
      if (!(file instanceof TFolder)) this.scheduleGraphRebuild(250);
    }
  }
  async validateBranch(file) {
    const ctx = this.caseContext(file);
    if (!ctx) return;
    const fm = await this.fileFrontmatter(file);
    const expectedGraph = `[[${this.surgeonGraphPath(ctx.specialty, ctx.surgeon).replace(/\.md$/, "")}|${ctx.surgeon}]]`;
    const safeProblems = !fm.cst_id || !fm.schema_version || !this.app.vault.getAbstractFileByPath(this.surgeonGraphPath(ctx.specialty, ctx.surgeon));
    const mismatch = fm.specialty && fm.specialty !== ctx.specialty || fm.surgeon && fm.surgeon !== ctx.surgeon;
    if (mismatch) {
      await this.addPendingReview(`Metadata/path mismatch:
- ${file.path}
- Stored: ${fm.specialty || "?"} / ${fm.surgeon || "?"}
- Path: ${ctx.specialty} / ${ctx.surgeon}`);
      return;
    }
    if (safeProblems || fm.graph_parent !== expectedGraph) await this.routeManagedFile(file, false);
  }
  async assertWellFormedLiveHeaderFences(files, label = "migration") {
    const malformed = [];
    for (const file of files || []) {
      if (!(file instanceof TFile)) continue;
      const text = await this.app.vault.read(file);
      const exact = (text.match(/```cst-surgeon-header\s*\n?```/g) || []).length;
      const starts = (text.match(/```cst-surgeon-header\b/g) || []).length;
      if (exact !== starts) malformed.push(file.path);
    }
    if (malformed.length) {
      const error = new Error(`${label} stopped before writing because ${malformed.length} case${malformed.length === 1 ? " has" : "s have"} a malformed cst-surgeon-header fence.`);
      error.cstPaths = malformed;
      throw error;
    }
    return true;
  }
  async scanLiveHeaders() {
    const details = [];
    for (const file of this.allCaseFiles()) {
      const text = await this.app.vault.read(file);
      const exact = (text.match(/```cst-surgeon-header\s*\n?```/g) || []).length;
      const anyStart = (text.match(/```cst-surgeon-header\b/g) || []).length;
      const legacy = this.parseLegacyGloveRegion(text);
      const title = this.findCaseTitle(text);
      const needs = exact !== 1 || anyStart !== 1 || !!legacy || !title;
      if (needs) details.push({ file, exact, anyStart, legacy: !!legacy, hasTitle: !!title });
    }
    return { total: this.allCaseFiles().length, affected: details.length, details };
  }
  async repairLiveHeaders(withSnapshot = true) {
    if (this.settings.initialized && !await this.quickStructureCheck()) {
      throw new Error("Live-header repair is paused until this device has a complete CST vault.");
    }
    const scan = await this.scanLiveHeaders();
    const malformed = scan.details.filter((x) => x.anyStart !== x.exact);
    if (malformed.length) {
      const err = new Error(`Malformed cst-surgeon-header fence in ${malformed.length} case(s). Safe repair stopped before writing files.`);
      err.cstPaths = malformed.map((x) => x.file.path);
      throw err;
    }
    const plans = [];
    let legacyRemoved = 0;
    let insertedTitles = 0;
    for (const item of scan.details) {
      const file = item.file;
      const context = this.caseContext(file);
      if (!context) continue;
      const original = await this.app.vault.read(file);
      const exact = (original.match(/```cst-surgeon-header\s*\n?```/g) || []).length;
      const anyStart = (original.match(/```cst-surgeon-header\b/g) || []).length;
      if (anyStart !== exact) {
        const error = new Error(`Malformed cst-surgeon-header fence in ${file.path}. Safe repair stopped before writing files.`);
        error.cstPaths = [file.path];
        throw error;
      }
      const legacy = this.parseLegacyGloveRegion(original);
      const legacyGloves = legacy ? normalizeGloves2(legacy.mdRaw, this.settings) : "";
      let next = legacy ? this.removeLegacyMdGlovePreamble(original, legacy) : original;
      next = next.replace(/\n?```cst-surgeon-header\s*\n?```\n?/g, "\n");
      const title = this.findCaseTitle(next);
      if (title) {
        next = `${next.slice(0, title.end).replace(/\s*$/, "")}

${CASE_HEADER_BLOCK}

${next.slice(title.end).replace(/^\s+/, "")}`;
      } else {
        const fmBlock = frontmatterBlock(next);
        const at = fmBlock?.end || 0;
        next = `${next.slice(0, at)}# ${file.basename}

${CASE_HEADER_BLOCK}

${next.slice(at).replace(/^\s+/, "")}`;
        insertedTitles++;
      }
      if (legacy) legacyRemoved++;
      plans.push({ file, path: file.path, original, next, context, legacyGloves });
    }
    let backupPath = "";
    if (withSnapshot && plans.length) {
      const snapshotTargets = plans.map((plan) => plan.file);
      if (plans.some((plan) => plan.legacyGloves)) {
        const registryState = await this.readSurgeonRegistry({ create: false });
        if (registryState.file instanceof TFile) snapshotTargets.push(registryState.file);
      }
      backupPath = await this.snapshotFiles("live-header-repair", snapshotTargets);
    }
    const registryMutations = /* @__PURE__ */ new Map();
    try {
      for (const plan of plans) {
        if (!plan.legacyGloves) continue;
        const result = await this.seedSurgeonGlovesIfUnknown(
          plan.context.specialty,
          plan.context.surgeon,
          plan.legacyGloves,
          verificationISO(plan.file.stat?.mtime || Date.now())
        );
        this.rememberRegistryMutation(registryMutations, plan.context.specialty, plan.context.surgeon, result);
      }
      await this.applyExpectedTextPlans(plans, "Live-header repair");
    } catch (error) {
      try {
        await this.rollbackRegistryMutations(registryMutations, "Live-header repair");
      } catch (rollback) {
        throw new Error(`${error.message || error} ${rollback.message || rollback}`);
      }
      throw error;
    }
    const repaired = plans.filter((plan) => plan.next !== plan.original).length;
    await this.rebuildGraph();
    await this.appendLog("Live header repair", `${repaired} notes repaired; ${legacyRemoved} legacy glove blocks removed.`);
    return { ...scan, repaired, legacyRemoved, insertedTitles, backupPath };
  }
  async repairAll(withSnapshot = false) {
    if (this.settings.initialized && !await this.quickStructureCheck()) {
      throw new Error("Backend repair is paused until this device has a complete CST vault.");
    }
    const files = this.allCaseFiles();
    let backupPath = "";
    if (withSnapshot && files.length) backupPath = await this.snapshotFiles("backend-repair", [...files, ...this.getSurgeonProfiles()]);
    const specialties = this.getSpecialties();
    for (const specialty of specialties) {
      for (const surgeon2 of this.getSurgeons(specialty)) await this.ensureSurgeonData(specialty, surgeon2, {}, { updateGraph: false });
    }
    for (const file of files) await this.routeManagedFile(file, false);
    await this.rebuildGraph();
    await this.appendLog("Backend repair", `${files.length} cases scanned.`);
    if (withSnapshot) new Notice(`CST repair complete: ${files.length} cases scanned.`);
    return { files: files.length, backupPath };
  }
  async quickStructureCheck({
    quiet = false,
    ignoreMissingPrefixes = [],
    allowedMissingRegistryKeys = [],
    allowRegistryMismatch = false,
    allowMissingSessionPaths = false,
    allowMissingRegistryForMigration = false
  } = {}) {
    this.lastStructureCheckRegistryMismatch = null;
    this.lastStructureCheckMissingSessionPaths = [];
    const pause = (message) => {
      if (!quiet) new Notice(message);
      return false;
    };
    const root = this.app.vault.getAbstractFileByPath(this.contentRoot);
    if (!(root instanceof TFolder)) {
      return pause(`CST Notes paused: ${this.contentRoot} is missing. Wait for Sync or run Initialize / repair installation.`);
    }
    const specialties = this.getSpecialties();
    if (!specialties.length) {
      return pause("CST Notes paused: no specialty folders are available yet. Wait for Obsidian Sync to finish.");
    }
    const registryFile = this.app.vault.getAbstractFileByPath(this.surgeonRegistryPath());
    if (!(registryFile instanceof TFile)) {
      if (!allowMissingRegistryForMigration) {
        return pause("CST Notes paused: the surgeon registry is missing. Wait for Sync or run the pending legacy migration from Admin.");
      }
      const locallyExpected = Array.isArray(this.settings.completedMigrations) && this.settings.completedMigrations.map(String).includes(MIGRATION_V012) || versionAtLeast(this.settings.pluginVersion, "0.1.2");
      if (locallyExpected || await this.migrationKnownComplete(MIGRATION_V012)) {
        return pause("CST Notes paused: the surgeon registry has not synced to this device yet.");
      }
    } else {
      let registryState;
      try {
        registryState = this.parseSurgeonRegistryText(await this.app.vault.read(registryFile));
      } catch (error) {
        return pause(`CST Notes paused: the surgeon registry could not be read (${error.message || error}).`);
      }
      if (registryState.invalid) {
        return pause(`CST Notes paused: ${registryState.error}. The file was not changed.`);
      }
      const physicalKeys = /* @__PURE__ */ new Set();
      for (const specialty of specialties) {
        for (const surgeon2 of this.getSurgeons(specialty)) physicalKeys.add(this.surgeonKey(specialty, surgeon2));
      }
      const registeredKeys = new Set(Object.keys(registryState.registry.surgeons || {}));
      const missingFolders = [...registeredKeys].filter((key4) => !physicalKeys.has(key4));
      const missingRecords = [...physicalKeys].filter((key4) => !registeredKeys.has(key4));
      const allowedRecords = new Set((allowedMissingRegistryKeys || []).map(String));
      const unexpectedMissingRecords = missingRecords.filter((key4) => !allowedRecords.has(key4));
      if (missingFolders.length || unexpectedMissingRecords.length) {
        this.lastStructureCheckRegistryMismatch = {
          missingFolders: [...missingFolders],
          missingRecords: [...unexpectedMissingRecords]
        };
        if (!allowRegistryMismatch) {
          return pause(`CST Notes paused: surgeon folders and registry records differ (${missingFolders.length} folder${missingFolders.length === 1 ? "" : "s"} missing, ${unexpectedMissingRecords.length} record${unexpectedMissingRecords.length === 1 ? "" : "s"} missing). Wait for Sync or run repair after verifying the vault.`);
        }
      }
    }
    const sessionFile = this.app.vault.getAbstractFileByPath(this.migrationSessionPath());
    if (sessionFile instanceof TFile) {
      let session;
      try {
        session = this.parseMigrationSessionText(await this.app.vault.read(sessionFile));
      } catch (error) {
        return pause(`CST Notes paused: ${error.message || error} The session file was not changed.`);
      }
      const ignoredPrefixes = (ignoreMissingPrefixes || []).map(normalizePath).filter(Boolean);
      const ignored = (path) => ignoredPrefixes.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
      const missing = (session.order || []).filter((path) => !ignored(path) && !(this.app.vault.getAbstractFileByPath(path) instanceof TFile));
      if (missing.length) {
        this.lastStructureCheckMissingSessionPaths = [...missing];
        if (!allowMissingSessionPaths) {
          return pause(`CST Notes paused: ${missing.length} migration case${missing.length === 1 ? "" : "s"} have not synced to this device yet.`);
        }
      }
    }
    return true;
  }
  async scanHealth() {
    const cases = this.allCaseFiles();
    const issues = [];
    let outdatedTemplates = 0;
    let templateIssues = 0;
    let missingIds = 0;
    let pathMismatches = 0;
    let missingGraph = 0;
    for (const file of cases) {
      const c = this.caseContext(file);
      const fm = await this.fileFrontmatter(file);
      if (!fm.cst_id) {
        missingIds++;
        issues.push(["Missing ID", file.path]);
      }
      if (fm.specialty && fm.specialty !== c.specialty || fm.surgeon && fm.surgeon !== c.surgeon) {
        pathMismatches++;
        issues.push(["Path mismatch", file.path]);
      }
      if (!this.app.vault.getAbstractFileByPath(this.surgeonGraphPath(c.specialty, c.surgeon))) {
        missingGraph++;
        issues.push(["Missing graph node", file.path]);
      }
      if (this.caseTemplateProvenance) {
        try {
          const { created, current } = await this.caseTemplateProvenance(file);
          if (created.version && current && created.version !== current.version) outdatedTemplates++;
        } catch (_) {
        }
      }
    }
    let missingGloves = 0, unknownGowns = 0, invalidGloves = 0, surgeonCount = 0;
    for (const specialty of this.getSpecialties()) {
      for (const surgeon2 of this.getSurgeons(specialty)) {
        surgeonCount++;
        const data = await this.getSurgeonData(specialty, surgeon2, { createIfMissing: false });
        const gloves = formatGloves(data?.gloves || "Unknown");
        const gown = data?.gown || "Unknown";
        if (gloves === "Unknown") missingGloves++;
        else {
          try {
            normalizeGloves2(gloves, this.settings);
          } catch (_) {
            invalidGloves++;
            issues.push(["Invalid gloves", `${specialty} / ${surgeon2}`]);
          }
        }
        if (gown === "Unknown" || !GOWNS2.includes(gown)) unknownGowns++;
      }
    }
    const duplicateSurgeons = this.duplicateSurgeonCandidates();
    return {
      cases: cases.length,
      surgeons: surgeonCount,
      specialties: this.getSpecialties().length,
      missingIds,
      pathMismatches,
      missingGraph,
      outdatedTemplates,
      templateIssues,
      missingGloves,
      unknownGowns,
      invalidGloves,
      duplicateSurgeons,
      issues
    };
  }
  getSurgeonProfiles() {
    const f = this.app.vault.getAbstractFileByPath(this.surgeonRegistryPath());
    return f instanceof TFile ? [f] : [];
  }
  duplicateSurgeonCandidates() {
    const map = /* @__PURE__ */ new Map();
    for (const specialty of this.getSpecialties()) {
      for (const surgeon2 of this.getSurgeons(specialty)) {
        const n = String(surgeon2).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!map.has(n)) map.set(n, []);
        map.get(n).push(`${specialty}: ${surgeon2}`);
      }
    }
    return [...map.values()].filter((v) => v.length > 1);
  }
  async verificationItems() {
    const items = [];
    for (const file of this.allCaseFiles()) {
      const fm = await this.fileFrontmatter(file);
      const c = this.caseContext(file);
      items.push({ kind: "Case", specialty: c.specialty, surgeon: c.surgeon, name: file.basename, file, verified: fm.last_verified || "" });
    }
    for (const specialty of this.getSpecialties()) {
      for (const surgeon2 of this.getSurgeons(specialty)) {
        const data = await this.getSurgeonData(specialty, surgeon2, { createIfMissing: false });
        const graphFile = this.app.vault.getAbstractFileByPath(this.surgeonGraphPath(specialty, surgeon2));
        if (!(graphFile instanceof TFile)) continue;
        items.push({ kind: "Surgeon", specialty, surgeon: surgeon2, name: surgeon2, file: graphFile, verified: data?.last_verified || "" });
      }
    }
    return items.sort((a, b) => {
      if (!a.verified && b.verified) return -1;
      if (a.verified && !b.verified) return 1;
      return String(a.verified).localeCompare(String(b.verified));
    });
  }
  async snapshotFiles(label, files) {
    const stamp = moment().format("YYYYMMDD-HHmmss-SSS");
    const readable = (safeFileName(label) || "snapshot").slice(0, 24);
    const labelHash = shortHash(String(label || "snapshot")).replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
    const base = this.p(`Admin/Backups/${stamp}-${readable}-${labelHash}`);
    const sourceFiles = [...new Map((files || []).filter((file) => file instanceof TFile).map((file) => {
      const originalPath = normalizePath(file.path);
      return [originalPath, {
        file,
        originalPath,
        modifiedMs: Number(file.stat?.mtime || 0)
      }];
    })).values()];
    if (sourceFiles.length > 9999) {
      throw new Error("Snapshot stopped: at most 9,999 files can be captured in one portable snapshot.");
    }
    const staged = [];
    for (let index = 0; index < sourceFiles.length; index++) {
      const source = sourceFiles[index];
      const { file, originalPath, modifiedMs } = source;
      this.assertVaultFilePath(file, originalPath, `Snapshot stopped because ${originalPath} moved or was replaced.`);
      const extension = (safeFileName(file.extension || "md") || "md").slice(0, 12);
      const hash = shortHash(originalPath).replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
      const name = `${String(index + 1).padStart(4, "0")}-${hash}.${extension}`;
      const content = await this.app.vault.read(file);
      this.assertVaultFilePath(file, originalPath, `Snapshot stopped because ${originalPath} moved or was replaced while being read.`);
      staged.push({
        file,
        originalPath,
        modifiedMs,
        name,
        relative: cleanPath("Files", name),
        content
      });
    }
    const preflightRoot = `${base}-9999`;
    const preflightFilesRoot = cleanPath(preflightRoot, "Files");
    for (const target of [
      this.p("Admin/Backups"),
      preflightRoot,
      preflightFilesRoot,
      cleanPath(preflightRoot, "Manifest.md"),
      ...staged.map((entry) => cleanPath(preflightFilesRoot, entry.name))
    ]) {
      validatePortableVaultPath(target, "Snapshot path");
    }
    await this.ensureFolder(this.p("Admin/Backups"));
    let root = "";
    for (let suffix = 1; suffix <= 9999; suffix++) {
      const candidate = suffix === 1 ? base : `${base}-${suffix}`;
      const candidateFilesRoot = cleanPath(candidate, "Files");
      const candidateManifest = cleanPath(candidate, "Manifest.md");
      for (const target of [
        candidate,
        candidateFilesRoot,
        candidateManifest,
        ...staged.map((entry) => cleanPath(candidateFilesRoot, entry.name))
      ]) {
        validatePortableVaultPath(target, "Snapshot path");
      }
      if (this.app.vault.getAbstractFileByPath(candidate)) continue;
      this.markInternalCreate(candidate);
      try {
        await this.app.vault.createFolder(candidate);
        root = candidate;
        break;
      } catch (error) {
        this.ignoreCreateUntil.delete(normalizePath(candidate));
        if (this.app.vault.getAbstractFileByPath(candidate)) continue;
        throw error;
      }
    }
    if (!root) throw new Error("Snapshot stopped after 9,999 same-millisecond root collisions.");
    const filesRoot = cleanPath(root, "Files");
    const entries = staged.map((entry) => ({
      ...entry,
      target: cleanPath(filesRoot, entry.name)
    }));
    const manifestPath = cleanPath(root, "Manifest.md");
    await this.ensureFolder(filesRoot);
    const manifestEntries = [];
    for (const entry of entries) {
      this.markInternalCreate(entry.target);
      await this.app.vault.create(entry.target, entry.content);
      manifestEntries.push({
        original_path: entry.originalPath,
        backup_file: entry.relative,
        modified_ms: entry.modifiedMs,
        characters: entry.content.length
      });
    }
    const created = nowISO();
    const manifest = {
      version: 1,
      label: String(label || "snapshot"),
      created,
      files: manifestEntries
    };
    this.markInternalCreate(manifestPath);
    await this.app.vault.create(
      manifestPath,
      `# CST Snapshot Manifest

Created: ${created}

\`\`\`json
${JSON.stringify(manifest, null, 2)}
\`\`\`
`
    );
    this.lastSnapshot = { label, path: root, at: created, count: entries.length };
    try {
      await this.appendLog("Snapshot", `${label}: ${entries.length} files → ${root}`);
    } catch (error) {
      console.error("CST snapshot audit log", error);
    }
    return root;
  }
  async appendLog(action, detail) {
    const path = this.p("Admin/Logs/Automation.md");
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) file = await this.ensureTextFile(path, "# CST Automation Log\n\n");
    const line = `- ${nowISO()} — **${action}** — ${detail}
`;
    await this.appendFileTextAtPath(file, path, line, "Audit log moved or was replaced before it could be updated.");
  }
  async addPendingReview(text) {
    const path = this.p("Admin/Data/Pending Review.md");
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) file = await this.ensureTextFile(path, "# Pending CST Reviews\n\n");
    await this.appendFileTextAtPath(
      file,
      path,
      `## ${nowISO()}

${text}

`,
      "Pending Review log moved or was replaced before it could be updated."
    );
  }
  async createDiagnostic(action, error, extra = {}) {
    const stamp = moment().format("YYYYMMDD-HHmmss");
    const diagnosticId = `CST-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const err = error instanceof Error ? error : new Error(String(error || "Unknown CST error"));
    let health = null;
    try {
      health = await this.scanHealth();
    } catch (_) {
    }
    const migrationReadErrors = [];
    const readMigrationState = async (migrationId) => {
      try {
        return await this.migrationCompleted(migrationId);
      } catch (migrationError) {
        migrationReadErrors.push(migrationError?.message || String(migrationError));
        return false;
      }
    };
    const migrations = {
      v011: await readMigrationState(MIGRATION_V011),
      v012: await readMigrationState(MIGRATION_V012),
      v013: await readMigrationState(MIGRATION_V013)
    };
    const platform = Platform.isMobile ? Platform.isIosApp ? "iOS" : "Mobile" : "Desktop";
    const paths = Array.isArray(extra.paths) ? extra.paths : [];
    const ids = extra.ids && typeof extra.ids === "object" ? extra.ids : {};
    const findings = health ? [
      `${health.cases} managed cases`,
      `${health.surgeons} surgeons`,
      `${health.missingIds} missing IDs`,
      `${health.pathMismatches} path/metadata mismatches`,
      `${health.missingGraph} missing graph nodes`,
      `${health.invalidGloves} invalid glove records`
    ] : ["Health scan unavailable after failure"];
    if (migrationReadErrors.length) {
      findings.push(`Migration-state collection was unavailable: ${migrationReadErrors.join(" | ")}`);
    }
    const text = [
      "CST Notes diagnostic request",
      "",
      "Please diagnose this CST Notes plugin failure and give me the safest fix. Do not assume the case bodies should be manually edited unless the diagnostic requires it.",
      "",
      `Diagnostic ID: ${diagnosticId}`,
      `Plugin version: ${PLUGIN_VERSION}`,
      `Platform: ${platform}`,
      `Action attempted: ${action}`,
      `Result: FAILED`,
      `Stage: ${extra.stage || "Admin/backend action"}`,
      "",
      "Vault paths:",
      `- Content root: ${this.contentRoot}`,
      `- Backend root: ${this.settings.backendRoot}`,
      ...paths.map((x) => `- Relevant path: ${x}`),
      "",
      `Schema version: ${SCHEMA_VERSION}`,
      "Migration state:",
      `- v0.1.1: ${migrations.v011 ? "Completed" : "Pending"}`,
      `- v0.1.2: ${migrations.v012 ? "Completed" : "Pending"}`,
      `- v0.1.3: ${migrations.v013 ? "Completed" : "Pending"}`,
      extra.migrationId ? `- Current migration ID: ${extra.migrationId}` : "",
      "",
      "Validation findings:",
      ...findings.map((x) => `- ${x}`),
      ...Object.entries(ids).map(([k, v]) => `- ${k}: ${v}`),
      "",
      `Error: ${err.message || String(err)}`,
      "",
      "Stack summary:",
      String(err.stack || "No stack available").slice(0, 5e3),
      "",
      "Safety state:",
      `- Case body writes after failure: ${extra.caseBodiesModified ? "POSSIBLE — inspect backup/log" : "none reported by the action"}`,
      `- Backup/snapshot: ${extra.backupPath || this.lastSnapshot?.path || "none reported"}`,
      `- Rollback requested: ${extra.rollbackRequired ? "yes" : "no"}`,
      "",
      "Please tell me:",
      "1. What most likely failed.",
      "2. What plugin logic/file should be corrected.",
      "3. Whether I should run another repair before changing any files manually."
    ].filter(Boolean).join("\n");
    const path = this.p(`Admin/Logs/Diagnostics/${diagnosticId}.md`);
    let savedPath = "";
    try {
      await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
      const report = `# ${diagnosticId}

- Action: ${action}
- Created: ${nowISO()}
- Plugin: ${PLUGIN_VERSION}

## ChatGPT diagnostic

\`\`\`text
${text.replace(/\`\`\`/g, "~~~")}
\`\`\`
`;
      await this.ensureTextFile(path, report);
      savedPath = path;
      try {
        await this.appendLog("Diagnostic", `${diagnosticId} — ${action} — ${err.message || err}`);
      } catch (_) {
      }
    } catch (logError) {
      console.error("CST could not persist diagnostic log", logError);
    }
    return { id: diagnosticId, path: savedPath, text, summary: err.message || String(err) };
  }
  async runAdminAction(action, fn, extra = {}) {
    try {
      return await fn();
    } catch (e) {
      console.error(`CST ${action}`, e);
      let diagnostic;
      try {
        diagnostic = await this.createDiagnostic(action, e, extra);
      } catch (diagnosticError) {
        console.error("CST diagnostic fallback", diagnosticError);
        diagnostic = {
          id: `CST-INMEMORY-${Date.now()}`,
          path: "",
          summary: e?.message || String(e),
          text: `CST action failed: ${action}

${e?.stack || e}

Diagnostic persistence also failed: ${diagnosticError?.stack || diagnosticError}`
        };
      }
      try {
        new DiagnosticModal(this, diagnostic).open();
      } catch (modalError) {
        console.error("CST could not open diagnostic modal", modalError);
        new Notice(`${action} failed: ${diagnostic.summary}`);
      }
      return null;
    }
  }
  async openFile(file) {
    const active = this.app.workspace.activeLeaf;
    const inCSTApp = active?.view?.getViewType?.() === VIEW_TYPE_CST_SIDEBAR;
    const leaf2 = inCSTApp ? this.app.workspace.getLeaf("tab") : this.app.workspace.getLeaf(false);
    await leaf2.openFile(file);
    await this.app.workspace.revealLeaf?.(leaf2);
  }
  async clearCSTTabs() {
    const workspace = this.app.workspace;
    let kept = 0;
    for (const leaf2 of [...workspace.getLeavesOfType("markdown")]) {
      const view = leaf2.view, file = view?.file;
      if (!file || !(this.isCasePath(file.path) || file.path.startsWith(this.p() + "/") || file.path === this.settings.launcherPath)) continue;
      if (leaf2.getViewState?.().pinned) {
        kept++;
        continue;
      }
      const path = file.path;
      if (view.editor?.getValue) {
        let saved;
        try {
          saved = await this.app.vault.read(file);
        } catch {
          kept++;
          continue;
        }
        if (view.editor.getValue() !== saved) {
          kept++;
          continue;
        }
      }
      if (leaf2.view !== view || view.file !== file || file.path !== path || leaf2.getViewState?.().pinned) {
        kept++;
        continue;
      }
      leaf2.detach();
    }
    const apps = [...workspace.getLeavesOfType(VIEW_TYPE_CST_SIDEBAR)];
    for (const leaf2 of apps.slice(1)) if (!leaf2.getViewState?.().pinned) leaf2.detach();
    await this.activateSidebar({ specialty: "", surgeon: "", query: "" });
    if (kept) new Notice(`${kept} pinned or unsaved CST Notes tab${kept === 1 ? " was" : "s were"} kept open.`);
  }
  navigateFromUI(label, operation) {
    void Promise.resolve().then(operation).catch((error) => {
      console.error(`CST navigation failed: ${label}`, error);
      new Notice(`${label} failed: ${error.message || error}`);
    });
  }
  dispatchVaultEvent(label, operation) {
    void Promise.resolve().then(() => {
      if (this.unloading) return;
      return this.runBackground ? this.runBackground(operation) : operation();
    }).catch((error) => {
      try {
        console.error(`CST ${label} event`, error);
      } catch (_) {
      }
      if (this.unloading) return;
      try {
        new Notice(`CST ${label} event paused safely: ${error.message || error}`);
      } catch (noticeError) {
        try {
          console.error("CST vault-event notice fallback", noticeError);
        } catch (_) {
        }
      }
    });
  }
  async cleanupDeletedCaseState(path) {
    path = normalizePath(String(path || ""));
    await this.pruneMigrationSessionPath(path);
    try {
      await this.appendLog("Case deletion cleanup", `${path} — active note-specific backend/session state removed; surgeon record retained.`);
    } catch (error) {
      console.error("CST case-deletion audit log", error);
      new Notice("Case deletion cleanup completed; its audit-log entry is pending.");
    }
    this.scheduleGraphRebuild(250);
  }
  async restoreStagedCaseDeletion(file, stagedPath, originalPath) {
    stagedPath = normalizePath(String(stagedPath || ""));
    originalPath = normalizePath(String(originalPath || ""));
    try {
      if (this.app.vault.getAbstractFileByPath(stagedPath) !== file || normalizePath(String(file?.path || "")) !== stagedPath || this.app.vault.getAbstractFileByPath(originalPath)) return false;
      const restored = await this.renameVaultItem(file, originalPath, stagedPath);
      return restored === file && this.app.vault.getAbstractFileByPath(originalPath) === file && normalizePath(String(file.path || "")) === originalPath;
    } catch (error) {
      console.error("CST could not restore a staged case deletion", error);
      return false;
    }
  }
  async archiveCaseDeletion(file, originalPath, expectedText) {
    originalPath = validatePortableVaultPath(
      normalizePath(String(originalPath || "")),
      "Case deletion source path"
    );
    const assertOriginal = () => this.assertVaultFilePath(
      file,
      originalPath,
      "Case deletion stopped because the selected case moved or was replaced while safe deletion was being prepared."
    );
    assertOriginal();
    const archiveRoot = this.p("Admin/Backups/Deleted Cases");
    await this.ensureFolder(archiveRoot);
    assertOriginal();
    const currentText = await this.app.vault.read(file);
    assertOriginal();
    if (currentText !== expectedText) {
      throw new Error("Case deletion stopped because the case changed while safe deletion was being prepared.");
    }
    const stem = Array.from(safeFileName(file.basename || "case") || "case").slice(0, 12).join("");
    const nonce = id("delete").replace(/[^A-Za-z0-9-]/g, "").slice(-52);
    const archivePath = validatePortableVaultPath(
      cleanPath(archiveRoot, `${stem}--${nonce}.md`),
      "Deleted-case archive path"
    );
    const manifestPath = validatePortableVaultPath(
      cleanPath(archiveRoot, `${stem}--${nonce}.json`),
      "Deleted-case manifest path"
    );
    if (this.app.vault.getAbstractFileByPath(archivePath) || this.app.vault.getAbstractFileByPath(manifestPath)) {
      throw new Error("Case deletion stopped because its unique archive transaction already exists.");
    }
    const context = this.caseContext(file);
    const surgeonData = context ? await this.getSurgeonData(context.specialty, context.surgeon, { createIfMissing: false }) : null;
    const surgeonRecord = surgeonData?.cst_id && !surgeonData.unavailable ? this.portableSurgeonRecord(surgeonData, context.specialty, context.surgeon) : null;
    const session = await this.loadMigrationSession();
    const migrationState = session ? {
      queued: session.order?.includes(originalPath),
      status: session.status?.[originalPath],
      working: session.working?.[originalPath]
    } : null;
    const preparedAt = nowISO();
    const manifestBase = {
      version: 1,
      surgeon_record: surgeonRecord,
      migration_state: migrationState,
      transaction_id: nonce,
      state: "prepared",
      prepared_at: preparedAt,
      original_path: originalPath,
      archive_path: archivePath,
      case_name: file.name,
      characters: expectedText.length,
      content_hash: shortHash(expectedText)
    };
    const preparedManifestText = JSON.stringify(manifestBase, null, 2) + "\n";
    this.markInternalCreate(manifestPath);
    const manifestFile = await this.app.vault.create(manifestPath, preparedManifestText);
    this.assertVaultFilePath(
      manifestFile,
      manifestPath,
      "Case deletion stopped because its recovery manifest moved or was replaced."
    );
    const observedManifestText = await this.app.vault.read(manifestFile);
    this.assertVaultFilePath(
      manifestFile,
      manifestPath,
      "Case deletion stopped because its recovery manifest moved or was replaced."
    );
    if (observedManifestText !== preparedManifestText) {
      throw new Error("Case deletion stopped because its recovery manifest bytes could not be verified.");
    }
    assertOriginal();
    const preMoveText = await this.app.vault.read(file);
    assertOriginal();
    if (preMoveText !== expectedText) {
      throw new Error("Case deletion stopped because the case changed after its recovery manifest was prepared.");
    }
    const moved = await this.renameVaultItem(file, archivePath, originalPath);
    try {
      this.assertVaultFilePath(
        moved,
        archivePath,
        "Case deletion stopped because the archived case moved or was replaced."
      );
      const archivedText = await this.app.vault.read(moved);
      this.assertVaultFilePath(
        moved,
        archivePath,
        "Case deletion stopped because the archived case moved or was replaced."
      );
      if (archivedText !== expectedText) {
        throw new Error("Case deletion stopped because the archived case bytes changed.");
      }
      const archivedAt = nowISO();
      const archivedManifestText = JSON.stringify({
        ...manifestBase,
        state: "archived",
        archived_at: archivedAt
      }, null, 2) + "\n";
      await this.replaceFileTextExpected(
        manifestFile,
        preparedManifestText,
        archivedManifestText,
        "Case deletion stopped because its recovery manifest changed or moved.",
        manifestPath
      );
      try {
        await this.appendLog("Case archived after deletion", `${originalPath} → ${archivePath} · manifest ${manifestPath}`);
      } catch (error) {
        console.error("CST case-deletion archive audit log", error);
      }
      this.assertVaultFilePath(
        moved,
        archivePath,
        "Case deletion stopped because the archived case moved or was replaced."
      );
      const finalText = await this.app.vault.read(moved);
      this.assertVaultFilePath(
        moved,
        archivePath,
        "Case deletion stopped because the archived case moved or was replaced."
      );
      if (finalText !== archivedText) {
        throw new Error("Case deletion stopped because the archived case changed before commit.");
      }
      return {
        file: moved,
        path: archivePath,
        text: finalText,
        originalPath,
        manifestFile,
        manifestPath,
        manifestText: archivedManifestText
      };
    } catch (error) {
      const restored = await this.restoreStagedCaseDeletion(moved, archivePath, originalPath);
      if (!restored) {
        const retainedPath = normalizePath(String(moved?.path || archivePath));
        throw new Error(`${error.message || error} The recoverable case remains at ${retainedPath}; backend/session state was retained.`);
      }
      throw error;
    }
  }
  async archivedCaseInfo(file) {
    const root = this.p("Admin/Backups/Deleted Cases") + "/";
    if (!(file instanceof TFile) || !file.path.startsWith(root) || file.path.slice(root.length).includes("/")) return null;
    const archivePath = file.path;
    const manifestFile = this.app.vault.getAbstractFileByPath(archivePath.replace(/\.md$/, ".json"));
    if (!(manifestFile instanceof TFile)) return null;
    const manifestText = await this.app.vault.read(manifestFile);
    const manifest = JSON.parse(manifestText);
    if (manifest.state !== "archived" || manifest.archive_path !== archivePath || !this.isCasePath(manifest.original_path)) return null;
    validatePortableVaultPath(manifest.original_path, "Restore destination");
    this.assertVaultFilePath(file, archivePath, "Archive moved during recovery lookup.");
    return { file, archivePath, manifestFile, manifestText, manifest };
  }
  async restoreArchivedCase(file) {
    const run = async () => {
      const info = await this.archivedCaseInfo(file);
      if (!info) throw new Error("This archive has no valid recovery manifest.");
      if (!await this.quickStructureCheck()) throw new Error("Wait for Sync before restoring.");
      const { archivePath, manifestFile, manifestText, manifest } = info;
      const target = manifest.original_path;
      const original = await this.app.vault.read(file);
      if (this.app.vault.getAbstractFileByPath(target)) throw new Error("The original case path is occupied. Both notes were preserved; rename the active case before restoring.");
      const fm = parseFrontmatterObject(original);
      const relative = target.slice(this.contentRoot.length + 1).split("/");
      const [specialty, surgeon2] = relative;
      if (fm.specialty !== specialty || fm.surgeon !== surgeon2 || !fm.cst_id || !fm.surgeon_id) throw new Error("Archive identity does not match its original folder. Review it before restoring.");
      const data = await this.getSurgeonData(specialty, surgeon2, { createIfMissing: false });
      if (data?.cst_id && data.cst_id !== fm.surgeon_id) throw new Error("The recipient surgeon identity differs. No case was restored.");
      if (!data?.cst_id && manifest.surgeon_record?.cst_id !== fm.surgeon_id) throw new Error("The original surgeon profile is unavailable. Restore the profile or wait for Sync first.");
      await this.ensureFolder(cleanPath(this.contentRoot, specialty, surgeon2));
      if (!data?.cst_id) await this.ensureSurgeonData(specialty, surgeon2, manifest.surgeon_record, { restoreIdentity: true });
      const restoredProfile = await this.getSurgeonData(specialty, surgeon2, { createIfMissing: false });
      if (restoredProfile?.cst_id !== fm.surgeon_id) throw new Error("Surgeon identity changed during restoration. The archive was retained.");
      if (await this.app.vault.read(manifestFile) !== manifestText) throw new Error("Recovery manifest changed. Retry after Sync.");
      this.assertVaultFilePath(file, archivePath, "Archive moved before restoration.");
      if (await this.app.vault.read(file) !== original) throw new Error("Archive changed before restoration. Retry.");
      const recoveredText = this.stripResourceMarkers?.(original) ?? original;
      const images = await this.attachmentRecovery?.prepareRestore({ text: recoveredText, originalPath: target, targetPath: target });
      const restoredText = images?.text ?? recoveredText;
      if (restoredText !== original) await this.snapshotFiles("Restored case preimage", [file]);
      await images?.assertUnchanged();
      if (await this.app.vault.read(file) !== original) throw new Error("Archive changed during image recovery.");
      this.assertVaultFilePath(manifestFile, archivePath.replace(/\.md$/i, ".json"), "Recovery manifest moved during image recovery.");
      if (await this.app.vault.read(manifestFile) !== manifestText) throw new Error("Recovery manifest changed during image recovery.");
      const restored = await this.renameVaultItem(file, target, archivePath);
      if (await this.app.vault.read(restored) !== original) throw new Error("Restored note changed concurrently. Its content was retained; review before continuing.");
      if (restoredText !== original) await this.replaceFileTextExpected(restored, original, restoredText, "Restored case changed during image repair.", target);
      await images?.assertUnchanged();
      try {
        await this.restoreCaseSession(manifest);
        await this.applyExpectedTextPlans([{
          file: manifestFile,
          path: manifestFile.path,
          original: manifestText,
          next: JSON.stringify({ ...manifest, state: "restored", restored_at: nowISO() }, null, 2) + "\n"
        }], "Case restoration");
      } catch (error) {
        new Notice("Case restored; recovery bookkeeping needs review. The recovery manifest was retained.");
        console.error("CST restoration bookkeeping", error);
      }
      this.scheduleGraphRebuild(250);
      await this.findExampleCase();
      await this.openFile(restored);
      const activeView = this.app.workspace?.activeLeaf?.view;
      if (activeView?.file === restored) activeView.previewMode?.rerender?.(true);
      new Notice("Case restored.");
      return restored;
    };
    const operation = (this.archiveRestoreQueue || Promise.resolve()).catch(() => {
    }).then(run);
    this.archiveRestoreQueue = operation.catch(() => {
    });
    return operation;
  }
  async restoreCaseSession(manifest) {
    const saved = manifest.migration_state;
    if (!saved) return;
    const state = await this.loadMigrationSession();
    if (!state) return;
    const path = manifest.original_path;
    state.order || (state.order = []);
    state.status || (state.status = {});
    state.working || (state.working = {});
    if (saved.queued && !state.order.includes(path)) state.order.push(path);
    if (saved.status !== void 0 && state.status[path] === void 0) state.status[path] = saved.status;
    if (saved.working !== void 0 && state.working[path] === void 0) state.working[path] = saved.working;
    this.reconcileMigrationSessionState(state);
    await this.saveMigrationSession(state);
  }
  async renderArchivedHeader(el, file) {
    const info = await this.archivedCaseInfo(file);
    if (!info) return false;
    el.empty();
    el.addClass("cst-live-header");
    el.dataset.cstSpecialty = "";
    el.dataset.cstSurgeon = "";
    el.createEl("p", { text: "Case deleted.", cls: "cst-muted" });
    el.createEl("p", { text: "Archived safely. Restore returns this case to its original location.", cls: "cst-muted" });
    const restore = el.createEl("button", { text: "Restore", cls: "mod-cta" });
    restore.onclick = () => this.navigateFromUI("Restore case", async () => {
      restore.disabled = true;
      try {
        await this.restoreArchivedCase(file);
      } finally {
        restore.disabled = false;
      }
    });
    this.addHomeButton(el);
    return true;
  }
  addCaseDeleteButton(el, actions, file) {
    this.addHomeButton(actions);
    const row = actions.createDiv({ cls: "cst-case-action-row" });
    if (this.openCSTExport) {
      const share = row.createEl("button", { text: "Export" });
      share.onclick = () => this.openCSTExport(file);
    }
    const remove = row.createEl("button", { text: "Delete", cls: "cst-case-delete-confirm" });
    let confirmation = null;
    remove.onclick = () => this.navigateFromUI("Delete case", async () => {
      if (!confirmation) {
        const path = file.path;
        const text = await this.app.vault.read(file);
        this.assertVaultFilePath(file, path, "Case moved before confirmation.");
        confirmation = { file, path, text, until: Date.now() + 1e4 };
        remove.textContent = "Are you sure?";
        remove.setAttribute?.("data-confirming", "true");
        return;
      }
      const approved = confirmation;
      confirmation = null;
      remove.textContent = "Delete";
      remove.setAttribute?.("data-confirming", "false");
      if (Date.now() > approved.until) return;
      remove.disabled = true;
      try {
        if (await this.deleteCase(file, approved)) await this.renderArchivedHeader(el, file);
      } finally {
        remove.disabled = false;
      }
    });
    remove.onblur = () => {
      confirmation = null;
      if (remove.textContent !== "Delete") remove.textContent = "Delete";
      remove.setAttribute?.("data-confirming", "false");
    };
    return remove;
  }
  async confirmCaseDeletion(file, expectedPath) {
    return await new Promise((resolve, reject) => {
      try {
        new CaseDeletionModal(this, file?.basename || "case", expectedPath, resolve).open();
      } catch (error) {
        reject(error);
      }
    });
  }
  async deleteCase(file, inlineConfirmation = null) {
    if (this.settings.initialized && !await this.quickStructureCheck()) {
      throw new Error("Case deletion is paused until this device has a complete CST vault.");
    }
    const current = this.app.vault.getAbstractFileByPath(normalizePath(file?.path || ""));
    if (!(current instanceof TFile) || !this.isCasePath(current.path)) {
      throw new Error("Only an existing CST case can be deleted from the CST app.");
    }
    const path = normalizePath(current.path);
    this.assertVaultFilePath(current, path, "Case deletion stopped because the selected case moved or was replaced.");
    const initialText = await this.app.vault.read(current);
    this.assertVaultFilePath(current, path, "Case deletion stopped because the selected case moved or was replaced.");
    if (inlineConfirmation && (inlineConfirmation.file !== current || inlineConfirmation.path !== path || inlineConfirmation.text !== initialText)) {
      new Notice("Case changed since confirmation. Review it and retry.");
      return false;
    }
    const confirmed = inlineConfirmation ? true : await this.confirmCaseDeletion(current, path);
    if (!confirmed) return false;
    const confirmedFile = this.app.vault.getAbstractFileByPath(path);
    if (confirmedFile !== current || normalizePath(String(current.path || "")) !== path || !this.isCasePath(path)) {
      new Notice("Case deletion was cancelled because the case moved or was replaced while confirmation was open.");
      return false;
    }
    const confirmedText = await this.app.vault.read(current);
    this.assertVaultFilePath(current, path, "Case deletion stopped because the selected case moved or was replaced.");
    if (confirmedText !== initialText) {
      new Notice("Case deletion was cancelled because the case changed while confirmation was open. Review it and retry.");
      return false;
    }
    const caseName = current.basename;
    const archived = await this.archiveCaseDeletion(current, path, confirmedText);
    this.assertVaultFilePath(
      archived.file,
      archived.path,
      "Case deletion stopped because the recovery archive moved or was replaced before commit."
    );
    this.assertVaultFilePath(
      archived.manifestFile,
      archived.manifestPath,
      "Case deletion stopped because the recovery manifest moved or was replaced before commit."
    );
    const committedManifestText = await this.app.vault.read(archived.manifestFile);
    this.assertVaultFilePath(
      archived.manifestFile,
      archived.manifestPath,
      "Case deletion stopped because the recovery manifest moved or was replaced before commit."
    );
    if (committedManifestText !== archived.manifestText) {
      throw new Error("Case deletion stopped because its recovery manifest changed before commit.");
    }
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(
        `Case removal paused because Sync placed another file at ${path}. The selected case is safe at ${archived.path}; backend/session state was retained.`
      );
      return false;
    }
    try {
      await this.cleanupDeletedCaseState(path);
    } catch (cleanupError) {
      try {
        const diagnostic = await this.createDiagnostic("Case deletion backend cleanup", cleanupError, {
          stage: "archive commit",
          paths: [path, archived.path]
        });
        new DiagnosticModal(this, diagnostic).open();
      } catch (diagnosticError) {
        console.error("CST case-deletion cleanup diagnostic", diagnosticError);
      }
      new Notice("Case deleted, but backend cleanup needs review.");
    }
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(
        `${caseName} was archived, but Sync placed another file at its former path during cleanup. Review that live case; the archive and manifest were retained.`
      );
    } else {
      new Notice(`${caseName} removed from CST and archived safely at ${archived.path}.`);
    }
    return true;
  }
  async openPath(path) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (file instanceof TFile) await this.openFile(file);
    else new Notice(`CST file not found: ${path}`);
  }
  async openAdmin() {
    await this.openPath(this.p("Admin/Admin.md"));
  }
  async activateSidebar(targetRoute = null) {
    if (targetRoute) this.sidebarActivationTarget = {
      specialty: String(targetRoute.specialty || ""),
      surgeon: String(targetRoute.surgeon || ""),
      query: String(targetRoute.query || "")
    };
    if (targetRoute) this.sidebarActivationTargetRevision = (this.sidebarActivationTargetRevision || 0) + 1;
    if (this.sidebarActivationPromise) return await this.sidebarActivationPromise;
    const activation = (async () => {
      let leaf2 = this.app.workspace.getLeavesOfType(VIEW_TYPE_CST_SIDEBAR)[0];
      if (!leaf2) {
        if (Platform.isMobile) leaf2 = this.app.workspace.getLeaf("tab");
        else leaf2 = this.app.workspace.getRightLeaf(false) || this.app.workspace.getLeaf("tab");
        const initialRoute = this.sidebarActivationTarget;
        if (initialRoute) this.pendingSidebarRoutes.set(leaf2, initialRoute);
        try {
          await leaf2.setViewState({ type: VIEW_TYPE_CST_SIDEBAR, active: true });
        } finally {
          this.pendingSidebarRoutes.delete(leaf2);
        }
      }
      const view = leaf2?.view;
      if (view instanceof CSTSidebarView) {
        let appliedRevision = -1;
        const applyLatestRoute = async (force = false) => {
          while (force || appliedRevision !== (this.sidebarActivationTargetRevision || 0)) {
            const revision = this.sidebarActivationTargetRevision || 0;
            const route = this.sidebarActivationTarget;
            if (route) await view.prepareForReveal(route);
            else if (force || appliedRevision < 0) await view.prepareForReveal();
            appliedRevision = revision;
            force = false;
          }
        };
        await applyLatestRoute(true);
        await this.app.workspace.revealLeaf(leaf2);
        await applyLatestRoute();
      } else {
        await this.app.workspace.revealLeaf(leaf2);
      }
      return leaf2;
    })();
    this.sidebarActivationPromise = activation;
    try {
      return await activation;
    } finally {
      if (this.sidebarActivationPromise === activation) {
        this.sidebarActivationPromise = null;
        this.sidebarActivationTarget = null;
      }
    }
  }
  async activateSidebarAt(specialty = "", surgeon2 = "") {
    return await this.activateSidebar({ specialty, surgeon: surgeon2, query: "" });
  }
  openNewCase(presetSpecialty = "", presetSurgeon = "") {
    new NewCaseModal(this, { presetSpecialty, presetSurgeon }).open();
  }
  openNewSurgeon(presetSpecialty = "") {
    new NewSurgeonModal(this, presetSpecialty).open();
  }
  async renderRootDashboard(el) {
    const specialties = this.getSpecialties();
    const caseEntries = await this.caseEntries();
    const usableEntries = caseEntries.filter((entry) => entry.usable);
    const actions = el.createDiv({ cls: "cst-actions" });
    const add = actions.createEl("button", { text: "+ New Case" });
    add.onclick = () => this.openNewCase();
    const quick = actions.createEl("button", { text: "Templates" });
    quick.onclick = () => this.navigateFromUI("Templates", () => this.openPath(this.p("Admin/Backend/Templates.md")));
    const stats = el.createDiv({ cls: "cst-admin-summary" });
    this.addStat(stats, "Specialties", specialties.length);
    this.addStat(stats, "Surgeons", this.getSpecialties().reduce((n, s) => n + this.getSurgeons(s).length, 0));
    this.addStat(stats, "Cases", usableEntries.length);
    this.addStat(stats, "Pending review", caseEntries.length - usableEntries.length);
    const table = el.createEl("table", { cls: "cst-table" });
    const hr = table.createEl("tr");
    ["Specialty", "Surgeons", "Cases"].forEach((x) => hr.createEl("th", { text: x }));
    for (const specialty of specialties) {
      const tr = table.createEl("tr");
      const td = tr.createEl("td");
      const a = td.createEl("a", { text: specialty, href: "#" });
      a.onclick = (e) => {
        e.preventDefault();
        this.navigateFromUI(`Open ${specialty}`, () => this.openPath(this.specialtyGraphPath(specialty)));
      };
      tr.createEl("td", { text: String(this.getSurgeons(specialty).length) });
      tr.createEl("td", { text: String(usableEntries.filter((entry) => entry.context.specialty === specialty).length) });
    }
    el.createEl("h3", { text: "Recent cases" });
    const recent = caseEntries.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime).slice(0, 8);
    const ul = el.createEl("ul");
    for (const entry of recent) {
      const f = entry.file;
      const c = entry.context;
      const li = ul.createEl("li");
      const label = entry.usable ? `${c.surgeon} — ${f.basename}` : `Pending review — ${f.basename}`;
      const a = li.createEl("a", { text: label, href: "#", cls: entry.usable ? "" : "cst-warning" });
      a.onclick = (e) => {
        e.preventDefault();
        this.navigateFromUI(`Open ${f.basename}`, () => this.openFile(f));
      };
    }
  }
  async renderSpecialtyDashboard(el, ctx) {
    const node = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(node instanceof TFile)) return;
    const fm = await this.fileFrontmatter(node);
    const specialty = fm.specialty || node.basename;
    const surgeons = this.getSurgeons(specialty);
    const cases = (await this.caseEntries()).filter((entry) => entry.usable && entry.context.specialty === specialty).map((entry) => entry.file);
    const actions = el.createDiv({ cls: "cst-actions" });
    const add = actions.createEl("button", { text: `+ New ${specialty} Case` });
    add.onclick = () => this.openNewCase(specialty, "");
    const addSurgeon = actions.createEl("button", { text: "+ New Surgeon" });
    addSurgeon.onclick = () => this.openNewSurgeon(specialty);
    const stats = el.createDiv({ cls: "cst-admin-summary" });
    this.addStat(stats, "Surgeons", surgeons.length);
    this.addStat(stats, "Cases", cases.length);
    const ul = el.createEl("ul");
    for (const surgeon2 of surgeons) {
      const li = ul.createEl("li");
      const a = li.createEl("a", { text: surgeon2, href: "#" });
      a.onclick = (e) => {
        e.preventDefault();
        this.navigateFromUI(`Open ${surgeon2}`, () => this.openPath(this.surgeonGraphPath(specialty, surgeon2)));
      };
      const count = cases.filter((f) => this.caseContext(f)?.surgeon === surgeon2).length;
      li.createSpan({ text: ` · ${count} case${count === 1 ? "" : "s"}`, cls: "cst-muted" });
    }
    el.createEl("h3", { text: "Recent cases" });
    const recent = cases.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 8);
    const recentUl = el.createEl("ul");
    for (const f of recent) {
      const c = this.caseContext(f);
      const li = recentUl.createEl("li");
      const a = li.createEl("a", { text: `${c.surgeon} — ${f.basename}`, href: "#" });
      a.onclick = (e) => {
        e.preventDefault();
        this.navigateFromUI(`Open ${f.basename}`, () => this.openFile(f));
      };
    }
  }
  async renderCaseHeaderBlock(el, ctx) {
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;
    if (await this.renderArchivedHeader(el, file)) return;
    const identity = await this.caseIdentityStatus(file);
    if (!identity) return;
    const c = identity.context;
    el.empty();
    el.addClass("cst-live-header");
    if (!identity.usable) {
      el.dataset.cstSpecialty = "";
      el.dataset.cstSurgeon = "";
      el.createDiv({
        cls: "cst-live-header-row cst-warning",
        text: identity.mismatch ? "Surgeon profile withheld · case identity mismatch" : "Surgeon profile withheld · case metadata unavailable"
      });
      const stored = identity.missingMetadata ? "Stored identity is incomplete." : `Stored: ${identity.storedSpecialty} / ${identity.storedSurgeon}.`;
      el.createEl("p", {
        cls: "cst-warning",
        text: `${stored} Path: ${c.specialty} / ${c.surgeon}. This case remains unchanged and needs review after Sync.`
      });
      const actions = el.createDiv({ cls: "cst-actions" });
      const review = actions.createEl("button", { text: "Open Pending Reviews" });
      review.onclick = () => this.navigateFromUI("Open Pending Reviews", () => this.openPath(this.p("Admin/Data/Pending Review.md")));
      this.addCaseDeleteButton(el, actions, file);
      return;
    }
    el.dataset.cstSpecialty = c.specialty;
    el.dataset.cstSurgeon = c.surgeon;
    await this.populateCaseHeader(el, c);
    if (this.caseTemplateProvenance) {
      try {
        const provenance = await this.caseTemplateProvenance(file);
        if (provenance.created.name && provenance.created.name !== "manual") {
          const created = `${provenance.created.name} ${provenance.created.version}`.trim();
          const current = provenance.current ? ` · Current: ${provenance.current.name} ${provenance.current.version}` : "";
          el.createDiv({ cls: "cst-live-header-meta cst-template-provenance", text: `Created with ${created}${current}` });
        }
      } catch (error) {
        console.error("CST template provenance display", error);
      }
    }
  }
  refreshSurgeonHeaderDisplays(specialty, surgeon2, data = null) {
    const gloves = formatGloves(data?.gloves || "Unknown");
    const gown = data?.gown || "Unknown";
    const legend = gloveLegend2(data?.gloves, this.settings);
    const music = String(data?.music || "").trim();
    for (const doc of this.workspaceDocuments()) {
      doc.querySelectorAll(".cst-live-header").forEach((el) => {
        if (el.dataset.cstSpecialty === specialty && el.dataset.cstSurgeon === surgeon2) {
          const row = el.querySelector(".cst-live-header-row");
          if (row) row.textContent = `${surgeon2} · ${gloves} · ${gown}`;
          const syncLine = (selector, text, className) => {
            let line = el.querySelector(selector);
            if (!text) {
              line?.remove();
              return;
            }
            if (!line) {
              line = doc.createElement("div");
              line.className = className;
              el.insertBefore(line, el.querySelector(".cst-actions"));
            }
            line.textContent = text;
          };
          syncLine(".cst-live-header-glove-key", legend, "cst-live-header-meta cst-live-header-glove-key");
          syncLine(".cst-live-header-music", music ? `Music: ${music}` : "", "cst-live-header-meta cst-live-header-music");
        }
      });
    }
  }
  async populateCaseHeader(el, ctx) {
    const data = await this.getSurgeonData(ctx.specialty, ctx.surgeon, { createIfMissing: false });
    const available = !!data?.cst_id && !data?.unavailable;
    el.dataset.cstSpecialty = available ? ctx.specialty : "";
    el.dataset.cstSurgeon = available ? ctx.surgeon : "";
    const gloves = formatGloves(data?.gloves || "Unknown");
    const gown = data?.gown || "Unknown";
    const legend = available ? gloveLegend2(data?.gloves, this.settings) : "";
    const music = available ? String(data?.music || "").trim() : "";
    const row = el.createDiv({
      cls: `cst-live-header-row${available ? "" : " cst-warning"}`,
      text: available ? `${ctx.surgeon} · ${gloves} · ${gown}` : `${ctx.surgeon} · profile unavailable (Sync pending)`
    });
    if (legend) el.createDiv({ cls: "cst-live-header-meta cst-live-header-glove-key", text: legend });
    if (music) el.createDiv({ cls: "cst-live-header-meta cst-live-header-music", text: `Music: ${music}` });
    if (!available) {
      el.createEl("p", {
        text: "The surgeon registry record is not available on this device. Profile actions are paused; the case note has not been changed.",
        cls: "cst-warning"
      });
    }
    const actions = el.createDiv({ cls: "cst-actions" });
    const open = actions.createEl("button", { text: `Open ${ctx.surgeon}` });
    open.onclick = async () => {
      try {
        await this.activateSidebarAt(ctx.specialty, ctx.surgeon);
      } catch (e) {
        new Notice(`CST could not open ${ctx.surgeon}: ${e.message || e}`);
      }
    };
    open.disabled = !available;
    if (!available) open.setAttribute("title", "Wait for the surgeon registry record to sync before opening the profile.");
    const add = actions.createEl("button", { text: `+ New ${ctx.surgeon} Case` });
    add.onclick = () => this.openNewCase(ctx.specialty, ctx.surgeon);
    add.disabled = !available;
    if (!available) add.setAttribute("title", "Wait for the surgeon registry record to sync before creating another case.");
    this.addCaseDeleteButton(el, actions, ctx.file);
  }
  async renderSurgeonProfile(el, ctx) {
    const node = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(node instanceof TFile)) return;
    this.addHomeButton(el);
    const raw = await this.app.vault.read(node);
    const fm = Object.assign(
      {},
      this.app.metadataCache.getFileCache(node)?.frontmatter || {},
      parseFrontmatterObject(raw)
    );
    const graphRoot = this.p("_Graph/Surgeons") + "/";
    const rel = node.path.startsWith(graphRoot) ? node.path.slice(graphRoot.length).replace(/\.md$/i, "") : "";
    const pathParts = rel.split("/").filter(Boolean);
    const specialty = String(fm.specialty || pathParts[0] || "").trim();
    const surgeon2 = String(fm.surgeon || pathParts[1] || node.basename).trim();
    if (!specialty || !surgeon2) {
      el.createEl("p", { text: "Surgeon identity is unavailable. Wait for Sync to finish or repair this generated node.", cls: "cst-warning" });
      return;
    }
    const data = await this.getSurgeonData(specialty, surgeon2, { createIfMissing: false });
    if (!data || data.unavailable) {
      el.createEl("p", { text: "Surgeon registry unavailable. Wait for Sync to finish before editing this profile.", cls: "cst-warning" });
      return;
    }
    el.addClass("cst-profile-card");
    const title = el.createDiv({ cls: "cst-profile-title", text: `${surgeon2} · ${formatGloves(data.gloves)} · ${data.gown}` });
    const grid = el.createDiv({ cls: "cst-modal-grid" });
    grid.createEl("label", { text: "Gloves" });
    const glove = makeInput(grid, { value: data.gloves });
    glove.onkeydown = exitSingleLineOnEnter;
    addGloveHelp(grid, this.settings);
    grid.createEl("label", { text: "Gown" });
    const gown = makeSelect(grid, "Gown");
    for (const g of GOWNS2) addOption(gown, g);
    gown.value = data.gown;
    grid.createEl("label", { text: "Music preferences" });
    const music = makeInput(grid, { value: data.music || "", placeholder: "Optional" });
    music.onkeydown = exitSingleLineOnEnter;
    let expectedFingerprint = this.surgeonRecordFingerprint(data);
    let dirtyGloves = false;
    let dirtyGown = false;
    let dirtyMusic = false;
    glove.oninput = () => {
      dirtyGloves = true;
    };
    gown.onchange = () => {
      dirtyGown = true;
    };
    music.oninput = () => {
      dirtyMusic = true;
    };
    const actions = el.createDiv({ cls: "cst-actions" });
    const save = actions.createEl("button", { text: "Save profile" });
    save.onclick = async () => {
      if (save.disabled) return;
      save.disabled = true;
      try {
        if (this.settings.initialized && !await this.quickStructureCheck()) throw new Error("Profile editing is paused until Sync finishes.");
        if (!dirtyGloves && !dirtyGown && !dirtyMusic) {
          new Notice("No profile changes to save.");
          return;
        }
        const updated = await this.updateSurgeonProfileExpected(specialty, surgeon2, {
          gloves: glove.value,
          gown: gown.value,
          music: music.value,
          dirtyGloves,
          dirtyGown,
          dirtyMusic
        }, expectedFingerprint);
        expectedFingerprint = this.surgeonRecordFingerprint(updated);
        dirtyGloves = false;
        dirtyGown = false;
        dirtyMusic = false;
        title.setText(`${surgeon2} · ${formatGloves(updated.gloves)} · ${updated.gown}`);
        glove.value = updated.gloves;
        gown.value = updated.gown;
        music.value = updated.music || "";
        new Notice(`${surgeon2} profile saved.`);
      } catch (e) {
        new Notice(e.message || String(e));
      } finally {
        if (save.isConnected) save.disabled = false;
      }
    };
    const add = actions.createEl("button", { text: `+ New ${surgeon2} Case` });
    add.onclick = () => this.openNewCase(specialty, surgeon2);
  }
  async renderCaseList(el, ctx) {
    const node = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(node instanceof TFile)) return;
    const raw = await this.app.vault.read(node);
    const fm = Object.assign(
      {},
      this.app.metadataCache.getFileCache(node)?.frontmatter || {},
      parseFrontmatterObject(raw)
    );
    const graphRoot = this.p("_Graph/Surgeons") + "/";
    const rel = node.path.startsWith(graphRoot) ? node.path.slice(graphRoot.length).replace(/\.md$/i, "") : "";
    const pathParts = rel.split("/").filter(Boolean);
    const specialty = String(fm.specialty || pathParts[0] || "").trim();
    const surgeon2 = String(fm.surgeon || pathParts[1] || "").trim();
    if (!specialty || !surgeon2) {
      el.createEl("em", { text: "Surgeon identity unavailable while Sync is loading." });
      return;
    }
    const cases = (await this.caseEntries()).filter((entry) => entry.usable && entry.context.specialty === specialty && entry.context.surgeon === surgeon2).map((entry) => entry.file).sort((a, b) => compareCSTNames(a.basename, b.basename));
    if (!cases.length) {
      el.createEl("em", { text: "No cases yet." });
      return;
    }
    const ul = el.createEl("ul");
    for (const f of cases) {
      const li = ul.createEl("li");
      const a = li.createEl("a", { text: f.basename, href: "#" });
      a.onclick = (e) => {
        e.preventDefault();
        this.navigateFromUI(`Open ${f.basename}`, () => this.openFile(f));
      };
    }
    el.createEl("p", { text: `${cases.length} case${cases.length === 1 ? "" : "s"}`, cls: "cst-muted" });
  }
  addStat(container, label, value) {
    const s = container.createDiv({ cls: "cst-stat" });
    s.createEl("strong", { text: String(value) });
    s.createSpan({ text: label });
  }
  async renderHealth(el) {
    const h = await this.scanHealth();
    const stats = el.createDiv({ cls: "cst-admin-summary" });
    this.addStat(stats, "Specialties", h.specialties);
    this.addStat(stats, "Surgeons", h.surgeons);
    this.addStat(stats, "Cases", h.cases);
    this.addStat(stats, "Missing IDs", h.missingIds);
    this.addStat(stats, "Path mismatches", h.pathMismatches);
    this.addStat(stats, "Missing graph nodes", h.missingGraph);
    this.addStat(stats, "Old templates", h.outdatedTemplates);
    this.addStat(stats, "Template issues", h.templateIssues);
    this.addStat(stats, "Missing gloves", h.missingGloves);
    this.addStat(stats, "Unknown gowns", h.unknownGowns);
    this.addStat(stats, "Invalid gloves", h.invalidGloves);
    this.addStat(stats, "Duplicate surgeon candidates", h.duplicateSurgeons.length);
    const actions = el.createDiv({ cls: "cst-actions" });
    const repair = actions.createEl("button", { text: "Preview / Repair Backend" });
    repair.onclick = () => this.navigateFromUI("Open Backend Repair", () => this.openPath(this.p("Admin/Backend/Repair.md")));
    if (h.issues.length) {
      el.createEl("h3", { text: "Problems" });
      const ul = el.createEl("ul");
      for (const [type, path] of h.issues.slice(0, 100)) ul.createEl("li", { text: `${type}: ${path}` });
    }
  }
  async renderVerification(el) {
    const items = await this.verificationItems();
    const table = el.createEl("table", { cls: "cst-table" });
    const hr = table.createEl("tr");
    ["Type", "Specialty", "Surgeon / Note", "Last verified"].forEach((x) => hr.createEl("th", { text: x }));
    for (const item of items) {
      const tr = table.createEl("tr");
      tr.createEl("td", { text: item.kind });
      tr.createEl("td", { text: item.specialty });
      const td = tr.createEl("td");
      const a = td.createEl("a", { text: item.kind === "Case" ? `${item.surgeon} — ${item.name}` : item.name, href: "#" });
      a.onclick = (e) => {
        e.preventDefault();
        this.navigateFromUI(`Open ${item.file.basename}`, () => this.openFile(item.file));
      };
      tr.createEl("td", { text: item.verified ? moment(item.verified).format("YYYY-MM-DD HH:mm") : "Never" });
    }
  }
  async renderActivity(el) {
    const files = this.allCaseFiles().sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 50);
    const ul = el.createEl("ul");
    for (const f of files) {
      const c = this.caseContext(f);
      const li = ul.createEl("li");
      const a = li.createEl("a", { text: `${c.surgeon} — ${f.basename}`, href: "#" });
      a.onclick = (e) => {
        e.preventDefault();
        this.navigateFromUI(`Open ${f.basename}`, () => this.openFile(f));
      };
      li.createSpan({ text: ` · ${moment(f.stat.mtime).format("YYYY-MM-DD HH:mm")}`, cls: "cst-muted" });
    }
  }
  async renderSystem(el) {
    const h = await this.scanHealth();
    const stats = el.createDiv({ cls: "cst-admin-summary" });
    this.addStat(stats, "Plugin", PLUGIN_VERSION);
    this.addStat(stats, "Schema", SCHEMA_VERSION);
    this.addStat(stats, "Cases", h.cases);
    this.addStat(stats, "Surgeons", h.surgeons);
    el.createEl("p", { text: `Content root: ${this.contentRoot}` });
    el.createEl("p", { text: `Backend root: ${this.settings.backendRoot}` });
    el.createEl("p", { text: "Core dependencies: Obsidian only. No Templater, QuickAdd, Meta Bind, or Dataview required." });
    el.createEl("p", { text: `Platform: ${Platform.isIosApp ? "iOS" : Platform.isAndroidApp ? "Android" : Platform.isMobile ? "Mobile" : "Desktop"}` });
    el.createEl("p", { text: `Surgeon data: ${this.surgeonRegistryPath()} (Markdown, mobile-safe)` });
    const actions = el.createDiv({ cls: "cst-actions" });
    const graph = actions.createEl("button", { text: "Rebuild Graph" });
    graph.onclick = async () => {
      const result = await this.runAdminAction("Rebuild Graph", () => this.rebuildGraph(), { stage: "graph rebuild" });
      if (result !== null) new Notice("Graph rebuilt.");
    };
    const repair = actions.createEl("button", { text: "Run Full Repair" });
    repair.onclick = async () => this.runAdminAction("Repair Entire Backend", () => this.repairAll(true), { stage: "system full repair" });
  }
  async renderSurgeonAdmin(el) {
    const actions = el.createDiv({ cls: "cst-actions" });
    const add = actions.createEl("button", { text: "+ New Surgeon" });
    add.onclick = () => this.openNewSurgeon();
    const rename = actions.createEl("button", { text: "Rename Surgeon" });
    rename.onclick = () => new SurgeonActionModal(this, "rename").open();
    const move = actions.createEl("button", { text: "Move Surgeon" });
    move.onclick = () => new SurgeonActionModal(this, "move").open();
    const merge = actions.createEl("button", { text: "Merge Surgeons" });
    merge.onclick = () => new SurgeonActionModal(this, "merge").open();
    const rows = [];
    for (const specialty of this.getSpecialties()) for (const surgeon2 of this.getSurgeons(specialty)) rows.push({ specialty, surgeon: surgeon2 });
    rows.sort((a, b) => a.surgeon.localeCompare(b.surgeon) || a.specialty.localeCompare(b.specialty));
    const ul = el.createEl("ul");
    for (const row of rows) {
      const data = await this.getSurgeonData(row.specialty, row.surgeon, { createIfMissing: false });
      const li = ul.createEl("li");
      const graph = this.surgeonGraphPath(row.specialty, row.surgeon);
      const a = li.createEl("a", { text: `${row.specialty} — ${row.surgeon}`, href: "#" });
      a.onclick = (e) => {
        e.preventDefault();
        this.navigateFromUI(`Open ${surgeon} graph`, () => this.openPath(graph));
      };
      li.createSpan({ text: ` · ${formatGloves(data?.gloves || "Unknown")} · ${data?.gown || "Unknown"}`, cls: "cst-muted" });
    }
    const dups = this.duplicateSurgeonCandidates();
    if (dups.length) {
      el.createEl("h3", { text: "Potential duplicate names" });
      for (const group of dups) el.createEl("p", { text: group.join(" / "), cls: "cst-warning" });
    }
  }
  async renderCaseAdmin(el) {
    const h = await this.scanHealth();
    const stats = el.createDiv({ cls: "cst-admin-summary" });
    this.addStat(stats, "Cases", h.cases);
    this.addStat(stats, "Old template versions", h.outdatedTemplates);
    this.addStat(stats, "Template issues", h.templateIssues);
    this.addStat(stats, "Missing IDs", h.missingIds);
    this.addStat(stats, "Path mismatches", h.pathMismatches);
    const actions = el.createDiv({ cls: "cst-actions" });
    const add = actions.createEl("button", { text: "+ New Case" });
    add.onclick = () => this.openNewCase();
    const quick = actions.createEl("button", { text: "Quick Case" });
    quick.onclick = () => new QuickCaseModal(this).open();
  }
  async renderTemplateAdmin(el) {
    if (this.exampleCase() && !this.settings.templateReviewCompleted) {
      const guide = el.createDiv({ cls: "cst-onboarding-card" });
      guide.createEl("h3", { text: "Getting started: review templates" });
      guide.createEl("p", { text: "Templates control the starting sections for new cases. Open any template below, review or edit it, then return here and mark this step complete." });
      const complete = guide.createEl("button", { text: "Mark template review complete", cls: "mod-cta" });
      complete.onclick = async () => {
        this.settings.templateReviewCompleted = true;
        await this.saveSettings();
        guide.remove();
        new Notice("Template review completed.");
      };
    }
    const prefix = this.p("_Templates/Cases") + "/";
    const examplePath = this.exampleTemplatePath?.() || this.p("_Templates/Cases/Example.md");
    const defaultPath = this.p("_Templates/Cases/_Default.md");
    const rank = (file) => file.path === examplePath ? 0 : file.path === defaultPath ? 1 : 2;
    const files = this.filesWithin(this.p("_Templates/Cases"), "md").filter((f) => this.isTemplatePath(f.path)).sort((a, b) => rank(a) - rank(b) || compareCSTNames(a.path, b.path));
    const table = el.createEl("table", { cls: "cst-table" });
    const hr = table.createEl("tr");
    ["Template", "Current version", "Action"].forEach((x) => hr.createEl("th", { text: x }));
    for (const f of files) {
      const version = await this.ensureTemplateVersion(f, false);
      const tr = table.createEl("tr");
      tr.createEl("td", { text: f.path === examplePath ? "Example template" : f.path === defaultPath ? "Default" : f.path.slice(prefix.length).replace(/\.md$/, "") });
      tr.createEl("td", { text: `v${version || 1}` });
      const td = tr.createEl("td");
      const b = td.createEl("button", { text: "Open" });
      b.onclick = () => this.navigateFromUI(`Open ${f.basename}`, () => this.openFile(f));
    }
  }
  async renderReferenceAdmin(el) {
    const root = this.app.vault.getAbstractFileByPath(this.p("References"));
    const stats = el.createDiv({ cls: "cst-admin-summary" });
    if (root instanceof TFolder) {
      for (const child of root.children.filter((x) => x instanceof TFolder)) {
        const count = this.filesWithin(child.path, "md").length;
        this.addStat(stats, child.name, count);
      }
    }
    const actions = el.createDiv({ cls: "cst-actions" });
    const create = actions.createEl("button", { text: "+ Create Reference" });
    create.onclick = () => new ReferenceModal(this).open();
    const imp = actions.createEl("button", { text: "Import Section From Case" });
    imp.onclick = () => new ImportSectionModal(this).open();
  }
  async renderGraphAdmin(el) {
    const specialties = this.getSpecialties();
    el.createEl("p", { text: `${specialties.length} specialty branches.` });
    const actions = el.createDiv({ cls: "cst-actions" });
    const rebuild = actions.createEl("button", { text: "Rebuild Generated Graph" });
    rebuild.onclick = async () => {
      const result = await this.runAdminAction("Rebuild Generated Graph", () => this.rebuildGraph(), { stage: "graph admin rebuild" });
      if (result !== null) new Notice("Generated graph rebuilt.");
    };
    const root = actions.createEl("button", { text: "Open Graph Root" });
    root.onclick = () => this.navigateFromUI("Open specialty graph", () => this.openPath(this.p("_Graph/Specialties.md")));
  }
  async renderRepairAdmin(el) {
    const h = await this.scanHealth();
    el.createEl("p", { text: `Scan: ${h.cases} cases, ${h.surgeons} surgeons, ${h.issues.length} direct structural issues.` });
    el.createEl("p", { text: "Repair tools snapshot affected files first. Structural repair may update hidden metadata/generated graph infrastructure but does not intentionally rewrite substantive case sections.", cls: "cst-muted" });
    const actions = el.createDiv({ cls: "cst-actions" });
    const headers = actions.createEl("button", { text: "Repair Live Surgeon Headers" });
    headers.onclick = () => new HeaderRepairModal(this).open();
    const repair = actions.createEl("button", { text: "Snapshot + Repair Entire Backend", cls: "mod-cta" });
    repair.onclick = async () => {
      repair.disabled = true;
      try {
        const result = await this.runAdminAction("Repair Entire Backend", () => this.repairAll(true), { stage: "backend repair" });
        if (result) {
          try {
            el.empty();
            await this.renderRepairAdmin(el);
          } catch (error) {
            console.error("CST repair view refresh", error);
            el.empty();
            el.createEl("p", { text: `Repair completed, but this view could not refresh: ${error.message || error}. Reopen the note to retry.`, cls: "cst-warning" });
          }
        }
      } finally {
        if (repair.isConnected) repair.disabled = false;
      }
    };
  }
  async renderMetadataAdmin(el) {
    const h = await this.scanHealth();
    const stats = el.createDiv({ cls: "cst-admin-summary" });
    this.addStat(stats, "Missing IDs", h.missingIds);
    this.addStat(stats, "Path mismatches", h.pathMismatches);
    this.addStat(stats, "Invalid glove formats", h.invalidGloves);
    this.addStat(stats, "Missing graph nodes", h.missingGraph);
    el.createEl("p", { text: "Backend properties are intentionally hidden in managed notes. Use Source mode only when you intentionally need raw YAML.", cls: "cst-muted" });
  }
  async renderMigrations(el) {
    el.createEl("p", { text: `Current plugin schema: ${SCHEMA_VERSION}` });
    el.createEl("p", { text: `Installed schema: ${this.settings.schemaVersion || 0}` });
    const done = await this.migrationCompleted(MIGRATION_V011);
    const done12 = await this.migrationCompleted(MIGRATION_V012);
    const done13 = await this.migrationCompleted(MIGRATION_V013);
    const failures = this.settings.migrationFailures || {};
    const rows = [
      { id: MIGRATION_V011, label: "v0.1.1 live surgeon header migration", done, blocked: false, run: () => this.migrateV011() },
      { id: MIGRATION_V012, label: "v0.1.2 mobile registry/header repair", done: done12, blocked: !done, run: () => this.migrateV012() },
      { id: MIGRATION_V013, label: "v0.1.3 app/migration workspace setup", done: done13 && done12, needsRevalidation: done13 && !done12, blocked: !done12, run: () => this.migrateV013() }
    ];
    for (const row of rows) {
      const failure = failures[row.id];
      const status = row.done ? "Completed" : row.needsRevalidation ? "Needs Revalidation" : failure ? "Failed" : row.blocked ? "Blocked" : "Pending";
      const line = el.createDiv({ cls: `cst-migration-status cst-status-${status.toLowerCase().replace(/\s+/g, "-")}` });
      line.createEl("strong", { text: `${row.done ? "✓" : row.needsRevalidation ? "!" : failure ? "!" : row.blocked ? "×" : "○"} ${row.label}` });
      line.createEl("span", { text: status, cls: row.done ? "cst-success" : "cst-warning" });
      if (failure) {
        line.createEl("div", { text: `${failure.summary || "Migration failed"}${failure.diagnosticId ? ` · ${failure.diagnosticId}` : ""}`, cls: "cst-muted" });
        if (failure.diagnosticId) {
          const copy = line.createEl("button", { text: "Copy diagnostic for ChatGPT" });
          copy.onclick = async () => {
            copy.disabled = true;
            try {
              let diagnosticText = failure.diagnosticText || "";
              if (!diagnosticText) {
                const path = this.p(`Admin/Logs/Diagnostics/${failure.diagnosticId}.md`);
                const f = this.app.vault.getAbstractFileByPath(path);
                if (f instanceof TFile) {
                  this.assertVaultFilePath(f, path, "Diagnostic file moved or was replaced before it could be copied.");
                  const raw = await this.app.vault.read(f);
                  this.assertVaultFilePath(f, path, "Diagnostic file moved or was replaced while it was being copied.");
                  const m = /```text\n([\s\S]*?)\n```/m.exec(raw);
                  diagnosticText = m?.[1] || raw;
                }
              }
              if (!diagnosticText) {
                new Notice("Diagnostic text is unavailable. Retry the migration to generate a fresh diagnostic.");
                return;
              }
              const ok = await copyText(diagnosticText);
              new Notice(ok ? "CST diagnostic copied." : "Could not copy automatically.");
            } catch (error) {
              console.error("CST diagnostic copy", error);
              new Notice(`Could not copy the diagnostic: ${error.message || error}`);
            } finally {
              if (copy.isConnected) copy.disabled = false;
            }
          };
        }
      }
      if (!row.done && !row.blocked) {
        const run = line.createEl("button", { text: failure ? "Retry" : "Run" });
        run.onclick = async () => {
          run.disabled = true;
          try {
            await this.runMigrationFromUI(row.id, row.label, row.run);
            try {
              el.empty();
              await this.renderMigrations(el);
            } catch (error) {
              console.error("CST migration view refresh", error);
              el.empty();
              el.createEl("p", { text: `Migration action finished, but this view could not refresh: ${error.message || error}. Reopen the note to retry.`, cls: "cst-warning" });
            }
          } finally {
            if (run.isConnected) run.disabled = false;
          }
        };
      }
    }
    const actions = el.createDiv({ cls: "cst-actions" });
    const headerRepair = actions.createEl("button", { text: "Repair Live Surgeon Headers" });
    headerRepair.onclick = () => new HeaderRepairModal(this).open();
    const legacyTemplates = actions.createEl("button", { text: "Legacy Template Migration", cls: "mod-cta" });
    legacyTemplates.onclick = () => new LegacyTemplateMigrationModal(this).open();
    const repair = actions.createEl("button", { text: "Apply Current Schema Safely" });
    repair.onclick = async () => {
      const result = await this.runAdminAction("Apply Current Schema Safely", () => this.repairAll(true), { stage: "schema repair" });
      if (result) {
        await this.runAdminAction("Save Current Schema State", async () => {
          const previousSchema = this.settings.schemaVersion;
          const previousPlugin = this.settings.pluginVersion;
          this.settings.schemaVersion = SCHEMA_VERSION;
          this.settings.pluginVersion = PLUGIN_VERSION;
          try {
            await this.saveSettings();
          } catch (error) {
            this.settings.schemaVersion = previousSchema;
            this.settings.pluginVersion = previousPlugin;
            throw error;
          }
          new Notice("Current schema applied safely.");
          return true;
        }, { stage: "schema settings save" });
      }
    };
  }
  async refreshGloveSettingsDisplays() {
    const guidance = glove_settings_exports.gloveHelpText(this.settings);
    for (const doc of this.workspaceDocuments()) {
      doc.querySelectorAll(".cst-glove-help").forEach((help) => {
        const lines = help.querySelectorAll("div");
        if (lines[0]) lines[0].textContent = guidance.legend;
        if (lines[1]) lines[1].textContent = `Sizes: ${guidance.sizes}. ${guidance.description} Example: "${guidance.example}".`;
      });
      const visible = /* @__PURE__ */ new Map();
      doc.querySelectorAll(".cst-live-header").forEach((header) => {
        const specialty = header.dataset.cstSpecialty, surgeon2 = header.dataset.cstSurgeon;
        if (specialty && surgeon2) visible.set(`${specialty}\0${surgeon2}`, { specialty, surgeon: surgeon2 });
      });
      for (const { specialty, surgeon: surgeon2 } of visible.values()) {
        const data = await this.getSurgeonData(specialty, surgeon2, { createIfMissing: false });
        if (data && !data.unavailable) this.refreshSurgeonHeaderDisplays(specialty, surgeon2, data);
      }
    }
    this.scheduleGraphRebuild?.(500);
  }
  async renderConfig(el) {
    const rows = [
      ["Content root", this.contentRoot],
      ["Backend root", this.settings.backendRoot]
    ];
    return glove_settings_exports.renderGloveSettingsEditor(el, this, { rows });
  }
  async createSurgeon({ specialty, surgeon: surgeon2, gloves = "Unknown", gown = "", music = "" }) {
    return await this.serializedAdminMutation(async () => {
      if (this.settings.initialized && !await this.quickStructureCheck()) {
        throw new Error("Surgeon creation is paused until this device has a complete CST vault.");
      }
      specialty = validatedPathSegment(specialty, "Specialty");
      surgeon2 = validatedPathSegment(surgeon2, "Surgeon", { person: true });
      if (!this.getSpecialties().includes(specialty)) throw new Error(`Specialty not found: ${specialty}`);
      const collision = this.getSurgeons(specialty).find((existing) => existing.normalize("NFC").toLocaleLowerCase() === surgeon2.normalize("NFC").toLocaleLowerCase());
      if (collision) throw new Error(`${collision} already exists in ${specialty}.`);
      gloves = normalizeGloves2(gloves || "Unknown", this.settings);
      gown = GOWNS2.includes(gown) ? gown : this.settings.defaultGown;
      const folderPath = validatePortableVaultPath(cleanPath(this.contentRoot, specialty, surgeon2), "New surgeon path");
      validatePortableVaultPath(this.specialtyGraphPath(specialty), "Surgeon specialty graph path");
      validatePortableVaultPath(this.surgeonGraphPath(specialty, surgeon2), "Surgeon graph path");
      validatePortableVaultPath(this.surgeonRegistryPath(), "Surgeon registry path");
      if (this.app.vault.getAbstractFileByPath(folderPath)) throw new Error(`Target already exists: ${folderPath}`);
      const existingRecord = await this.getRegistrySurgeon(specialty, surgeon2, { create: false });
      if (existingRecord.data) throw new Error("A surgeon registry record with this name already exists.");
      const record = this.adminRegistryRecord({
        cst_id: id("surgeon"),
        aliases: [],
        gloves,
        gown,
        music: String(music || "").trim(),
        schema_version: SCHEMA_VERSION,
        created: nowISO(),
        last_verified: nowISO()
      }, specialty, surgeon2);
      let folderCreated = false;
      let recordCreated = false;
      try {
        this.markInternalCreate(folderPath);
        try {
          await this.app.vault.createFolder(folderPath);
          folderCreated = true;
        } catch (error) {
          this.ignoreCreateUntil.delete(normalizePath(folderPath));
          const raced = this.app.vault.getAbstractFileByPath(folderPath);
          if (raced instanceof TFolder) {
            throw new Error(`${surgeon2}'s folder appeared from another window or device. It was preserved; wait for Sync, then retry.`);
          }
          throw error;
        }
        await this.applyAdminRegistryChanges([
          { specialty, surgeon: surgeon2, expected: null, data: record }
        ]);
        recordCreated = true;
      } catch (error) {
        const rollbackErrors = [];
        if (recordCreated) {
          try {
            await this.applyAdminRegistryChanges([
              { specialty, surgeon: surgeon2, expected: record, data: null }
            ]);
          } catch (rollback) {
            rollbackErrors.push(rollback.message || String(rollback));
          }
        }
        if (folderCreated) {
          try {
            const currentRecord = await this.getRegistrySurgeon(specialty, surgeon2, { create: false });
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            if (!currentRecord.data && folder instanceof TFolder) {
              await this.quarantineEmptySurgeonFolder(folder, folderPath, "New surgeon folder rollback");
            }
          } catch (rollback) {
            rollbackErrors.push(rollback.message || String(rollback));
          }
        }
        if (rollbackErrors.length) throw new Error(`${error.message || error} Rollback needs review: ${rollbackErrors.join(" | ")}`);
        throw error;
      }
      await this.finishAdminMutation("Create surgeon", `${specialty} / ${surgeon2}`);
      return { specialty, surgeon: surgeon2, data: record };
    });
  }
  async createSpecialty(name) {
    return await this.serializedAdminMutation(async () => {
      if (this.settings.initialized && !await this.quickStructureCheck()) {
        throw new Error("Specialty creation is paused until this device has a complete CST vault.");
      }
      const requested = validatedPathSegment(name, "Specialty");
      const collision = this.getSpecialties().find((existing) => existing.normalize("NFC").toLocaleLowerCase() === requested.normalize("NFC").toLocaleLowerCase());
      const specialty = collision || requested;
      const folderPath = cleanPath(this.contentRoot, specialty);
      const templatePath = this.p(`_Templates/Cases/${specialty}.md`);
      validatePortableVaultPath(folderPath, "Specialty folder path");
      validatePortableVaultPath(templatePath, "Specialty template path");
      validatePortableVaultPath(this.specialtyGraphPath(specialty), "Specialty graph path");
      validatePortableVaultPath(cleanPath(this.templateVersionRoot(templatePath), "v1.md"), "Specialty template version path");
      const existingFolder = this.app.vault.getAbstractFileByPath(folderPath);
      if (existingFolder && !(existingFolder instanceof TFolder)) {
        throw new Error(`Specialty path exists and is not a folder: ${folderPath}`);
      }
      if (!(existingFolder instanceof TFolder)) await this.ensureFolder(folderPath);
      const defaultFile = this.app.vault.getAbstractFileByPath(this.p("_Templates/Cases/_Default.md"));
      let templateFile = this.app.vault.getAbstractFileByPath(templatePath);
      if (templateFile && !(templateFile instanceof TFile)) {
        throw new Error(`Specialty template path exists and is not a file: ${templatePath}`);
      }
      if (!(templateFile instanceof TFile)) {
        const body = defaultFile instanceof TFile ? await this.app.vault.read(defaultFile) : sectionBody(specialty);
        templateFile = await this.ensureTextFile(templatePath, body);
      }
      await this.ensureTemplateVersion(templateFile, false);
      await this.ensureSpecialtyNode(specialty);
      await this.finishAdminMutation("Create specialty", specialty);
      return specialty;
    });
  }
  async serializedAdminMutation(operation) {
    const run = (this.adminMutationQueue || Promise.resolve()).catch(() => {
    }).then(operation);
    this.adminMutationQueue = run.catch(() => {
    });
    return await run;
  }
  adminRegistryRecord(data, specialty, surgeon2) {
    const record = this.portableSurgeonRecord(data, specialty, surgeon2);
    if (!record) return null;
    record.specialty = specialty;
    record.surgeon = canonicalPersonName(surgeon2);
    if (!String(record.cst_id || "").trim()) {
      throw new Error(`Surgeon registry ID is missing for ${specialty} / ${surgeon2}. Repair the registry before retrying Admin.`);
    }
    if (!String(record.created || "").trim()) {
      throw new Error(`Surgeon creation timestamp is missing for ${specialty} / ${surgeon2}. Repair the registry before retrying Admin.`);
    }
    try {
      record.gloves = normalizeGloves2(record.gloves || "Unknown", this.settings);
    } catch (error) {
      throw new Error(`Invalid glove profile for ${specialty} / ${surgeon2}: ${error.message || error}`);
    }
    if (!GOWNS2.includes(record.gown)) {
      throw new Error(`Invalid gown profile for ${specialty} / ${surgeon2}.`);
    }
    return record;
  }
  async applyAdminRegistryChanges(changes, options = {}) {
    await this.mutateSurgeonRegistry((registry) => {
      for (const change of changes) {
        if (!Object.prototype.hasOwnProperty.call(change, "expected")) continue;
        const key4 = this.surgeonKey(change.specialty, change.surgeon);
        const current = registry.surgeons[key4] || null;
        const expected = change.expected == null ? null : JSON.parse(JSON.stringify(change.expected));
        if (JSON.stringify(current) !== JSON.stringify(expected)) {
          throw new Error(`Surgeon registry changed during the Admin operation at ${change.specialty} / ${change.surgeon}.`);
        }
      }
      for (const change of changes) {
        const key4 = this.surgeonKey(change.specialty, change.surgeon);
        if (change.data == null) delete registry.surgeons[key4];
        else registry.surgeons[key4] = JSON.parse(JSON.stringify(change.data));
      }
    }, options);
  }
  async captureAdminCasePreimages(files) {
    return await Promise.all((files || []).map(async (file) => {
      const text = await this.app.vault.read(file);
      const missing = ["cst_id", "created", "last_verified"].filter((key4) => !frontmatterTopLevelScalar(text, key4));
      if (missing.length) {
        throw new Error(`Admin stopped because ${file.path} is missing persistent metadata (${missing.join(", ")}). Run Initialize / Repair before moving surgeon cases.`);
      }
      return { name: file.name, oldPath: file.path, text };
    }));
  }
  async routeAdminCases(preimages, folderPath, changedTexts, surgeonData = null) {
    if (!surgeonData) throw new Error("Admin routing requires a validated surgeon record.");
    for (const preimage of preimages) {
      const path = cleanPath(folderPath, preimage.name);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) throw new Error(`Case disappeared during Admin routing: ${path}`);
      const context = contextFromPath(path, this.contentRoot);
      if (!context || context.depth !== 3 || !context.surgeon) {
        throw new Error(`Admin routing produced an invalid case path: ${path}`);
      }
      const planned = this.adminRegistryRecord(surgeonData, context.specialty, context.surgeon);
      if (!planned?.cst_id) throw new Error(`Surgeon registry ID is missing for ${context.specialty} / ${context.surgeon}.`);
      const graphNode = this.surgeonGraphPath(context.specialty, context.surgeon).replace(/\.md$/, "");
      const routedText = setFrontmatterScalars(preimage.text, {
        cst_type: "case",
        specialty: context.specialty,
        surgeon: context.surgeon,
        surgeon_id: planned.cst_id,
        graph_parent: `[[${graphNode}|${context.surgeon}]]`,
        schema_version: SCHEMA_VERSION
      }, ["surgeon_profile", "gloves", "gown"]);
      const changed2 = await this.replaceFileTextExpected(
        file,
        preimage.text,
        routedText,
        `Admin routing stopped because ${path} was edited after the operation began. The newer edit was left untouched. It may also have moved or been replaced.`,
        path
      );
      if (changed2) changedTexts.set(path, routedText);
    }
  }
  async restoreAdminCasePreimages(preimages, folderPath, changedTexts) {
    const conflicts = [];
    for (const preimage of preimages) {
      const path = cleanPath(folderPath, preimage.name);
      const expectedText = changedTexts.get(path);
      if (expectedText == null) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        conflicts.push(`missing ${path}`);
        continue;
      }
      try {
        await this.replaceFileTextExpected(
          file,
          expectedText,
          preimage.text,
          `Case rollback stopped because ${path} was edited or moved after Admin routing.`,
          path
        );
      } catch (_) {
        conflicts.push(`edited ${path}`);
      }
    }
    if (conflicts.length) throw new Error(`Case rollback stopped for ${conflicts.join(", ")}.`);
  }
  async finishAdminMutation(action, detail) {
    try {
      await this.rebuildGraph();
    } catch (error) {
      console.error(`CST ${action} graph refresh`, error);
      this.scheduleGraphRebuild(500);
      new Notice(`${action} completed; generated graph refresh is pending.`);
    }
    try {
      await this.appendLog(action, detail);
    } catch (error) {
      console.error(`CST ${action} audit log`, error);
      new Notice(`${action} completed; its audit-log entry is pending.`);
    }
  }
  adminSnapshotLabel(action, ...identityParts) {
    const prefix = (safeFileName(action) || "admin").slice(0, 32);
    return `${prefix}-${shortHash(identityParts.join("\0")).slice(2)}`;
  }
  validateRelocatedDescendantPaths(folder, oldRoot, newRoot) {
    const stack = folder instanceof TFolder ? [...folder.children] : [];
    const inventory = [];
    while (stack.length) {
      const item = stack.pop();
      if (!normalizePath(String(item.path || "")).startsWith(oldRoot + "/")) {
        throw new Error("Relocated child inventory escaped the expected surgeon folder.");
      }
      const relative = item.path.slice(oldRoot.length).replace(/^\/+/, "");
      validatePortableVaultPath(cleanPath(newRoot, relative), "Relocated child path");
      inventory.push(`${item instanceof TFolder ? "folder" : item instanceof TFile ? "file" : "item"}:${relative}`);
      if (item instanceof TFolder) stack.push(...item.children);
    }
    inventory.sort((a, b) => a.localeCompare(b));
    return JSON.stringify(inventory);
  }
  async relocateSurgeonTransaction(sourceSpecialty, sourceSurgeon, targetSpecialty, targetSurgeon, action) {
    if (this.settings.initialized && !await this.quickStructureCheck()) {
      throw new Error(`${action} is paused until this device has a complete CST vault.`);
    }
    sourceSpecialty = validatedPathSegment(sourceSpecialty, "Source specialty");
    sourceSurgeon = validatedPathSegment(sourceSurgeon, "Source surgeon", { person: true });
    targetSpecialty = validatedPathSegment(targetSpecialty, "Destination specialty");
    targetSurgeon = validatedPathSegment(targetSurgeon, "Destination surgeon", { person: true });
    if (!this.getSpecialties().includes(targetSpecialty)) throw new Error(`Specialty not found: ${targetSpecialty}`);
    if (sourceSpecialty === targetSpecialty && sourceSurgeon === targetSurgeon) throw new Error("Source and target are the same.");
    const oldFolderPath = validatePortableVaultPath(cleanPath(this.contentRoot, sourceSpecialty, sourceSurgeon), "Source surgeon path");
    const newFolderPath = validatePortableVaultPath(cleanPath(this.contentRoot, targetSpecialty, targetSurgeon), "Destination surgeon path");
    const folder = this.app.vault.getAbstractFileByPath(oldFolderPath);
    if (!(folder instanceof TFolder)) throw new Error("Surgeon folder not found.");
    if (this.app.vault.getAbstractFileByPath(newFolderPath)) throw new Error(`Target already exists: ${newFolderPath}`);
    const sourceInventory = this.validateRelocatedDescendantPaths(folder, oldFolderPath, newFolderPath);
    const sourceState = await this.getRegistrySurgeon(sourceSpecialty, sourceSurgeon, { create: false });
    const targetState = await this.getRegistrySurgeon(targetSpecialty, targetSurgeon, { create: false });
    if (!sourceState.data) throw new Error("Source surgeon registry record not found.");
    if (targetState.data) throw new Error("Destination surgeon registry record already exists.");
    const sourceRecord = JSON.parse(JSON.stringify(sourceState.data));
    const targetRecord = targetState.data ? JSON.parse(JSON.stringify(targetState.data)) : null;
    const movedRecord = this.adminRegistryRecord(sourceRecord, targetSpecialty, targetSurgeon);
    const aliases = new Set(Array.isArray(movedRecord.aliases) ? movedRecord.aliases : []);
    if (sourceSurgeon !== targetSurgeon) aliases.add(sourceSurgeon);
    movedRecord.aliases = [...aliases];
    movedRecord.last_verified = nowISO();
    movedRecord.schema_version = SCHEMA_VERSION;
    const sourceCases = this.allCaseFiles().filter((file) => {
      const context = this.caseContext(file);
      return context?.specialty === sourceSpecialty && context?.surgeon === sourceSurgeon;
    });
    const preimages = await this.captureAdminCasePreimages(sourceCases);
    const affected = [...sourceCases];
    const registryFile = this.app.vault.getAbstractFileByPath(this.surgeonRegistryPath());
    if (registryFile instanceof TFile) affected.push(registryFile);
    const sessionFile = this.app.vault.getAbstractFileByPath(this.migrationSessionPath());
    if (sessionFile instanceof TFile) {
      const session = await this.loadMigrationSession();
      const checkpoint = session?.lastSaved;
      const checkpointInFolder = checkpoint?.path && (checkpoint.path === oldFolderPath || checkpoint.path.startsWith(oldFolderPath + "/"));
      const checkpointOnProfile = !!checkpoint?.registryBackupPath && checkpoint.specialty === sourceSpecialty && checkpoint.surgeon === sourceSurgeon;
      if (checkpointInFolder || checkpointOnProfile) {
        throw new Error("Rename/move paused because Undo Last Saved Migration depends on this surgeon. Undo it first, or save another migration to replace that checkpoint.");
      }
      affected.push(sessionFile);
    }
    await this.snapshotFiles(this.adminSnapshotLabel(action, sourceSpecialty, sourceSurgeon, targetSpecialty, targetSurgeon), affected);
    const postSnapshotFolder = this.app.vault.getAbstractFileByPath(oldFolderPath);
    if (postSnapshotFolder !== folder || this.validateRelocatedDescendantPaths(postSnapshotFolder, oldFolderPath, newFolderPath) !== sourceInventory) {
      throw new Error(`${action} stopped because ${oldFolderPath} changed while its snapshot was being created. The late content was preserved; retry after Sync settles.`);
    }
    let folderRenamed = false;
    let sessionRemapped = false;
    let registryMoved = false;
    const changedHashes = /* @__PURE__ */ new Map();
    try {
      const assertRenamedInventory = () => {
        const current = this.app.vault.getAbstractFileByPath(newFolderPath);
        if (current !== folder || !(current instanceof TFolder) || this.validateRelocatedDescendantPaths(current, newFolderPath, oldFolderPath) !== sourceInventory) {
          throw new Error(`${action} stopped because the surgeon folder gained, lost, or replaced content during relocation. All detected content will be preserved during rollback.`);
        }
        return current;
      };
      await this.renameVaultItem(folder, newFolderPath, oldFolderPath);
      folderRenamed = true;
      assertRenamedInventory();
      sessionRemapped = await this.remapMigrationSessionPrefix(oldFolderPath, newFolderPath);
      assertRenamedInventory();
      await this.applyAdminRegistryChanges([
        { specialty: sourceSpecialty, surgeon: sourceSurgeon, expected: sourceRecord, data: null },
        { specialty: targetSpecialty, surgeon: targetSurgeon, expected: targetRecord, data: movedRecord }
      ]);
      registryMoved = true;
      assertRenamedInventory();
      await this.routeAdminCases(preimages, newFolderPath, changedHashes, movedRecord);
      assertRenamedInventory();
    } catch (error) {
      const rollbackErrors = [];
      try {
        await this.restoreAdminCasePreimages(preimages, newFolderPath, changedHashes);
      } catch (rollback) {
        rollbackErrors.push(rollback.message || String(rollback));
      }
      if (registryMoved) {
        try {
          await this.applyAdminRegistryChanges([
            { specialty: sourceSpecialty, surgeon: sourceSurgeon, expected: null, data: sourceRecord },
            { specialty: targetSpecialty, surgeon: targetSurgeon, expected: movedRecord, data: targetRecord }
          ]);
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      if (sessionRemapped) {
        try {
          await this.remapMigrationSessionPrefix(newFolderPath, oldFolderPath);
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      if (folderRenamed) {
        try {
          const currentFolder = this.app.vault.getAbstractFileByPath(newFolderPath);
          const originalPathItem = this.app.vault.getAbstractFileByPath(oldFolderPath);
          if (currentFolder instanceof TFolder && !originalPathItem) {
            await this.renameVaultItem(currentFolder, oldFolderPath, newFolderPath);
          } else if (!(originalPathItem instanceof TFolder) || currentFolder) {
            throw new Error("Folder rollback could not prove that the surgeon folder returned to its original path.");
          }
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      this.scheduleGraphRebuild(250);
      if (rollbackErrors.length) {
        throw new Error(`${error.message || error} Rollback needs review: ${rollbackErrors.join(" | ")}`);
      }
      throw error;
    }
    await this.finishAdminMutation(action, `${sourceSpecialty}/${sourceSurgeon} -> ${targetSpecialty}/${targetSurgeon}`);
    return true;
  }
  async renameSurgeon(specialty, oldName, newName) {
    return await this.serializedAdminMutation(() => this.relocateSurgeonTransaction(specialty, oldName, specialty, newName, "Rename surgeon"));
  }
  async moveSurgeon(specialty, surgeon2, destination) {
    return await this.serializedAdminMutation(() => this.relocateSurgeonTransaction(specialty, surgeon2, destination, surgeon2, "Move surgeon"));
  }
  async mergeSurgeonsTransaction(sourceSpecialty, sourceSurgeon, targetSpecialty, targetSurgeon) {
    if (this.settings.initialized && !await this.quickStructureCheck()) {
      throw new Error("Surgeon merge is paused until this device has a complete CST vault.");
    }
    sourceSpecialty = validatedPathSegment(sourceSpecialty, "Source specialty");
    sourceSurgeon = validatedPathSegment(sourceSurgeon, "Source surgeon", { person: true });
    targetSpecialty = validatedPathSegment(targetSpecialty, "Target specialty");
    targetSurgeon = validatedPathSegment(targetSurgeon, "Target surgeon", { person: true });
    if (sourceSpecialty === targetSpecialty && sourceSurgeon === targetSurgeon) throw new Error("Source and target are the same.");
    const sourceFolderPath = validatePortableVaultPath(cleanPath(this.contentRoot, sourceSpecialty, sourceSurgeon), "Source surgeon path");
    const targetFolderPath = validatePortableVaultPath(cleanPath(this.contentRoot, targetSpecialty, targetSurgeon), "Target surgeon path");
    const sourceFolder = this.app.vault.getAbstractFileByPath(sourceFolderPath);
    const targetFolder = this.app.vault.getAbstractFileByPath(targetFolderPath);
    if (!(sourceFolder instanceof TFolder)) throw new Error("Source surgeon folder not found.");
    if (!(targetFolder instanceof TFolder)) throw new Error("Target surgeon folder not found.");
    const sourceCases = this.allCaseFiles().filter((file) => {
      const context = this.caseContext(file);
      return context?.specialty === sourceSpecialty && context?.surgeon === sourceSurgeon;
    });
    const sourceCasePaths = new Set(sourceCases.map((file) => file.path));
    const unexpected = sourceFolder.children.filter((item) => !sourceCasePaths.has(item.path));
    if (unexpected.length) {
      throw new Error(`Merge stopped: source folder contains non-case item${unexpected.length === 1 ? "" : "s"} (${unexpected.map((item) => item.name).join(", ")}). Move or review ${unexpected.length === 1 ? "it" : "them"} first.`);
    }
    const targetNames = new Set(targetFolder.children.map((item) => item.name.normalize("NFC").toLocaleLowerCase()));
    const movedPaths = /* @__PURE__ */ new Map();
    for (const file of sourceCases) {
      const foldedName = file.name.normalize("NFC").toLocaleLowerCase();
      if (targetNames.has(foldedName)) {
        throw new Error(`Merge conflict: ${file.name} already exists for target surgeon.`);
      }
      targetNames.add(foldedName);
      movedPaths.set(file.path, validatePortableVaultPath(cleanPath(targetFolderPath, file.name), "Merged case path"));
    }
    const sourceState = await this.getRegistrySurgeon(sourceSpecialty, sourceSurgeon, { create: false });
    const targetState = await this.getRegistrySurgeon(targetSpecialty, targetSurgeon, { create: false });
    if (!sourceState.data || !targetState.data) throw new Error("Both source and target surgeon registry records are required.");
    const sourceRecord = JSON.parse(JSON.stringify(sourceState.data));
    const targetRecord = JSON.parse(JSON.stringify(targetState.data));
    const sourcePortable = this.adminRegistryRecord(sourceRecord, sourceSpecialty, sourceSurgeon);
    const sessionFile = this.app.vault.getAbstractFileByPath(this.migrationSessionPath());
    const session = sessionFile instanceof TFile ? await this.loadMigrationSession() : null;
    if (session?.lastSaved) {
      const checkpoint = session.lastSaved;
      const touchesMovedCase = sourceCasePaths.has(checkpoint.path);
      const touchesMergedProfile = !!checkpoint.registryBackupPath && (checkpoint.specialty === sourceSpecialty && checkpoint.surgeon === sourceSurgeon || checkpoint.specialty === targetSpecialty && checkpoint.surgeon === targetSurgeon);
      if (touchesMovedCase || touchesMergedProfile) {
        throw new Error("Merge paused because Undo Last Saved Migration depends on the source or target surgeon. Undo it first, or save another migration to replace that checkpoint.");
      }
    }
    const mergedCandidate = JSON.parse(JSON.stringify(targetRecord));
    if ((!mergedCandidate.gloves || mergedCandidate.gloves === "Unknown") && sourcePortable.gloves) mergedCandidate.gloves = sourcePortable.gloves;
    if ((!mergedCandidate.gown || mergedCandidate.gown === "Unknown") && sourcePortable.gown) mergedCandidate.gown = sourcePortable.gown;
    if (!String(mergedCandidate.music || "").trim() && sourcePortable.music) mergedCandidate.music = sourcePortable.music;
    mergedCandidate.aliases = [.../* @__PURE__ */ new Set([...Array.isArray(mergedCandidate.aliases) ? mergedCandidate.aliases : [], ...sourcePortable.aliases, sourceSurgeon])];
    mergedCandidate.last_verified = nowISO();
    mergedCandidate.schema_version = SCHEMA_VERSION;
    const merged = this.adminRegistryRecord(mergedCandidate, targetSpecialty, targetSurgeon);
    const preimages = await this.captureAdminCasePreimages(sourceCases);
    const affected = [...sourceCases];
    const registryFile = this.app.vault.getAbstractFileByPath(this.surgeonRegistryPath());
    if (registryFile instanceof TFile) affected.push(registryFile);
    if (sessionFile instanceof TFile) affected.push(sessionFile);
    await this.snapshotFiles(this.adminSnapshotLabel("merge-surgeon", sourceSpecialty, sourceSurgeon, targetSpecialty, targetSurgeon), affected);
    return await this.executeMergeSurgeonsTransaction({
      sourceSpecialty,
      sourceSurgeon,
      targetSpecialty,
      targetSurgeon,
      sourceFolderPath,
      targetFolderPath,
      movedPaths,
      sourceRecord,
      targetRecord,
      merged,
      preimages
    });
  }
  async executeMergeSurgeonsTransaction(plan) {
    const {
      sourceSpecialty,
      sourceSurgeon,
      targetSpecialty,
      targetSurgeon,
      sourceFolderPath,
      targetFolderPath,
      movedPaths,
      sourceRecord,
      targetRecord,
      merged,
      preimages
    } = plan;
    const completedMoves = [];
    const changedHashes = /* @__PURE__ */ new Map();
    let sessionRemapped = false;
    let registryMerged = false;
    let sourceQuarantined = false;
    try {
      for (const [oldPath, newPath] of movedPaths) {
        const file = this.app.vault.getAbstractFileByPath(oldPath);
        if (!(file instanceof TFile)) throw new Error(`Case disappeared during merge: ${oldPath}`);
        await this.renameVaultItem(file, newPath, oldPath);
        completedMoves.push({ oldPath, newPath });
      }
      sessionRemapped = await this.remapMigrationSessionPaths((path) => movedPaths.get(path) || path);
      await this.applyAdminRegistryChanges([
        { specialty: sourceSpecialty, surgeon: sourceSurgeon, expected: sourceRecord, data: null },
        { specialty: targetSpecialty, surgeon: targetSurgeon, expected: targetRecord, data: merged }
      ]);
      registryMerged = true;
      await this.routeAdminCases(preimages, targetFolderPath, changedHashes, merged);
      const emptied = this.app.vault.getAbstractFileByPath(sourceFolderPath);
      if (!(emptied instanceof TFolder) || emptied.children.length) {
        throw new Error("Source surgeon folder was not empty after moving its cases.");
      }
      await this.quarantineEmptySurgeonFolder(emptied, sourceFolderPath, "Merged source surgeon folder");
      sourceQuarantined = true;
      if (this.app.vault.getAbstractFileByPath(sourceFolderPath) instanceof TFolder) {
        throw new Error("Source surgeon folder could not be removed.");
      }
    } catch (error) {
      const rollbackErrors = [];
      if (sourceQuarantined || !(this.app.vault.getAbstractFileByPath(sourceFolderPath) instanceof TFolder)) {
        try {
          await this.ensureFolder(sourceFolderPath);
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      try {
        await this.restoreAdminCasePreimages(preimages, targetFolderPath, changedHashes);
      } catch (rollback) {
        rollbackErrors.push(rollback.message || String(rollback));
      }
      if (registryMerged) {
        try {
          await this.applyAdminRegistryChanges([
            { specialty: sourceSpecialty, surgeon: sourceSurgeon, expected: null, data: sourceRecord },
            { specialty: targetSpecialty, surgeon: targetSurgeon, expected: merged, data: targetRecord }
          ]);
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      if (sessionRemapped) {
        const reverse = new Map([...movedPaths].map(([oldPath, newPath]) => [newPath, oldPath]));
        try {
          await this.remapMigrationSessionPaths((path) => reverse.get(path) || path);
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      for (const move of [...completedMoves].reverse()) {
        try {
          const file = this.app.vault.getAbstractFileByPath(move.newPath);
          const originalPathItem = this.app.vault.getAbstractFileByPath(move.oldPath);
          if (file instanceof TFile && !originalPathItem) {
            await this.renameVaultItem(file, move.oldPath, move.newPath);
          } else if (!(originalPathItem instanceof TFile) || file) {
            throw new Error(`Case rollback could not prove that ${move.oldPath} was restored.`);
          }
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      this.scheduleGraphRebuild(250);
      if (rollbackErrors.length) {
        throw new Error(`${error.message || error} Rollback needs review: ${rollbackErrors.join(" | ")}`);
      }
      throw error;
    }
    await this.finishAdminMutation("Merge surgeon", `${sourceSpecialty}/${sourceSurgeon} -> ${targetSpecialty}/${targetSurgeon}`);
    return true;
  }
  async mergeSurgeons(sourceSpecialty, sourceSurgeon, targetSpecialty, targetSurgeon) {
    return await this.serializedAdminMutation(() => this.mergeSurgeonsTransaction(sourceSpecialty, sourceSurgeon, targetSpecialty, targetSurgeon));
  }
  canonicalCaseHeading(label) {
    const raw = String(label || "").trim().replace(/:$/, "").replace(/\s+/g, " ");
    const key4 = raw.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    const aliases = {
      "case": "Case",
      "overview": "Case",
      "case overview": "Case",
      "position": "Position",
      "positioning": "Position",
      "tips": "Tips",
      "pearls": "Tips",
      "cst pearls": "Tips",
      "pearls tips": "Tips",
      "drape": "Drape",
      "draping": "Drape",
      "drapes": "Drape",
      "mayo": "Mayo",
      "mayo stand": "Mayo",
      "on mayo": "Mayo",
      "basin": "Basin",
      "back table": "Back Table",
      "backtable": "Back Table",
      "back table setup": "Back Table",
      "trays": "Trays",
      "tray": "Trays",
      "sets": "Trays",
      "set": "Trays",
      "instrument trays": "Trays",
      "instrument sets": "Trays",
      "instruments": "Trays",
      "sutures": "Sutures",
      "suture": "Sutures",
      "closure": "Sutures",
      "closures": "Sutures",
      "closing": "Sutures",
      "dressing": "Dressings",
      "bandage": "Dressings",
      "mayo flow": "Mayo Flow",
      "mayo sequence": "Mayo Flow",
      "mayo order": "Mayo Flow",
      "procedure order": "Mayo Flow",
      "procedure flow": "Mayo Flow",
      "dressings": "Dressings",
      "notes": "Notes",
      "note": "Notes",
      "misc": "Notes",
      "miscellaneous": "Notes",
      "other": "Notes",
      "other notes": "Notes"
    };
    return aliases[key4] || raw;
  }
  async inferSpineVariant(file, rawText = null, expectedPath = "") {
    expectedPath = normalizePath(String(expectedPath || file?.path || ""));
    this.assertVaultFilePath(file, expectedPath, `Spine template inference stopped because ${expectedPath} moved or was replaced.`);
    let raw = rawText;
    if (raw == null) raw = await this.app.vault.read(file);
    this.assertVaultFilePath(file, expectedPath, `Spine template inference stopped because ${expectedPath} moved or was replaced.`);
    const cached = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const fm = Object.assign({}, cached, parseFrontmatterObject(raw));
    const t = String(fm.template || "");
    if (/^Spine-(Cervical|Lumbar|Thoracic)$/i.test(t)) return t.split("-")[1].replace(/^./, (c) => c.toUpperCase());
    const name = (expectedPath.split("/").pop() || "").replace(/\.md$/i, "").toLowerCase();
    const hit = [];
    if (/\b(acdf|pcdf|cervical|c[1-7](?:\s*[-/]\s*c?[1-7])?)\b/i.test(name)) hit.push("Cervical");
    if (/\b(tlif|plif|alif|llif|xlif|lumbar|l[1-5](?:\s*[-/]\s*l?[1-5])?)\b/i.test(name)) hit.push("Lumbar");
    if (/\b(thoracic|t(?:[1-9]|1[0-2])(?:\s*[-/]\s*t?(?:[1-9]|1[0-2]))?)\b/i.test(name)) hit.push("Thoracic");
    return [...new Set(hit)].length === 1 ? [...new Set(hit)][0] : "";
  }
  parseCaseSections(text) {
    const legacy = this.parseLegacyGloveRegion(text);
    if (legacy) text = this.removeLegacyMdGlovePreamble(text, legacy);
    const title = this.findCaseTitle(text);
    if (!title) return { title: "", sections: /* @__PURE__ */ new Map(), unknown: [] };
    let body = text.slice(title.end);
    body = body.replace(/```cst-surgeon-header\s*\n?```/g, "");
    const heads = [];
    const re = /^(#{1,6})\s+(.+?)\s*:?[ \t]*$/gm;
    let m;
    while (m = re.exec(body)) {
      const label = String(m[2] || "").trim().replace(/:$/, "");
      if (/^(gloves|md|pa)$/i.test(label)) continue;
      heads.push({ start: m.index, end: m.index + m[0].length, level: m[1].length, label });
    }
    const sections2 = /* @__PURE__ */ new Map();
    const unknown = [];
    const first = heads[0]?.start ?? body.length;
    const preamble = body.slice(0, first).trim();
    if (preamble) sections2.set("Case", preamble);
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i];
      const next = heads[i + 1]?.start ?? body.length;
      const content = body.slice(h.end, next).trim();
      if (!content) continue;
      const canon = this.canonicalCaseHeading(h.label);
      if (sections2.has(canon)) sections2.set(canon, `${sections2.get(canon)}

${content}`.trim());
      else sections2.set(canon, content);
    }
    return { title: title.text.replace(/^[ \t]{0,3}#\s+/, "").trim(), sections: sections2, unknown };
  }
  hydrateTemplateBody(templateBody, parsed) {
    const knownTemplateLabels = /* @__PURE__ */ new Set();
    const lines = String(templateBody || "").split("\n");
    const out = [];
    for (const line of lines) {
      out.push(line);
      const m = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
      if (!m) continue;
      const label = this.canonicalCaseHeading(m[2]);
      knownTemplateLabels.add(label);
      const content = parsed.sections.get(label);
      if (content) {
        out.push("", content, "");
        parsed.sections.delete(label);
      }
    }
    const leftovers = [...parsed.sections.entries()].filter(([k, v]) => v && k !== "Case");
    if (leftovers.length) {
      out.push("", "### Legacy preserved sections", "");
      for (const [label, content] of leftovers) out.push(`#### ${label}`, "", content, "");
    }
    return out.join("\n").replace(/\n{4,}/g, "\n\n\n").trim() + "\n";
  }
  async legacyTemplatePlan() {
    const safe = [], ambiguous = [], current = [];
    for (const file of this.allCaseFiles()) {
      const c = this.caseContext(file);
      const raw = await this.app.vault.read(file);
      const fm = Object.assign(
        {},
        this.app.metadataCache.getFileCache(file)?.frontmatter || {},
        parseFrontmatterObject(raw)
      );
      let variant = "";
      if (c.specialty.toLowerCase() === "spine") {
        variant = await this.inferSpineVariant(file, raw);
        if (!variant) {
          ambiguous.push(file);
          continue;
        }
      }
      const t = await this.getTemplate(c.specialty, variant);
      if (fm.template === t.key && fm.template_version === t.version) {
        current.push(file);
        continue;
      }
      safe.push({ file, variant });
    }
    return { safe, ambiguous, current };
  }
  stripFrontmatter(text) {
    const value = String(text || "");
    const front = frontmatterBlock(value);
    return front ? value.slice(front.end) : value;
  }
  normalizeComparable(text) {
    return String(text || "").toLowerCase().replace(/```[\s\S]*?```/g, (m) => m.toLowerCase()).replace(/\s+/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
  }
  migrationTemplateHeadings(templateBody) {
    const out = [];
    for (const line of String(templateBody || "").split("\n")) {
      const m = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
      if (!m) continue;
      const label = String(m[2] || "").trim();
      out.push({ label, level: m[1].length, canonical: this.canonicalCaseHeading(label) });
    }
    return out;
  }
  migrationSuggestedHeading(label, templateHeadings = []) {
    const canon = this.canonicalCaseHeading(label);
    const direct = templateHeadings.find((x) => x.canonical.toLowerCase() === canon.toLowerCase());
    if (direct) return direct.label;
    const key4 = String(label || "").toLowerCase();
    const prefer = (name) => templateHeadings.find((x) => x.canonical === name || x.label === name)?.label || name;
    if (/pearl|tip/.test(key4)) return prefer("Tips");
    if (/position/.test(key4)) return prefer("Position");
    if (/drap/.test(key4)) return prefer("Drape");
    if (/mayo.*flow|sequence|order/.test(key4)) return prefer("Mayo Flow");
    if (/mayo/.test(key4)) return prefer("Mayo");
    if (/basin/.test(key4)) return prefer("Basin");
    if (/back.*table/.test(key4)) return prefer("Back Table");
    if (/tray|set|instrument|equipment|implant|retractor|kerrison|karlin|special.*setup|setup/.test(key4)) return prefer("Trays");
    if (/sutur|clos(?:ing|ure)/.test(key4)) return prefer("Sutures");
    if (/dressings/.test(key4)) return prefer("Dressings");
    if (/dressing|bandage/.test(key4)) return prefer("Dressings");
    return prefer("Notes");
  }
  migrationLabelFromLine(line) {
    let value = String(line || "").trim();
    if (!value) return "";
    let structured = false;
    const markdown = /^(#{1,6})\s+(.+?)\s*$/.exec(value);
    if (markdown) {
      value = markdown[2];
      structured = true;
    }
    const bold = /^\*\*(.+?)\*\*\s*:?[ \t]*$/.exec(value);
    if (bold) {
      value = bold[1];
      structured = true;
    }
    const hasColon = /:\s*$/.test(value);
    value = value.replace(/:\s*$/, "").trim();
    return structured || hasColon ? value : "";
  }
  extractMigrationSectionBody(block, destinationHeading = "") {
    const item = block && typeof block === "object" ? block : { content: block };
    let lines = String(item.content || "").replace(/\r\n?/g, "\n").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return "";
    if (item.special !== "pa") {
      const candidates = [item.label, item.canonical, destinationHeading].filter((label) => label && !String(label).startsWith("__")).map((label) => this.canonicalCaseHeading(this.migrationLabelFromLine(label) || label).toLowerCase());
      const firstLabel = this.migrationLabelFromLine(lines[0]);
      const firstCanonical = firstLabel ? this.canonicalCaseHeading(firstLabel).toLowerCase() : "";
      if (firstCanonical && new Set(candidates).has(firstCanonical)) {
        lines.shift();
        while (lines.length && !lines[0].trim()) lines.shift();
      }
    }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.length ? `${lines.join("\n")}

` : "";
  }
  parseLegacyMigrationBlocks(text, templateBody = "") {
    let body = this.stripFrontmatter(text);
    const legacyGloves = this.parseLegacyGloveRegion(body);
    if (legacyGloves) body = this.removeLegacyMdGlovePreamble(body, legacyGloves);
    body = body.replace(/```cst-surgeon-header\s*\n?[\s\S]*?```/g, "");
    const lines = body.split("\n");
    const templateHeadings = this.migrationTemplateHeadings(templateBody);
    const templateCanonicals = new Set(templateHeadings.map((h) => h.canonical.toLowerCase()));
    let inFence = false, fence = "", title = "";
    const markers = [];
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.replace(/\r$/, "");
      const fenceHit = /^\s*(```|~~~)/.exec(line);
      if (fenceHit) {
        if (!inFence) {
          inFence = true;
          fence = fenceHit[1];
        } else if (fenceHit[1] === fence) {
          inFence = false;
          fence = "";
        }
      }
      if (!inFence) {
        const pa = /^\s*(?:#{1,6}\s*)?(?:\*\*)?PA(?:\*\*)?\s*:\s*(.*?)\s*$/.exec(line);
        if (pa) {
          markers.push({ line: i, level: 6, label: "PA", start: offset, end: offset + line.length, inlineContent: line.trim(), special: "pa" });
          offset += rawLine.length + 1;
          continue;
        }
        const h = /^\s{0,3}(#{1,6})\s+(.+?)\s*:?[ \t]*$/.exec(line);
        const bold = !h ? /^\s*\*\*(.+?)\*\*\s*(:)?\s*$/.exec(line) : null;
        const plain = !h && !bold ? /^\s{0,3}([A-Za-z][A-Za-z0-9/&+()'’., -]{0,79})\s*:\s*$/.exec(line) : null;
        if (h) {
          const label = String(h[2] || "").trim().replace(/:$/, "");
          if (h[1].length === 1 && !title && !/^(gloves|md)$/i.test(label)) title = label;
          else if (!/^(gloves|md)$/i.test(label)) markers.push({ line: i, level: h[1].length, label, start: offset, end: offset + line.length });
        } else if (bold) {
          const rawBoldLabel = String(bold[1] || "").trim();
          const explicitColon = !!bold[2] || /:\s*$/.test(rawBoldLabel);
          const label = rawBoldLabel.replace(/:$/, "");
          const canonical = this.canonicalCaseHeading(label).toLowerCase();
          if (!/^(gloves|md)$/i.test(label) && (explicitColon || templateCanonicals.has(canonical))) {
            markers.push({ line: i, level: 2, label, start: offset, end: offset + line.length });
          }
        } else if (plain) {
          const label = String(plain[1] || "").trim();
          const canonical = this.canonicalCaseHeading(label);
          const previous = markers[markers.length - 1];
          const previousTarget = previous ? this.migrationSuggestedHeading(previous.label, templateHeadings) : "";
          const nestedMayoFlowLabel = canonical === "Mayo" && this.canonicalCaseHeading(previousTarget) === "Mayo Flow";
          if (!/^md$/i.test(label) && !nestedMayoFlowLabel) {
            markers.push({ line: i, level: 2, label, start: offset, end: offset + line.length, special: /^gloves$/i.test(label) ? "gloves" : "" });
          }
        }
      }
      offset += rawLine.length + 1;
    }
    const titleMatch = this.findCaseTitle(body);
    const titleEnd = titleMatch ? titleMatch.end : 0;
    const blocks = [];
    const firstStart = markers[0]?.start ?? body.length;
    const preamble = body.slice(titleEnd, firstStart).trim();
    if (preamble) blocks.push({ id: `b0-${shortHash(preamble)}`, label: "Legacy Preamble", canonical: "__legacy_preamble__", content: preamble, suggested: this.migrationSuggestedHeading("Case", templateHeadings) });
    for (let i = 0; i < markers.length; i++) {
      const h = markers[i];
      const next = markers[i + 1]?.start ?? body.length;
      let content = h.special === "pa" ? body.slice(h.start, next).trim() : body.slice(h.end, next).trim();
      if (!content) continue;
      const canonical = h.special === "pa" ? "__pa_legacy__" : h.special === "gloves" ? "__legacy_gloves__" : this.canonicalCaseHeading(h.label);
      blocks.push({ id: `b${i + 1}-${shortHash(h.label + "\n" + content)}`, label: h.special === "pa" ? "PA" : h.label, canonical, content, suggested: h.special === "pa" ? "Notes" : this.migrationSuggestedHeading(h.label, templateHeadings), special: h.special || "" });
    }
    return { title: title || titleMatch?.text?.replace(/^#\s+/, "").trim() || "", blocks, body, legacyMdRaw: legacyGloves?.mdRaw || "" };
  }
  migrationBaseDestination(title, templateBody) {
    return `# ${title}

${CASE_HEADER_BLOCK}

${String(templateBody || "").trim()}
`;
  }
  normalizeMigrationDestinationHeader(text, fallbackTitle) {
    let body = String(text || "");
    body = body.replace(/\n?```cst-surgeon-header\b[\s\S]*?```\n?/g, "\n");
    let title = this.findCaseTitle(body);
    if (!title) {
      body = `# ${fallbackTitle || "Case"}

${body.replace(/^\s+/, "")}`;
      title = this.findCaseTitle(body);
    }
    if (!title) return body;
    return `${body.slice(0, title.end).replace(/\s*$/, "")}

${CASE_HEADER_BLOCK}

${body.slice(title.end).replace(/^\s+/, "")}`.replace(/\n{4,}/g, "\n\n\n");
  }
  migrationSectionContent(text, heading) {
    text = String(text || "");
    const escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^(#{2,6})\\s+${escaped}\\s*$`, "mi");
    const m = re.exec(text);
    if (!m) return "";
    const level = m[1].length;
    const startAt = m.index + m[0].length;
    const rest = text.slice(startAt);
    const headRe = /^(#{1,6})\s+.+$/gm;
    let hm, endAt = text.length;
    while (hm = headRe.exec(rest)) {
      if (hm[1].length <= level) {
        endAt = startAt + hm.index;
        break;
      }
    }
    return text.slice(startAt, endAt).trim();
  }
  insertMigrationSection(text, heading, content) {
    text = String(text || "");
    const body = String(content || "").replace(/^\s*\n/, "").replace(/\s*$/, "");
    if (!body) return text;
    const escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^(#{2,6})\\s+${escaped}\\s*$`, "mi");
    const m = re.exec(text);
    if (!m) {
      return `${text.replace(/\s*$/, "")}

## ${heading}

${body}
`;
    }
    const level = m[1].length;
    const startAt = m.index + m[0].length;
    const rest = text.slice(startAt);
    const headRe = /^(#{1,6})\s+.+$/gm;
    let hm, endAt = text.length;
    while (hm = headRe.exec(rest)) {
      if (hm[1].length <= level) {
        endAt = startAt + hm.index;
        break;
      }
    }
    const existing = text.slice(startAt, endAt).trim();
    const merged = existing ? `${existing}

${body}` : body;
    return `${text.slice(0, startAt)}

${merged}

${text.slice(endAt).replace(/^\s+/, "")}`;
  }
  moveMigrationBlock(destination, block, target) {
    const heading = target || block?.suggested || "Notes";
    const body = this.extractMigrationSectionBody(block, heading);
    if (!body) return String(destination || "");
    if (heading === "Keep as Custom Heading") {
      return `${String(destination || "").replace(/\s*$/, "")}

## ${block.label}

${body}`;
    }
    return this.insertMigrationSection(destination || "", heading, body);
  }
  migrationUnresolved(sourceText, destinationText, templateBody, working = {}) {
    if (this.collectLegacyTransferLeftovers) return this.collectLegacyTransferLeftovers(sourceText, destinationText, templateBody, working);
    const parsed = this.parseLegacyMigrationBlocks(sourceText, templateBody);
    let remainingDestination = this.normalizeComparable(destinationText);
    const ignored = new Set(working.ignored || []);
    const unresolved = [];
    for (const block of parsed.blocks) {
      if (ignored.has(block.id)) continue;
      const blockNorm = this.normalizeComparable(this.extractMigrationSectionBody(block, block.suggested));
      if (!blockNorm) continue;
      const matchAt = blockNorm ? remainingDestination.indexOf(blockNorm) : -1;
      if (matchAt >= 0) {
        remainingDestination = remainingDestination.slice(0, matchAt) + " ".repeat(blockNorm.length) + remainingDestination.slice(matchAt + blockNorm.length);
        continue;
      }
      unresolved.push(block);
    }
    return unresolved;
  }
  migrationUnmapped(sourceText, destinationText, templateBody, working = {}) {
    return this.migrationUnresolved(sourceText, destinationText, templateBody, working);
  }
  migrationSessionPath() {
    return this.p("Admin/Data/Legacy Migration Session.md");
  }
  migrationStatePath(value, label) {
    const raw = String(value || "");
    const normalized = normalizePath(raw);
    const parts = raw.split("/");
    if (!raw || raw !== normalized || raw.includes("\\") || raw.startsWith("/") || /^[A-Za-z]:/.test(raw) || parts.some((part) => !part || part === "." || part === "..")) {
      throw new Error(`${label} is not a canonical relative vault path.`);
    }
    return validatePortableVaultPath(normalized, label);
  }
  migrationSessionBackupToken(state) {
    const raw = String(state?.sessionId ?? "");
    if (!raw.trim()) throw new Error("The legacy migration session ID is missing.");
    const readable = (safeFileName(raw) || "legacy").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "legacy";
    const hash = shortHash(raw).replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
    return `${readable}-${hash}`;
  }
  migrationLegacyBackupRoot(state) {
    const raw = String(state?.sessionId ?? "");
    const safe = safeFileName(raw);
    const bytes2 = typeof TextEncoder === "function" ? new TextEncoder().encode(raw).length : raw.length;
    if (!raw || safe !== raw || bytes2 > 40 || !/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(raw)) return "";
    return this.migrationStatePath(
      this.p(`Admin/Backups/Legacy Template Migration/${raw}`),
      "Legacy migration backup root"
    );
  }
  migrationSessionBackupRoot(state, { assign = false } = {}) {
    if (!state || typeof state !== "object") throw new Error("The legacy migration session is invalid.");
    const expected = this.migrationStatePath(
      this.p(`Admin/Backups/Legacy Template Migration/${this.migrationSessionBackupToken(state)}`),
      "Legacy migration backup root"
    );
    const persisted = String(state.backupRoot || "");
    if (!persisted) {
      if (assign) state.backupRoot = expected;
      return expected;
    }
    const normalized = this.migrationStatePath(persisted, "Legacy migration backup root");
    const legacy = this.migrationLegacyBackupRoot(state);
    if (normalized !== expected && (!legacy || normalized !== legacy)) {
      throw new Error("The legacy migration backup root is outside this managed migration session.");
    }
    if (assign) state.backupRoot = normalized;
    return normalized;
  }
  migrationUndoBackupPath(state, value, label) {
    const path = this.migrationStatePath(value, label);
    const undoRoot = cleanPath(this.migrationSessionBackupRoot(state), "_Undo");
    if (!path.startsWith(undoRoot + "/")) {
      throw new Error(`${label} is outside this migration session's managed Undo folder.`);
    }
    const leaf2 = path.slice(undoRoot.length + 1);
    if (leaf2.includes("/") || !/^(?:preimage|pre)-[A-Za-z0-9-]{8,80}\.[A-Za-z0-9]{1,12}$/i.test(leaf2)) {
      throw new Error(`${label} is not a managed migration snapshot.`);
    }
    return path;
  }
  migrationSessionText(state) {
    return `---
cst_type: "legacy-migration-session"
schema_version: ${SCHEMA_VERSION}
---

# Legacy Migration Session

Machine-managed resumable migration workspace.

\`\`\`${MIGRATION_STATE_LANG}
${JSON.stringify(state, null, 2)}
\`\`\`
`;
  }
  migrationSessionComparable(state) {
    const copy = JSON.parse(JSON.stringify(state || {}));
    delete copy.revision;
    return JSON.stringify(copy);
  }
  setMigrationSessionBaseline(state, comparable = null) {
    if (!state || typeof state !== "object") return;
    Object.defineProperty(state, "__cstSessionBaseline", {
      value: comparable == null ? this.migrationSessionComparable(state) : String(comparable),
      writable: true,
      configurable: true,
      enumerable: false
    });
  }
  parseMigrationSessionText(text) {
    const re = new RegExp("```" + MIGRATION_STATE_LANG + "\\s*\\r?\\n([\\s\\S]*?)\\r?\\n```", "m");
    const match = re.exec(String(text || ""));
    if (!match) throw new Error("the legacy migration session block is missing or incomplete.");
    try {
      const state = JSON.parse(match[1]);
      if (!state || typeof state !== "object" || !Array.isArray(state.order)) {
        throw new Error("the session JSON does not contain a valid queue");
      }
      if (state.order.some((path) => typeof path !== "string" || !normalizePath(path))) {
        throw new Error("the session queue contains an invalid path");
      }
      if (!state.status || typeof state.status !== "object" || Array.isArray(state.status)) state.status = {};
      if (!state.working || typeof state.working !== "object" || Array.isArray(state.working)) state.working = {};
      state.revision = Math.max(0, Number(state.revision) || 0);
      this.setMigrationSessionBaseline(state);
      return state;
    } catch (error) {
      throw new Error(`the legacy migration session is invalid (${error.message || error}).`);
    }
  }
  async loadMigrationSession() {
    const file = this.app.vault.getAbstractFileByPath(this.migrationSessionPath());
    if (!(file instanceof TFile)) return null;
    return this.parseMigrationSessionText(await this.app.vault.read(file));
  }
  reconcileMigrationSessionState(state) {
    if (!state || typeof state !== "object") return state;
    if (!Array.isArray(state.order)) state.order = [];
    if (!state.status || typeof state.status !== "object") state.status = {};
    if (!state.working || typeof state.working !== "object") state.working = {};
    const seen = /* @__PURE__ */ new Set();
    state.order = (state.order || []).filter((path) => {
      if (seen.has(path) || !state.status?.[path]) return false;
      seen.add(path);
      return true;
    });
    if (!state.currentPath || !state.status?.[state.currentPath]) {
      state.currentPath = this.nextMigrationPath(state, "") || "";
    }
    return state;
  }
  async saveMigrationSession(state) {
    const operation = async () => {
      const expectedBase = state && typeof state === "object" ? state.__cstSessionBaseline : null;
      const snapshot = JSON.parse(JSON.stringify(state || {}));
      const baseRevision = Math.max(0, Number(snapshot.revision) || 0);
      const reconciled = this.reconcileMigrationSessionState(snapshot);
      const path = this.migrationSessionPath();
      await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
      let file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        reconciled.revision = 1;
        const text = this.migrationSessionText(reconciled);
        this.markInternalCreate(path);
        try {
          file = await this.app.vault.create(path, text);
        } catch (error) {
          this.ignoreCreateUntil.delete(normalizePath(path));
          const raced = this.app.vault.getAbstractFileByPath(path);
          if (!(raced instanceof TFile)) throw error;
          const remote = this.parseMigrationSessionText(await this.app.vault.read(raced));
          if (this.migrationSessionComparable(remote) !== this.migrationSessionComparable(reconciled)) {
            throw new Error("A legacy migration session appeared from another window or device. It was preserved; reopen the migration workspace.");
          }
          reconciled.revision = Math.max(0, Number(remote.revision) || 0);
          file = raced;
        }
      } else {
        const assertSessionPath = () => this.assertVaultFilePath(
          file,
          path,
          "The legacy migration session moved or was replaced in another window or device. Reopen the migration workspace."
        );
        assertSessionPath();
        const transform = (current) => {
          assertSessionPath();
          const currentState = this.parseMigrationSessionText(current);
          const currentRevision = Math.max(0, Number(currentState.revision) || 0);
          const currentComparable = this.migrationSessionComparable(currentState);
          const nextComparable = this.migrationSessionComparable(reconciled);
          if (currentComparable === nextComparable) {
            reconciled.revision = currentRevision;
            return current;
          }
          if (currentRevision !== baseRevision || expectedBase != null && String(expectedBase) !== currentComparable) {
            throw new Error("The legacy migration session changed on another window or device. Reopen the migration workspace before saving again.");
          }
          reconciled.revision = currentRevision + 1;
          return this.migrationSessionText(reconciled);
        };
        if (typeof this.app.vault.process === "function") {
          await this.suppress(file, async () => {
            assertSessionPath();
            return await this.app.vault.process(file, transform);
          });
        } else {
          assertSessionPath();
          const current = await this.app.vault.read(file);
          assertSessionPath();
          const next = transform(current);
          if (current !== next) {
            await this.suppress(file, async () => {
              assertSessionPath();
              return await this.app.vault.modify(file, next);
            });
          }
        }
      }
      this.assertVaultFilePath(
        file,
        path,
        "The legacy migration session moved or was replaced in another window or device. Reopen the migration workspace."
      );
      if (state && typeof state === "object") {
        state.revision = reconciled.revision;
        this.setMigrationSessionBaseline(state, this.migrationSessionComparable(reconciled));
      }
      return file;
    };
    const run = (this.migrationSessionQueue || Promise.resolve()).catch(() => {
    }).then(operation);
    this.migrationSessionQueue = run.catch(() => {
    });
    return await run;
  }
  async remapMigrationSessionPaths(mapper, {
    invalidateLastSaved = false,
    invalidateLastSavedIfMapped = false,
    resetMappedWorking = false,
    updateLastSavedProfile = true
  } = {}) {
    const file = this.app.vault.getAbstractFileByPath(this.migrationSessionPath());
    if (!(file instanceof TFile)) return false;
    let lastConflict = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await this.loadMigrationSession();
      if (!state) return false;
      const mapPath = (path) => {
        const value = normalizePath(String(path || ""));
        const mapped = normalizePath(String(mapper(value) || value));
        return mapped || value;
      };
      let changed2 = false;
      const remappedPaths = /* @__PURE__ */ new Set();
      const remapObject = (source) => {
        const target = {};
        for (const [path, value] of Object.entries(source || {})) {
          const mapped = mapPath(path);
          if (mapped !== path) {
            changed2 = true;
            remappedPaths.add(mapped);
          }
          if (Object.prototype.hasOwnProperty.call(target, mapped) && mapped !== path) {
            throw new Error(`Migration session path collision while remapping ${path} to ${mapped}.`);
          }
          target[mapped] = value;
        }
        return target;
      };
      const mappedOrder = [];
      const seen = /* @__PURE__ */ new Set();
      for (const path of state.order || []) {
        const mapped = mapPath(path);
        if (mapped !== path) changed2 = true;
        if (!seen.has(mapped)) {
          seen.add(mapped);
          mappedOrder.push(mapped);
        }
      }
      state.order = mappedOrder;
      state.status = remapObject(state.status);
      state.working = remapObject(state.working);
      if (resetMappedWorking) {
        for (const mapped of remappedPaths) {
          if (Object.prototype.hasOwnProperty.call(state.working, mapped)) {
            delete state.working[mapped];
            changed2 = true;
          }
          if (Object.prototype.hasOwnProperty.call(state.status, mapped) && state.status[mapped] !== "needs-review") {
            state.status[mapped] = "needs-review";
            changed2 = true;
          }
        }
      }
      if (state.currentPath) {
        const mapped = mapPath(state.currentPath);
        if (mapped !== state.currentPath) changed2 = true;
        state.currentPath = mapped;
      }
      if (state.lastSaved?.path) {
        const originalLastPath = state.lastSaved.path;
        const mapped = mapPath(originalLastPath);
        const lastSavedMapped = mapped !== originalLastPath;
        if (lastSavedMapped && invalidateLastSavedIfMapped) {
          state.lastSaved = null;
          changed2 = true;
        } else {
          if (lastSavedMapped) changed2 = true;
          state.lastSaved.path = mapped;
          const context = contextFromPath(mapped, this.contentRoot);
          if (updateLastSavedProfile && context?.depth === 3 && context.surgeon) {
            if (state.lastSaved.specialty !== context.specialty || state.lastSaved.surgeon !== context.surgeon) changed2 = true;
            state.lastSaved.specialty = context.specialty;
            state.lastSaved.surgeon = context.surgeon;
            if (state.lastSaved.preSurgeonRecord) {
              state.lastSaved.preSurgeonRecord.specialty = context.specialty;
              state.lastSaved.preSurgeonRecord.surgeon = context.surgeon;
            }
          }
        }
      }
      if (invalidateLastSaved && state.lastSaved) {
        state.lastSaved = null;
        changed2 = true;
      }
      if (!changed2) return false;
      try {
        await this.saveMigrationSession(state);
        return true;
      } catch (error) {
        if (!/session changed on another window or device/i.test(String(error?.message || error))) throw error;
        lastConflict = error;
      }
    }
    throw lastConflict || new Error("Migration session path remap could not settle after concurrent changes.");
  }
  async remapMigrationSessionPrefix(oldPrefix, newPrefix, options = {}) {
    oldPrefix = normalizePath(oldPrefix);
    newPrefix = normalizePath(newPrefix);
    return await this.remapMigrationSessionPaths((path) => {
      if (path === oldPrefix) return newPrefix;
      return path.startsWith(oldPrefix + "/") ? newPrefix + path.slice(oldPrefix.length) : path;
    }, options);
  }
  async pruneMigrationSessionPath(deletedPath, { includeDescendants = false } = {}) {
    deletedPath = normalizePath(String(deletedPath || ""));
    if (!deletedPath) return false;
    const matches = (path) => {
      path = normalizePath(String(path || ""));
      return path === deletedPath || includeDescendants && path.startsWith(deletedPath + "/");
    };
    let lastConflict = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await this.loadMigrationSession();
      if (!state) return false;
      let changed2 = false;
      const originalLength = (state.order || []).length;
      state.order = (state.order || []).filter((path) => !matches(path));
      changed2 = changed2 || state.order.length !== originalLength;
      for (const collection of [state.status, state.working]) {
        for (const key4 of Object.keys(collection || {})) {
          if (!matches(key4)) continue;
          delete collection[key4];
          changed2 = true;
        }
      }
      if (matches(state.currentPath)) {
        state.currentPath = "";
        changed2 = true;
      }
      if (matches(state.lastSaved?.path)) {
        state.lastSaved = null;
        changed2 = true;
      }
      if (!changed2) return false;
      this.reconcileMigrationSessionState(state);
      try {
        await this.saveMigrationSession(state);
        return true;
      } catch (error) {
        if (!/session changed on another window or device/i.test(String(error?.message || error))) throw error;
        lastConflict = error;
      }
    }
    throw lastConflict || new Error("Migration session cleanup could not settle after concurrent changes.");
  }
  async retireConfirmedMissingMigrationPaths(paths) {
    const requested = new Set((paths || []).map((path) => normalizePath(String(path || ""))).filter(Boolean));
    if (!requested.size) return { retired: 0, backupRoot: "" };
    const sessionFile = this.app.vault.getAbstractFileByPath(this.migrationSessionPath());
    if (!(sessionFile instanceof TFile)) return { retired: 0, backupRoot: "" };
    const initiallyMissing = [...requested].filter((path) => !(this.app.vault.getAbstractFileByPath(path) instanceof TFile));
    if (!initiallyMissing.length) return { retired: 0, backupRoot: "" };
    const backupRoot = await this.snapshotFiles("retire-confirmed-missing-migration-entries", [sessionFile]);
    let lastConflict = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const confirmed = new Set([...requested].filter((path) => !(this.app.vault.getAbstractFileByPath(path) instanceof TFile)));
      if (!confirmed.size) return { retired: 0, backupRoot };
      const state = await this.loadMigrationSession();
      if (!state) return { retired: 0, backupRoot };
      let retired = 0;
      const originalOrder = state.order || [];
      state.order = originalOrder.filter((path) => {
        if (!confirmed.has(path)) return true;
        retired++;
        return false;
      });
      for (const collection of [state.status, state.working]) {
        for (const path of confirmed) delete collection?.[path];
      }
      if (confirmed.has(state.currentPath)) state.currentPath = "";
      if (confirmed.has(state.lastSaved?.path)) state.lastSaved = null;
      if (!retired) return { retired: 0, backupRoot };
      this.reconcileMigrationSessionState(state);
      try {
        await this.saveMigrationSession(state);
        try {
          await this.appendLog("Retire confirmed-missing migration entries", `${retired} entr${retired === 1 ? "y" : "ies"} · backup ${backupRoot}`);
        } catch (_) {
        }
        return { retired, backupRoot };
      } catch (error) {
        if (!/session changed on another window or device/i.test(String(error?.message || error))) throw error;
        lastConflict = error;
      }
    }
    throw lastConflict || new Error("Missing migration-entry recovery could not settle after concurrent changes.");
  }
  async migrationCaseIsCurrent(file, variant = "", rawText = null, expectedPath = "") {
    expectedPath = normalizePath(String(expectedPath || file?.path || ""));
    this.assertVaultFilePath(file, expectedPath, `Migration currentness check stopped because ${expectedPath} moved or was replaced.`);
    let raw = rawText;
    if (raw == null) raw = await this.app.vault.read(file);
    this.assertVaultFilePath(file, expectedPath, `Migration currentness check stopped because ${expectedPath} moved or was replaced.`);
    const fm = Object.assign(
      {},
      this.app.metadataCache.getFileCache(file)?.frontmatter || {},
      parseFrontmatterObject(raw)
    );
    if (fm.legacy_migrated === true || fm.template_initialized === true) return true;
    const c = contextFromPath(expectedPath, this.contentRoot);
    if (!c) return true;
    if (c.specialty.toLowerCase() === "spine" && !variant) return false;
    const t = await this.getTemplate(c.specialty, variant);
    this.assertVaultFilePath(file, expectedPath, `Migration currentness check stopped because ${expectedPath} moved or was replaced.`);
    if (fm.template === t.key && (fm.template_version === t.version || fm.template_version === t.legacyHash)) {
      await this.patchFrontmatter(file, (meta) => {
        meta.template = t.key;
        meta.template_version = t.version;
        meta.template_initialized = true;
      }, expectedPath);
      return true;
    }
    return false;
  }
  async scanLegacyMigrationQueue() {
    const entries = [];
    const current = [];
    for (const file of this.allCaseFiles().slice().sort((a, b) => a.path.localeCompare(b.path))) {
      const expectedPath = normalizePath(file.path);
      this.assertVaultFilePath(file, expectedPath, `Migration scan stopped because ${expectedPath} moved or was replaced.`);
      const c = contextFromPath(expectedPath, this.contentRoot);
      const raw = await this.app.vault.read(file);
      this.assertVaultFilePath(file, expectedPath, `Migration scan stopped because ${expectedPath} moved or was replaced.`);
      let variant = "";
      if (c.specialty.toLowerCase() === "spine") variant = await this.inferSpineVariant(file, raw, expectedPath);
      if (await this.migrationCaseIsCurrent(file, variant, raw, expectedPath)) {
        current.push(expectedPath);
        continue;
      }
      this.assertVaultFilePath(file, expectedPath, `Migration scan stopped because ${expectedPath} moved or was replaced.`);
      entries.push({ path: expectedPath, specialty: c.specialty, surgeon: c.surgeon, variant, ambiguous: c.specialty.toLowerCase() === "spine" && !variant });
    }
    return { entries, current };
  }
  async prepareMigrationSession() {
    const scan = await this.scanLegacyMigrationQueue();
    let state = await this.loadMigrationSession();
    if (!state || state.completed) {
      state = {
        version: 1,
        sessionId: `legacy-${Date.now().toString(36)}`,
        started: nowISO(),
        order: [],
        status: {},
        working: {},
        currentPath: "",
        paneOrder: "legacy-left",
        lastSaved: null,
        completed: false
      };
    }
    const valid = new Set(scan.entries.map((e) => e.path));
    for (const entry of scan.entries) {
      if (!state.order.includes(entry.path)) state.order.push(entry.path);
      if (!state.status[entry.path] || state.status[entry.path] === "current") state.status[entry.path] = entry.ambiguous ? "needs-review" : "remaining";
      if (!state.working[entry.path]) state.working[entry.path] = { variant: entry.variant || "", ignored: [], resolved: [], autoMapped: [], autoFill: false, autoFillEngineVersion: MIGRATION_AUTOFILL_ENGINE_VERSION, migrationNote: "", unmappedNotified: false, templateDriftAccepted: false, pendingGloves: "", pendingGlovesTouched: false };
      if (!state.working[entry.path].variant && entry.variant) state.working[entry.path].variant = entry.variant;
    }
    for (const path of Object.keys(state.status)) {
      const present = this.app.vault.getAbstractFileByPath(path) instanceof TFile;
      if (present && !valid.has(path) && state.status[path] !== "migrated" && state.status[path] !== "skipped") delete state.status[path];
    }
    if (!state.currentPath || !state.status[state.currentPath] || ["migrated", "skipped"].includes(state.status[state.currentPath])) {
      state.currentPath = this.nextMigrationPath(state, "") || "";
    }
    await this.saveMigrationSession(state);
    return { state, scan };
  }
  nextMigrationPath(state, currentPath) {
    const valid = (p) => !!state.status?.[p] && this.app.vault.getAbstractFileByPath(p) instanceof TFile;
    const order = (state.order || []).filter(valid);
    const after = order.indexOf(currentPath);
    const choose = (status) => {
      if (after >= 0) {
        const later = order.slice(after + 1).find((p) => state.status[p] === status);
        if (later) return later;
      }
      return order.find((p) => state.status[p] === status) || "";
    };
    return choose("remaining") || choose("needs-review") || "";
  }
  migrationStats(state) {
    const values = Object.values(state.status || {});
    const count = (x) => values.filter((v) => v === x).length;
    const remaining = count("remaining"), review = count("needs-review"), migrated = count("migrated"), skipped = count("skipped");
    return {
      total: values.length,
      remaining,
      review,
      migrated,
      skipped,
      resolved: migrated + skipped,
      processed: migrated + skipped + review,
      left: remaining + review
    };
  }
  async loadMigrationWorking(state, path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Legacy case not found: ${path}`);
    const c = this.caseContext(file);
    if (!c) throw new Error("Selected note is not a managed case.");
    const working = state.working[path] || (state.working[path] = {});
    const hasWorking = (key4) => Object.prototype.hasOwnProperty.call(working, key4);
    const raw = await this.app.vault.read(file);
    if (c.specialty.toLowerCase() === "spine" && !working.variant) working.variant = await this.inferSpineVariant(file, raw) || "";
    const variant = working.variant || "";
    const spineUnselected = c.specialty.toLowerCase() === "spine" && !variant;
    const t = spineUnselected ? { key: "Spine-Unselected", path: "", body: "", version: "", legacyHash: "" } : await this.getTemplate(c.specialty, variant);
    const source = this.stripFrontmatter(raw);
    const parsed = this.parseLegacyMigrationBlocks(source, t.body);
    const title = parsed.title || file.basename;
    if (!hasWorking("sourceOriginal")) working.sourceOriginal = source;
    if (!hasWorking("sourceWorking")) working.sourceWorking = source;
    const currentSourceHash = shortHash(source);
    if (!hasWorking("sourceBodyHash")) {
      if (hasWorking("sourceOriginal") && shortHash(String(working.sourceOriginal ?? "")) !== currentSourceHash) working.sourceChangedOnDisk = true;
      else working.sourceBodyHash = currentSourceHash;
    } else {
      working.sourceChangedOnDisk = working.sourceBodyHash !== currentSourceHash;
    }
    const surgeonData = await this.getSurgeonData(c.specialty, c.surgeon, { createIfMissing: false });
    if (!surgeonData?.cst_id) {
      throw new Error("The surgeon registry record is unavailable. Wait for Sync or repair the registry before opening this migration case.");
    }
    const currentSurgeonGloves = surgeonData?.gloves || "Unknown";
    const currentSurgeonFingerprint = this.surgeonRecordFingerprint(surgeonData);
    if (!Object.prototype.hasOwnProperty.call(working, "surgeonBaselineGloves")) {
      working.surgeonBaselineGloves = currentSurgeonGloves;
      working.surgeonBaselineFingerprint = currentSurgeonFingerprint;
    } else if (working.surgeonBaselineGloves !== currentSurgeonGloves) {
      if (working.pendingGlovesTouched) working.surgeonChangedOnDisk = true;
      else {
        working.surgeonBaselineGloves = currentSurgeonGloves;
        working.surgeonBaselineFingerprint = currentSurgeonFingerprint;
        working.pendingGloves = currentSurgeonGloves;
        working.surgeonChangedOnDisk = false;
      }
    } else {
      working.surgeonBaselineFingerprint = currentSurgeonFingerprint;
    }
    const legacyMdRaw = parsed.legacyMdRaw || "";
    let legacyMdCanonical = "";
    if (legacyMdRaw) {
      try {
        legacyMdCanonical = normalizeGloves2(legacyMdRaw, this.settings);
      } catch (_) {
      }
    }
    working.legacyMdGloves = legacyMdCanonical;
    if (!hasWorking("pendingGlovesTouched")) working.pendingGlovesTouched = false;
    if (!hasWorking("pendingGloves") || !working.pendingGlovesTouched && working.pendingGloves === "Unknown" && (!surgeonData?.gloves || surgeonData.gloves === "Unknown") && legacyMdCanonical) {
      working.pendingGloves = (!surgeonData?.gloves || surgeonData.gloves === "Unknown") && legacyMdCanonical ? legacyMdCanonical : surgeonData?.gloves || "Unknown";
    }
    working.gloveConflict = !!(legacyMdCanonical && surgeonData?.gloves && surgeonData.gloves !== "Unknown" && surgeonData.gloves !== legacyMdCanonical && !working.pendingGlovesTouched);
    if (spineUnselected) {
      if (!hasWorking("destination")) working.destination = `# ${title}

${CASE_HEADER_BLOCK}

<!-- Choose Cervical, Lumbar, or Thoracic above before migrating this Spine case. -->
`;
      working.baseDestination = working.destination;
      working.templatePath = "";
      working.templateKey = "Spine-Unselected";
      working.templateVersion = "";
    } else if (!hasWorking("baseDestination") || working.templatePath !== t.path || !hasWorking("templateVersion")) {
      working.baseDestination = this.migrationBaseDestination(title, t.body);
      if (!hasWorking("destination")) working.destination = working.baseDestination;
      working.templatePath = t.path;
      working.templateKey = t.key;
      working.templateVersion = t.version;
      working.templateDriftAccepted = false;
    }
    working.autoFill = false;
    return { file, context: c, working, template: t, source: hasWorking("sourceWorking") ? working.sourceWorking : working.sourceOriginal, raw };
  }
  async migrationSnapshotOriginal(state, file, expectedPath = "") {
    if (!(file instanceof TFile)) throw new Error("Migration snapshot source is missing.");
    expectedPath = normalizePath(String(expectedPath || file.path || ""));
    this.assertVaultFilePath(file, expectedPath, "Migration snapshot source moved or was replaced.");
    const backupRoot = this.migrationSessionBackupRoot(state, { assign: true });
    const undoRoot = this.migrationStatePath(cleanPath(backupRoot, "_Undo"), "Legacy migration Undo folder");
    const extension = (safeFileName(file.extension || "md").replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "md").toLowerCase();
    const originHash = shortHash(expectedPath).replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
    const makeTarget = (attempt) => {
      const nonce = id("pre").replace(/[^A-Za-z0-9]/g, "").slice(-16);
      const collision = attempt ? `-${attempt + 1}` : "";
      return this.migrationStatePath(
        cleanPath(undoRoot, `pre-${nonce}-${originHash}${collision}.${extension}`),
        "Legacy migration snapshot path"
      );
    };
    let target = makeTarget(0);
    const content = await this.app.vault.read(file);
    this.assertVaultFilePath(file, expectedPath, "Migration snapshot source moved or was replaced while being read.");
    await this.ensureFolder(undoRoot);
    this.assertVaultFilePath(file, expectedPath, "Migration snapshot source moved or was replaced while its Undo folder was prepared.");
    for (let attempt = 0; attempt < 100; attempt++) {
      if (attempt) target = makeTarget(attempt);
      if (this.app.vault.getAbstractFileByPath(target)) continue;
      this.markInternalCreate(target);
      try {
        await this.app.vault.create(target, content);
        return target;
      } catch (error) {
        if (this.app.vault.getAbstractFileByPath(target)) continue;
        throw error;
      }
    }
    throw new Error("Could not allocate a unique legacy migration Undo snapshot.");
  }
  async commitMigrationCase(state, path, working) {
    path = this.migrationStatePath(path, "Migration case path");
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error("Case disappeared before save.");
    const c = this.caseContext(file);
    if (!c) throw new Error("Case path is no longer valid.");
    const currentCaseTextAtCommit = await this.app.vault.read(file);
    const currentSourceHash = shortHash(this.stripFrontmatter(currentCaseTextAtCommit));
    if (!working.sourceBodyHash || currentSourceHash !== working.sourceBodyHash) {
      state.status[path] = "needs-review";
      working.sourceChangedOnDisk = true;
      await this.saveMigrationSession(state);
      return { saved: false, reason: "The case changed on disk after this migration working copy was opened. Reopen or reconcile the latest case before saving.", unresolved: [] };
    }
    if (c.specialty.toLowerCase() === "spine" && !working.variant) {
      state.status[path] = "needs-review";
      await this.saveMigrationSession(state);
      return { saved: false, reason: "Spine template must be selected.", unresolved: [] };
    }
    const t = await this.getTemplate(c.specialty, working.variant || "");
    const sourceForMigration = Object.prototype.hasOwnProperty.call(working, "sourceWorking") ? String(working.sourceWorking ?? "") : String(working.sourceOriginal ?? "");
    const unresolved = this.migrationUnresolved(sourceForMigration, String(working.destination ?? ""), t.body, working);
    const templateChanged = working.templateVersion !== t.version;
    const drift = templateChanged && !working.templateDriftAccepted;
    const saveVersion = templateChanged && working.templateDriftAccepted ? working.templateVersion : t.version;
    const registryState = await this.readSurgeonRegistry({ create: false });
    if (registryState.invalid) {
      throw new Error(`Migration save stopped because the surgeon registry is invalid: ${registryState.error}.`);
    }
    const registryKey = this.surgeonKey(c.specialty, c.surgeon);
    const rawSurgeonRecord = registryState.registry.surgeons?.[registryKey] || null;
    if (!rawSurgeonRecord) {
      state.status[path] = "needs-review";
      await this.saveMigrationSession(state);
      return { saved: false, reason: "The surgeon registry record disappeared before save. Repair or reopen the migration workspace.", unresolved, drift, latestTemplate: t };
    }
    const originalSurgeonRecord = JSON.parse(JSON.stringify(rawSurgeonRecord));
    const currentSurgeon = this.surgeonDataFromRegistry(registryState.registry, c.specialty, c.surgeon, registryState.file);
    const currentSurgeonGloves = currentSurgeon?.gloves || "Unknown";
    const currentSurgeonFingerprint = this.surgeonRecordFingerprint(originalSurgeonRecord);
    if (Object.prototype.hasOwnProperty.call(working, "surgeonBaselineGloves") && working.surgeonBaselineGloves !== currentSurgeonGloves) {
      if (working.pendingGlovesTouched) {
        state.status[path] = "needs-review";
        working.surgeonChangedOnDisk = true;
        await this.saveMigrationSession(state);
        return { saved: false, reason: "The surgeon glove profile changed after this working copy was opened. Review the current profile before saving.", unresolved, drift, latestTemplate: t };
      }
      working.surgeonBaselineGloves = currentSurgeonGloves;
      working.surgeonBaselineFingerprint = currentSurgeonFingerprint;
      working.pendingGloves = currentSurgeonGloves;
      working.surgeonChangedOnDisk = false;
    } else {
      working.surgeonBaselineFingerprint = currentSurgeonFingerprint;
    }
    const legacyGloves = working.legacyMdGloves || "";
    working.gloveConflict = !!(legacyGloves && currentSurgeonGloves !== "Unknown" && currentSurgeonGloves !== legacyGloves && !working.pendingGlovesTouched);
    if (working.gloveConflict && !working.pendingGlovesTouched) {
      state.status[path] = "needs-review";
      await this.saveMigrationSession(state);
      return { saved: false, reason: "Legacy MD gloves conflict with the current surgeon record. Choose Keep Current or Use Legacy in the migration GUI.", unresolved, drift, latestTemplate: t };
    }
    let pendingGloves = String(working.pendingGloves || "Unknown").trim() || "Unknown";
    try {
      pendingGloves = normalizeGloves2(pendingGloves, this.settings);
    } catch (e) {
      state.status[path] = "needs-review";
      working.gloveError = e.message || String(e);
      await this.saveMigrationSession(state);
      return { saved: false, reason: `MD gloves need review: ${working.gloveError}`, unresolved, drift, latestTemplate: t };
    }
    if (unresolved.length || drift) {
      state.status[path] = "needs-review";
      working.lastUnresolved = unresolved.map((x) => x.id);
      working.pendingGloves = pendingGloves;
      await this.saveMigrationSession(state);
      return { saved: false, reason: drift ? `Template changed from ${working.templateVersion} to ${t.version}.` : "Unresolved legacy content remains.", unresolved, drift, latestTemplate: t };
    }
    const gloveChanged = pendingGloves !== currentSurgeonGloves;
    const originalCaseText = currentCaseTextAtCommit;
    const backupPath = await this.migrationSnapshotOriginal(state, file, path);
    const registryBackupPath = gloveChanged ? await this.migrationSnapshotOriginal(state, registryState.file, this.surgeonRegistryPath()) : "";
    const front = frontmatterBlock(originalCaseText)?.text || "";
    const normalizedDestination = this.normalizeMigrationDestinationHeader(working.destination || "", file.basename);
    const body = String(normalizedDestination).replace(/^\s+/, "").replace(/\s*$/, "") + "\n";
    const caseWithMigratedBody = `${front}${front && !front.endsWith("\n") ? "\n" : ""}${body}`;
    const committedAt = nowISO();
    const next = setFrontmatterScalars(caseWithMigratedBody, {
      template: t.key,
      template_version: saveVersion,
      template_initialized: true,
      legacy_migrated: true,
      schema_version: SCHEMA_VERSION,
      last_verified: committedAt
    });
    const preCommitState = JSON.parse(JSON.stringify(state));
    const preCommitBaseline = state.__cstSessionBaseline;
    let caseWritten = false;
    let postSurgeonRecord = null;
    try {
      if (gloveChanged) {
        postSurgeonRecord = await this.updateSurgeonProfileExpected(c.specialty, c.surgeon, {
          gloves: pendingGloves,
          dirtyGloves: true,
          dirtyGown: false
        }, currentSurgeonFingerprint);
      }
      caseWritten = await this.replaceFileTextExpected(
        file,
        originalCaseText,
        next,
        "The case changed in another window or device while Save & Next was preparing backups. The newer case was left untouched; a moved or replaced case is treated the same way.",
        path
      );
      state.status[path] = "migrated";
      const postCaseHash = shortHash(next);
      state.lastSaved = {
        path,
        backupPath,
        registryBackupPath,
        specialty: c.specialty,
        surgeon: c.surgeon,
        postCaseHash,
        postSurgeonHash: gloveChanged ? this.surgeonRecordFingerprint(postSurgeonRecord) : "",
        preSurgeonRecord: gloveChanged ? originalSurgeonRecord : null,
        at: committedAt
      };
      delete state.working[path];
      await this.saveMigrationSession(state);
    } catch (e) {
      const rollbackErrors = [];
      if (caseWritten) {
        try {
          await this.replaceFileTextExpected(
            file,
            next,
            originalCaseText,
            "Migration case rollback stopped because the case was edited or moved after the migration write.",
            path
          );
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      if (postSurgeonRecord) {
        try {
          await this.applyAdminRegistryChanges([{
            specialty: c.specialty,
            surgeon: c.surgeon,
            expected: postSurgeonRecord,
            data: originalSurgeonRecord
          }]);
          try {
            await this.ensureSurgeonGraphNode(c.specialty, c.surgeon, originalSurgeonRecord.cst_id || "", originalSurgeonRecord);
            this.refreshSurgeonHeaderDisplays(c.specialty, c.surgeon, originalSurgeonRecord);
          } catch (refreshError) {
            console.error("CST migration rollback display refresh", refreshError);
            this.scheduleGraphRebuild(250);
          }
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      for (const key4 of Object.keys(state)) delete state[key4];
      Object.assign(state, preCommitState);
      if (preCommitBaseline != null) this.setMigrationSessionBaseline(state, preCommitBaseline);
      if (rollbackErrors.length) {
        throw new Error(`${e.message || e} Rollback needs review: ${rollbackErrors.join(" | ")}`);
      }
      throw e;
    }
    try {
      await this.appendLog("Legacy template migration", `${path} → ${t.key} ${saveVersion}${gloveChanged ? ` · ${c.surgeon} gloves → ${pendingGloves}` : ""}`);
    } catch (error) {
      console.error("CST migration audit log", error);
      new Notice("The case migration was saved, but its audit-log entry is pending. Run Backend Repair after Sync is stable.");
    }
    return { saved: true, unresolved: [], gloveChanged };
  }
  async undoLastMigration(state) {
    const last = state.lastSaved;
    if (!last?.path || !last?.backupPath) throw new Error("No saved migration is available to undo.");
    const targetPath = this.migrationStatePath(last.path, "Undo case path");
    const backupPath = this.migrationUndoBackupPath(state, last.backupPath, "Undo case snapshot path");
    const registryBackupPath = last.registryBackupPath ? this.migrationUndoBackupPath(state, last.registryBackupPath, "Undo surgeon snapshot path") : "";
    if (registryBackupPath && registryBackupPath === backupPath) {
      throw new Error("Undo refused because the case and surgeon checkpoints reference the same snapshot.");
    }
    const postCaseHash = String(last.postCaseHash || "").trim();
    const postSurgeonHash = String(last.postSurgeonHash || "").trim();
    if (!postCaseHash) {
      throw new Error("Undo refused because this checkpoint has no guarded case postimage. Restore its backup manually after reviewing current edits.");
    }
    if (registryBackupPath && !postSurgeonHash) {
      throw new Error("Undo refused because this checkpoint has no guarded surgeon postimage. Restore its backup manually after reviewing current edits.");
    }
    const target = this.app.vault.getAbstractFileByPath(targetPath);
    const context = this.caseContext(target);
    const checkpointSpecialty = String(last.specialty || "").trim();
    const checkpointSurgeon = String(last.surgeon || "").trim();
    if (!(target instanceof TFile) || !context || target.path !== targetPath || context.specialty !== checkpointSpecialty || context.surgeon !== checkpointSurgeon || !Array.isArray(state.order) || !state.order.includes(targetPath) || state.status?.[targetPath] !== "migrated") {
      throw new Error("Undo refused because the checkpoint does not identify the exact managed migrated case in this session.");
    }
    const backup = this.app.vault.getAbstractFileByPath(backupPath);
    if (!(target instanceof TFile) || !(backup instanceof TFile)) throw new Error("Undo snapshot is missing.");
    const savedOriginal = await this.app.vault.read(backup);
    const restoredBody = this.stripResourceMarkers?.(savedOriginal) ?? savedOriginal;
    const images = await this.attachmentRecovery?.prepareRestore({ text: restoredBody, originalPath: targetPath, targetPath });
    const original = images?.text ?? restoredBody;
    const migratedCaseText = await this.app.vault.read(target);
    if (shortHash(migratedCaseText) !== postCaseHash) {
      throw new Error("Undo stopped because the migrated case was edited after Save & Next. Copy those edits elsewhere before retrying.");
    }
    let originalSurgeon = null;
    let migratedSurgeon = null;
    if (registryBackupPath) {
      const registryState = await this.getRegistrySurgeon(checkpointSpecialty, checkpointSurgeon, { create: false });
      const registryBackup = this.app.vault.getAbstractFileByPath(registryBackupPath);
      if (registryState.missing || registryState.invalid || !(registryState.file instanceof TFile) || !(registryBackup instanceof TFile)) {
        throw new Error("Undo surgeon snapshot is missing.");
      }
      if (Object.prototype.hasOwnProperty.call(last, "preSurgeonRecord")) {
        originalSurgeon = last.preSurgeonRecord;
      } else {
        const parsedBackup = this.parseSurgeonRegistryText(await this.app.vault.read(registryBackup));
        if (parsedBackup.invalid) throw new Error(`Undo surgeon snapshot is invalid: ${parsedBackup.error}.`);
        const key4 = this.surgeonKey(checkpointSpecialty, checkpointSurgeon);
        originalSurgeon = parsedBackup.registry.surgeons?.[key4] || null;
      }
      migratedSurgeon = registryState.data;
      if (!originalSurgeon || !migratedSurgeon) throw new Error("Undo surgeon checkpoint is incomplete.");
      this.adminRegistryRecord(JSON.parse(JSON.stringify(originalSurgeon)), checkpointSpecialty, checkpointSurgeon);
      this.adminRegistryRecord(JSON.parse(JSON.stringify(migratedSurgeon)), checkpointSpecialty, checkpointSurgeon);
      if (this.surgeonRecordFingerprint(migratedSurgeon) !== postSurgeonHash) {
        throw new Error("Undo stopped because the surgeon record was edited after Save & Next.");
      }
    }
    const preUndoState = JSON.parse(JSON.stringify(state));
    const preUndoBaseline = state.__cstSessionBaseline;
    let caseRestored = false;
    let surgeonRestored = false;
    try {
      await images?.assertUnchanged();
      this.assertVaultFilePath(backup, backupPath, "Undo snapshot moved during image recovery.");
      if (await this.app.vault.read(backup) !== savedOriginal) throw new Error("Undo snapshot changed during image recovery.");
      caseRestored = await this.replaceFileTextExpected(
        target,
        migratedCaseText,
        original,
        "Undo stopped because the migrated case changed in another window or device, or moved or was replaced.",
        targetPath
      );
      await images?.assertUnchanged();
      if (registryBackupPath) {
        await this.applyAdminRegistryChanges([{
          specialty: checkpointSpecialty,
          surgeon: checkpointSurgeon,
          expected: migratedSurgeon,
          data: originalSurgeon
        }], { create: false });
        surgeonRestored = true;
      }
      state.status[targetPath] = "needs-review";
      state.currentPath = targetPath;
      state.lastSaved = null;
      await this.saveMigrationSession(state);
    } catch (error) {
      const rollbackErrors = [];
      if (surgeonRestored) {
        try {
          await this.applyAdminRegistryChanges([{
            specialty: checkpointSpecialty,
            surgeon: checkpointSurgeon,
            expected: originalSurgeon,
            data: migratedSurgeon
          }], { create: false });
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      if (caseRestored) {
        try {
          await this.replaceFileTextExpected(
            target,
            original,
            migratedCaseText,
            "Undo compensation stopped because the restored case was edited or moved after Undo began.",
            targetPath
          );
        } catch (rollback) {
          rollbackErrors.push(rollback.message || String(rollback));
        }
      }
      for (const key4 of Object.keys(state)) delete state[key4];
      Object.assign(state, preUndoState);
      if (preUndoBaseline != null) this.setMigrationSessionBaseline(state, preUndoBaseline);
      if (rollbackErrors.length) {
        throw new Error(`${error.message || error} Rollback needs review: ${rollbackErrors.join(" | ")}`);
      }
      throw error;
    }
    if (registryBackupPath) {
      const restored = (await this.getRegistrySurgeon(checkpointSpecialty, checkpointSurgeon, { create: false })).data;
      try {
        if (restored) {
          await this.ensureSurgeonGraphNode(checkpointSpecialty, checkpointSurgeon, restored.cst_id || restored.id || "", restored);
          this.refreshSurgeonHeaderDisplays(checkpointSpecialty, checkpointSurgeon, restored);
        } else {
          this.scheduleGraphRebuild(250);
        }
      } catch (error) {
        console.error("CST undo graph refresh", error);
        this.scheduleGraphRebuild(250);
      }
    }
    try {
      await this.appendLog("Undo legacy migration", targetPath);
    } catch (error) {
      console.error("CST undo audit log", error);
      new Notice("The migration undo completed, but its audit-log entry is pending.");
    }
  }
  async createReference(category, name) {
    if (this.settings.initialized && !await this.quickStructureCheck()) {
      throw new Error("Reference creation is paused until this device has a complete CST vault.");
    }
    category = validatedPathSegment(category, "Reference category");
    name = validatedPathSegment(name, "Reference name");
    const categories = ["Trays", "Instruments", "Sutures", "Dressings", "Medications", "Equipment", "Implants"];
    const folderPath = this.p(`References/${category}`);
    const path = validatePortableVaultPath(this.p(`References/${category}/${name}.md`), "Reference path");
    if (!categories.includes(category)) throw new Error(`Unsupported reference category: ${category}`);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      throw new Error(`Reference folder is unavailable: ${folderPath}. Wait for Sync before creating the reference.`);
    }
    const targetName = `${name}.md`;
    const foldedTarget = targetName.normalize("NFC").toLocaleLowerCase();
    const existing = folder.children.find((item) => item.name.normalize("NFC").toLocaleLowerCase() === foldedTarget);
    if (existing instanceof TFile) {
      try {
        await this.openFile(existing);
      } catch (_) {
      }
      throw new Error(`"${name}" already exists in ${category}. Opened the existing reference.`);
    }
    const content = `---
cst_type: "reference"
cst_id: ${yamlString(id("ref"))}
reference_type: ${yamlString(category)}
aliases: []
created: ${yamlString(nowISO())}
---

# ${name}
`;
    this.markInternalCreate(path);
    let file;
    try {
      file = await this.app.vault.create(path, content);
    } catch (error) {
      this.ignoreCreateUntil.delete(normalizePath(path));
      const raced = this.app.vault.getAbstractFileByPath(path);
      if (!(raced instanceof TFile)) throw error;
      try {
        await this.openFile(raced);
      } catch (_) {
      }
      throw new Error(`"${name}" was created by another window or device. The winning reference was preserved and opened.`);
    }
    try {
      await this.openFile(file);
    } catch (error) {
      console.error("CST could not open the newly created reference.", error);
      new Notice(`${name} was created, but could not be opened: ${error.message || error}`);
    }
    return file;
  }
  extractSection(text, heading) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^##\\s+${escaped}\\s*$`, "mi");
    const m = re.exec(text);
    if (!m) return "";
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const next = /^##\s+/m.exec(rest);
    return (next ? rest.slice(0, next.index) : rest).trim();
  }
  insertSection(editor, heading, content) {
    let text = editor.getValue();
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^##\\s+${escaped}\\s*$`, "mi");
    const m = re.exec(text);
    if (!m) {
      text = text.replace(/\s*$/, "") + `

## ${heading}

${content.trim()}
`;
      editor.setValue(text);
      return;
    }
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const next = /^##\s+/m.exec(rest);
    const end = next ? start + next.index : text.length;
    const before = text.slice(0, end).replace(/\s*$/, "");
    const after = text.slice(end).replace(/^\s*/, "");
    editor.setValue(`${before}

${content.trim()}

${after}`.trimEnd() + "\n");
  }
};
var CaseDeletionModal = class extends Modal {
  constructor(plugin, caseName, expectedPath, resolve) {
    super(plugin.app);
    this.caseName = String(caseName || "case");
    this.expectedPath = normalizePath(String(expectedPath || ""));
    this.resolveDecision = resolve;
    this.settled = false;
  }
  finish(value) {
    if (this.settled) return;
    this.settled = true;
    this.resolveDecision(!!value);
    this.close();
  }
  onOpen() {
    this.modalEl.addClass("cst-delete-confirm-modal");
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "Remove case from CST?" });
    el.createEl("p", {
      text: `Archive “${this.caseName}” outside the active CST case database?`,
      cls: "cst-warning"
    });
    el.createEl("p", {
      text: "The case is rechecked after confirmation. If Sync moves, replaces, or edits it while this dialog is open, removal is cancelled.",
      cls: "cst-muted"
    });
    el.createEl("p", {
      text: "CST keeps the exact note plus an original-path manifest under Backend/Admin/Backups/Deleted Cases. Purge it manually through Obsidian only after Sync settles.",
      cls: "cst-muted"
    });
    el.createEl("code", { text: this.expectedPath });
    const actions = el.createDiv({ cls: "cst-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.onclick = () => this.finish(false);
    const remove = actions.createEl("button", { text: "Archive case", cls: "mod-warning" });
    remove.onclick = () => this.finish(true);
    window.setTimeout(() => {
      if (cancel.isConnected !== false) cancel.focus();
    }, 0);
  }
  onClose() {
    if (!this.settled) {
      this.settled = true;
      this.resolveDecision(false);
    }
    this.contentEl.empty();
  }
};
var OnboardingHideModal = class extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }
  onOpen() {
    const el = this.contentEl;
    el.createEl("h2", { text: "Hide onboarding checklist?" });
    el.createEl("p", { text: "You can show it again from Admin → Onboarding → Show onboarding checklist, while the example case is present." });
    el.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    el.createEl("button", { text: "Hide checklist", cls: "mod-cta" }).onclick = () => this.plugin.navigateFromUI("Hide checklist", async () => {
      this.plugin.settings.onboardingDismissed = true;
      await this.plugin.saveSettings();
      this.plugin.refreshOnboarding();
      this.close();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var CSTSidebarView = class extends ItemView {
  constructor(leaf2, plugin) {
    super(leaf2);
    this.plugin = plugin;
    const initialRoute = plugin.pendingSidebarRoutes?.get(leaf2) || {};
    this.query = String(initialRoute.query || "");
    this.specialty = String(initialRoute.specialty || "");
    this.surgeon = String(initialRoute.surgeon || "");
    this.renderTimer = null;
    this.searchTimer = null;
    this.shellReady = false;
    this.renderEpoch = 0;
    this.renderedRouteKey = "";
    this.refreshPending = false;
    const queueIfRelevant = (file) => {
      if (this.isSidebarDependency(file?.path)) this.queueRender();
    };
    this.registerEvent(plugin.app.vault.on("create", queueIfRelevant));
    this.registerEvent(plugin.app.vault.on("delete", queueIfRelevant));
    this.registerEvent(plugin.app.vault.on("rename", (file, oldPath) => {
      if (this.isSidebarDependency(file?.path) || this.isSidebarDependency(oldPath)) this.queueRender();
    }));
    this.registerEvent(plugin.app.vault.on("modify", queueIfRelevant));
    if (plugin.app.workspace?.on) {
      this.registerEvent(plugin.app.workspace.on("active-leaf-change", (activeLeaf) => {
        if (activeLeaf === this.leaf && this.refreshPending) this.queueRender();
      }));
    }
  }
  getViewType() {
    return VIEW_TYPE_CST_SIDEBAR;
  }
  getDisplayText() {
    return "CST Notes";
  }
  getIcon() {
    return "cst-open-kelly";
  }
  isSidebarDependency(path) {
    path = normalizePath(String(path || ""));
    return !!path && (this.plugin.isManagedPath(path) || path === normalizePath(this.plugin.surgeonRegistryPath()));
  }
  queueRender() {
    this.refreshPending = true;
    if (Platform.isMobile && this.plugin.app.workspace?.activeLeaf !== this.leaf) {
      if (this.renderTimer) window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
      return;
    }
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      this.flushQueuedRender().catch((error) => {
        this.refreshPending = true;
        console.error(error);
      });
    }, 160);
  }
  async flushQueuedRender({ allowHidden = false } = {}) {
    if (!allowHidden && Platform.isMobile && this.plugin.app.workspace?.activeLeaf !== this.leaf) {
      this.refreshPending = true;
      return false;
    }
    this.refreshPending = false;
    this.renderChips({ preserveScroll: true });
    await this.renderContent({ preserveScroll: true });
    return true;
  }
  async onOpen() {
    this.buildShell();
    await this.renderContent({ preserveScroll: false });
  }
  async onClose() {
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    this.renderEpoch++;
    this.renderTimer = null;
    this.searchTimer = null;
    this.refreshPending = false;
    this.contentEl.empty();
    this.shellReady = false;
  }
  makeAction(parent3, text, fn, primary = false) {
    const b = parent3.createEl("button", { text });
    if (primary) b.addClass("mod-cta");
    b.onclick = fn;
    return b;
  }
  buildShell() {
    const el = this.contentEl;
    el.empty();
    el.addClass("cst-app-view");
    const top = el.createDiv({ cls: "cst-app-top" });
    const titleWrap = top.createDiv();
    titleWrap.createEl("div", { text: "CST Notes", cls: "cst-app-title" });
    titleWrap.createEl("div", { text: Platform.isMobile ? "Mobile case workspace" : "Case workspace", cls: "cst-muted cst-app-subtitle" });
    const actions = el.createDiv({ cls: "cst-app-actions" });
    this.makeAction(actions, "+ New Case", () => this.plugin.openNewCase(), true);
    this.makeAction(actions, "Templates", () => this.plugin.navigateFromUI("Templates", () => this.plugin.openPath(this.plugin.p("Admin/Backend/Templates.md"))));
    this.makeAction(actions, "+ Surgeon", () => this.plugin.openNewSurgeon());
    const home = el.createDiv({ cls: "cst-app-home-nav cst-panel-home-nav" });
    this.homeButton = this.makeAction(home, "Home", () => this.navigateHome());
    this.searchInput = makeInput(el, { value: this.query, placeholder: "Search surgeon or case…" });
    this.searchInput.addClass("cst-app-search");
    this.searchInput.setAttribute("autocapitalize", "off");
    this.searchInput.setAttribute("autocomplete", "off");
    this.searchInput.oninput = () => {
      this.query = this.searchInput.value;
      if (this.searchTimer) window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.searchTimer = null;
        this.plugin.navigateFromUI("Refresh CST search", () => this.renderContent({ preserveScroll: false }));
      }, 90);
    };
    this.chipsEl = el.createDiv({ cls: "cst-specialty-chips" });
    this.bodyEl = el.createDiv({ cls: "cst-app-body" });
    const footer = el.createDiv({ cls: "cst-app-footer" });
    const admin = footer.createEl("button", { text: "Admin" });
    admin.onclick = () => this.plugin.navigateFromUI("Open CST Admin", () => this.plugin.openAdmin());
    footer.createSpan({ text: `v${PLUGIN_VERSION}`, cls: "cst-muted" });
    this.shellReady = true;
    this.renderChips();
  }
  renderChips({ preserveScroll = false } = {}) {
    if (!this.chipsEl) return;
    const scrollLeft = this.chipsEl.scrollLeft;
    const route = this.routeSnapshot();
    const stage = document.createElement("div");
    this.homeButton?.classList.toggle("is-active", !route.query && !route.specialty && !route.surgeon);
    for (const specialty of this.plugin.getSpecialties()) {
      const b = stage.createEl("button", { text: specialty });
      if (route.specialty === specialty && !route.surgeon) b.addClass("is-active");
      b.onclick = () => this.navigateSpecialty(specialty);
    }
    this.chipsEl.replaceChildren(...Array.from(stage.childNodes));
    if (preserveScroll) this.chipsEl.scrollLeft = scrollLeft;
  }
  routeSnapshot() {
    return {
      query: String(this.query || ""),
      specialty: String(this.specialty || ""),
      surgeon: String(this.surgeon || "")
    };
  }
  routeKey(route = this.routeSnapshot()) {
    return JSON.stringify([route.query, route.specialty, route.surgeon]);
  }
  async requestRoute(route, { preserveScroll = false } = {}) {
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    this.renderTimer = null;
    this.refreshPending = false;
    this.query = String(route?.query || "");
    this.specialty = String(route?.specialty || "");
    this.surgeon = String(route?.surgeon || "");
    if (this.searchInput) this.searchInput.value = this.query;
    this.renderChips({ preserveScroll });
    await this.renderContent({ preserveScroll });
  }
  navigateHome() {
    this.plugin.navigateFromUI("Open CST home", () => this.requestRoute({ specialty: "", surgeon: "", query: "" }));
  }
  navigateSpecialty(specialty) {
    this.plugin.navigateFromUI(`Open ${specialty}`, () => this.requestRoute({ specialty, surgeon: "", query: "" }));
  }
  navigateSurgeon(specialty, surgeon2) {
    this.plugin.navigateFromUI(`Open ${surgeon2}`, () => this.requestRoute({ specialty, surgeon: surgeon2, query: "" }));
  }
  async prepareForReveal(route = null) {
    if (route) {
      const target = { specialty: String(route.specialty || ""), surgeon: String(route.surgeon || "") };
      if (route.query) target.query = String(route.query);
      await this.requestRoute(target, { preserveScroll: false });
    } else if (this.refreshPending) {
      if (this.renderTimer) window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
      await this.flushQueuedRender({ allowHidden: true });
    }
  }
  restoreScroll(generation, routeKey, scrollTop, chipScrollLeft) {
    if (generation !== this.renderEpoch || routeKey !== this.renderedRouteKey) return;
    this.contentEl.scrollTop = scrollTop;
    if (this.chipsEl) this.chipsEl.scrollLeft = chipScrollLeft;
  }
  async renderContent({ preserveScroll = false } = {}) {
    if (!this.shellReady) this.buildShell();
    const el = this.bodyEl;
    if (!el) return;
    let route = this.routeSnapshot();
    const specialties = this.plugin.getSpecialties();
    let routeChanged = false;
    if (route.specialty && !specialties.includes(route.specialty)) {
      this.specialty = "";
      this.surgeon = "";
      routeChanged = true;
    } else if (route.surgeon && !this.plugin.getSurgeons(route.specialty).includes(route.surgeon)) {
      this.surgeon = "";
      routeChanged = true;
    }
    if (routeChanged) {
      route = this.routeSnapshot();
      this.renderChips({ preserveScroll: true });
    }
    const generation = ++this.renderEpoch;
    const routeKey = this.routeKey(route);
    const stage = document.createElement("div");
    const q = route.query.trim().toLowerCase();
    if (q) await this.renderSearch(stage, q);
    else if (route.surgeon && route.specialty) await this.renderSurgeon(stage, route.specialty, route.surgeon);
    else if (route.specialty) await this.renderSpecialty(stage, route.specialty);
    else await this.renderHome(stage);
    if (generation !== this.renderEpoch || routeKey !== this.routeKey() || el !== this.bodyEl) return false;
    const scrollTop = this.contentEl.scrollTop;
    const chipScrollLeft = this.chipsEl?.scrollLeft || 0;
    el.replaceChildren(...Array.from(stage.childNodes));
    this.renderedRouteKey = routeKey;
    if (!q && !route.specialty && !route.surgeon) {
      this.plugin.completeOnboarding("home");
      const checklist = el.querySelector(".cst-home-checklist");
      if (checklist) {
        checklist.empty();
        this.plugin.renderOnboarding(checklist);
      }
    }
    if (!q && route.specialty && route.surgeon) {
      this.plugin.completeOnboarding("hierarchy");
      if (stage.dataset.profileAvailable === "true") this.plugin.completeOnboarding("profile");
    }
    if (preserveScroll) {
      this.restoreScroll(generation, routeKey, scrollTop, chipScrollLeft);
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => this.restoreScroll(generation, routeKey, scrollTop, chipScrollLeft));
      }
    } else {
      this.contentEl.scrollTop = 0;
    }
    return true;
  }
  async renderHome(el) {
    this.plugin.renderOnboarding(el.createDiv({ cls: "cst-home-checklist" }));
    const entries = (await this.plugin.caseEntries()).sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
    el.createEl("h3", { text: "Recent cases" });
    const recent = el.createDiv({ cls: "cst-app-list" });
    if (!entries.length) recent.createEl("p", { text: "No cases yet.", cls: "cst-muted" });
    for (const entry of entries.slice(0, 10)) {
      const { file, context: c } = entry;
      const row = recent.createEl("button", { cls: "cst-app-row" });
      row.createSpan({ text: file.basename, cls: "cst-app-row-title" });
      const detail = entry.usable ? `${c.specialty} · ${c.surgeon}` : `Pending review · path ${c.specialty} / ${c.surgeon}`;
      row.createSpan({ text: detail, cls: entry.usable ? "cst-muted" : "cst-warning" });
      row.onclick = () => this.plugin.navigateFromUI(`Open ${file.basename}`, () => this.plugin.openFile(file));
    }
  }
  async renderSpecialty(el, specialty) {
    const header = el.createDiv({ cls: "cst-app-section-head" });
    const left = header.createDiv();
    left.createEl("h3", { text: specialty });
    const add = header.createEl("button", { text: "+ Case" });
    add.onclick = () => this.plugin.openNewCase(specialty, "");
    const surgeons = this.plugin.getSurgeons(specialty);
    const cases = (await this.plugin.caseEntries()).filter((entry) => entry.usable && entry.context.specialty === specialty).map((entry) => entry.file);
    left.createEl("p", { text: `${surgeons.length} surgeons - ${cases.length} cases`, cls: "cst-muted" });
    const registryState = await this.plugin.readSurgeonRegistry({ create: false });
    const list = el.createDiv({ cls: "cst-app-list" });
    for (const surgeon2 of surgeons) {
      const d = this.plugin.surgeonDataFromRegistry(registryState.registry, specialty, surgeon2, registryState.file) || await this.plugin.getSurgeonData(specialty, surgeon2, { createIfMissing: false });
      const available = !!d?.cst_id && !d?.unavailable;
      const count = cases.filter((f) => this.plugin.caseContext(f)?.surgeon === surgeon2).length;
      const wrap = list.createDiv({ cls: "cst-app-surgeon-wrap" });
      const row = wrap.createEl("button", { cls: "cst-app-row" });
      row.createSpan({ text: surgeon2, cls: "cst-app-row-title" });
      row.createSpan({
        text: available ? `${formatGloves(d.gloves || "Unknown")} · ${d.gown || "Unknown"} · ${count} case${count === 1 ? "" : "s"}` : `Profile unavailable · Sync pending · ${count} case${count === 1 ? "" : "s"}`,
        cls: available ? "cst-muted" : "cst-warning"
      });
      row.onclick = () => this.navigateSurgeon(specialty, surgeon2);
      const plus = wrap.createEl("button", { text: "+", cls: "cst-mini-add" });
      plus.setAttribute("aria-label", `New ${surgeon2} case`);
      plus.onclick = (e) => {
        e.stopPropagation();
        this.plugin.openNewCase(specialty, surgeon2);
      };
      plus.disabled = !available;
      if (!available) plus.setAttribute("title", "Wait for the surgeon registry record to sync.");
    }
    if (!surgeons.length) el.createEl("p", { text: "No surgeons yet.", cls: "cst-muted" });
    el.createEl("h3", { text: "Recent" });
    const rec = el.createDiv({ cls: "cst-app-list" });
    for (const file of cases.slice().sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 8)) {
      const c = this.plugin.caseContext(file);
      const row = rec.createEl("button", { cls: "cst-app-row" });
      row.createSpan({ text: file.basename, cls: "cst-app-row-title" });
      row.createSpan({ text: c.surgeon, cls: "cst-muted" });
      row.onclick = () => this.plugin.navigateFromUI(`Open ${file.basename}`, () => this.plugin.openFile(file));
    }
  }
  async renderSurgeon(el, specialty, surgeon2) {
    const d = await this.plugin.getSurgeonData(specialty, surgeon2, { createIfMissing: false });
    const available = !!d?.cst_id && !d?.unavailable;
    el.dataset.profileAvailable = String(available);
    const cases = (await this.plugin.caseEntries()).filter((entry) => entry.usable && entry.context.specialty === specialty && entry.context.surgeon === surgeon2).map((entry) => entry.file).sort((a, b) => compareCSTNames(a.basename, b.basename));
    const nav = el.createDiv({ cls: "cst-surgeon-nav" });
    const back = nav.createEl("button", { text: `← ${specialty}` });
    back.onclick = () => this.navigateSpecialty(specialty);
    const graph = nav.createEl("button", { text: "Open surgeon profile" });
    graph.onclick = () => this.plugin.navigateFromUI(`Open ${surgeon2} profile`, () => this.plugin.openPath(this.plugin.surgeonGraphPath(specialty, surgeon2)));
    graph.disabled = !available;
    if (!available) graph.setAttribute("title", "Wait for the surgeon registry record to sync.");
    const card = el.createDiv({ cls: "cst-profile-card" });
    card.createEl("div", { text: surgeon2, cls: "cst-app-title" });
    card.createEl("div", {
      text: available ? `${formatGloves(d.gloves || "Unknown")} · ${d.gown || "Unknown"}` : "Profile unavailable · Sync pending",
      cls: available ? "cst-profile-title" : "cst-warning"
    });
    if (!available) {
      card.createEl("p", {
        text: "The surgeon registry record is not available on this device. Profile and case-creation actions are paused; no case notes were changed.",
        cls: "cst-warning"
      });
    }
    const actions = card.createDiv({ cls: "cst-actions" });
    const add = actions.createEl("button", { text: `+ New ${surgeon2} Case`, cls: "mod-cta" });
    add.onclick = () => this.plugin.openNewCase(specialty, surgeon2);
    add.disabled = !available;
    if (!available) add.setAttribute("title", "Wait for the surgeon registry record to sync.");
    el.createEl("h3", { text: `Cases · ${cases.length}` });
    const list = el.createDiv({ cls: "cst-app-list" });
    if (!cases.length) list.createEl("p", { text: "No cases for this surgeon yet.", cls: "cst-muted" });
    for (const file of cases) {
      const wrap = list.createDiv({ cls: "cst-app-case-wrap" });
      const row = wrap.createEl("button", { cls: "cst-app-row" });
      row.createSpan({ text: file.basename, cls: "cst-app-row-title" });
      row.createSpan({ text: specialty, cls: "cst-muted" });
      row.onclick = () => this.plugin.navigateFromUI(`Open ${file.basename}`, () => this.plugin.openFile(file));
      const remove = wrap.createEl("button", { text: "×", cls: "cst-case-delete" });
      remove.setAttribute("aria-label", `Delete ${file.basename}`);
      remove.onclick = async (event) => {
        event.stopPropagation();
        remove.disabled = true;
        try {
          const deleted = await this.plugin.deleteCase(file);
          if (deleted) await this.requestRoute({ specialty, surgeon: surgeon2, query: "" });
        } catch (error) {
          new Notice(error.message || String(error));
        } finally {
          if (remove.isConnected) remove.disabled = false;
        }
      };
    }
  }
  async renderSearch(el, q) {
    el.createEl("h3", { text: "Search" });
    const list = el.createDiv({ cls: "cst-app-list" });
    const registryState = await this.plugin.readSurgeonRegistry({ create: false });
    const caseEntries = await this.plugin.caseEntries();
    let shown = 0;
    for (const specialty of this.plugin.getSpecialties()) {
      for (const surgeon2 of this.plugin.getSurgeons(specialty)) {
        if (!surgeon2.toLowerCase().includes(q)) continue;
        const d = this.plugin.surgeonDataFromRegistry(registryState.registry, specialty, surgeon2, registryState.file) || await this.plugin.getSurgeonData(specialty, surgeon2, { createIfMissing: false });
        const available = !!d?.cst_id && !d?.unavailable;
        const row = list.createEl("button", { cls: "cst-app-row" });
        row.createSpan({ text: surgeon2, cls: "cst-app-row-title" });
        row.createSpan({
          text: available ? `${specialty} · ${formatGloves(d.gloves || "Unknown")} · ${d.gown || "Unknown"}` : `${specialty} · profile unavailable · Sync pending`,
          cls: available ? "cst-muted" : "cst-warning"
        });
        row.onclick = () => this.navigateSurgeon(specialty, surgeon2);
        if (++shown >= 40) break;
      }
      if (shown >= 40) break;
    }
    if (shown < 40) {
      for (const entry of caseEntries) {
        const { file, context: c } = entry;
        const hay = `${file.basename} ${c.surgeon} ${c.specialty} ${entry.storedSurgeon} ${entry.storedSpecialty}`.toLowerCase();
        if (!hay.includes(q)) continue;
        const row = list.createEl("button", { cls: "cst-app-row" });
        row.createSpan({ text: file.basename, cls: "cst-app-row-title" });
        row.createSpan({
          text: entry.usable ? `${c.specialty} · ${c.surgeon}` : `Pending review · path ${c.specialty} / ${c.surgeon}`,
          cls: entry.usable ? "cst-muted" : "cst-warning"
        });
        row.onclick = () => this.plugin.navigateFromUI(`Open ${file.basename}`, () => this.plugin.openFile(file));
        if (++shown >= 40) break;
      }
    }
    if (!shown) list.createEl("p", { text: "No matching surgeons or cases.", cls: "cst-muted" });
  }
};
var SetupModal = class extends Modal {
  constructor(plugin, manual = false) {
    super(plugin.app);
    this.plugin = plugin;
    this.manual = manual;
    this.syncVerified = false;
    this.registryMismatch = null;
    this.missingSessionPaths = [];
    this.running = false;
    this.closedWhileRunning = false;
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "CST Notes Setup" });
    contentEl.createEl("p", { text: `Content: ${this.plugin.contentRoot}` });
    contentEl.createEl("p", { text: `Backend: ${this.plugin.settings.backendRoot}` });
    contentEl.createEl("p", { text: "Set up your CST Notes workspace with editable templates and navigation. New users also receive an example case and surgeon to practice with. Existing case content is preserved when repairing a workspace." });
    const existing = this.plugin.detectExistingCSTArtifacts();
    const actions = contentEl.createDiv({ cls: "cst-actions" });
    if ((this.plugin.settings.initialized || existing.exists) && !this.syncVerified) {
      contentEl.createEl("p", { text: "Existing CST files were detected. To prevent a partially synced iPhone, iPad, Mac, or PC from scaffolding over the vault, repair is locked until the read-only Sync check passes.", cls: "cst-warning" });
      const verify = actions.createEl("button", { text: "Verify Complete Vault", cls: "mod-cta" });
      verify.onclick = async () => {
        if (this.running) return;
        this.running = true;
        verify.disabled = true;
        verify.setText("Checking…");
        try {
          if (!await this.plugin.quickStructureCheck({ allowRegistryMismatch: true, allowMissingSessionPaths: true, allowMissingRegistryForMigration: true })) throw new Error("The vault is not ready. Wait for Sync and try again.");
          this.registryMismatch = this.plugin.lastStructureCheckRegistryMismatch;
          this.missingSessionPaths = [...this.plugin.lastStructureCheckMissingSessionPaths || []];
          this.syncVerified = true;
          this.running = false;
          this.render();
        } catch (e) {
          this.running = false;
          new Notice(e.message || String(e));
          if (verify.isConnected) {
            verify.disabled = false;
            verify.setText("Verify Complete Vault");
          }
        }
      };
      const cancel2 = actions.createEl("button", { text: "Cancel" });
      cancel2.onclick = () => this.close();
      return;
    }
    if (this.syncVerified && this.registryMismatch) {
      const folderCount = this.registryMismatch.missingFolders.length;
      const recordCount = this.registryMismatch.missingRecords.length;
      contentEl.createEl("p", { text: `Read-only verification found ${folderCount} registry entr${folderCount === 1 ? "y" : "ies"} without a folder and ${recordCount} surgeon folder${recordCount === 1 ? "" : "s"} without a registry record. Continue only after Sync is complete. Repair recreates the missing side non-destructively; it does not delete cases or registry data.`, cls: "cst-warning" });
    }
    if (this.syncVerified && this.missingSessionPaths.length) {
      contentEl.createEl("p", { text: `The migration session still references ${this.missingSessionPaths.length} case${this.missingSessionPaths.length === 1 ? "" : "s"} that are absent from this device. If Sync is still running, cancel and wait. If you have confirmed these cases were permanently deleted, retire only their active migration entries below. The session is snapshotted first; case backups and audit logs are retained.`, cls: "cst-warning" });
      const list = contentEl.createEl("ul", { cls: "cst-compact-list" });
      for (const path of this.missingSessionPaths.slice(0, 8)) list.createEl("li", { text: path });
      if (this.missingSessionPaths.length > 8) list.createEl("li", { text: `…and ${this.missingSessionPaths.length - 8} more` });
      const retire = actions.createEl("button", { text: "Retire Confirmed-Missing Entries", cls: "mod-warning" });
      const cancel2 = actions.createEl("button", { text: "Cancel" });
      cancel2.onclick = () => this.close();
      retire.onclick = async () => {
        if (this.running) return;
        this.running = true;
        retire.disabled = true;
        cancel2.disabled = true;
        retire.setText("Snapshotting & retiring…");
        try {
          const result = await this.plugin.retireConfirmedMissingMigrationPaths(this.missingSessionPaths);
          if (!await this.plugin.quickStructureCheck({ allowRegistryMismatch: true, allowMissingSessionPaths: true, allowMissingRegistryForMigration: true })) throw new Error("The vault changed during recovery. Wait for Sync and verify again.");
          this.registryMismatch = this.plugin.lastStructureCheckRegistryMismatch;
          this.missingSessionPaths = [...this.plugin.lastStructureCheckMissingSessionPaths || []];
          this.running = false;
          new Notice(result.retired ? `Retired ${result.retired} missing migration entr${result.retired === 1 ? "y" : "ies"}. Session backup: ${result.backupRoot}.` : "No entries were retired; the referenced cases are available again.");
          this.render();
        } catch (e) {
          this.running = false;
          new Notice(e.message || String(e));
          if (retire.isConnected) {
            retire.disabled = false;
            cancel2.disabled = false;
            retire.setText("Retire Confirmed-Missing Entries");
          }
        }
      };
      return;
    }
    const b = actions.createEl("button", { text: existing.exists || this.manual ? "Initialize / Repair" : "Initialize CST Notes" });
    b.addClass("mod-cta");
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.onclick = () => this.close();
    b.onclick = async () => {
      if (this.running) return;
      this.running = true;
      b.disabled = true;
      cancel.disabled = true;
      b.setText("Working…");
      try {
        await this.plugin.initializeSystem({ existingVaultConfirmed: this.syncVerified });
      } catch (e) {
        console.error(e);
        this.running = false;
        new Notice(`CST setup failed: ${e.message || e}`);
        if (b.isConnected) {
          b.disabled = false;
          cancel.disabled = false;
          b.setText("Try again");
        }
        return;
      }
      this.running = false;
      new Notice("CST Notes initialized.");
      this.close();
      try {
        await this.plugin.activateSidebar({ specialty: "", surgeon: "", query: "" });
        this.plugin.refreshOnboarding();
      } catch (e) {
        console.error(e);
        new Notice(`CST Notes initialized, but the CST Notes app could not open: ${e.message || e}`);
      }
    };
  }
  close() {
    if (this.running) {
      new Notice("CST setup is still working. Keep this window open until it finishes.");
      return;
    }
    super.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var NewSurgeonModal = class extends Modal {
  constructor(plugin, presetSpecialty = "", onCreated = null) {
    super(plugin.app);
    this.plugin = plugin;
    this.specialty = presetSpecialty;
    this.onCreated = onCreated;
    this.submitting = false;
  }
  onOpen() {
    this.render();
  }
  render() {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "New Surgeon" });
    const specs = this.plugin.getSpecialties();
    if (!specs.length) {
      el.createEl("p", { text: "Create a specialty before adding a surgeon.", cls: "cst-muted" });
      const emptyActions = el.createDiv({ cls: "cst-actions" });
      const addSpecialty = emptyActions.createEl("button", { text: "+ New Specialty", cls: "mod-cta" });
      addSpecialty.onclick = () => new NewSpecialtyModal(this.plugin, async (specialty) => {
        this.specialty = specialty;
        this.render();
      }).open();
      const cancel = emptyActions.createEl("button", { text: "Cancel" });
      cancel.onclick = () => this.close();
      return;
    }
    if (!this.specialty || !specs.includes(this.specialty)) this.specialty = specs[0] || "";
    const grid = el.createDiv({ cls: "cst-modal-grid" });
    grid.createEl("label", { text: "Specialty" });
    const spec = makeSelect(grid, "Specialty");
    for (const s of specs) addOption(spec, s);
    spec.value = this.specialty;
    spec.onchange = () => this.specialty = spec.value;
    grid.createEl("label", { text: "Name" });
    const name = makeInput(grid, { placeholder: "Surgeon name" });
    grid.createEl("label", { text: "Gloves" });
    const gloves = makeInput(grid, { placeholder: glove_settings_exports.gloveHelpText(this.plugin.settings).example });
    gloves.onkeydown = exitSingleLineOnEnter;
    addGloveHelp(grid, this.plugin.settings);
    grid.createEl("label", { text: "Gown" });
    const gown = makeSelect(grid, "Gown");
    for (const g of GOWNS2) addOption(gown, g);
    gown.value = this.plugin.settings.defaultGown;
    grid.createEl("label", { text: "Music preferences" });
    const music = makeInput(grid, { placeholder: "Optional" });
    music.onkeydown = exitSingleLineOnEnter;
    const preview = el.createDiv({ cls: "cst-preview" });
    const update = () => {
      try {
        preview.setText(`Stored: ${formatGloves(normalizeGloves2(gloves.value || "Unknown", this.plugin.settings))} · ${gown.value}`);
      } catch (e) {
        preview.setText(e.message);
      }
    };
    gloves.oninput = update;
    gown.onchange = update;
    update();
    const actions = el.createDiv({ cls: "cst-actions" });
    const create = actions.createEl("button", { text: "Create Surgeon" });
    create.addClass("mod-cta");
    create.onclick = async () => {
      if (this.submitting) return;
      this.submitting = true;
      create.disabled = true;
      create.setText("Creating…");
      try {
        if (this.plugin.settings.initialized && !await this.plugin.quickStructureCheck()) throw new Error("Surgeon creation is paused until this device has a complete CST vault.");
        const n = validatedPathSegment(name.value, "Surgeon", { person: true });
        const collision = this.plugin.getSurgeons(this.specialty).find((s) => s.normalize("NFC").toLocaleLowerCase() === n.normalize("NFC").toLocaleLowerCase());
        if (collision) throw new Error(`${collision} already exists in ${this.specialty}.`);
        const canon = normalizeGloves2(gloves.value || "Unknown", this.plugin.settings);
        await this.plugin.createSurgeon({ specialty: this.specialty, surgeon: n, gloves: canon, gown: gown.value, music: music.value });
        new Notice(`${n} added to ${this.specialty}.`);
        this.close();
        if (this.onCreated) await this.onCreated(n, this.specialty);
      } catch (e) {
        new Notice(e.message || String(e));
      } finally {
        this.submitting = false;
        create.disabled = false;
        create.setText("Create Surgeon");
      }
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var NewCaseModal = class extends Modal {
  constructor(plugin, opts = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.specialty = opts.presetSpecialty || "";
    this.surgeon = opts.presetSurgeon || "";
    this.title = "";
    this.variant = "Cervical";
    this.submitting = false;
    this.previewNonce = 0;
  }
  onOpen() {
    this.render();
  }
  render() {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "New Case" });
    const specs = this.plugin.getSpecialties();
    if (!this.specialty || !specs.includes(this.specialty)) this.specialty = specs[0] || "";
    const surgeons = this.plugin.getSurgeons(this.specialty);
    if (!this.surgeon || !surgeons.includes(this.surgeon)) this.surgeon = surgeons[0] || "";
    const grid = el.createDiv({ cls: "cst-modal-grid" });
    grid.createEl("label", { text: "Specialty" });
    const spec = makeSelect(grid, "Specialty");
    for (const s of specs) addOption(spec, s);
    spec.value = this.specialty;
    spec.onchange = () => {
      this.specialty = spec.value;
      this.surgeon = "";
      this.render();
    };
    if (this.specialty.toLowerCase() === "spine") {
      grid.createEl("label", { text: "Spine template" });
      const variant = makeSelect(grid, "Spine template");
      for (const v of ["Cervical", "Lumbar", "Thoracic"]) addOption(variant, v);
      variant.value = this.variant;
      variant.onchange = () => {
        this.variant = variant.value;
        queuePreview();
      };
    }
    grid.createEl("label", { text: "Surgeon" });
    const surgeon2 = makeSelect(grid, "Surgeon");
    addOption(surgeon2, "", surgeons.length ? "Select surgeon" : "No surgeons yet");
    for (const s of surgeons) addOption(surgeon2, s);
    surgeon2.value = this.surgeon;
    surgeon2.onchange = () => {
      this.surgeon = surgeon2.value;
      queuePreview();
    };
    grid.createEl("label", { text: "Case" });
    const title = blurOnEnter(makeInput(grid, { value: this.title, placeholder: "Case name" }));
    title.oninput = () => {
      this.title = title.value;
      queuePreview();
    };
    const createTools = el.createDiv({ cls: "cst-actions" });
    const addSurgeon = createTools.createEl("button", { text: "+ New Surgeon" });
    addSurgeon.onclick = () => new NewSurgeonModal(this.plugin, this.specialty, async (n) => {
      this.surgeon = n;
      this.render();
    }).open();
    const addSpecialty = createTools.createEl("button", { text: "+ New Specialty" });
    addSpecialty.onclick = () => new NewSpecialtyModal(this.plugin, async (n) => {
      this.specialty = n;
      this.surgeon = "";
      this.render();
    }).open();
    const preview = el.createDiv({ cls: "cst-preview" });
    const updatePreview = async () => {
      const nonce = ++this.previewNonce;
      const specialty = this.specialty;
      const surgeonName = this.surgeon;
      const titleText = this.title;
      const variantName = this.variant;
      const n = safeFileName(titleText || "Case name");
      const header = surgeonName ? await this.plugin.getSurgeonData(specialty, surgeonName, { createIfMissing: false }) : null;
      if (nonce !== this.previewNonce || preview.isConnected === false) return;
      const h = header ? `${surgeonName} · ${formatGloves(header.gloves)} · ${header.gown}` : "Select a surgeon";
      const template = specialty.toLowerCase() === "spine" ? `Spine / ${variantName}` : specialty;
      preview.setText(`${h}
Template: ${template}
${cleanPath(this.plugin.contentRoot, specialty, surgeonName || "Surgeon", `${n}.md`)}`);
    };
    const queuePreview = () => {
      void updatePreview().catch((error) => {
        console.error("CST New Case preview", error);
        if (preview.isConnected !== false) preview.setText(`Preview unavailable while Sync is settling.
${error.message || error}`);
      });
    };
    queuePreview();
    const actions = el.createDiv({ cls: "cst-actions" });
    const create = actions.createEl("button", { text: "Create" });
    create.addClass("mod-cta");
    create.onclick = async () => {
      if (this.submitting) return;
      this.submitting = true;
      create.disabled = true;
      create.setText("Creating…");
      try {
        if (!this.surgeon) throw new Error("Select or create a surgeon.");
        if (!this.title.trim()) throw new Error("Enter a case name.");
        await this.plugin.createCase({ specialty: this.specialty, surgeon: this.surgeon, title: this.title, variant: this.variant });
        this.close();
      } catch (e) {
        new Notice(e.message || String(e));
      } finally {
        this.submitting = false;
        create.disabled = false;
        create.setText("Create");
      }
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var QuickCaseModal = class extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.choiceIndex = 0;
    this.title = "";
    this.variant = "Cervical";
    this.submitting = false;
    this.previewNonce = 0;
  }
  onOpen() {
    this.render();
  }
  render() {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "Quick Case" });
    const choices = [];
    for (const specialty of this.plugin.getSpecialties()) {
      for (const surgeon2 of this.plugin.getSurgeons(specialty)) {
        choices.push({ specialty, surgeon: surgeon2, label: `${specialty} — ${surgeon2}` });
      }
    }
    if (!choices.length) {
      el.createEl("p", { text: "No surgeons yet. Create a surgeon first." });
      const emptyActions = el.createDiv({ cls: "cst-actions" });
      const addSurgeon = emptyActions.createEl("button", { text: "+ New Surgeon", cls: "mod-cta" });
      addSurgeon.onclick = () => new NewSurgeonModal(this.plugin).open();
      const addSpecialty = emptyActions.createEl("button", { text: "+ New Specialty" });
      addSpecialty.onclick = () => new NewSpecialtyModal(this.plugin).open();
      return;
    }
    if (this.choiceIndex >= choices.length) this.choiceIndex = 0;
    const selected = choices[this.choiceIndex];
    const grid = el.createDiv({ cls: "cst-modal-grid" });
    grid.createEl("label", { text: "Surgeon" });
    const sel = makeSelect(grid, "Surgeon");
    choices.forEach((c, i) => addOption(sel, String(i), c.label));
    sel.value = String(this.choiceIndex);
    sel.onchange = () => {
      this.choiceIndex = Number(sel.value);
      this.render();
    };
    if (selected.specialty.toLowerCase() === "spine") {
      grid.createEl("label", { text: "Spine template" });
      const variant = makeSelect(grid, "Spine template");
      ["Cervical", "Lumbar", "Thoracic"].forEach((v) => addOption(variant, v));
      variant.value = this.variant;
      variant.onchange = () => {
        this.variant = variant.value;
        this.render();
      };
    }
    grid.createEl("label", { text: "Case" });
    const title = blurOnEnter(makeInput(grid, { placeholder: "Case name", value: this.title }));
    title.oninput = () => this.title = title.value;
    const preview = el.createDiv({ cls: "cst-preview" });
    const previewNonce = ++this.previewNonce;
    this.plugin.getSurgeonData(selected.specialty, selected.surgeon, { createIfMissing: false }).then((d) => {
      if (previewNonce !== this.previewNonce || preview.isConnected === false) return;
      preview.setText(`${selected.surgeon} · ${formatGloves(d?.gloves || "Unknown")} · ${d?.gown || "Unknown"}
${selected.specialty.toLowerCase() === "spine" ? `Template: Spine / ${this.variant}` : `Template: ${selected.specialty}`}`);
    }).catch(console.error);
    const actions = el.createDiv({ cls: "cst-actions" });
    const create = actions.createEl("button", { text: "Create" });
    create.addClass("mod-cta");
    create.onclick = async () => {
      if (this.submitting) return;
      this.submitting = true;
      create.disabled = true;
      create.setText("Creating…");
      try {
        if (!this.title.trim()) throw new Error("Enter a case name.");
        await this.plugin.createCase({ specialty: selected.specialty, surgeon: selected.surgeon, title: this.title, variant: this.variant });
        this.close();
      } catch (e) {
        new Notice(e.message || String(e));
      } finally {
        this.submitting = false;
        create.disabled = false;
        create.setText("Create");
      }
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var NewSpecialtyModal = class extends Modal {
  constructor(plugin, onCreated = null) {
    super(plugin.app);
    this.plugin = plugin;
    this.onCreated = onCreated;
    this.submitting = false;
  }
  onOpen() {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "New Specialty" });
    el.createEl("p", { text: "Creates the specialty folder, graph node, and an editable starter template copied from the default template." });
    const grid = el.createDiv({ cls: "cst-modal-grid" });
    grid.createEl("label", { text: "Name" });
    const name = makeInput(grid);
    const b = el.createEl("button", { text: "Create Specialty" });
    b.addClass("mod-cta");
    b.onclick = async () => {
      if (this.submitting) return;
      this.submitting = true;
      b.disabled = true;
      b.setText("Creating…");
      try {
        const n = await this.plugin.createSpecialty(name.value);
        this.close();
        if (this.onCreated) await this.onCreated(n);
      } catch (e) {
        new Notice(e.message || String(e));
      } finally {
        this.submitting = false;
        if (b.isConnected) {
          b.disabled = false;
          b.setText("Create Specialty");
        }
      }
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var SurgeonActionModal = class extends Modal {
  constructor(plugin, mode) {
    super(plugin.app);
    this.plugin = plugin;
    this.mode = mode;
    this.submitting = false;
  }
  choices() {
    const out = [];
    for (const specialty of this.plugin.getSpecialties()) for (const surgeon2 of this.plugin.getSurgeons(specialty)) out.push({ specialty, surgeon: surgeon2, label: `${specialty} — ${surgeon2}` });
    return out;
  }
  onOpen() {
    const el = this.contentEl;
    el.empty();
    const title = this.mode === "rename" ? "Rename Surgeon" : this.mode === "move" ? "Move Surgeon" : "Merge Surgeons";
    el.createEl("h2", { text: title });
    el.createEl("p", { text: "A snapshot of affected files is created before this operation.", cls: "cst-muted" });
    const choices = this.choices();
    if (!choices.length) {
      el.createEl("p", { text: "No surgeons found." });
      return;
    }
    const grid = el.createDiv({ cls: "cst-modal-grid" });
    grid.createEl("label", { text: this.mode === "merge" ? "Source surgeon" : "Surgeon" });
    const src = makeSelect(grid, this.mode === "merge" ? "Source surgeon" : "Surgeon");
    choices.forEach((c, i) => addOption(src, String(i), c.label));
    let newName, dest, target;
    if (this.mode === "rename") {
      grid.createEl("label", { text: "New name" });
      newName = makeInput(grid);
    } else if (this.mode === "move") {
      grid.createEl("label", { text: "Destination specialty" });
      dest = makeSelect(grid, "Destination specialty");
      this.plugin.getSpecialties().forEach((s) => addOption(dest, s));
    } else {
      grid.createEl("label", { text: "Target surgeon" });
      target = makeSelect(grid, "Target surgeon");
      choices.forEach((c, i) => addOption(target, String(i), c.label));
      target.value = String(Math.min(1, choices.length - 1));
    }
    const b = el.createEl("button", { text: "Previewed operation — Apply" });
    b.addClass("mod-warning");
    b.onclick = async () => {
      if (this.submitting) return;
      this.submitting = true;
      b.disabled = true;
      b.setText("Applying…");
      try {
        const s = choices[Number(src.value)];
        if (this.mode === "rename") await this.plugin.renameSurgeon(s.specialty, s.surgeon, newName.value);
        else if (this.mode === "move") await this.plugin.moveSurgeon(s.specialty, s.surgeon, dest.value);
        else {
          const t = choices[Number(target.value)];
          await this.plugin.mergeSurgeons(s.specialty, s.surgeon, t.specialty, t.surgeon);
        }
        new Notice(`${title} complete.`);
        this.close();
      } catch (e) {
        new Notice(e.message || String(e));
      } finally {
        this.submitting = false;
        if (b.isConnected) {
          b.disabled = false;
          b.setText("Previewed operation — Apply");
        }
      }
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ReferenceModal = class extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.submitting = false;
  }
  onOpen() {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "Create Reference" });
    const cats = ["Trays", "Instruments", "Sutures", "Dressings", "Medications", "Equipment", "Implants"];
    const grid = el.createDiv({ cls: "cst-modal-grid" });
    grid.createEl("label", { text: "Category" });
    const cat = makeSelect(grid, "Category");
    cats.forEach((c) => addOption(cat, c));
    grid.createEl("label", { text: "Name" });
    const name = makeInput(grid);
    const b = el.createEl("button", { text: "Create" });
    b.addClass("mod-cta");
    b.onclick = async () => {
      if (this.submitting) return;
      this.submitting = true;
      b.disabled = true;
      b.setText("Creating…");
      try {
        await this.plugin.createReference(cat.value, name.value);
        this.close();
      } catch (e) {
        new Notice(e.message || String(e));
      } finally {
        this.submitting = false;
        if (b.isConnected) {
          b.disabled = false;
          b.setText("Create");
        }
      }
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ImportSectionModal = class extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.source = "";
    this.heading = "Trays";
    this.submitting = false;
  }
  async onOpen() {
    try {
      await this.render();
    } catch (e) {
      this.contentEl.empty();
      this.contentEl.createEl("p", { text: e.message || String(e), cls: "cst-warning" });
    }
  }
  async render() {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "Import Section From Case" });
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      el.createEl("p", { text: "Open the destination CST case first." });
      return;
    }
    const destination = await this.plugin.caseIdentityStatus(view.file);
    if (!destination?.usable) {
      el.createEl("p", { text: "The destination is not a verified CST case. Resolve its identity after Sync before importing.", cls: "cst-warning" });
      return;
    }
    const files = (await this.plugin.caseEntries()).filter((entry) => entry.usable && entry.file.path !== view.file.path).map((entry) => entry.file).sort((a, b2) => a.path.localeCompare(b2.path));
    if (!files.length) {
      el.createEl("p", { text: "No other verified CST case is available as a source.", cls: "cst-muted" });
      return;
    }
    const headings = ["Case", "Position", "Tips", "Drape", "Mayo", "Basin", "Back Table", "Trays", "Sutures", "Dressing", "Mayo Flow", "Dressings", "Notes"];
    const grid = el.createDiv({ cls: "cst-modal-grid" });
    grid.createEl("label", { text: "Source case" });
    const src = makeSelect(grid, "Source case");
    files.forEach((f, i) => addOption(src, String(i), f.path.replace(this.plugin.contentRoot + "/", "")));
    grid.createEl("label", { text: "Section" });
    const sec = makeSelect(grid, "Section");
    headings.forEach((h) => addOption(sec, h));
    sec.value = this.heading;
    const b = el.createEl("button", { text: "Preview / Insert" });
    b.addClass("mod-cta");
    b.onclick = async () => {
      if (this.submitting) return;
      this.submitting = true;
      b.disabled = true;
      b.setText("Loading…");
      try {
        const f = files[Number(src.value)];
        if (!f) return;
        const source = await this.plugin.caseIdentityStatus(f);
        if (!source?.usable) throw new Error("The source case changed or moved during preview. Review it after Sync.");
        const text = await this.plugin.app.vault.read(f);
        const body = this.plugin.extractSection(text, sec.value);
        if (!body) {
          new Notice(`No content found under "${sec.value}" in source case.`);
          return;
        }
        new SectionPreviewModal(this.plugin, view.editor, view.editor.getValue(), sec.value, body, f.basename, () => this.close()).open();
      } catch (e) {
        new Notice(e.message || String(e));
      } finally {
        this.submitting = false;
        if (b.isConnected) {
          b.disabled = false;
          b.setText("Preview / Insert");
        }
      }
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var SectionPreviewModal = class extends Modal {
  constructor(plugin, editor, expectedText, heading, body, source, onDone) {
    super(plugin.app);
    this.plugin = plugin;
    this.editor = editor;
    this.expectedText = expectedText;
    this.heading = heading;
    this.body = body;
    this.source = source;
    this.onDone = onDone;
    this.submitting = false;
  }
  onOpen() {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: `Import ${this.heading}` });
    el.createEl("p", { text: `Source: ${this.source}`, cls: "cst-muted" });
    const pre = el.createEl("pre");
    pre.setText(this.body);
    const actions = el.createDiv({ cls: "cst-actions" });
    const insert = actions.createEl("button", { text: "Insert into matching section" });
    insert.addClass("mod-cta");
    insert.onclick = () => {
      if (this.submitting) return;
      if (this.editor.getValue() !== this.expectedText) {
        new Notice("The destination case changed while the preview was open. Nothing was inserted; reopen the preview.");
        return;
      }
      this.submitting = true;
      insert.disabled = true;
      try {
        this.plugin.insertSection(this.editor, this.heading, this.body);
        this.close();
        if (this.onDone) this.onDone();
      } catch (e) {
        this.submitting = false;
        if (insert.isConnected) insert.disabled = false;
        new Notice(e.message || String(e));
      }
    };
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.onclick = () => this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var DiagnosticModal = class extends Modal {
  constructor(plugin, diagnostic) {
    super(plugin.app);
    this.plugin = plugin;
    this.diagnostic = diagnostic;
  }
  onOpen() {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "CST Backend Action Failed" });
    el.createEl("p", { text: this.diagnostic.summary || "The action failed.", cls: "cst-warning" });
    el.createEl("p", { text: `Diagnostic: ${this.diagnostic.id}`, cls: "cst-muted" });
    const ta = el.createEl("textarea", { cls: "cst-diagnostic-text" });
    ta.value = this.diagnostic.text || "";
    ta.setAttribute("readonly", "");
    const actions = el.createDiv({ cls: "cst-actions" });
    const copy = actions.createEl("button", { text: "Copy diagnostic for ChatGPT", cls: "mod-cta" });
    copy.onclick = async () => {
      const ok = await copyText(this.diagnostic.text || "");
      new Notice(ok ? "CST diagnostic copied." : "Could not copy automatically. Select the diagnostic text manually.");
    };
    const open = actions.createEl("button", { text: "Open diagnostic log" });
    open.disabled = !this.diagnostic.path;
    open.onclick = () => {
      if (!this.diagnostic.path) return;
      this.close();
      this.plugin.navigateFromUI("Open diagnostic log", () => this.plugin.openPath(this.diagnostic.path));
    };
    const close = actions.createEl("button", { text: "Close" });
    close.onclick = () => this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var HeaderRepairModal = class extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.scan = null;
  }
  async onOpen() {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "Repair Live Surgeon Headers" });
    el.createEl("p", { text: "Scans managed cases and repairs missing, duplicate, malformed, or misplaced live surgeon-header markers. A backup is created before any case is changed.", cls: "cst-muted" });
    try {
      this.scan = await this.plugin.scanLiveHeaders();
    } catch (e) {
      console.error("CST live-header scan", e);
      try {
        const diagnostic = await this.plugin.createDiagnostic("Scan Live Surgeon Headers", e, { stage: "header repair scan" });
        new DiagnosticModal(this.plugin, diagnostic).open();
        this.close();
      } catch (diagnosticError) {
        console.error("CST live-header scan diagnostic", diagnosticError);
        el.createEl("p", {
          text: `Scan failed: ${e.message || e}. Diagnostic persistence also failed: ${diagnosticError.message || diagnosticError}. No case files were changed.`,
          cls: "cst-warning"
        });
        const actions2 = el.createDiv({ cls: "cst-actions" });
        const close = actions2.createEl("button", { text: "Close" });
        close.onclick = () => this.close();
        new Notice("CST header scan failed; no case files were changed.");
      }
      return;
    }
    const stats = el.createDiv({ cls: "cst-admin-summary" });
    this.plugin.addStat(stats, "Cases checked", this.scan.total);
    this.plugin.addStat(stats, "Need repair", this.scan.affected);
    if (this.scan.details.length) {
      const preview = el.createEl("details");
      preview.createEl("summary", { text: `Preview ${this.scan.details.length} affected notes` });
      const ul = preview.createEl("ul");
      for (const item of this.scan.details.slice(0, 50)) {
        const bits = [];
        if (item.exact !== 1 || item.anyStart !== 1) bits.push(`header markers: ${item.anyStart}`);
        if (item.legacy) bits.push("legacy gloves");
        if (!item.hasTitle) bits.push("missing H1");
        ul.createEl("li", { text: `${item.file.path} — ${bits.join(", ") || "position repair"}` });
      }
      if (this.scan.details.length > 50) preview.createEl("p", { text: `+ ${this.scan.details.length - 50} more`, cls: "cst-muted" });
    }
    const actions = el.createDiv({ cls: "cst-actions" });
    const repair = actions.createEl("button", { text: this.scan.affected ? `Repair ${this.scan.affected} Notes` : "Nothing to Repair", cls: "mod-cta" });
    repair.disabled = !this.scan.affected;
    repair.onclick = async () => {
      repair.disabled = true;
      const result = await this.plugin.runAdminAction("Repair Live Surgeon Headers", () => this.plugin.repairLiveHeaders(true), { stage: "live header repair", paths: this.scan.details.slice(0, 20).map((x) => x.file.path) });
      if (result) {
        new Notice(`CST live header repair complete: ${result.repaired} notes repaired.`);
        this.close();
      } else repair.disabled = false;
    };
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.onclick = () => this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var UnmappedContentModal = class extends Modal {
  constructor(plugin, migrationModal, block, headings) {
    super(plugin.app);
    this.plugin = plugin;
    this.migrationModal = migrationModal;
    this.parentRenderNonce = migrationModal.renderNonce;
    this.block = block;
    this.headings = headings || [];
  }
  onOpen() {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "Unmapped Legacy Content" });
    el.createEl("div", { text: this.block.label, cls: "cst-app-row-title" });
    const pre = el.createEl("pre", { cls: "cst-unmapped-preview" });
    pre.setText(this.block.content);
    const grid = el.createDiv({ cls: "cst-modal-grid" });
    grid.createEl("label", { text: "Suggested destination" });
    const select = makeSelect(grid, "Suggested destination");
    const seen = /* @__PURE__ */ new Set();
    const options = [this.block.suggested, ...this.headings.map((h) => h.label), "Keep as Custom Heading"].filter(Boolean);
    for (const opt of options) {
      if (seen.has(opt)) continue;
      seen.add(opt);
      addOption(select, opt, opt);
    }
    select.value = this.block.suggested || options[0] || "Notes";
    el.createEl("p", { text: `Suggested header: ${this.block.suggested || "Notes"}`, cls: "cst-muted" });
    const actions = el.createDiv({ cls: "cst-actions" });
    const leave = actions.createEl("button", { text: "Leave Unmapped" });
    leave.onclick = () => this.close();
    const ignore = actions.createEl("button", { text: "Ignore" });
    const move = actions.createEl("button", { text: "Move Content", cls: "mod-cta" });
    const status = el.createDiv({ cls: "cst-muted cst-migration-action-status" });
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    let running = false;
    const run = async (label, action) => {
      if (running) return;
      running = true;
      leave.disabled = true;
      ignore.disabled = true;
      move.disabled = true;
      status.setText(`${label}…`);
      const result = await this.migrationModal.runMigrationAction(label, action, {
        nonce: this.parentRenderNonce
      });
      if (result?.ok) {
        this.close();
        return;
      }
      running = false;
      if (leave.isConnected) leave.disabled = false;
      if (ignore.isConnected) ignore.disabled = false;
      if (move.isConnected) move.disabled = false;
      if (status.isConnected) {
        status.setText(result?.busy ? "Another migration action is still running." : "The migration workspace changed. Reopen this unmapped-content window.");
      }
    };
    ignore.onclick = () => {
      void run("Ignore legacy content", () => this.migrationModal.ignoreBlock(this.block));
    };
    move.onclick = () => {
      const destination = select.value;
      void run("Move legacy content", () => this.migrationModal.moveBlock(this.block, destination));
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var LegacyTemplateMigrationModal = class extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.state = null;
    this.scan = null;
    this.current = null;
    this.filterSpecialty = "All";
    this.filterStatus = "All";
    this.mobilePane = "legacy";
    this.compareMode = false;
    this.renderNonce = 0;
    this.isSaving = false;
    this.isClosed = false;
    this.actionPromise = null;
    this.actionStatus = null;
    this.actionStatusText = "";
    this.draftTimer = null;
    this.draftSavePromise = Promise.resolve();
    this.draftSaveError = null;
    this.draftState = "saved";
    this.draftRevision = 0;
    this.closeRequested = false;
    this.busyControls = [];
    this.inputBinding = null;
    this.accessibilityId = id("cst-migration");
  }
  async onOpen() {
    this.isClosed = false;
    this.closeRequested = false;
    const startupToken = {};
    this.startupToken = startupToken;
    this.modalEl.addClass("cst-migration-modal");
    this.contentEl.addClass("cst-migration-workspace");
    const stillOpen = () => !this.isClosed && !this.closeRequested && this.startupToken === startupToken;
    try {
      const structureReady = await this.plugin.quickStructureCheck();
      if (!stillOpen()) return;
      if (!structureReady) {
        this.contentEl.empty();
        this.contentEl.createEl("h2", { text: "Migration paused" });
        const warning = this.contentEl.createEl("p", { text: "This device does not have a complete CST vault yet. Wait for Obsidian Sync to finish, then reopen this workspace.", cls: "cst-warning" });
        warning.setAttribute("role", "alert");
        const close = this.contentEl.createEl("button", { text: "Close" });
        close.onclick = () => {
          void this.close();
        };
        return;
      }
      const prepared = await this.plugin.prepareMigrationSession();
      if (!stillOpen()) return;
      this.state = prepared.state;
      this.scan = prepared.scan;
      await this.render();
      if (!stillOpen()) return;
    } catch (error) {
      if (!stillOpen()) return;
      console.error("CST migration workspace startup", error);
      this.contentEl.empty();
      this.contentEl.createEl("h2", { text: "Migration workspace unavailable" });
      const message = this.contentEl.createEl("p", {
        text: `CST could not open the migration workspace: ${error.message || error}`,
        cls: "cst-warning"
      });
      message.setAttribute("role", "alert");
      message.setAttribute("aria-live", "assertive");
      const close = this.contentEl.createEl("button", { text: "Close" });
      close.onclick = () => {
        void this.close();
      };
    }
  }
  isRenderCurrent(nonce) {
    return !this.isClosed && !this.closeRequested && nonce === this.renderNonce;
  }
  draftStatusMessage(state = this.draftState) {
    if (state === "pending") return "Draft changed - waiting to save";
    if (state === "saving") return "Saving draft…";
    if (state === "error") return "Draft not saved - resolve the session conflict before closing";
    return "Draft saved";
  }
  setDraftStatus(state, message = "") {
    this.draftState = state;
    const text = message || this.draftStatusMessage(state);
    if (!this.draftStatus?.isConnected) return;
    this.draftStatus.setText(text);
    this.draftStatus.setAttribute("data-state", state);
    this.draftStatus.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
  }
  setActionStatus(message = "", isError = false) {
    this.actionStatusText = String(message || "");
    if (!this.actionStatus?.isConnected) return;
    this.actionStatus.setText(this.actionStatusText);
    this.actionStatus.setAttribute("aria-live", isError ? "assertive" : "polite");
    this.actionStatus.toggleClass("cst-warning", !!isError);
  }
  captureInputs() {
    const binding = this.inputBinding;
    if (!binding || binding.nonce !== this.renderNonce || binding.working !== this.current?.working) return;
    const { working, sourceEditor, destinationEditor, noteInput, gloveInput } = binding;
    if (sourceEditor?.isConnected) working.sourceWorking = sourceEditor.value;
    if (destinationEditor?.isConnected) working.destination = destinationEditor.value;
    if (noteInput?.isConnected) working.migrationNote = noteInput.value;
    if (gloveInput?.isConnected) working.pendingGloves = gloveInput.value;
  }
  clearInputBinding() {
    this.inputBinding = null;
    this.sourceEditor = null;
    this.destinationEditor = null;
    this.noteInput = null;
    this.gloveInput = null;
  }
  scheduleDraftSave() {
    if (this.isClosed || this.closeRequested) return;
    this.captureInputs();
    if (!this.state || this.isSaving) return;
    if (this.draftTimer) window.clearTimeout(this.draftTimer);
    const revision = ++this.draftRevision;
    this.draftSaveError = null;
    this.setDraftStatus("pending");
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = null;
      const operation = (this.draftSavePromise || Promise.resolve()).catch(() => {
      }).then(async () => {
        if (this.isClosed) return;
        if (revision === this.draftRevision) this.setDraftStatus("saving");
        await this.plugin.saveMigrationSession(this.state);
      });
      this.draftSavePromise = operation;
      operation.then(() => {
        if (this.isClosed || revision !== this.draftRevision) return;
        this.draftSaveError = null;
        this.setDraftStatus("saved");
      }).catch((error) => {
        if (this.isClosed || revision !== this.draftRevision) return;
        const firstFailure = !this.draftSaveError;
        this.draftSaveError = error;
        this.setDraftStatus("error");
        console.error("CST migration draft autosave", error);
        if (firstFailure) new Notice(`CST migration draft was not saved: ${error.message || error}`);
      });
    }, 750);
    if (typeof this.draftTimer?.unref === "function") this.draftTimer.unref();
  }
  async persist({ capture = true } = {}) {
    if (capture) this.captureInputs();
    if (this.draftTimer) {
      window.clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    const revision = ++this.draftRevision;
    this.setDraftStatus("saving");
    try {
      await (this.draftSavePromise || Promise.resolve());
    } catch (_) {
    }
    try {
      if (this.state) await this.plugin.saveMigrationSession(this.state);
      if (revision === this.draftRevision) {
        this.draftSaveError = null;
        this.setDraftStatus("saved");
      }
    } catch (error) {
      if (revision === this.draftRevision) {
        this.draftSaveError = error;
        this.setDraftStatus("error");
      }
      throw error;
    }
  }
  async runMigrationAction(label, action, options = {}) {
    if (this.isClosed || this.closeRequested) return { ok: false, closed: true };
    if (this.actionPromise) {
      new Notice("Wait for the current migration action to finish.");
      return { ok: false, busy: true };
    }
    const expectedNonce = options.nonce ?? this.renderNonce;
    let operation;
    operation = (async () => {
      this.isSaving = true;
      this.setMigrationControlsBusy(true);
      this.setActionStatus(`${label}…`);
      try {
        if (!this.isRenderCurrent(expectedNonce)) return { ok: false, stale: true };
        const value = await action();
        this.setActionStatus("");
        return { ok: true, value };
      } catch (error) {
        console.error(`CST migration action failed: ${label}`, error);
        let handled = false;
        if (typeof options.onError === "function") {
          try {
            await options.onError(error);
            handled = true;
          } catch (renderError) {
            console.error(`CST migration error renderer failed: ${label}`, renderError);
          }
        }
        const message = `${label} failed: ${error.message || error}`;
        this.setActionStatus(message, true);
        if (!handled || options.alsoNotice) new Notice(message);
        return { ok: false, error };
      } finally {
        this.isSaving = false;
        this.setMigrationControlsBusy(false);
      }
    })();
    this.actionPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.actionPromise === operation) this.actionPromise = null;
    }
  }
  bindMigrationAction(control, label, action, options = {}) {
    const nonce = options.nonce ?? this.renderNonce;
    control.onclick = () => {
      void this.runMigrationAction(label, action, { ...options, nonce });
    };
  }
  filteredPaths() {
    return this.state.order.filter((path) => {
      const f = this.plugin.app.vault.getAbstractFileByPath(path);
      const c = f instanceof TFile ? this.plugin.caseContext(f) : null;
      if (!c) return false;
      if (this.filterSpecialty !== "All" && c.specialty !== this.filterSpecialty) return false;
      if (this.filterStatus !== "All" && this.state.status[path] !== this.filterStatus) return false;
      return true;
    });
  }
  async setCurrent(path) {
    await this.persist();
    this.state.currentPath = path;
    await this.plugin.saveMigrationSession(this.state);
    await this.render();
  }
  async advance() {
    await this.persist();
    const oldPath = this.state.currentPath;
    const fresh = await this.plugin.loadMigrationSession();
    if (fresh) this.state = fresh;
    this.state.currentPath = this.plugin.nextMigrationPath(this.state, oldPath) || "";
    await this.plugin.saveMigrationSession(this.state);
    await this.render(true);
  }
  async previous() {
    await this.persist();
    const i = this.state.order.indexOf(this.state.currentPath);
    for (let x = i - 1; x >= 0; x--) {
      const p = this.state.order[x];
      if (!["migrated", "skipped"].includes(this.state.status[p])) {
        this.state.currentPath = p;
        break;
      }
    }
    await this.plugin.saveMigrationSession(this.state);
    await this.render();
  }
  unresolved() {
    if (!this.current) return [];
    this.captureInputs();
    const working = this.current.working;
    return this.plugin.migrationUnresolved(
      Object.prototype.hasOwnProperty.call(working, "sourceWorking") ? String(working.sourceWorking ?? "") : String(working.sourceOriginal ?? ""),
      Object.prototype.hasOwnProperty.call(working, "destination") ? String(working.destination ?? "") : String(working.baseDestination ?? ""),
      this.current.template.body,
      working
    );
  }
  async moveBlock(block, target) {
    this.captureInputs();
    const w = this.current.working;
    const destination = Object.prototype.hasOwnProperty.call(w, "destination") ? String(w.destination ?? "") : String(w.baseDestination ?? "");
    w.destination = this.plugin.moveMigrationBlock(destination, block, target);
    if (!Array.isArray(w.resolved)) w.resolved = [];
    if (!w.resolved.includes(block.id)) w.resolved.push(block.id);
    await this.plugin.saveMigrationSession(this.state);
    await this.render(true);
  }
  async ignoreBlock(block) {
    this.captureInputs();
    const w = this.current.working;
    if (!Array.isArray(w.ignored)) w.ignored = [];
    if (!w.ignored.includes(block.id)) w.ignored.push(block.id);
    await this.plugin.saveMigrationSession(this.state);
    await this.render(true);
  }
  async sendNeedsReview() {
    this.captureInputs();
    this.state.status[this.state.currentPath] = "needs-review";
    await this.plugin.saveMigrationSession(this.state);
    await this.advance();
  }
  async skipCurrent() {
    this.captureInputs();
    this.state.status[this.state.currentPath] = "skipped";
    await this.plugin.saveMigrationSession(this.state);
    await this.advance();
  }
  async saveAndNext() {
    const path = this.state.currentPath;
    await this.persist();
    if (this.state.currentPath !== path || this.current?.file?.path !== path) {
      throw new Error("The selected migration case changed before Save & Next began.");
    }
    const workingSnapshot = JSON.parse(JSON.stringify(this.current.working || {}));
    const result = await this.plugin.commitMigrationCase(this.state, path, workingSnapshot);
    if (!result.saved) new Notice(`CST: moved to Needs Review — ${result.reason || "unresolved legacy content"}`);
    else new Notice("CST legacy case migrated.");
    const fresh = await this.plugin.loadMigrationSession();
    if (fresh) this.state = fresh;
    this.state.currentPath = this.plugin.nextMigrationPath(this.state, path) || "";
    await this.plugin.saveMigrationSession(this.state);
    await this.render(true);
  }
  setMigrationControlsBusy(busy) {
    if (busy) {
      this.busyControls = [...this.contentEl.querySelectorAll("button,input,textarea,select")].map((control) => ({ control, disabled: !!control.disabled }));
      for (const item of this.busyControls) item.control.disabled = true;
      return;
    }
    for (const item of this.busyControls || []) {
      if (item.control?.isConnected) item.control.disabled = item.disabled;
    }
    this.busyControls = [];
  }
  async mergeLatestTemplate(latest) {
    this.captureInputs();
    const w = this.current.working;
    const destination = Object.prototype.hasOwnProperty.call(w, "destination") ? String(w.destination ?? "") : String(w.baseDestination ?? "");
    const title = this.plugin.parseLegacyMigrationBlocks(destination, latest.body).title || this.current.file.basename;
    let next = this.plugin.migrationBaseDestination(title, latest.body);
    const parsed = this.plugin.parseLegacyMigrationBlocks(destination, latest.body);
    const headings = this.plugin.migrationTemplateHeadings(latest.body);
    for (const block of parsed.blocks) {
      const clean = this.plugin.extractMigrationSectionBody(block, block.suggested).replace(/<!--[\s\S]*?-->/g, "").trim();
      if (!clean) continue;
      const target = headings.find((h) => h.canonical.toLowerCase() === block.canonical.toLowerCase());
      if (target) next = this.plugin.insertMigrationSection(next, target.label, clean);
    }
    w.baseDestination = this.plugin.migrationBaseDestination(title, latest.body);
    w.destination = next;
    w.templatePath = latest.path;
    w.templateKey = latest.key;
    w.templateVersion = latest.version;
    w.templateDriftAccepted = false;
    w.preAutoFillDestination = null;
    await this.plugin.saveMigrationSession(this.state);
    await this.render(true);
  }
  async render(skipCapture = false) {
    if (!skipCapture) this.captureInputs();
    const nonce = ++this.renderNonce;
    this.clearInputBinding();
    if (this.isClosed || this.closeRequested) return;
    const el = this.contentEl;
    el.empty();
    const stats = this.plugin.migrationStats(this.state);
    const top = el.createDiv({ cls: "cst-migration-top" });
    const title = top.createDiv();
    title.createEl("h2", { text: "Legacy Template Migration" });
    title.createEl("div", { text: "Source → reviewed current template", cls: "cst-muted" });
    const filters = top.createDiv({ cls: "cst-migration-filters" });
    const spec = makeSelect(filters, "Filter by specialty");
    addOption(spec, "All", "All specialties");
    this.plugin.getSpecialties().forEach((x) => addOption(spec, x));
    spec.value = this.filterSpecialty;
    spec.onchange = () => {
      void this.runMigrationAction("Filter specialties", async () => {
        this.filterSpecialty = spec.value;
        await this.render();
      }, { nonce });
    };
    const status = makeSelect(filters, "Filter by migration status");
    [["All", "All statuses"], ["remaining", "Remaining"], ["needs-review", "Needs Review"], ["skipped", "Skipped"], ["migrated", "Migrated"]].forEach(([v, t]) => addOption(status, v, t));
    status.value = this.filterStatus;
    status.onchange = () => {
      void this.runMigrationAction("Filter statuses", async () => {
        this.filterStatus = status.value;
        await this.render();
      }, { nonce });
    };
    const progressWrap = el.createDiv({ cls: "cst-migration-progress-wrap" });
    const progress = progressWrap.createEl("progress", { cls: "cst-migration-progress" });
    progress.max = Math.max(1, stats.total);
    progress.value = stats.processed;
    progress.setAttribute("aria-label", `${stats.processed} of ${stats.total} cases reviewed`);
    const progressText = progressWrap.createEl("div", { text: `${stats.processed} / ${stats.total} reviewed this pass · ${stats.left} still open · ${stats.migrated} Migrated · ${stats.remaining} Remaining · ${stats.review} Needs Review · ${stats.skipped} Skipped`, cls: "cst-muted" });
    progressText.setAttribute("role", "status");
    if (!this.state.currentPath) {
      const done = el.createDiv({ cls: "cst-migration-complete" });
      if (stats.review) {
        done.createEl("h3", { text: "Needs Review" });
        done.createEl("p", { text: `${stats.review} cases still require review. They remain untouched until resolved.` });
        const resume = done.createEl("button", { text: "Resume Review Queue", cls: "mod-cta" });
        this.bindMigrationAction(resume, "Resume review queue", async () => {
          this.state.currentPath = this.state.order.find((p) => this.state.status[p] === "needs-review") || "";
          await this.plugin.saveMigrationSession(this.state);
          await this.render();
        }, { nonce });
      } else {
        done.createEl("h3", { text: "Migration queue complete" });
        done.createEl("p", { text: "No Remaining or Needs Review cases are left." });
      }
      if (this.isSaving) this.setMigrationControlsBusy(true);
      return;
    }
    const requestedPath = this.state.currentPath;
    let loaded;
    try {
      loaded = await this.plugin.loadMigrationWorking(this.state, requestedPath);
    } catch (e) {
      if (!this.isRenderCurrent(nonce)) return;
      el.createEl("p", { text: e.message || String(e), cls: "cst-warning" });
      return;
    }
    if (!this.isRenderCurrent(nonce) || this.state.currentPath !== requestedPath) return;
    const { file, context, working } = loaded;
    let latest, sd;
    try {
      latest = context.specialty.toLowerCase() === "spine" && !working.variant ? loaded.template : await this.plugin.getTemplate(context.specialty, working.variant || "");
      if (!this.isRenderCurrent(nonce) || this.state.currentPath !== requestedPath) return;
      sd = await this.plugin.getSurgeonData(context.specialty, context.surgeon, { createIfMissing: false });
    } catch (error) {
      if (!this.isRenderCurrent(nonce)) return;
      el.createEl("p", { text: error.message || String(error), cls: "cst-warning" }).setAttribute("role", "alert");
      return;
    }
    if (!this.isRenderCurrent(nonce) || this.state.currentPath !== requestedPath) return;
    loaded.template = latest;
    this.current = loaded;
    const currentBar = el.createDiv({ cls: "cst-migration-current" });
    const currentText = currentBar.createDiv();
    currentText.createEl("strong", { text: `${context.surgeon} — ${file.basename}` });
    currentText.createEl("div", { text: `${context.specialty} · Template ${working.templateKey || latest.key} ${working.templateVersion || latest.version} · ${this.state.status[file.path]}`, cls: "cst-muted" });
    const index = this.state.order.indexOf(file.path) + 1;
    currentBar.createEl("span", { text: `${index}/${this.state.order.length}`, cls: "cst-muted" });
    if (working.sourceChangedOnDisk) {
      const warning = el.createEl("p", { text: "This case changed outside the migration workspace. Save & Next is paused until the latest source is reopened and reconciled.", cls: "cst-warning" });
      warning.setAttribute("role", "alert");
    }
    if (working.surgeonChangedOnDisk) {
      const warning = el.createDiv({ cls: "cst-warning cst-glove-conflict" });
      warning.setAttribute("role", "alert");
      warning.createEl("p", { text: "This surgeon's glove profile changed outside the migration workspace. Choose which glove value to keep before saving." });
      warning.createEl("div", { text: `Current profile: ${formatGloves(sd.gloves || "Unknown")} · Your draft: ${formatGloves(working.pendingGloves ?? "Unknown")}`, cls: "cst-muted" });
      const resolution = warning.createDiv({ cls: "cst-actions" });
      const useCurrentProfile = resolution.createEl("button", { text: "Use Current Profile" });
      this.bindMigrationAction(useCurrentProfile, "Use current surgeon profile", async () => {
        working.pendingGloves = sd.gloves || "Unknown";
        working.pendingGlovesTouched = true;
        working.surgeonBaselineGloves = sd.gloves || "Unknown";
        working.surgeonBaselineFingerprint = this.plugin.surgeonRecordFingerprint(sd);
        working.surgeonChangedOnDisk = false;
        working.gloveConflict = false;
        await this.plugin.saveMigrationSession(this.state);
        await this.render(true);
      }, { nonce });
      const keepDraftProfile = resolution.createEl("button", { text: "Keep Draft Glove Value", cls: "mod-cta" });
      this.bindMigrationAction(keepDraftProfile, "Keep draft glove value", async () => {
        working.pendingGlovesTouched = true;
        working.surgeonBaselineGloves = sd.gloves || "Unknown";
        working.surgeonBaselineFingerprint = this.plugin.surgeonRecordFingerprint(sd);
        working.surgeonChangedOnDisk = false;
        working.gloveConflict = false;
        await this.plugin.saveMigrationSession(this.state);
        await this.render(true);
      }, { nonce });
    }
    const toolbar = el.createDiv({ cls: "cst-migration-toolbar" });
    const prev = toolbar.createEl("button", { text: "← Previous" });
    this.bindMigrationAction(prev, "Open previous case", () => this.previous(), { nonce });
    const jump = makeSelect(toolbar, "Jump to case");
    addOption(jump, file.path, "Jump to case…");
    for (const p of this.filteredPaths()) {
      const f = this.plugin.app.vault.getAbstractFileByPath(p);
      if (!(f instanceof TFile)) continue;
      addOption(jump, p, `${this.state.status[p]} · ${p.replace(this.plugin.contentRoot + "/", "")}`);
    }
    jump.onchange = () => {
      const path = jump.value;
      void this.runMigrationAction("Open selected case", () => this.setCurrent(path), { nonce });
    };
    if (!Platform.isPhone) {
      const swap = toolbar.createEl("button", { text: "Swap Panes ⇄" });
      this.bindMigrationAction(swap, "Swap migration panes", async () => {
        this.state.paneOrder = this.state.paneOrder === "legacy-left" ? "template-left" : "legacy-left";
        await this.plugin.saveMigrationSession(this.state);
        await this.render();
      }, { nonce });
    }
    const editTemplate = toolbar.createEl("button", { text: "Edit Template" });
    editTemplate.disabled = !(working.templatePath || latest.path);
    editTemplate.onclick = async () => {
      try {
        const result = await this.runMigrationAction("Prepare template editor", async () => {
          await this.persist();
          const path = working.templatePath || latest.path;
          if (!path) throw new Error("No template is selected.");
          return path;
        }, { nonce });
        if (!result.ok) return;
        const closed = await this.close();
        if (closed) await this.plugin.openPath(result.value);
      } catch (error) {
        console.error("CST template editor navigation", error);
        new Notice(`Could not open the template editor: ${error.message || error}`);
      }
    };
    const compare = toolbar.createEl("button", { text: `Compare: ${this.compareMode ? "ON" : "OFF"}` });
    compare.setAttribute("aria-pressed", String(!!this.compareMode));
    this.bindMigrationAction(compare, "Toggle comparison mode", async () => {
      this.compareMode = !this.compareMode;
      await this.render();
    }, { nonce });
    if (context.specialty.toLowerCase() === "spine") {
      const spine = makeSelect(toolbar, "Choose Spine template");
      addOption(spine, "", "Choose Spine template…");
      ["Cervical", "Lumbar", "Thoracic"].forEach((v) => addOption(spine, v));
      spine.value = working.variant || "";
      spine.onchange = () => {
        void this.runMigrationAction("Change Spine template", async () => {
          this.captureInputs();
          working.variant = spine.value;
          working.destination = "";
          working.baseDestination = "";
          working.templateVersion = "";
          working.templatePath = "";
          working.templateKey = "";
          working.autoMapped = [];
          working.autoFill = false;
          working.templateDriftAccepted = false;
          if (working.variant) this.state.status[file.path] = "remaining";
          else this.state.status[file.path] = "needs-review";
          await this.plugin.saveMigrationSession(this.state);
          await this.render(true);
        }, { nonce });
      };
    }
    if (working.templateVersion && latest.version !== working.templateVersion) {
      const drift = el.createDiv({ cls: "cst-template-drift" });
      drift.createEl("strong", { text: `Newer template available: ${working.templateVersion} → ${latest.version}` });
      drift.createEl("span", { text: working.templateDriftAccepted ? " Current working version explicitly accepted." : " Review before saving." });
      const merge = drift.createEl("button", { text: "Merge Latest Template", cls: "mod-cta" });
      this.bindMigrationAction(merge, "Merge latest template", () => this.mergeLatestTemplate(latest), { nonce });
      const keep = drift.createEl("button", { text: "Keep Current Working Copy" });
      this.bindMigrationAction(keep, "Keep current working copy", async () => {
        working.templateDriftAccepted = true;
        await this.plugin.saveMigrationSession(this.state);
        await this.render();
      }, { nonce });
    }
    const sourcePaneId = `${this.accessibilityId}-source-pane`;
    const destinationPaneId = `${this.accessibilityId}-destination-pane`;
    const legacyTabId = `${this.accessibilityId}-legacy-tab`;
    const destinationTabId = `${this.accessibilityId}-destination-tab`;
    if (Platform.isPhone) {
      const tabs = el.createDiv({ cls: "cst-migration-mobile-tabs" });
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "Migration panes");
      const legacyTab = tabs.createEl("button", { text: "Legacy" });
      const newTab = tabs.createEl("button", { text: "New Template" });
      legacyTab.id = legacyTabId;
      newTab.id = destinationTabId;
      legacyTab.setAttribute("role", "tab");
      newTab.setAttribute("role", "tab");
      legacyTab.setAttribute("aria-controls", sourcePaneId);
      newTab.setAttribute("aria-controls", destinationPaneId);
      legacyTab.setAttribute("aria-selected", String(this.mobilePane === "legacy"));
      newTab.setAttribute("aria-selected", String(this.mobilePane === "template"));
      legacyTab.tabIndex = this.mobilePane === "legacy" ? 0 : -1;
      newTab.tabIndex = this.mobilePane === "template" ? 0 : -1;
      if (this.mobilePane === "legacy") legacyTab.addClass("is-active");
      else newTab.addClass("is-active");
      this.bindMigrationAction(legacyTab, "Open legacy pane", async () => {
        this.captureInputs();
        this.mobilePane = "legacy";
        await this.render();
      }, { nonce });
      this.bindMigrationAction(newTab, "Open new-template pane", async () => {
        this.captureInputs();
        this.mobilePane = "template";
        await this.render();
      }, { nonce });
    }
    const panes = el.createDiv({ cls: `cst-migration-panes ${this.state.paneOrder === "template-left" ? "is-swapped" : ""} ${this.compareMode ? "is-compare" : ""}` });
    const sourcePane = panes.createDiv({ cls: `cst-migration-pane cst-source-pane ${Platform.isPhone && this.mobilePane !== "legacy" ? "is-mobile-hidden" : ""}` });
    sourcePane.id = sourcePaneId;
    sourcePane.setAttribute("aria-label", "Legacy source note");
    if (Platform.isPhone) {
      sourcePane.setAttribute("role", "tabpanel");
      sourcePane.setAttribute("aria-labelledby", legacyTabId);
      sourcePane.setAttribute("aria-hidden", String(this.mobilePane !== "legacy"));
    }
    const sourceHeading = sourcePane.createEl("h3", { text: "Legacy Note — Source" });
    sourceHeading.id = `${this.accessibilityId}-source-heading`;
    const sourceSearchControls = sourcePane.createDiv({ cls: "cst-pane-search-controls" });
    const sourceSearch = makeInput(sourceSearchControls, { placeholder: "Search legacy…", ariaLabel: "Search legacy source note" });
    sourceSearch.addClass("cst-pane-search");
    const sourceFind = sourceSearchControls.createEl("button", { text: "Find Next" });
    const sourceStatus = sourcePane.createEl("div", { cls: "cst-pane-search-status cst-muted" });
    sourceStatus.id = `${this.accessibilityId}-source-search-status`;
    sourceStatus.setAttribute("role", "status");
    sourceStatus.setAttribute("aria-live", "polite");
    const sourceEditor = sourcePane.createEl("textarea", { cls: "cst-migration-editor cst-source-editor" });
    this.sourceEditor = sourceEditor;
    sourceEditor.setAttribute("aria-labelledby", sourceHeading.id);
    sourceEditor.setAttribute("aria-describedby", sourceStatus.id);
    sourceEditor.value = Object.prototype.hasOwnProperty.call(working, "sourceWorking") ? String(working.sourceWorking ?? "") : String(working.sourceOriginal ?? "");
    sourceEditor.oninput = () => {
      working.sourceWorking = sourceEditor.value;
      this.scheduleDraftSave();
    };
    wireTextareaSearch(sourceSearch, sourceEditor, sourceFind, sourceStatus);
    const destPane = panes.createDiv({ cls: `cst-migration-pane cst-destination-pane ${Platform.isPhone && this.mobilePane !== "template" ? "is-mobile-hidden" : ""}` });
    destPane.id = destinationPaneId;
    destPane.setAttribute("aria-label", "New template working copy");
    if (Platform.isPhone) {
      destPane.setAttribute("role", "tabpanel");
      destPane.setAttribute("aria-labelledby", destinationTabId);
      destPane.setAttribute("aria-hidden", String(this.mobilePane !== "template"));
    }
    const destinationHeading = destPane.createEl("h3", { text: context.specialty.toLowerCase() === "spine" && !working.variant ? "Newest Template — Choose Spine Template" : `Newest Template — ${latest.key} ${latest.version}` });
    destinationHeading.id = `${this.accessibilityId}-destination-heading`;
    if (!Object.prototype.hasOwnProperty.call(working, "pendingGloves")) working.pendingGloves = sd.gloves || "Unknown";
    const surgeonControls = destPane.createDiv({ cls: "cst-migration-surgeon-controls" });
    surgeonControls.createEl("label", { text: "MD Gloves" });
    const gloveInput = makeInput(surgeonControls, { value: working.pendingGloves ?? "", placeholder: glove_settings_exports.gloveHelpText(this.plugin.settings).example });
    gloveInput.onkeydown = exitSingleLineOnEnter;
    this.gloveInput = gloveInput;
    const gloveHint = surgeonControls.createEl("div", { text: "Migration-only control. On successful Save & Next this updates the surgeon record; it is never written as static text into the case.", cls: "cst-muted" });
    gloveHint.id = `${this.accessibilityId}-glove-hint`;
    const gloveError = surgeonControls.createEl("div", { cls: "cst-warning cst-glove-error" });
    gloveError.id = `${this.accessibilityId}-glove-error`;
    gloveError.setAttribute("role", "alert");
    gloveError.setAttribute("aria-live", "assertive");
    gloveInput.setAttribute("aria-describedby", `${gloveHint.id} ${gloveError.id}`);
    const preview = destPane.createEl("div", { text: `${context.surgeon} · ${working.pendingGloves ?? "Unknown"} · ${sd.gown || "Unknown"}`, cls: "cst-migration-surgeon-header" });
    const updateGlovePreview = (normalize = false, userInitiated = false) => {
      const raw = gloveInput.value;
      working.pendingGloves = raw;
      if (userInitiated) working.pendingGlovesTouched = true;
      try {
        const canon = normalizeGloves2(raw, this.plugin.settings);
        gloveError.setText("");
        if (normalize) {
          gloveInput.value = canon;
          working.pendingGloves = canon;
        }
        preview.setText(`${context.surgeon} · ${canon} · ${sd.gown || "Unknown"}`);
      } catch (e) {
        gloveError.setText(e.message || String(e));
        preview.setText(`${context.surgeon} · ${raw || "Unknown"} · ${sd.gown || "Unknown"}`);
      }
    };
    gloveInput.oninput = () => {
      updateGlovePreview(false, true);
      this.scheduleDraftSave();
    };
    gloveInput.onchange = () => {
      updateGlovePreview(true, true);
      this.scheduleDraftSave();
    };
    updateGlovePreview(false, false);
    if (working.gloveConflict && working.legacyMdGloves) {
      const conflict3 = destPane.createDiv({ cls: "cst-glove-conflict" });
      conflict3.createEl("strong", { text: "Legacy MD glove conflict" });
      conflict3.createEl("div", { text: `Current surgeon: ${formatGloves(sd.gloves || "Unknown")} · Legacy MD: ${formatGloves(working.legacyMdGloves)}`, cls: "cst-muted" });
      const buttons = conflict3.createDiv({ cls: "cst-actions" });
      const keep = buttons.createEl("button", { text: "Keep Current" });
      this.bindMigrationAction(keep, "Keep current glove profile", async () => {
        working.pendingGloves = sd.gloves || "Unknown";
        working.pendingGlovesTouched = true;
        working.gloveConflict = false;
        await this.plugin.saveMigrationSession(this.state);
        await this.render(true);
      }, { nonce });
      const use = buttons.createEl("button", { text: "Use Legacy", cls: "mod-cta" });
      this.bindMigrationAction(use, "Use legacy glove value", async () => {
        working.pendingGloves = working.legacyMdGloves;
        working.pendingGlovesTouched = true;
        working.gloveConflict = false;
        await this.plugin.saveMigrationSession(this.state);
        await this.render(true);
      }, { nonce });
    }
    const migrationSource = Object.prototype.hasOwnProperty.call(working, "sourceWorking") ? String(working.sourceWorking ?? "") : String(working.sourceOriginal ?? "");
    const migrationDestination = Object.prototype.hasOwnProperty.call(working, "destination") ? String(working.destination ?? "") : String(working.baseDestination ?? "");
    const unresolved = this.plugin.migrationUnresolved(migrationSource, migrationDestination, latest.body, working);
    const unmapped = context.specialty.toLowerCase() === "spine" && !working.variant ? [] : this.plugin.migrationUnmapped(migrationSource, migrationDestination, latest.body, working);
    const destSearchControls = destPane.createDiv({ cls: "cst-pane-search-controls" });
    const destSearch = makeInput(destSearchControls, { placeholder: "Search new template…", ariaLabel: "Search new template working copy" });
    destSearch.addClass("cst-pane-search");
    const destFind = destSearchControls.createEl("button", { text: "Find Next" });
    const destStatus = destPane.createEl("div", { cls: "cst-pane-search-status cst-muted" });
    destStatus.id = `${this.accessibilityId}-destination-search-status`;
    destStatus.setAttribute("role", "status");
    destStatus.setAttribute("aria-live", "polite");
    const destinationEditor = destPane.createEl("textarea", { cls: "cst-migration-editor cst-destination-editor" });
    this.destinationEditor = destinationEditor;
    destinationEditor.setAttribute("aria-labelledby", destinationHeading.id);
    destinationEditor.setAttribute("aria-describedby", destStatus.id);
    destinationEditor.value = migrationDestination;
    destinationEditor.oninput = () => {
      working.destination = destinationEditor.value;
      this.scheduleDraftSave();
    };
    wireTextareaSearch(destSearch, destinationEditor, destFind, destStatus);
    if (unmapped.length) {
      const panel = destPane.createDiv({ cls: "cst-unmapped-panel cst-unmapped-integrated" });
      const head = panel.createDiv({ cls: "cst-unmapped-panel-head" });
      head.createEl("strong", { text: `⚠ Unmapped Legacy Content — ${unmapped.length}` });
      const pop = head.createEl("button", { text: "Pop Out Unmapped" });
      pop.onclick = () => new UnmappedContentModal(this.plugin, this, unmapped[0], this.plugin.migrationTemplateHeadings(latest.body)).open();
      const block = unmapped[Math.min(working.unmappedIndex || 0, unmapped.length - 1)];
      working.unmappedIndex = Math.min(working.unmappedIndex || 0, unmapped.length - 1);
      const row = panel.createDiv({ cls: "cst-unmapped-focus" });
      row.createEl("strong", { text: block.label });
      const pre = row.createEl("pre", { cls: "cst-unmapped-preview" });
      pre.setText(block.content);
      const controls = row.createDiv({ cls: "cst-unmapped-inline-controls" });
      controls.createEl("label", { text: "Destination" });
      const select = makeSelect(controls, "Destination");
      const headings = this.plugin.migrationTemplateHeadings(latest.body);
      const opts = [block.suggested, ...headings.map((h) => h.label), "Keep as Custom Heading"].filter(Boolean);
      [...new Set(opts)].forEach((x) => addOption(select, x));
      select.value = block.suggested || opts[0] || "Notes";
      const previewBox = row.createDiv({ cls: "cst-unmapped-destination-preview" });
      const updateDestPreview = () => {
        const currentDestination = Object.prototype.hasOwnProperty.call(working, "destination") ? String(working.destination ?? "") : String(working.baseDestination ?? "");
        const content = select.value === "Keep as Custom Heading" ? "Custom heading will be appended to the migrated note." : this.plugin.migrationSectionContent(currentDestination, select.value);
        previewBox.setText(content || "Destination section is currently empty.");
      };
      select.onchange = updateDestPreview;
      updateDestPreview();
      const actions = row.createDiv({ cls: "cst-unmapped-actions" });
      const move = actions.createEl("button", { text: "Move Content", cls: "mod-cta" });
      this.bindMigrationAction(move, "Move legacy content", () => this.moveBlock(block, select.value), { nonce });
      const ignore = actions.createEl("button", { text: "Ignore Intentionally" });
      this.bindMigrationAction(ignore, "Ignore legacy content", () => this.ignoreBlock(block), { nonce });
      if (unmapped.length > 1) {
        const prevU = actions.createEl("button", { text: "← Previous Unmapped" });
        this.bindMigrationAction(prevU, "Open previous unmapped block", async () => {
          working.unmappedIndex = (working.unmappedIndex - 1 + unmapped.length) % unmapped.length;
          await this.plugin.saveMigrationSession(this.state);
          await this.render(true);
        }, { nonce });
        const nextU = actions.createEl("button", { text: "Next Unmapped →" });
        this.bindMigrationAction(nextU, "Open next unmapped block", async () => {
          working.unmappedIndex = (working.unmappedIndex + 1) % unmapped.length;
          await this.plugin.saveMigrationSession(this.state);
          await this.render(true);
        }, { nonce });
      }
      panel.createEl("div", { text: `${working.unmappedIndex + 1} of ${unmapped.length} unresolved`, cls: "cst-muted" });
    } else {
      destPane.createEl("div", { text: "✓ Unmapped Content — 0", cls: "cst-success cst-unmapped-clear" });
    }
    const accounting = el.createDiv({ cls: "cst-source-accounting" });
    accounting.createEl("strong", { text: "Source Accounting" });
    const parsed = this.plugin.parseLegacyMigrationBlocks(migrationSource, latest.body);
    const unresolvedIds = new Set(unresolved.map((x) => x.id));
    const ignoredIds = new Set(working.ignored || []);
    const acct = accounting.createDiv({ cls: "cst-accounting-chips" });
    for (const block of parsed.blocks) {
      const blockState = ignoredIds.has(block.id) ? "ignored" : unresolvedIds.has(block.id) ? "unresolved" : "resolved";
      if (blockState === "unresolved") {
        const mark = acct.createEl("button", { text: `! ${block.label}`, cls: "cst-accounting-unresolved" });
        mark.setAttribute("title", "Review unresolved source content");
        mark.onclick = () => new UnmappedContentModal(this.plugin, this, block, this.plugin.migrationTemplateHeadings(latest.body)).open();
      } else {
        acct.createSpan({ text: `${blockState === "resolved" ? "✓" : "–"} ${block.label}`, cls: `cst-accounting-${blockState}` });
      }
    }
    const noteWrap = el.createDiv({ cls: "cst-migration-note" });
    noteWrap.createEl("label", { text: "Migration note" });
    const noteInput = makeInput(noteWrap, { value: working.migrationNote ?? "", placeholder: "Scratch note - not written into the case", ariaLabel: "Migration scratch note" });
    this.noteInput = noteInput;
    noteInput.oninput = () => this.scheduleDraftSave();
    this.inputBinding = {
      nonce,
      working,
      sourceEditor,
      destinationEditor,
      noteInput,
      gloveInput
    };
    const bottom = el.createDiv({ cls: "cst-migration-bottom" });
    this.draftStatus = bottom.createSpan({ text: this.draftStatusMessage(), cls: "cst-muted cst-migration-draft-status" });
    this.draftStatus.setAttribute("role", "status");
    this.setDraftStatus(this.draftState);
    this.actionStatus = bottom.createSpan({ text: this.actionStatusText, cls: "cst-muted cst-migration-action-status" });
    this.actionStatus.setAttribute("role", "status");
    this.actionStatus.setAttribute("aria-live", "polite");
    const skip = bottom.createEl("button", { text: "Skip" });
    this.bindMigrationAction(skip, "Skip case", () => this.skipCurrent(), { nonce });
    const review = bottom.createEl("button", { text: "Send to Needs Review" });
    this.bindMigrationAction(review, "Send case to Needs Review", () => this.sendNeedsReview(), { nonce });
    const undo = bottom.createEl("button", { text: "Undo Last Saved Migration" });
    undo.disabled = !this.state.lastSaved;
    this.bindMigrationAction(undo, "Undo last saved migration", async () => {
      await this.plugin.undoLastMigration(this.state);
      await this.render();
    }, { nonce });
    const save = bottom.createEl("button", { text: "Save & Next", cls: "mod-cta" });
    this.saveButton = save;
    this.bindMigrationAction(save, "Save and open next case", () => this.saveAndNext(), {
      nonce,
      onError: async (error) => {
        const diagnostic = await this.plugin.createDiagnostic("Legacy Migration Save & Next", error, {
          stage: "legacy migration queue advancement",
          paths: [file.path]
        });
        new DiagnosticModal(this.plugin, diagnostic).open();
        new Notice("CST migration could not advance. A diagnostic was generated.");
        if (!this.isClosed) await this.render(true);
      }
    });
    if (this.isSaving) this.setMigrationControlsBusy(true);
  }
  async close() {
    if (this.isClosed) return true;
    if (this.isSaving || this.actionPromise) {
      new Notice("Wait for the current migration action to finish before closing the workspace.");
      return false;
    }
    if (this.closeRequested) return false;
    this.closeRequested = true;
    this.setMigrationControlsBusy(true);
    this.captureInputs();
    try {
      await this.persist({ capture: false });
      this.draftSaveError = null;
      this.isClosed = true;
      ++this.renderNonce;
      this.clearInputBinding();
      super.close();
      return true;
    } catch (e) {
      console.error("CST migration close save", e);
      this.draftSaveError = e;
      this.setDraftStatus("error", "Draft not saved - workspace kept open");
      new Notice(`CST migration workspace stayed open because its draft could not be saved: ${e.message || e}`);
      return false;
    } finally {
      if (!this.isClosed) {
        this.closeRequested = false;
        this.setMigrationControlsBusy(false);
      }
    }
  }
  onClose() {
    this.isClosed = true;
    this.closeRequested = true;
    ++this.renderNonce;
    if (this.draftTimer) window.clearTimeout(this.draftTimer);
    this.draftTimer = null;
    this.clearInputBinding();
    this.busyControls = [];
    this.contentEl.empty();
  }
};
var CSTSettingsTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("cst-settings-editor");
    containerEl.onkeydown = exitSingleLineOnEnter;
    containerEl.createEl("h2", { text: "CST Notes" });
    let stagedContentRoot = this.plugin.settings.contentRoot;
    let stagedBackendRoot = this.plugin.settings.backendRoot;
    const persistSetting = async (key4, value, label) => {
      const previous = this.plugin.settings[key4];
      this.plugin.settings[key4] = value;
      try {
        await this.plugin.saveSettings();
      } catch (error) {
        this.plugin.settings[key4] = previous;
        console.error(`CST setting save failed: ${label}`, error);
        new Notice(`${label} was not saved: ${error.message || error}`);
      }
    };
    new Setting(containerEl).setName("Content root").setDesc("Only this tree is treated as the CST case database.").addText((t) => t.setValue(stagedContentRoot).onChange((v) => {
      stagedContentRoot = v;
    }));
    new Setting(containerEl).setName("Backend root").setDesc("All generated/admin/template/data infrastructure lives here.").addText((t) => t.setValue(stagedBackendRoot).onChange((v) => {
      stagedBackendRoot = v;
    }));
    new Setting(containerEl).setName("Apply root paths").setDesc("Root paths are staged above and are never committed while you type. Initialized vaults are locked to prevent an accidental split; moving a live database requires a dedicated migration.").addButton((button) => button.setButtonText("Validate and Apply").setCta().onClick(async () => {
      const previousContentRoot = this.plugin.settings.contentRoot;
      const previousBackendRoot = this.plugin.settings.backendRoot;
      try {
        const contentRoot = validateConfiguredVaultRoot(stagedContentRoot, "Content root");
        const backendRoot = validateConfiguredVaultRoot(stagedBackendRoot, "Backend root");
        if (vaultPathsOverlap(contentRoot, backendRoot)) throw new Error("Content root and Backend root must be separate, non-nested folders.");
        const launcher = normalizePath(this.plugin.settings.launcherPath || "CST App.md");
        if (launcher === contentRoot || launcher.startsWith(contentRoot + "/") || launcher === backendRoot || launcher.startsWith(backendRoot + "/")) {
          throw new Error("The launcher note must stay outside both managed roots.");
        }
        if (contentRoot === this.plugin.settings.contentRoot && backendRoot === this.plugin.settings.backendRoot) {
          new Notice("CST root paths are unchanged.");
          return;
        }
        const existing = this.plugin.detectExistingCSTArtifacts();
        if (this.plugin.settings.initialized || existing.exists) {
          throw new Error("Root paths are locked because CST data already exists. No setting was changed.");
        }
        this.plugin.settings.contentRoot = contentRoot;
        this.plugin.settings.backendRoot = backendRoot;
        await this.plugin.saveSettings();
        this.plugin.updateManagedBodyClass();
        new Notice("CST root paths saved. Initialize CST Notes to create the new empty structure.");
        this.display();
      } catch (error) {
        this.plugin.settings.contentRoot = previousContentRoot;
        this.plugin.settings.backendRoot = previousBackendRoot;
        new Notice(error.message || String(error));
      }
    }));
    glove_settings_exports.renderGloveSettingsEditor(containerEl, this.plugin);
    new Setting(containerEl).setName("Open CST app at startup").setDesc("Desktop opens the CST view in the right sidebar; mobile opens it as a normal tab.").addToggle((t) => t.setValue(!!this.plugin.settings.autoOpenSidebar).onChange((v) => {
      void persistSetting("autoOpenSidebar", v, "Open CST app at startup");
    }));
    new Setting(containerEl).setName("Open CST app").addButton((b) => b.setButtonText("Open").onClick(() => this.plugin.navigateFromUI("Open CST app", () => this.plugin.activateSidebar())));
    new Setting(containerEl).setName("Initialize / repair").addButton((b) => b.setButtonText("Open setup").onClick(() => new SetupModal(this.plugin, true).open()));
  }
};
module.exports = CSTNotesPlugin;

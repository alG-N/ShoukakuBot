const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');

const args = new Set(process.argv.slice(2));
const modeCheck = args.has('--check');
const modeReport = args.has('--report') || !modeCheck;

function walkTsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(full));
      continue;
    }
    if (entry.isFile() && full.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

function toRel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function collect() {
  const files = walkTsFiles(SRC_DIR);
  const declarations = [];
  const anyStubs = [];

  const ifaceRegex = /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_]+)/;
  const typeRegex = /^\s*(?:export\s+)?type\s+([A-Za-z0-9_]+)\s*=/;
  const anyStubRegex = /^\s*(?:export\s+)?type\s+([A-Za-z0-9_]+)\s*=\s*any\s*;?\s*$/;

  for (const file of files) {
    const rel = toRel(file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const anyMatch = line.match(anyStubRegex);
      if (anyMatch) {
        anyStubs.push({ name: anyMatch[1], file: rel, line: i + 1 });
      }

      const iMatch = line.match(ifaceRegex);
      if (iMatch) {
        declarations.push({ name: iMatch[1], kind: 'interface', file: rel, line: i + 1 });
        continue;
      }

      const tMatch = line.match(typeRegex);
      if (tMatch) {
        declarations.push({ name: tMatch[1], kind: 'type', file: rel, line: i + 1 });
      }
    }
  }

  const grouped = new Map();
  for (const d of declarations) {
    if (!grouped.has(d.name)) grouped.set(d.name, []);
    grouped.get(d.name).push(d);
  }

  const duplicates = [];
  for (const [name, items] of grouped.entries()) {
    const uniqueFiles = [...new Set(items.map((x) => x.file))];
    if (uniqueFiles.length > 1) {
      duplicates.push({
        name,
        declCount: items.length,
        fileCount: uniqueFiles.length,
        kinds: [...new Set(items.map((x) => x.kind))],
        files: uniqueFiles,
      });
    }
  }

  duplicates.sort((a, b) => b.declCount - a.declCount || a.name.localeCompare(b.name));
  anyStubs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  return { duplicates, anyStubs, fileCount: files.length };
}

function printReport(result) {
  console.log('Type Guardrails Report');
  console.log('======================');
  console.log(`Scanned files: ${result.fileCount}`);
  console.log(`Duplicate type/interface names: ${result.duplicates.length}`);
  console.log(`Forbidden type = any stubs: ${result.anyStubs.length}`);
  console.log('');

  if (result.duplicates.length > 0) {
    console.log('Duplicate declarations (report-only):');
    for (const d of result.duplicates) {
      console.log(`- ${d.name} | declarations=${d.declCount} | files=${d.fileCount} | kinds=${d.kinds.join(',')}`);
      for (const file of d.files) {
        console.log(`  - ${file}`);
      }
    }
    console.log('');
  }

  if (result.anyStubs.length > 0) {
    console.log('Forbidden any stubs:');
    for (const s of result.anyStubs) {
      console.log(`- ${s.file}:${s.line} (${s.name})`);
    }
    console.log('');
  }
}

const result = collect();

if (modeReport) {
  printReport(result);
}

if (modeCheck && result.anyStubs.length > 0) {
  console.error(`Check failed: found ${result.anyStubs.length} forbidden type = any stubs.`);
  process.exit(1);
}

process.exit(0);

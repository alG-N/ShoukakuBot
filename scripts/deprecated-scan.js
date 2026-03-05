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
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function toRel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function collectDeprecatedDeclarations(files) {
  const declarations = [];
  const symbolRegex = /^(?:\s*export\s+)?(?:abstract\s+)?(?:class|function|const|let|var|type|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

  for (const file of files) {
    const rel = toRel(file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      if (!/@deprecated\b/.test(lines[i])) {
        continue;
      }

      for (let j = i + 1; j < Math.min(lines.length, i + 30); j++) {
        const next = lines[j].trim();
        if (!next) {
          continue;
        }

        if (next.startsWith('*') || next.startsWith('/**') || next.startsWith('*/')) {
          continue;
        }

        const match = next.match(symbolRegex);
        if (match) {
          declarations.push({
            symbol: match[1],
            file: rel,
            line: j + 1,
          });
          break;
        }

        break;
      }
    }
  }

  const unique = new Map();
  for (const decl of declarations) {
    const key = `${decl.file}:${decl.line}:${decl.symbol}`;
    unique.set(key, decl);
  }

  return [...unique.values()];
}

function collectUsage(files, deprecatedDecls) {
  const bySymbol = new Map();
  for (const decl of deprecatedDecls) {
    if (!bySymbol.has(decl.symbol)) {
      bySymbol.set(decl.symbol, []);
    }
    bySymbol.get(decl.symbol).push(decl);
  }

  const usages = [];

  for (const file of files) {
    const rel = toRel(file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!line || /^\s*\/\//.test(trimmed) || trimmed.startsWith('/**') || trimmed.startsWith('*') || trimmed.startsWith('*/')) {
        continue;
      }

      for (const [symbol, decls] of bySymbol.entries()) {
        const symbolRegex = new RegExp(`\\b${symbol}\\b`);
        if (!symbolRegex.test(line)) {
          continue;
        }

        const isOwnDeclarationLine = decls.some((d) => d.file === rel && d.line === i + 1);
        if (isOwnDeclarationLine) {
          continue;
        }

        usages.push({
          symbol,
          file: rel,
          line: i + 1,
          text: line.trim(),
        });
      }
    }
  }

  return usages;
}

function groupUsageBySymbol(usages) {
  const map = new Map();
  for (const usage of usages) {
    if (!map.has(usage.symbol)) {
      map.set(usage.symbol, []);
    }
    map.get(usage.symbol).push(usage);
  }
  return map;
}

function printReport(result) {
  console.log('Deprecated Scan Report');
  console.log('======================');
  console.log(`Scanned files: ${result.fileCount}`);
  console.log(`Deprecated declarations: ${result.declarations.length}`);
  console.log(`Deprecated symbol usages: ${result.usages.length}`);
  console.log('');

  if (result.declarations.length > 0) {
    console.log('Deprecated declarations:');
    for (const decl of result.declarations) {
      console.log(`- ${decl.symbol} @ ${decl.file}:${decl.line}`);
    }
    console.log('');
  }

  if (result.usages.length > 0) {
    console.log('Usages of deprecated symbols:');
    const grouped = groupUsageBySymbol(result.usages);
    for (const [symbol, usages] of grouped.entries()) {
      console.log(`- ${symbol} (${usages.length})`);
      for (const usage of usages.slice(0, 20)) {
        console.log(`  - ${usage.file}:${usage.line}`);
      }
      if (usages.length > 20) {
        console.log(`  - ... and ${usages.length - 20} more`);
      }
    }
    console.log('');
  }
}

function main() {
  const files = walkTsFiles(SRC_DIR);
  const declarations = collectDeprecatedDeclarations(files);
  const usages = collectUsage(files, declarations);

  const result = {
    fileCount: files.length,
    declarations,
    usages,
  };

  if (modeReport) {
    printReport(result);
  }

  if (modeCheck && usages.length > 0) {
    console.error(`Check failed: found ${usages.length} usages of deprecated symbols.`);
    process.exit(1);
  }
}

main();

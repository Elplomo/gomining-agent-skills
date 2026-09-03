#!/usr/bin/env node
// Structural validator for the GoMining Agent Skills repository.
//
// Acts as the repository's "test" command: it verifies that the skills content
// is well-formed enough to be consumed by the documented tooling (the `skills`
// CLI, Claude Code plugin loading, and programmatic `skills.json` access).
//
// Exit codes:
//   0  -> no fatal structural errors (advisory warnings may still be printed)
//   1  -> at least one fatal structural error
//
// Fatal errors are broken structure that would stop a consumer from loading a
// skill (missing SKILL.md/skill.json, invalid JSON, missing YAML frontmatter,
// or an unparseable top-level manifest). Manifest/directory drift and missing
// reference files are reported as warnings so that pre-existing content issues
// do not block the environment from booting.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skillsDir = path.join(root, 'skills');
const manifestPath = path.join(root, 'skills.json');

const errors = [];
const warnings = [];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// 1. Top-level manifest must exist and be valid JSON with a skills array.
let manifest;
try {
  manifest = readJson(manifestPath);
} catch (e) {
  errors.push(`skills.json is not valid JSON: ${e.message}`);
}
if (manifest && !Array.isArray(manifest.skills)) {
  errors.push('skills.json is missing a top-level "skills" array.');
}

// 2. Enumerate skill directories.
if (!fs.existsSync(skillsDir)) {
  errors.push('skills/ directory does not exist.');
}
const skillDirs = fs.existsSync(skillsDir)
  ? fs.readdirSync(skillsDir).filter((d) => fs.statSync(path.join(skillsDir, d)).isDirectory())
  : [];

// 3. Per-skill structural checks (fatal).
for (const name of skillDirs) {
  const dir = path.join(skillsDir, name);
  const skillMd = path.join(dir, 'SKILL.md');
  const skillJson = path.join(dir, 'skill.json');

  if (!fs.existsSync(skillMd)) {
    errors.push(`${name}: missing SKILL.md`);
  } else {
    const content = fs.readFileSync(skillMd, 'utf8');
    if (!/^---\n[\s\S]*?\n---/.test(content)) {
      errors.push(`${name}: SKILL.md is missing YAML frontmatter`);
    }
    // Advisory: check that reference links resolve on disk.
    for (const m of content.matchAll(/\((references\/[^)]+\.md)\)/g)) {
      const refPath = path.join(dir, m[1]);
      if (!fs.existsSync(refPath)) {
        warnings.push(`${name}: referenced file not found -> ${m[1]}`);
      }
    }
  }

  if (!fs.existsSync(skillJson)) {
    errors.push(`${name}: missing skill.json`);
  } else {
    try {
      const meta = readJson(skillJson);
      if (!meta.name) warnings.push(`${name}: skill.json has no "name" field`);
    } catch (e) {
      errors.push(`${name}: skill.json is not valid JSON: ${e.message}`);
    }
  }
}

// 4. Manifest <-> directory drift (advisory).
if (manifest && Array.isArray(manifest.skills)) {
  const manifestNames = manifest.skills.map((s) => s.name);
  for (const name of skillDirs) {
    if (!manifestNames.includes(name)) {
      warnings.push(`directory "${name}" is not listed in skills.json`);
    }
  }
  for (const name of manifestNames) {
    if (!skillDirs.includes(name)) {
      warnings.push(`skills.json lists "${name}" but skills/${name} does not exist`);
    }
  }
}

// Report.
console.log(`Validated ${skillDirs.length} skill directories.`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length) {
  console.error(`\n${errors.length} fatal error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\nStructural validation passed (no fatal errors).');

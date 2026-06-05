#!/usr/bin/env node
// PostToolUse (Edit|Write) : eslint --fix sur le .ts/.tsx modifié. Toujours exit 0.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
try {
  const fp = JSON.parse(readFileSync(0, 'utf8')).tool_input?.file_path || '';
  if (/\.(ts|tsx)$/.test(fp)) { try { execSync(`npx eslint --fix "${fp}"`, { stdio: 'pipe' }); } catch {} }
} catch {}
process.exit(0);

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBusinessImportGraph, summarizeImportGraph } from './lib/business-boundaries.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--report')) {
  throw new Error('Usage: node scripts/check-business-boundaries.mjs [--report path.json]');
}
const report = summarizeImportGraph(readBusinessImportGraph(root));
if (args[0] === '--report')
  writeFileSync(resolve(process.cwd(), args[1]), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Business boundaries: ${report.sourceFiles} source files, ${report.imports} imports, ${report.serviceBarrelConsumers} service-barrel consumers, ${report.valueSyntaxCycles.length} value-syntax cycle components.`,
);
for (const violation of report.violations) console.error(violation.message);
if (report.violations.length) process.exitCode = 1;
else console.log('Deterministic game boundary and explicit service entries: PASS.');

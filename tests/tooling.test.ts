import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const versions = JSON.parse(
  readFileSync(new URL('../scripts/ddragon-version.json', import.meta.url), 'utf8'),
) as {
  dataDragon: string;
  communityDragon: string;
};
const downloadScript = readFileSync(
  new URL('../scripts/download-ddragon.js', import.meta.url),
  'utf8',
);
const parserScript = readFileSync(
  new URL('../scripts/parse-champions.js', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };
const cleanBuildScript = readFileSync(
  new URL('../scripts/test-clean-asset-build.mjs', import.meta.url),
  'utf8',
);

describe('asset tooling', () => {
  it('uses repository-pinned Riot data versions', () => {
    expect(versions.dataDragon).toMatch(/^\d+\.\d+\.\d+$/);
    expect(versions.communityDragon).toMatch(/^\d+\.\d+$/);
    expect(downloadScript).toContain("path.join(__dirname, 'ddragon-version.json')");
    expect(parserScript).toContain("path.join(__dirname, 'ddragon-version.json')");
    expect(parserScript).not.toContain('raw.communitydragon.org/latest');
  });

  it('verifies assets before and after builds, including a clean repository build', () => {
    expect(packageJson.scripts.prebuild).toBe('npm run assets:verify');
    expect(packageJson.scripts.postbuild).toBe('npm run assets:verify:dist');
    expect(packageJson.scripts.check).toContain('npm run test:assets-clean');
    expect(cleanBuildScript).toContain("'public/lol/data/'");
    expect(cleanBuildScript).toContain("spawnSync('npm', ['run', 'build']");
  });
});

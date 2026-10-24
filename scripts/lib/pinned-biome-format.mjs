import { spawn } from 'node:child_process';
import path from 'node:path';

export async function formatWithPinnedBiome({ root, source, stdinFilePath, label }) {
  const maxInputBytes = 2 * 1024 * 1024;
  if (Buffer.byteLength(source, 'utf8') > maxInputBytes) {
    throw new Error(`${label}: input exceeds the dedicated 2 MiB formatting limit.`);
  }
  return new Promise((resolve, reject) => {
    const formatter = spawn(
      process.execPath,
      [
        path.join(root, 'node_modules/@biomejs/biome/bin/biome'),
        'format',
        `--stdin-file-path=${stdinFilePath}`,
        `--files-max-size=${maxInputBytes}`,
      ],
      { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const output = [];
    const errors = [];
    let outputBytes = 0;
    const timeout = setTimeout(() => {
      formatter.kill('SIGKILL');
      reject(new Error(`${label}: pinned Biome formatting timed out.`));
    }, 30_000);
    formatter.stdout.on('data', (bytes) => {
      outputBytes += bytes.length;
      if (outputBytes > 16 * 1024 * 1024) {
        formatter.kill('SIGKILL');
        reject(new Error(`${label}: formatted output exceeds the output limit.`));
      } else output.push(bytes);
    });
    formatter.stderr.on('data', (bytes) => errors.push(bytes));
    formatter.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`${label}: pinned Biome could not start (${error.message}).`));
    });
    formatter.on('close', (code) => {
      clearTimeout(timeout);
      const formatted = Buffer.concat(output).toString('utf8');
      const diagnostic = Buffer.concat(errors).toString('utf8').trim();
      // Biome can return zero while ignoring a path or a size-limited input.
      if (code !== 0 || !formatted.trim() || diagnostic) {
        reject(new Error(`${label}: pinned Biome formatting failed (${diagnostic || code}).`));
      } else resolve(formatted);
    });
    formatter.stdin.on('error', (error) => {
      if (!('code' in error) || error.code !== 'EPIPE') reject(error);
    });
    formatter.stdin.end(source);
  });
}

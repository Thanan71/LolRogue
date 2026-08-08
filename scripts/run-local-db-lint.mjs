import { spawnSync } from 'node:child_process';

const retryable =
  /Failed to connect|failed to connect|connection refused|database system is starting/i;
const maxAttempts = 15;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const lint = spawnSync('supabase', ['db', 'lint', '--level', 'warning'], {
    encoding: 'utf8',
  });
  if (lint.status === 0) {
    process.stdout.write(lint.stdout);
    process.stderr.write(lint.stderr);
    process.exit(0);
  }

  const output = `${lint.stdout}\n${lint.stderr}`;
  if (!retryable.test(output) || attempt === maxAttempts) {
    process.stdout.write(lint.stdout);
    process.stderr.write(lint.stderr);
    process.exit(lint.status ?? 1);
  }

  process.stderr.write(
    `PostgreSQL redémarre, nouvelle tentative de lint (${attempt}/${maxAttempts})…\n`,
  );
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
}

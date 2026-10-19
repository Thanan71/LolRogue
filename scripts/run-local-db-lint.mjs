import { spawnSync } from 'node:child_process';
import { repositoryRoot, requireNode24, requirePinnedCli } from './lib/critical-command.mjs';
import { assertLocalDatabaseEnvironment, supabaseEnvironment } from './lib/remote-operation.mjs';

requireNode24();
assertLocalDatabaseEnvironment();
const supabase = requirePinnedCli('supabase');

const retryable =
  /Failed to connect|failed to connect|connection refused|database system is starting/i;
const maxAttempts = 15;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  assertLocalDatabaseEnvironment();
  const lint = spawnSync(supabase, ['db', 'lint', '--local', '--level', 'warning'], {
    cwd: repositoryRoot,
    env: supabaseEnvironment(),
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

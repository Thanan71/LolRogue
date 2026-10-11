import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { constants } from 'node:os';
import path from 'node:path';
import { requirePinnedCli } from './critical-command.mjs';

/**
 * Run argument vectors sequentially, preserving child output, failures and interruptions.
 * @param {{command:string,args:string[]}[]} plan
 * @param {{cwd?:string,env?:NodeJS.ProcessEnv,signalSource?:NodeJS.EventEmitter,beforeStep?:()=>unknown}} options
 */
export async function runCommandPlan(
  plan,
  { cwd, env = process.env, signalSource = process, beforeStep } = {},
) {
  let child;
  let interrupted;
  let forceStop;
  const forwardSignal = (signal) => {
    if (interrupted) return;
    interrupted = signal;
    if (!child?.pid) return;
    const kill = (forwarded) => {
      try {
        if (process.platform === 'win32') child.kill(forwarded);
        else process.kill(-child.pid, forwarded);
      } catch {
        child.kill(forwarded);
      }
    };
    kill(signal);
    forceStop = setTimeout(() => kill('SIGKILL'), 1000);
    forceStop.unref();
  };
  const onInterrupt = () => forwardSignal('SIGINT');
  const onTerminate = () => forwardSignal('SIGTERM');
  signalSource.on('SIGINT', onInterrupt);
  signalSource.on('SIGTERM', onTerminate);
  try {
    // Verify the complete plan before its first effect, including later chained tools.
    for (const step of plan) {
      if (path.isAbsolute(step.command) && !existsSync(step.command)) {
        throw Object.assign(
          new Error(`Required local executable is missing: ${step.command}. Run npm ci.`),
          { code: 'CLI_TOOL_MISSING' },
        );
      }
      if (
        step.command === process.execPath &&
        step.args[0] &&
        path.isAbsolute(step.args[0]) &&
        !existsSync(step.args[0])
      ) {
        throw Object.assign(new Error(`Required command script is missing: ${step.args[0]}.`), {
          code: 'CLI_SCRIPT_MISSING',
        });
      }
    }
    for (const step of plan) {
      if (interrupted) break;
      await beforeStep?.();
      const result = await new Promise((resolve, reject) => {
        child = spawn(step.command, step.args, {
          cwd,
          env: {
            ...env,
            PATH: [
              cwd ? path.join(cwd, 'node_modules', '.bin') : '',
              path.dirname(process.execPath),
              env.PATH ?? '',
            ]
              .filter(Boolean)
              .join(path.delimiter),
          },
          stdio: 'inherit',
          shell: false,
          detached: process.platform !== 'win32',
        });
        child.once('error', reject);
        child.once('exit', (code, signal) => resolve({ code, signal }));
      });
      clearTimeout(forceStop);
      child = undefined;
      if (interrupted) break;
      if (result.signal) return 128 + (constants.signals[result.signal] ?? 1);
      if (result.code !== 0) return result.code ?? 1;
    }
    return interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : 0;
  } finally {
    clearTimeout(forceStop);
    signalSource.removeListener('SIGINT', onInterrupt);
    signalSource.removeListener('SIGTERM', onTerminate);
  }
}

export function nodeCommand(root, script, args = []) {
  return { command: process.execPath, args: [path.join(root, script), ...args] };
}

export function toolCommand(root, tool, args = []) {
  return { command: requirePinnedCli(tool, tool, root), args };
}

export function npmCommand(root, alias, args = []) {
  const npmCli =
    process.env.npm_execpath ??
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
  return {
    command: process.execPath,
    args: [npmCli, 'run', alias, ...(args.length ? ['--', ...args] : [])],
  };
}

export function targetPlan(target, context, args = []) {
  switch (target.kind) {
    case 'node':
      return [nodeCommand(context.root, target.script, [...target.args, ...args])];
    case 'npm':
      return [npmCommand(context.root, target.alias, args)];
    case 'vitest':
    case 'supabase':
      return [toolCommand(context.root, target.kind, [...target.args, ...args])];
    default:
      throw new Error(`Unhandled command plan: ${target.kind}.`);
  }
}

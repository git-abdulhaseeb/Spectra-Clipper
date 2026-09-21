import { execFile, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  timeoutMs?: number;
  cwd?: string;
  abortSignal?: AbortSignal;
}

/**
 * Safely executes an external binary using execFile (without shell interpolation).
 * Guarantees process tree termination on timeout or cancellation.
 */
export function safeExec(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { timeoutMs = 120000, cwd, abortSignal } = options;

  return new Promise((resolve, reject) => {
    let child: ChildProcess | null = null;
    let isTerminated = false;

    try {
      child = execFile(
        command,
        args,
        {
          cwd,
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          shell: false,
        },
        (error, stdout, stderr) => {
          isTerminated = true;
          if (error) {
            const exitCode = typeof error.code === 'number' ? error.code : 1;
            const enhancedError = new Error(
              `Command [${command}] failed with exit code ${exitCode}: ${stderr || error.message}`
            );
            (enhancedError as any).exitCode = exitCode;
            (enhancedError as any).stderr = stderr;
            (enhancedError as any).stdout = stdout;
            reject(enhancedError);
          } else {
            resolve({
              stdout: stdout ? stdout.toString() : '',
              stderr: stderr ? stderr.toString() : '',
              exitCode: 0,
            });
          }
        }
      );
    } catch (spawnErr) {
      reject(spawnErr);
      return;
    }

    // Handle abort signal or timeout cancellation
    const killProcessTree = () => {
      if (isTerminated || !child || !child.pid) return;
      isTerminated = true;
      logger.warn({ pid: child.pid, command }, 'Terminating child process tree');

      if (process.platform === 'win32') {
        execFile('taskkill', ['/F', '/T', '/PID', child.pid.toString()], () => {});
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch (_) {
          child.kill('SIGKILL');
        }
      }
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        killProcessTree();
        reject(new Error('Command execution aborted by client request'));
      });
    }

    // Safety fallback timeout
    const timer = setTimeout(() => {
      if (!isTerminated) {
        killProcessTree();
        reject(new Error(`Command [${command}] timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs + 1000);

    child.on('exit', () => {
      clearTimeout(timer);
    });
  });
}

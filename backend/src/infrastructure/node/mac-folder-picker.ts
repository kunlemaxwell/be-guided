import { execFile } from 'node:child_process';
import type { FolderPicker } from '../../application/ports';
import { AppError } from '../../domain/errors';

/**
 * The macOS "Choose folder" dialog via AppleScript. execFile with fixed
 * arguments: no shell, nothing from the request reaches the command line.
 */
export class MacFolderPicker implements FolderPicker {
  chooseFolder(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      execFile(
        'osascript',
        ['-e', 'POSIX path of (choose folder with prompt "Choose the folder")'],
        { timeout: 10 * 60_000 },
        (error, stdout, stderr) => {
          if (error) {
            // -128 = the person pressed Cancel.
            if (String(stderr).includes('-128')) resolve(null);
            else reject(new AppError('SERVER_ERROR', 'The folder picker could not open. Try again.'));
            return;
          }
          const p = String(stdout).trim();
          resolve(p ? p.replace(/\/$/, '') || '/' : null);
        },
      );
    });
  }
}

export function macFolderPickerAvailable(): boolean {
  return process.platform === 'darwin';
}

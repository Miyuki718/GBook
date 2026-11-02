import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const script = readFileSync(new URL('./dpapi.ps1', import.meta.url), 'utf8');

// Data travels through private pipes, never through command arguments or files.
function transform(operation, bytes) {
  if (process.platform !== 'win32') return Promise.reject(new Error('Windows required'));
  return new Promise((resolve, reject) => {
    const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const command = `& { ${script} } -Operation ${operation}`;
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('DPAPI timeout')); }, 15000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new Error('DPAPI process unavailable')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.from(output.trim(), 'base64')) : reject(new Error('DPAPI failed')); });
    child.stdin.on('error', () => {});
    child.stdin.end(Buffer.from(bytes).toString('base64'));
  });
}
export const credentialEncryption = {
  id: 'gbook-phase0-windows-dpapi-currentuser-v1',
  async isAvailable() {
    try { const text = 'GBook probe'; return await this.decrypt(await this.encrypt(text)) === text; } catch { return false; }
  },
  encrypt: text => transform('encrypt', Buffer.from(text, 'utf8')),
  async decrypt(bytes) { return (await transform('decrypt', bytes)).toString('utf8'); },
};

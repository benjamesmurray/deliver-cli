import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export class Logger {
  private static LOG_DIR = '.agent_logs';
  private static LOG_FILE = 'audit.log';

  static logCommand(command: string, args: string[], output: string): void {
    const baseDir = process.cwd();
    const logDirPath = join(baseDir, this.LOG_DIR);

    if (!existsSync(logDirPath)) {
      mkdirSync(logDirPath, { recursive: true });
    }

    const logFilePath = join(logDirPath, this.LOG_FILE);
    const timestamp = new Date().toISOString();
    
    const logEntry = `[${timestamp}] COMMAND: ${command} ${args.join(' ')}\nOUTPUT:\n${output}\n---\n`;
    
    try {
      appendFileSync(logFilePath, logEntry, 'utf-8');
    } catch (e) {
      console.error('Failed to write to audit log', e);
    }
  }
}
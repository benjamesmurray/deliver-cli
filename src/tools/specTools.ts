import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isTs = __filename.endsWith('.ts');
const cliCmd = isTs ? 'npx' : 'node';
const cliPath = join(__dirname, '..', isTs ? 'cli.ts' : 'cli.js');

async function runCli(args: string[]): Promise<string> {
  try {
    const execArgs = isTs ? ['tsx', cliPath, ...args] : [cliPath, ...args];
    const { stdout, stderr } = await execFileAsync(cliCmd, execArgs, {
        cwd: process.cwd(),
        env: process.env
    });
    if (stderr && stderr.trim().length > 0 && !stdout) {
       throw new Error(stderr);
    }
    return stdout.trim();
  } catch (error: any) {
    if (error.stdout) return error.stdout.trim();
    throw new Error(error.message || String(error));
  }
}

export function registerSpecTools(server: McpServer): void {
  server.registerTool(
    'sc_status',
    {
      description: 'Get a health check of the active project and discover next steps.',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['status'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_init',
    {
      description: 'Initialize a new feature specification. MUST be called from the workspace root directory. Do not cd into subdirectories first.',
      inputSchema: {
        name: z.string().describe('Feature name'),
        description: z.string().optional().describe('Optional feature description'),
        mode: z.enum(['one-shot', 'step-through']).optional().describe('Workflow mode (default: step-through)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'init', '--name', args.name];
        if (args.description) cliArgs.push('--description', args.description);
        if (args.mode) cliArgs.push('--mode', args.mode);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_plan',
    {
      description: 'Progress the workflow state (e.g., Requirements -> Design). Automatically archives when finished.',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)'),
        instruction: z.string().optional().describe('Specific instructions or updates for the next phase')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'plan'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        if (args.instruction) cliArgs.push('--instruction', args.instruction);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_todo_list',
    {
      description: 'List all implementation tasks and their status.',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'todo', 'list'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_todo_start',
    {
      description: 'Mark a task as being actively worked on.',
      inputSchema: {
        id: z.string().describe('Task ID (e.g., "1.1")'),
        feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'todo', 'start', '--id', args.id];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_todo_complete',
    {
      description: 'Mark a task as completed.',
      inputSchema: {
        id: z.string().describe('Task ID (e.g., "1.1")'),
        feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'todo', 'complete', '--id', args.id];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_epoch',
    {
      description: 'Update the task-epoch context (focus, intentions, hypotheses, questions).',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)'),
        focus: z.string().optional().describe('Active focus'),
        intentions: z.string().optional().describe('Pending intentions'),
        hypotheses: z.string().optional().describe('Active hypotheses'),
        openQuestions: z.string().optional().describe('Open questions / uncertainties')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'epoch'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        if (args.focus) cliArgs.push('--focus', args.focus);
        if (args.intentions) cliArgs.push('--intentions', args.intentions);
        if (args.hypotheses) cliArgs.push('--hypotheses', args.hypotheses);
        if (args.openQuestions) cliArgs.push('--openQuestions', args.openQuestions);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_approve',
    {
      description: 'Explicitly approve the current drafted phase after review.',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'approve'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_analyze',
    {
      description: 'Perform a dedicated ambiguity analysis and self-critique of the drafted document. This step is mandatory before seeking user approval.',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'analyze'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_guidance',
    {
      description: 'Get detailed behavioral instructions for the current state (e.g., Ambiguity Resolution Loop steps).',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'guidance'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_archive',
    {
      description: 'Manually move the project to the completed directory.',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'archive'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_feedback',
    {
      description: 'Provide user feedback or answers to open questions. This clears the associated open questions from the epoch context.',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)'),
        feedback: z.string().describe('The user feedback or answers provided')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'feedback', '--instruction', args.feedback];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_mode',
    {
      description: 'Toggle project mode between one-shot and step-through.',
      inputSchema: {
        mode: z.enum(['one-shot', 'step-through']).describe('Workflow mode'),
        feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'mode', args.mode];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_help',
    {
      description: 'Learn how to use the CLI tools and get deep documentation.',
      inputSchema: {
        topic: z.string().optional().describe('Topic to get help for')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['help'];
        if (args.topic) cliArgs.push(args.topic);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_verify',
    {
      description: 'A dedicated tool to validate that the last action worked.',
      inputSchema: {
         feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['verify'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'sc_refresh',
    {
      description: 'Force a refresh and synchronization of the internal workflow state machine after editing a document. Use this to verify action persistence.',
      inputSchema: {
         feature: z.string().optional().describe('Feature name (optional)')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['verify'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );
}
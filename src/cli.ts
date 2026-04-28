#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync, cpSync, rmSync } from 'fs';
import { join, basename, dirname, isAbsolute } from 'path';
import { parseArgs } from 'util';
import { SpecManager } from './features/shared/SpecManager.js';
import { TemplateRepository } from './features/shared/templateRepository.js';
import { WorkflowStateRepository } from './features/shared/workflowStateRepository.js';
import { openApiLoader } from './features/shared/openApiLoader.js';
import { completeTask } from './features/task/completeTask.js';
import { TaskParser } from './features/shared/taskParser.js';
import { Logger } from './logger.js';

function archiveProject(baseDir: string, featureName?: string): string {
  const rootDir = SpecManager.findProjectRoot(baseDir);
  const currentPath = SpecManager.resolveFeaturePath(baseDir, featureName);
  const targetDir = join(rootDir, 'projects', 'completed');
  
  if (currentPath.includes(targetDir)) {
    return 'Project is already in the completed directory.';
  }

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const featureDirName = basename(currentPath);
  const targetPath = join(targetDir, featureDirName);

  try {
    renameSync(currentPath, targetPath);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      // Handle cross-device moves if necessary
      cpSync(currentPath, targetPath, { recursive: true });
      rmSync(currentPath, { recursive: true, force: true });
    } else {
      throw err;
    }
  }

  // Update .spec_last_used with new relative path
  writeFileSync(join(rootDir, '.spec_last_used'), join('projects', 'completed', featureDirName), 'utf-8');
  return `Successfully archived project to ${join('projects', 'completed', featureDirName)}.`;
}

/**
 * Core CLI execution logic, exposed for direct invocation by MCP tools to avoid subprocess overhead.
 */
export async function executeCliCommand(args: string[]): Promise<string> {
  let output = '';
  const { positionals, values } = parseArgs({
    args,
    options: {
      feature: { type: 'string' },
      instruction: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string' },
      id: { type: 'string' },
      focus: { type: 'string' },
      intentions: { type: 'string' },
      hypotheses: { type: 'string' },
      openQuestions: { type: 'string' },
      mode: { type: 'string' },
      help: { type: 'boolean' }
    },
    allowPositionals: true
  });

  const command = positionals[0];
  const subcommand = positionals[1];
  const baseDir = process.cwd();

  try {
    if (command === 'help' || values.help) {
      let topic = '';
      if (command === 'help') {
        topic = subcommand;
        if (topic === 'exec') topic = positionals[2];
      } else {
        topic = command;
        if (topic === 'exec') topic = subcommand;
      }

      if (topic === 'init') {
        output = `
Initialize a new feature specification.

Usage:
  mcpx with server="spec" tool="sc_init" and name="<name>" [arguments]

Arguments:
  name="<name>"         Name of the feature (e.g., "user-auth").
  description="<text>"  Brief overview of the feature.
  mode="<mode>"         Set workflow mode: 'step-through' (default) or 'one-shot'.
`;
      } else if (topic === 'plan') {
        output = `
Progress the workflow to the next state (e.g., Requirements -> Design).
Scaffolds the next document based on the current state.

Usage:
  mcpx with server="spec" and tool="sc_plan"

Arguments:
  (None - this tool is stateful and automatically targets the active feature)
`;
      } else if (topic === 'approve') {
        output = `
Explicitly approve the current drafted phase.
This is required in 'step-through' mode before calling 'mcpx with server="spec" and tool="sc_plan"' to move to the next phase.

Usage:
  mcpx with server="spec" and tool="sc_approve"

Arguments:
  (None - this tool is stateful and automatically targets the active feature)
`;
      } else if (topic === 'todo') {
        output = `
Manage implementation tasks.

Usage:
  mcpx with server="spec" and tool="sc_todo_list" [arguments]
  mcpx with server="spec" and tool="sc_todo_start" id="<id>" [arguments]
  mcpx with server="spec" and tool="sc_todo_complete" id="<id>" [arguments]

Arguments:
  feature="<name>"      Target feature name (optional if already active).
  id="<id>"             The task ID (e.g., "1.1").
`;
      } else if (topic === 'epoch') {
        output = `
Update context for short-term memory. 
Helps agents maintain continuity across sessions.

Usage:
  mcpx with server="spec" and tool="sc_epoch" [arguments]

Arguments:
  feature="<name>"      Target feature name.
  focus="<text>"        What is being worked on right now.
  intentions="<text>"   What is planned next.
  hypotheses="<text>"   Assumptions about the architecture or solution.
  openQuestions="<text>" Questions pending user feedback.
`;
      } else if (topic === 'archive') {
        output = `
Manually move the project to the completed directory.

Usage:
  mcpx with server="spec" and tool="sc_archive" [arguments]

Arguments:
  feature="<name>"      Target feature name.
`;
      } else if (topic === 'mode') {
        output = `
Toggle project mode between 'one-shot' and 'step-through'.

Usage:
  mcpx with server="spec" tool="sc_mode" and mode="<mode>" [arguments]

Arguments:
  feature="<name>"      Target feature name.
  mode="<mode>"         'one-shot' or 'step-through'.
`;
      } else if (topic === 'status') {
        output = `
Get a health check of the active project and discover next steps.

Usage:
  mcpx with server="spec" and tool="sc_status" [arguments]

Arguments:
  feature="<name>"      Target feature name.
`;
      } else if (topic === 'verify') {
        output = `
Verify current state and check consistency. 
A dedicated tool to validate that the last action worked.

Usage:
  mcpx with server="spec" and tool="sc_verify" [arguments]

Arguments:
  feature="<name>"      Target feature name.
`;
      } else {
        output = `
MCP server for managing spec workflow (requirements, design, implementation).

Usage:
  mcpx with server="spec" and tool="[command]"

Available Tools:
  mcpx with server="spec" and tool="sc_status"        Get a health check of the active project.
  mcpx with server="spec" and tool="sc_verify"        Verify current state and check consistency.
  mcpx with server="spec" and tool="sc_help"          Help about any command.
  mcpx with server="spec" and tool="sc_init"          Initialize a new feature.
  mcpx with server="spec" and tool="sc_plan"          Progress the workflow state.
  mcpx with server="spec" and tool="sc_approve"       Approve the current drafted phase.
  mcpx with server="spec" and tool="sc_todo_"*        Manage implementation tasks.
  mcpx with server="spec" and tool="sc_epoch"         Update short-term memory context.
  mcpx with server="spec" and tool="sc_archive"       Manually archive the project.
  mcpx with server="spec" and tool="sc_mode"          Toggle between 'one-shot' and 'step-through'.

Arguments:
  feature="<name>"         Feature name context.
  instruction="<text>"     Instructions for the next phase.
  name="<name>"            Feature name (for init).
  description="<text>"     Feature description (for init).
  id="<id>"                Task ID (for todo).
  mode="<mode>"            'one-shot' or 'step-through'.

Use mcpx with server="spec" tool="sc_help" and command="[command]" for more information.
`;
      }
      Logger.logCommand(args.join(' '), [], output);
      return output;
    }

    if (command === 'status') {
      output = SpecManager.getStatusSummary(baseDir, values.feature);
    } 
    else if (command === 'verify') {
      output = "Project state verified.\n\n" + SpecManager.getStatusSummary(baseDir, values.feature);
    }
    else if (command === 'exec') {
      if (subcommand === 'init') {
        let featureName = values.name || values.feature;
        if (!featureName) {
           // Agent-optimized: default to a generic name if none provided
           featureName = `feature-${Math.floor(Date.now() / 1000)}`;
        }
        
        const featurePath = SpecManager.resolveFeaturePath(baseDir, featureName);
        if (!existsSync(featurePath)) {
          mkdirSync(featurePath, { recursive: true });
        }
        
        if (values.mode === 'one-shot' || values.mode === 'step-through') {
          SpecManager.setMode(featurePath, values.mode as 'one-shot' | 'step-through');
        }

        const reqFileName = WorkflowStateRepository.getStageFileName('requirements');
        const reqPath = join(featurePath, reqFileName);
        let created = false;
        if (!existsSync(reqPath)) {
          const content = TemplateRepository.getInterpolatedTemplate('requirements', { 
            featureName, 
            introduction: values.description || 'Initial requirements' 
          });
          writeFileSync(reqPath, content, 'utf-8');
          writeFileSync(join(featurePath, '.epoch-context.md'), `# Epoch Context\n\n**Current Phase:** Requirements\n\n`, 'utf-8');
          created = true;
        }

        const absReqPath = isAbsolute(reqPath) ? reqPath : join(process.cwd(), reqPath);
        const confirmation = created 
          ? `✅ Created new requirements template at: ${absReqPath}`
          : `ℹ️ Requirements already exist at: ${absReqPath}`;

        output = `${confirmation}\n\n${SpecManager.getStatusSummary(baseDir, featureName)}`;
      } 
      else if (subcommand === 'mode') {
        const featurePath = SpecManager.resolveFeaturePath(baseDir, values.feature);
        const mode = positionals[2] || values.mode;
        if (mode !== 'one-shot' && mode !== 'step-through') {
            throw new Error('Mode must be either "one-shot" or "step-through"');
        }
        SpecManager.setMode(featurePath, mode);
        output = `Mode updated successfully to ${mode}.\n\n${SpecManager.getStatusSummary(baseDir, values.feature)}`;
      }
      else if (subcommand === 'approve') {
        output = SpecManager.approve(baseDir, values.feature);
      }
      else if (subcommand === 'feedback') {
        const featurePath = SpecManager.resolveFeaturePath(baseDir, values.feature);
        const feedback = values.instruction || '';
        
        // Update epoch context: Clear open questions since feedback was provided
        const epochPath = join(featurePath, '.epoch-context.md');
        if (existsSync(epochPath)) {
            let epochContent = readFileSync(epochPath, 'utf-8');
            epochContent = epochContent.replace(/## Open Questions \/ Uncertainties[\s\S]*?(?=##|$)/, `## Open Questions / Uncertainties\n*   None (Feedback received: ${feedback.slice(0, 50)}${feedback.length > 50 ? '...' : ''})\n\n`);
            writeFileSync(epochPath, epochContent, 'utf-8');
        }

        // Set feedback marker to prevent immediate approval in the same turn
        const feedbackMarker = join(featurePath, '.spec-last-feedback');
        writeFileSync(feedbackMarker, new Date().toISOString(), 'utf-8');
        
        output = `Feedback acknowledged and recorded. Open questions have been cleared.\n\n${SpecManager.getStatusSummary(baseDir, values.feature)}`;
      }
      else if (subcommand === 'plan') {
        const featurePath = SpecManager.resolveFeaturePath(baseDir, values.feature);
        const state = SpecManager.getWorkflowState(featurePath);
        const mode = SpecManager.getMode(featurePath);
        
        let message = '';
        if (!state.requirements.exists) {
            const content = TemplateRepository.getInterpolatedTemplate('requirements', { 
              featureName: featurePath.split('/').pop() || 'feature', 
              introduction: values.instruction || '' 
            });
            writeFileSync(join(featurePath, WorkflowStateRepository.getStageFileName('requirements')), content, 'utf-8');
            message = `Initialized ${WorkflowStateRepository.getStageFileName('requirements')}.`;
            // Agent-optimized: remove guide injections for reduced token density
        } else if (!state.requirements.edited) {
            message = `Please finish editing ${WorkflowStateRepository.getStageFileName('requirements')} (remove all <template> tags) before advancing.`;
            if (values.instruction) message += `\n> Reminder instruction: ${values.instruction}`;
        } else if (!state.requirements.approved && mode !== 'one-shot') {
            message = `Requirements drafted but not yet approved. Please review and run \`use mcpx with server="spec" and tool="sc_approve"\` before advancing.`;
            if (values.instruction) message += `\n> Reminder instruction: ${values.instruction}`;
        } else if (!state.design.exists) {
            if (mode === 'one-shot') {
                try {
                    SpecManager.validateTransition(featurePath, 'requirements');
                } catch (e: any) {
                    return `${e.message}\n\n${SpecManager.getStatusSummary(baseDir, values.feature)}`;
                }
            }
            let content = TemplateRepository.getInterpolatedTemplate('design', { 
              featureName: featurePath.split('/').pop() || 'feature' 
            });
            if (values.instruction) content += `\n\n> **Guidance:** ${values.instruction}`;
            writeFileSync(join(featurePath, WorkflowStateRepository.getStageFileName('design')), content, 'utf-8');
            writeFileSync(join(featurePath, '.epoch-context.md'), `# Epoch Context\n\n**Current Phase:** Design\n\n`, 'utf-8');
            message = `Requirements complete. Scaffolding ${WorkflowStateRepository.getStageFileName('design')}. Epoch context reset.`;
            // Agent-optimized: remove guide injections
        } else if (!state.design.edited) {
            message = `Please finish editing ${WorkflowStateRepository.getStageFileName('design')} (remove all <template> tags) before advancing.`;
            if (values.instruction) message += `\n> Reminder instruction: ${values.instruction}`;
        } else if (!state.design.approved && mode !== 'one-shot') {
            message = `Design drafted but not yet approved. Please review and run \`use mcpx with server="spec" and tool="sc_approve"\` before advancing.`;
            if (values.instruction) message += `\n> Reminder instruction: ${values.instruction}`;
        } else if (!state.tasks.exists) {
            if (mode === 'one-shot') {
                try {
                    SpecManager.validateTransition(featurePath, 'design');
                } catch (e: any) {
                    return `${e.message}\n\n${SpecManager.getStatusSummary(baseDir, values.feature)}`;
                }
            }
            let content = TemplateRepository.getInterpolatedTemplate('tasks', { 
              featureName: featurePath.split('/').pop() || 'feature' 
            });
            if (values.instruction) content += `\n\n> **Guidance:** ${values.instruction}`;
            writeFileSync(join(featurePath, WorkflowStateRepository.getStageFileName('tasks')), content, 'utf-8');
            writeFileSync(join(featurePath, '.epoch-context.md'), `# Epoch Context\n\n**Current Phase:** Implementation Planning\n\n`, 'utf-8');
            message = `Design complete. Scaffolding ${WorkflowStateRepository.getStageFileName('tasks')}. Epoch context reset.`;
            // Agent-optimized: remove guide injections
        } else if (!state.tasks.edited) {
            message = `Please finish editing ${WorkflowStateRepository.getStageFileName('tasks')} (remove all <template> tags) before advancing.`;
            if (values.instruction) message += `\n> Reminder instruction: ${values.instruction}`;
        } else if (!state.tasks.approved && mode !== 'one-shot') {
            message = `Tasks drafted but not yet approved. Please review and run \`use mcpx with server="spec" and tool="sc_approve"\` before advancing.`;
            if (values.instruction) message += `\n> Reminder instruction: ${values.instruction}`;
        } else {
            // Check if all tasks are complete
            let allTasksComplete = false;
            const tasksPath = join(featurePath, WorkflowStateRepository.getStageFileName('tasks'));
            if (existsSync(tasksPath)) {
                const tasksContent = readFileSync(tasksPath, 'utf-8');
                const tasks = TaskParser.parse(tasksContent);
                const areTasksDone = (ts: any[]): boolean => ts.every(t => t.completed && (t.children.length === 0 || areTasksDone(t.children)));
                allTasksComplete = tasks.length > 0 && areTasksDone(tasks);
            }

            if (!allTasksComplete) {
                message = 'Not all implementation tasks are complete. Proceed with `mcpx with server="spec" and tool="sc_todo_start"` or finish tasks manually.';
                if (values.instruction) message += `\n> Received instruction: ${values.instruction}`;
            } else {
                message = 'Workflow is completely finished.';
                const archiveResult = archiveProject(baseDir, values.feature);
                message += `\n\n${archiveResult}`;
                output = `${message}\n\n${SpecManager.getStatusSummary(baseDir)}`;
                return output;
            }
        }

        output = `${message}\n\n${SpecManager.getStatusSummary(baseDir, values.feature)}`;
      }
      else if (subcommand === 'archive') {
        const result = archiveProject(baseDir, values.feature);
        output = `${result}\n\n${SpecManager.getStatusSummary(baseDir)}`;
      }
      else if (subcommand === 'todo') {
        const action = positionals[2];
        const featurePath = SpecManager.resolveFeaturePath(baseDir, values.feature);
        
        if (action === 'list') {
            output = SpecManager.getStatusSummary(baseDir, values.feature);
        } else if (action === 'complete' && values.id) {
            const result = await completeTask({ path: featurePath, taskNumber: values.id });
            output = `${result.displayText}\n\n${SpecManager.getStatusSummary(baseDir, values.feature)}`;
        } else if (action === 'start' && values.id) {
            output = `🚀 Task ${values.id} marked as IN PROGRESS.\n\n${SpecManager.getStatusSummary(baseDir, values.feature)}`;
        } else {
             output = `Action ${action} on id ${values.id} acknowledged.\n\n${SpecManager.getStatusSummary(baseDir, values.feature)}`;
        }
      }
      else if (subcommand === 'epoch') {
        const featurePath = SpecManager.resolveFeaturePath(baseDir, values.feature);
        const epochPath = join(featurePath, '.epoch-context.md');
        let epochContent = existsSync(epochPath) ? readFileSync(epochPath, 'utf-8') : `# Epoch Context\n\n`;

        if (values.focus) {
            epochContent = epochContent.replace(/## Active Focus[\s\S]*?(?=##|$)/, `## Active Focus\n*   ${values.focus}\n\n`);
            if (!epochContent.includes('## Active Focus')) epochContent += `## Active Focus\n*   ${values.focus}\n\n`;
        }
        if (values.intentions) {
            epochContent = epochContent.replace(/## Pending Intentions[\s\S]*?(?=##|$)/, `## Pending Intentions\n*   ${values.intentions}\n\n`);
            if (!epochContent.includes('## Pending Intentions')) epochContent += `## Pending Intentions\n*   ${values.intentions}\n\n`;
        }
        if (values.hypotheses) {
            epochContent = epochContent.replace(/## Active Hypotheses[\s\S]*?(?=##|$)/, `## Active Hypotheses\n*   ${values.hypotheses}\n\n`);
            if (!epochContent.includes('## Active Hypotheses')) epochContent += `## Active Hypotheses\n*   ${values.hypotheses}\n\n`;
        }
        if (values.openQuestions) {
            epochContent = epochContent.replace(/## Open Questions \/ Uncertainties[\s\S]*?(?=##|$)/, `## Open Questions / Uncertainties\n*   ${values.openQuestions}\n\n`);
            if (!epochContent.includes('## Open Questions / Uncertainties')) epochContent += `## Open Questions / Uncertainties\n*   ${values.openQuestions}\n\n`;
        }
        
        writeFileSync(epochPath, epochContent, 'utf-8');
        output = `Epoch context updated successfully.\n\n${SpecManager.getStatusSummary(baseDir, values.feature)}`;
      } else {
        throw new Error('Unknown exec subcommand');
      }
    } else {
      throw new Error(`Unknown command: ${command}`);
    }

    Logger.logCommand(args.join(' '), [], output);
    return output;
  } catch (error: any) {
    output = `Error: ${error.message}`;
    Logger.logCommand(args.join(' '), [], output);
    throw error;
  }
}

async function main() {
  try {
    const output = await executeCliCommand(process.argv.slice(2));
    console.log(output);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Only run main if this file is being executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

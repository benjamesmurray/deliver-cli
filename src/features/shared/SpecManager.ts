import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, isAbsolute, basename, dirname, relative } from 'path';
import { isDocumentEdited } from './documentAnalyzer.js';
import { WorkflowStateRepository } from './workflowStateRepository.js';
import { TaskParser } from './taskParser.js';

export type FeatureState = 'Requirements Pending' | 'Requirements Confirmed' | 'Design Confirmed' | 'Tasks Pending' | 'Tasks Completed';

export interface WorkflowState {
  requirements: { exists: boolean; edited: boolean; approved: boolean };
  design: { exists: boolean; edited: boolean; approved: boolean };
  tasks: { exists: boolean; edited: boolean; approved: boolean };
  featurePath: string;
}

/**
 * SpecManager manages the feature path resolution and overall workflow state.
 */
export class SpecManager {
  private static LAST_USED_FILE = '.spec_last_used';

  /**
   * Resolves the feature path using fuzzy logic and implicit context.
   */
  static resolveFeaturePath(baseDir: string, featureName?: string): string {
    const rootDir = this.findProjectRoot(baseDir);

    if (featureName) {
      let resolvedPath: string;

      if (isAbsolute(featureName)) {
        if (existsSync(featureName)) {
          resolvedPath = featureName;
          this.setLastUsed(baseDir, relative(baseDir, resolvedPath) || '.');
          return resolvedPath;
        }
      }

      // If we are already inside the feature directory, return baseDir
      if (basename(baseDir) === featureName) {
        resolvedPath = baseDir;
        this.setLastUsed(rootDir, relative(rootDir, resolvedPath) || '.');
        return resolvedPath;
      }

      if (existsSync(join(rootDir, featureName))) {
        resolvedPath = join(rootDir, featureName);
      } else {
        const nameOnly = basename(featureName);
        const commonDirs = [join('projects', 'active'), join('projects', 'completed'), 'active', 'completed', 'specs', 'docs'];
        let foundPath: string | null = null;
        
        // First try the original featureName in common dirs
        for (const dir of commonDirs) {
          if (existsSync(join(rootDir, dir, featureName))) {
            foundPath = join(rootDir, dir, featureName);
            break;
          }
        }

        // If not found, try the basename in common dirs
        if (!foundPath && nameOnly !== featureName) {
          for (const dir of commonDirs) {
            if (existsSync(join(rootDir, dir, nameOnly))) {
              foundPath = join(rootDir, dir, nameOnly);
              break;
            }
          }
        }

        resolvedPath = foundPath || (featureName.startsWith('projects/') || featureName.startsWith('active/') || featureName.startsWith('completed/') 
          ? join(rootDir, featureName) 
          : join(rootDir, 'projects', 'active', featureName));
      }

      this.setLastUsed(rootDir, relative(rootDir, resolvedPath));
      return resolvedPath;
    }

    const lastUsedPath = join(rootDir, this.LAST_USED_FILE);
    if (existsSync(lastUsedPath)) {
      const lastUsed = readFileSync(lastUsedPath, 'utf-8').trim();
      const fullPath = join(rootDir, lastUsed);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }

    throw new Error('Could not determine project context. Please provide a feature name (e.g. {"feature": "auth"}).');
  }

  private static setLastUsed(rootDir: string, featurePathRelative: string): void {
    writeFileSync(join(rootDir, this.LAST_USED_FILE), featurePathRelative, 'utf-8');
  }

  /**
   * Finds the project root by searching upwards for marker files.
   */
  public static findProjectRoot(startDir: string): string {
    let current = startDir;
    while (current !== dirname(current)) {
      if (existsSync(join(current, 'package.json')) || existsSync(join(current, '.git')) || existsSync(join(current, '.spec_root'))) {
        return current;
      }
      current = dirname(current);
    }
    return startDir;
  }

  /**
   * Gets the current workflow mode for the feature.
   */
  static getMode(featurePath: string): 'step-through' | 'one-shot' {
    const modeFile = join(featurePath, '.spec-mode');
    if (existsSync(modeFile)) {
      const mode = readFileSync(modeFile, 'utf-8').trim();
      if (mode === 'one-shot') return 'one-shot';
    }
    return 'step-through';
  }

  /**
   * Sets the workflow mode for the feature.
   */
  static setMode(featurePath: string, mode: 'step-through' | 'one-shot'): void {
    writeFileSync(join(featurePath, '.spec-mode'), mode, 'utf-8');
  }

  /**
   * Infers the workflow state dynamically.
   */
  static getWorkflowState(featurePath: string): WorkflowState {
    const checkDoc = (stage: string) => {
      const fileName = WorkflowStateRepository.getStageFileName(stage);
      const filePath = join(featurePath, fileName);
      const approvedPath = join(featurePath, `.spec-${stage}-approved`);
      return {
        exists: existsSync(filePath),
        edited: isDocumentEdited(filePath),
        approved: existsSync(approvedPath)
      };
    };

    return {
      requirements: checkDoc('requirements'),
      design: checkDoc('design'),
      tasks: checkDoc('tasks'),
      featurePath
    };
  }

  /**
   * Returns a dense Markdown output representing the current status.
   */
  static getStatusSummary(baseDir: string, featureName?: string): string {
    try {
      const featurePath = this.resolveFeaturePath(baseDir, featureName);
      const state = this.getWorkflowState(featurePath);
      const mode = this.getMode(featurePath);
      const rootDir = this.findProjectRoot(baseDir);

      const isArchived = featurePath.includes(join(rootDir, 'projects', 'completed')) || 
                        featurePath.includes(join(rootDir, 'completed'));

      const formatStatus = (s: { exists: boolean, edited: boolean, approved: boolean }, label: string, draftLabel: string = 'Draft') => {
          if (!s.exists) return 'Missing';
          if (!s.edited) return draftLabel;
          if (!s.approved) return 'Reviewing';
          return label;
      };

      const reqStatus = formatStatus(state.requirements, 'Drafted', 'Draft (Ready for design)');
      const desStatus = formatStatus(state.design, 'Drafted', 'Draft (Ready for tasks)');
      
      let allTasksComplete = false;
      if (state.tasks.exists && state.tasks.edited) {
        const tasksPath = join(featurePath, WorkflowStateRepository.getStageFileName('tasks'));
        const content = readFileSync(tasksPath, 'utf-8');
        const tasks = TaskParser.parse(content);
        const areTasksDone = (ts: any[]): boolean => ts.every(t => t.completed && (t.children.length === 0 || areTasksDone(t.children)));
        allTasksComplete = tasks.length > 0 && areTasksDone(tasks);
      }
      const tskStatus = allTasksComplete ? 'Completed' : formatStatus(state.tasks, 'Active', 'Draft (Ready for dev)');

      let nextSteps = '';
      let phase = 'Specify';
      let isPlanningPhase = !isArchived;

      if (isArchived) {
          phase = 'Completed';
          nextSteps = 'Feature workflow is complete. This project is archived.';
      } else if (!state.requirements.exists) {
         phase = WorkflowStateRepository.getStageDisplayName('requirements');
         nextSteps = 'Run `spec sc_init` to initialize requirements.';
      } else if (!state.requirements.edited) {
         phase = WorkflowStateRepository.getStageDisplayName('requirements');
         nextSteps = '💡 Next Step: Write the contents of the requirements.md file, then run `spec sc_plan` to move through the workflow.';
      } else if (!state.requirements.approved) {
         phase = WorkflowStateRepository.getStageDisplayName('requirements');
         if (mode === 'one-shot') {
            nextSteps = '🤖 [AUTONOMOUS REVIEW] Resolve ambiguities autonomously. Once resolved, run `spec sc_plan` to scaffold the design phase.';
         } else {
            nextSteps = '🔍 [REVIEW] Requirements drafted. Review and run `spec sc_approve` when ready.';
         }
      } else if (!state.design.exists) {
         phase = WorkflowStateRepository.getStageDisplayName('requirements');
         nextSteps = '✅ [APPROVED] Run `spec sc_plan` to scaffold the design phase.';
      } else if (!state.design.edited) {
         phase = WorkflowStateRepository.getStageDisplayName('design');
         nextSteps = '💡 Next Step: Write the contents of the design.md file, then run `spec sc_plan` to move through the workflow.';
      } else if (!state.design.approved) {
         phase = WorkflowStateRepository.getStageDisplayName('design');
         if (mode === 'one-shot') {
            nextSteps = '🤖 [AUTONOMOUS REVIEW] Resolve ambiguities autonomously. Once resolved, run `spec sc_plan` to scaffold the tasks phase.';
         } else {
            nextSteps = '🔍 [REVIEW] Design drafted. Review and run `spec sc_approve` when ready.';
         }
      } else if (!state.tasks.exists) {
         phase = WorkflowStateRepository.getStageDisplayName('design');
         nextSteps = '✅ [APPROVED] Run `spec sc_plan` to scaffold the tasks phase.';
      } else if (!state.tasks.edited) {
         phase = WorkflowStateRepository.getStageDisplayName('tasks');
         nextSteps = '💡 Next Step: Write the contents of the tasks.md file, then run `spec sc_todo_start` to begin implementation.';
      } else if (!state.tasks.approved) {
         phase = WorkflowStateRepository.getStageDisplayName('tasks');
         if (mode === 'one-shot') {
            let firstTaskId = '';
            if (state.tasks.exists) {
                const tasksPath = join(featurePath, WorkflowStateRepository.getStageFileName('tasks'));
                const content = readFileSync(tasksPath, 'utf-8');
                const tasks = TaskParser.parse(content);
                const findFirst = (ts: any[]): any => {
                    for (const t of ts) {
                        if (!t.completed) return t;
                        const found = findFirst(t.children);
                        if (found) return found;
                    }
                    return null;
                };
                const first = findFirst(tasks);
                if (first) firstTaskId = ` --id ${first.id}`;
            }
            nextSteps = `🤖 [AUTONOMOUS REVIEW] Resolve ambiguities autonomously. Once resolved, run \`spec sc_todo_start${firstTaskId}\` to begin implementation.`;
         } else {
            nextSteps = '🔍 [REVIEW] Tasks drafted. Review and run `spec sc_approve` when ready.';
         }
      } else if (!allTasksComplete) {
         isPlanningPhase = false;
         phase = 'Implementation';
         nextSteps = '🚀 [IMPLEMENTATION] Proceed with tasks. Run `spec sc_todo_start` to begin.';
      } else {
         isPlanningPhase = false;
         phase = 'Completed';
         nextSteps = 'Feature workflow is complete.';
      }

      if (isPlanningPhase) {
          nextSteps = `ℹ️ Phase: ${phase}. (Note: Source code implementation begins in the Build phase).\n\n${nextSteps}`;
      }

      let epochInfo = '';
      const epochPath = join(featurePath, '.epoch-context.md');
      if (existsSync(epochPath)) {
          const epochContent = readFileSync(epochPath, 'utf-8');
          epochInfo = `\n\n--- Epoch Context ---\n${epochContent.trim()}`;
      }

      return `Project: spec-cli | Phase: ${phase}
State Root: ${rootDir}
Feature: ${featurePath.replace(baseDir, '').replace(/^[\/\\]/, '')}
Requirements: ${reqStatus}
Design: ${desStatus}
Tasks: ${tskStatus}
Next Step: ${nextSteps}${epochInfo}`;
    } catch (e: any) {
      const rootDir = this.findProjectRoot(baseDir);
      return `Project: spec-cli | Phase: Error
State Root: ${rootDir}
Error: ${e.message}
Next Step: Run \`spec sc_init --name "your-feature"\` to start a new feature.`;
    }
  }

  /**
   * Validates that the current phase is ready to be approved or advanced.
   */
  static validateTransition(featurePath: string, phase: string): void {
    const epochPath = join(featurePath, '.epoch-context.md');
    if (existsSync(epochPath)) {
        const epochContent = readFileSync(epochPath, 'utf-8');
        const openQuestionsMatch = epochContent.match(/## Open Questions \/ Uncertainties\n([\s\S]*?)(?=##|$)/);
        if (openQuestionsMatch) {
            const questionsText = openQuestionsMatch[1].trim();
            if (questionsText.length > 0 && questionsText !== '*' && questionsText.toLowerCase() !== 'none') {
                 // Check if it's just empty bullets
                 const lines = questionsText.split('\n').filter(l => l.trim().length > 0);
                 const hasRealQuestions = lines.some(l => {
                     const t = l.replace(/^\*\s*/, '').trim();
                     return t.length > 0 && t.toLowerCase() !== 'none' && t !== '*';
                 });
                 if (hasRealQuestions) {
                     throw new Error(`Cannot advance while there are active open questions in the epoch context. Please resolve them using \`spec sc_epoch --openQuestions "None"\`.`);
                 }
            }
        }
    }
  }

  /**
   * Approves the current phase.
   */
  static approve(baseDir: string, featureName?: string): string {
    const featurePath = this.resolveFeaturePath(baseDir, featureName);
    const state = this.getWorkflowState(featurePath);
    let phase = '';
    if (state.requirements.exists && state.requirements.edited && !state.requirements.approved) phase = 'requirements';
    else if (state.design.exists && state.design.edited && !state.design.approved) phase = 'design';
    else if (state.tasks.exists && state.tasks.edited && !state.tasks.approved) phase = 'tasks';
    
    if (!phase) {
        throw new Error('No phase is currently in a "Reviewing" state to be approved.');
    }

    this.validateTransition(featurePath, phase);

    // Enforce delay after feedback to prevent misinterpretation of answers as approval in the same turn
    const feedbackMarker = join(featurePath, '.spec-last-feedback');
    if (existsSync(feedbackMarker)) {
        const markerTime = new Date(readFileSync(feedbackMarker, 'utf-8')).getTime();
        const now = Date.now();
        if (now - markerTime < 2000) { // 2 seconds threshold
            throw new Error('Approval blocked: Recent feedback was recorded. To prevent misinterpretation of information as approval, you must wait for a separate turn and explicit user approval before calling spec sc_approve.');
        }
        rmSync(feedbackMarker, { force: true });
    }

    const approvedPath = join(featurePath, `.spec-${phase}-approved`);
    writeFileSync(approvedPath, new Date().toISOString(), 'utf-8');
    return `✅ Phase "${WorkflowStateRepository.getStageDisplayName(phase)}" has been approved. Run \`spec sc_plan\` to scaffold the next phase.`;
  }
}

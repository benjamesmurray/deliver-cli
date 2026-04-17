import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, isAbsolute, basename, dirname, relative } from 'path';
import { isDocumentEdited } from './documentAnalyzer.js';
import { WorkflowStateRepository } from './workflowStateRepository.js';
import { TaskParser } from './taskParser.js';

export type FeatureState = 'Requirements Pending' | 'Requirements Confirmed' | 'Design Confirmed' | 'Tasks Pending' | 'Tasks Completed' | 'Testing Pending' | 'Testing Confirmed';

export interface WorkflowState {
  requirements: { exists: boolean; edited: boolean; approved: boolean };
  design: { exists: boolean; edited: boolean; approved: boolean };
  tasks: { exists: boolean; edited: boolean; approved: boolean };
  testing: { exists: boolean; edited: boolean; approved: boolean };
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
      testing: checkDoc('testing'),
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

      const formatStatus = (s: { exists: boolean, edited: boolean, approved: boolean }, label: string) => {
          if (!s.exists) return 'Missing';
          if (!s.edited) return 'Pending Edits';
          if (!s.approved) return 'Reviewing';
          return label;
      };

      const reqStatus = formatStatus(state.requirements, 'Drafted');
      const desStatus = formatStatus(state.design, 'Drafted');
      
      let allTasksComplete = false;
      if (state.tasks.exists && state.tasks.edited) {
        const tasksPath = join(featurePath, WorkflowStateRepository.getStageFileName('tasks'));
        const content = readFileSync(tasksPath, 'utf-8');
        const tasks = TaskParser.parse(content);
        const areTasksDone = (ts: any[]): boolean => ts.every(t => t.completed && (t.children.length === 0 || areTasksDone(t.children)));
        allTasksComplete = tasks.length > 0 && areTasksDone(tasks);
      }
      const tskStatus = allTasksComplete ? 'Completed' : formatStatus(state.tasks, 'Active');
      const tstStatus = formatStatus(state.testing, 'Drafted');

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
         nextSteps = '⚠️ [ACTION REQUIRED] Complete drafting requirements and remove all `<template-requirements>` tags.';
      } else if (!state.requirements.approved) {
         phase = WorkflowStateRepository.getStageDisplayName('requirements');
         nextSteps = mode === 'one-shot' 
            ? '🤖 [AUTONOMOUS REVIEW] Resolve ambiguities autonomously. Run `spec sc_analyze` followed by `spec sc_guidance`. Once resolved, run `spec sc_plan` to scaffold the design phase.'
            : '🔍 [REVIEW] Requirements drafted. **CRITICAL: You must now analyze for ambiguities before approval.** Run `spec sc_analyze` for analysis steps, then `spec sc_approve` when ready.';
      } else if (!state.design.exists) {
         phase = WorkflowStateRepository.getStageDisplayName('requirements');
         nextSteps = '✅ [APPROVED] Run `spec sc_plan` to scaffold the design phase.';
      } else if (!state.design.edited) {
         phase = WorkflowStateRepository.getStageDisplayName('design');
         nextSteps = '⚠️ [ACTION REQUIRED] Complete drafting design and remove all `<template-design>` tags.';
      } else if (!state.design.approved) {
         phase = WorkflowStateRepository.getStageDisplayName('design');
         nextSteps = mode === 'one-shot'
            ? '🤖 [AUTONOMOUS REVIEW] Resolve technical ambiguities autonomously. Run `spec sc_analyze` followed by `spec sc_guidance`. Once resolved, run `spec sc_plan` to scaffold the tasks phase.'
            : '🔍 [REVIEW] Design drafted. **CRITICAL: You must now analyze for technical ambiguities before approval.** Run `spec sc_analyze` for analysis steps, then `spec sc_approve` when ready.';
      } else if (!state.tasks.exists) {
         phase = WorkflowStateRepository.getStageDisplayName('design');
         nextSteps = '✅ [APPROVED] Run `spec sc_plan` to scaffold the tasks phase.';
      } else if (!state.tasks.edited) {
         phase = WorkflowStateRepository.getStageDisplayName('tasks');
         nextSteps = '⚠️ [ACTION REQUIRED] Complete drafting tasks and remove all `<template-tasks>` tags.';
      } else if (!state.tasks.approved) {
         phase = WorkflowStateRepository.getStageDisplayName('tasks');
         nextSteps = mode === 'one-shot'
            ? '🤖 [AUTONOMOUS REVIEW] Verify task plan autonomously. Run `spec sc_analyze` followed by `spec sc_guidance`. Once verified, run `spec sc_todo_start` to begin.'
            : '🔍 [REVIEW] Tasks drafted. **CRITICAL: You must now analyze for planning ambiguities before approval.** Run `spec sc_analyze` for analysis steps, then `spec sc_approve` when ready.';
      } else if (!allTasksComplete) {
         isPlanningPhase = false;
         phase = 'Implementation';
         nextSteps = '🚀 [IMPLEMENTATION] Proceed with tasks. Run `spec sc_todo_start` to begin.';
      } else if (!state.testing.exists) {
         isPlanningPhase = false;
         phase = WorkflowStateRepository.getStageDisplayName('testing');
         nextSteps = '✅ [COMPLETED] Implementation complete. Run `spec sc_plan` to scaffold testing.';
      } else if (!state.testing.edited) {
         isPlanningPhase = false;
         phase = WorkflowStateRepository.getStageDisplayName('testing');
         nextSteps = '⚠️ [ACTION REQUIRED] Complete drafting testing and remove all `<template-testing>` tags.';
      } else if (!state.testing.approved) {
         isPlanningPhase = false;
         phase = WorkflowStateRepository.getStageDisplayName('testing');
         nextSteps = mode === 'one-shot'
            ? '🤖 [AUTONOMOUS TEST] Execute tests autonomously. Run `spec sc_guidance`. Once passed, run `spec sc_plan` to finalize.'
            : '🔍 [REVIEW] Testing plan drafted. Run `spec sc_guidance` for review steps. Use `spec sc_approve` when ready.';
      } else {
         isPlanningPhase = false;
         phase = 'Completed';
         nextSteps = 'Feature workflow is complete.';
      }

      if (isPlanningPhase) {
          nextSteps = `🛑 STRICT MANDATE: You are in the Planning Phase. You MUST NOT write source code. Use \`spec sc_plan\` only after approval.\n\n${nextSteps}`;
      }

      let epochInfo = '';
      const epochPath = join(featurePath, '.epoch-context.md');
      if (existsSync(epochPath)) {
          const epochContent = readFileSync(epochPath, 'utf-8');
          epochInfo = `\n\n--- Epoch Context ---\n${epochContent.trim()}`;
      }

      return `Project: spec-cli | Phase: ${phase}
Feature: ${featurePath.replace(baseDir, '').replace(/^[\/\\]/, '')}
Requirements: ${reqStatus}
Design: ${desStatus}
Tasks: ${tskStatus}
Testing: ${tstStatus}
Next Step: ${nextSteps}${epochInfo}`;
    } catch (e: any) {
      return `Project: spec-cli | Phase: Error
Error: ${e.message}
Next Step: Run \`spec sc_init --name "your-feature"\` to start a new feature.`;
    }
  }

  /**
   * Gets detailed behavioral guidance for the current state.
   */
  static getGuidance(baseDir: string, featureName?: string): string {
    const featurePath = this.resolveFeaturePath(baseDir, featureName);
    const state = this.getWorkflowState(featurePath);
    const mode = this.getMode(featurePath);

    let phase = '';
    let guidanceText = '';

    if (state.requirements.exists && state.requirements.edited && !state.requirements.approved) {
        phase = 'requirements';
        guidanceText = mode === 'one-shot' 
            ? '🚨 ONE-SHOT MODE ACTIVE: You are in the **Autonomous Ambiguity Resolution Loop**:\n1. Self-review the requirements for ambiguities or edge cases.\n2. Use `spec sc_epoch --openQuestions "..."` to record findings.\n3. Resolve all identified issues autonomously using your best judgment.\n4. Ensure all open questions are answered and closed.\nOnce all ambiguities are resolved autonomously, IMMEDIATELY run `spec sc_plan` to scaffold the design phase.\n\n### Self-Review Checklist:\n- Are all requirements clear and unambiguous?\n- Are edge cases considered?\n- Is the scope clearly defined?'
            : 'You are in the **Ambiguity Resolution Loop**:\n1. Self-review for ambiguities/edge cases.\n2. Use `spec sc_epoch --openQuestions "..."` to record findings.\n3. Resolve what you can confidently.\n4. Ask the user targeted questions for the rest. When the user provides answers, use `spec sc_feedback --feedback "..."` to record them and clear the open questions. DO NOT mistake information or answers for final approval. 5. DO NOT ask for final approval until all questions are answered and you have called `spec sc_feedback` for all responses. Repeat this loop if answers raise new questions.\nOnce all ambiguities are resolved AND you have recorded the feedback, ask the user for explicit approval (e.g., "Do the requirements look good?"). Once explicitly approved, run `spec sc_approve` to finalize.\n\n### Self-Review Checklist:\n- Are all requirements clear and unambiguous?\n- Are edge cases considered?\n- Is the scope clearly defined?';
    } else if (state.design.exists && state.design.edited && !state.design.approved) {
        phase = 'design';
        guidanceText = mode === 'one-shot'
            ? '🚨 ONE-SHOT MODE ACTIVE: You are in the **Autonomous Ambiguity Resolution Loop**:\n1. Self-review the design for technical ambiguities or missing details.\n2. Use `spec sc_epoch --openQuestions "..."` to record findings.\n3. Resolve all identified issues autonomously using your best judgment.\n4. Ensure all open questions are answered and closed.\nOnce all ambiguities are resolved autonomously, IMMEDIATELY run `spec sc_plan` to scaffold the tasks phase.\n\n### Self-Review Checklist:\n- Check for circular dependencies in Design.\n- Ensure all acceptance criteria have corresponding design elements.\n- Are data models clearly defined?'
            : 'You are in the **Ambiguity Resolution Loop**:\n1. Self-review for technical ambiguities/missing details.\n2. Use `spec sc_epoch --openQuestions "..."` to record findings.\n3. Resolve what you can confidently.\n4. Ask the user targeted questions for the rest. When the user provides answers, use `spec sc_feedback --feedback "..."` to record them and clear the open questions. DO NOT mistake information or answers for final approval. 5. DO NOT ask for final approval until all questions are answered and you have called `spec sc_feedback` for all responses. Repeat this loop if answers raise new questions.\nOnce all ambiguities are resolved AND you have recorded the feedback, ask the user for explicit approval (e.g., "Does the design look good?"). Once explicitly approved, run `spec sc_approve` to finalize.\n\n### Self-Review Checklist:\n- Check for circular dependencies in Design.\n- Ensure all acceptance criteria have corresponding design elements.\n- Are data models clearly defined?';
    } else if (state.tasks.exists && state.tasks.edited && !state.tasks.approved) {
        phase = 'tasks';
        guidanceText = mode === 'one-shot'
            ? '🚨 ONE-SHOT MODE ACTIVE: You are in the **Autonomous Ambiguity Resolution Loop**:\n1. Self-review the task list for missing dependencies or unclear steps.\n2. Use `spec sc_epoch --openQuestions "..."` to record findings.\n3. Resolve all identified issues autonomously using your best judgment.\n4. Ensure the task plan is comprehensive and dependencies are correct.\nOnce verified, IMMEDIATELY run `spec sc_todo_start` to begin implementation.\n\n### Self-Review Checklist:\n- Ensure all acceptance criteria have corresponding tasks.\n- Are dependencies between tasks logically ordered?\n- Are task sizes appropriately granular?'
            : 'You are in the **Ambiguity Resolution Loop**:\n1. Self-review for missing dependencies.\n2. Use `spec sc_epoch --openQuestions "..."` to record findings.\n3. Resolve what you can.\n4. Ask the user targeted questions. When the user provides answers, use `spec sc_feedback --feedback "..."` to record them and clear the open questions. DO NOT mistake information or answers for final approval. 5. DO NOT ask for final approval until all questions are answered and you have called `spec sc_feedback` for all responses.\nOnce all questions are answered AND you have recorded the feedback, ask for explicit approval (e.g., "Does the task plan look good?"). Once approved, run `spec sc_approve` to finalize.\n\n### Self-Review Checklist:\n- Ensure all acceptance criteria have corresponding tasks.\n- Are dependencies between tasks logically ordered?\n- Are task sizes appropriately granular?';
    } else if (state.testing.exists && state.testing.edited && !state.testing.approved) {
        phase = 'testing';
        guidanceText = mode === 'one-shot'
            ? '🚨 ONE-SHOT MODE ACTIVE:\n1. Draft the testing document (remove all `<template-testing>` tags).\n2. Implement and execute automated tests (unit, integration, or E2E) as per the plan.\n3. Autonomously fix any failures.\n4. Once all tests pass, IMMEDIATELY run `spec sc_plan` to finalize the project.\n\n### Self-Review Checklist:\n- Are all tasks covered by testing?\n- Are edge cases tested?\n- Are testing steps clear and reproducible?'
            : 'Edit testing document. Provide manual testing steps. Remove all `<template-testing>` tags. Ask the user to execute tests and provide feedback. Once passed, run `spec sc_approve` to finalize.\n\n### Self-Review Checklist:\n- Are all tasks covered by testing?\n- Are edge cases tested?\n- Are testing steps clear and reproducible?';
    }

    if (phase) {
        const markerPath = join(featurePath, `.spec-${phase}-guidance`);
        writeFileSync(markerPath, new Date().toISOString(), 'utf-8');
        return guidanceText;
    }

    return 'No specific behavioral guidance for the current state. Follow the snappy "Next Step" in `spec sc_status`.';
  }
/**
 * Performs an ambiguity analysis and self-critique.
 */
static analyze(baseDir: string, featureName?: string): string {
  const featurePath = this.resolveFeaturePath(baseDir, featureName);
  const state = this.getWorkflowState(featurePath);
  const mode = this.getMode(featurePath);

  let phase = '';
  let analysisPrompt = '';

  if (state.requirements.exists && state.requirements.edited && !state.requirements.approved) {
      phase = 'requirements';
      analysisPrompt = `### [Self-Critique] Requirements Analysis
Please perform a thorough analysis of the drafted Requirements document for:
1. **Ambiguities**: Are any requirements open to multiple interpretations?
2. **Edge Cases**: Are error conditions, limit cases, and rare scenarios covered?
3. **Missing Details**: Are there any gaps in the user stories or acceptance criteria?
4. **Consistency**: Do any requirements contradict each other?

**Action**: Use \`spec sc_epoch --openQuestions "..."\` to record at least 2-3 specific findings or questions for the user. DO NOT ask for approval until these are resolved.`;
  } else if (state.design.exists && state.design.edited && !state.design.approved) {
      phase = 'design';
      analysisPrompt = `### [Self-Critique] Design Analysis
Please perform a technical analysis of the drafted Design document for:
1. **Completeness**: Does the design cover every requirement and acceptance criterion?
2. **Technical Risks**: Are there any unproven technologies or potential bottlenecks?
3. **Data Integrity**: Are data models clearly defined with proper relationships?
4. **Error Resilience**: Is the error handling strategy comprehensive for this architecture?

**Action**: Use \`spec sc_epoch --openQuestions "..."\` to record at least 2-3 specific technical uncertainties. DO NOT ask for approval until these are resolved.`;
  } else if (state.tasks.exists && state.tasks.edited && !state.tasks.approved) {
      phase = 'tasks';
      analysisPrompt = `### [Self-Critique] Task Plan Analysis
Please perform a detailed review of the Implementation Plan for:
1. **Granularity**: Are tasks small enough to be completed in one turn?
2. **Dependencies**: Is the execution order logically sound?
3. **Integration**: Is there a clear plan for wiring components together?
4. **Testability**: Does each task have clear acceptance criteria and testing steps?

**Action**: Use \`spec sc_epoch --openQuestions "..."\` to record any missing steps or dependency risks. DO NOT ask for approval until the plan is airtight.`;
  } else if (state.testing.exists && state.testing.edited && !state.testing.approved) {
      phase = 'testing';
      analysisPrompt = `### [Self-Critique] Testing Plan Analysis
Please perform a review of the Testing & Verification Plan for:
1. **Coverage**: Are all requirements and design elements covered by tests?
2. **Reproducibility**: Are manual steps clear and unambiguous?
3. **Edge Case Verification**: Are the identified edge cases specifically tested?
4. **Automation**: Is the balance between automated and manual testing appropriate?

**Action**: Use \`spec sc_epoch --openQuestions "..."\` to record any gaps in verification logic.`;
  }

  if (phase) {
      const markerPath = join(featurePath, `.spec-${phase}-analyzed`);
      writeFileSync(markerPath, new Date().toISOString(), 'utf-8');
      return analysisPrompt;
  }

  return 'Analysis is only available when a document is drafted and awaiting review. Use `spec sc_status` to check the current state.';
}

/**
 * Validates that the current phase is ready to be approved or advanced.
...
   */
  static validateTransition(featurePath: string, phase: string): void {
    const guidancePath = join(featurePath, `.spec-${phase}-guidance`);
    if (!existsSync(guidancePath)) {
        throw new Error(`You must run \`spec sc_guidance\` to review the ${phase} before advancing.`);
    }

    const analyzePath = join(featurePath, `.spec-${phase}-analyzed`);
    if (!existsSync(analyzePath)) {
        throw new Error(`You must run \`spec sc_analyze\` to perform a self-critique for ambiguities in the ${phase} before advancing.`);
    }

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
    else if (state.testing.exists && state.testing.edited && !state.testing.approved) phase = 'testing';
    
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

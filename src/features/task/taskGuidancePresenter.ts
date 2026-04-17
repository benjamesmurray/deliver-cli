import { openApiLoader, OpenApiLoader } from '../shared/openApiLoader.js';
import { TaskLexer } from '../shared/taskLexer.js';

/**
 * TaskGuidancePresenter handles the construction of complex UI guidance strings
 * for "Next Step" and model prompts during task implementation.
 */
export class TaskGuidancePresenter {
  private static get template() {
    openApiLoader.loadSpec();
    return openApiLoader.getTaskGuidanceTemplate();
  }

  /**
   * Build task guidance text after task completion.
   */
  static buildNextStepGuidance(
    tasksContent: string,
    completedTaskNumber?: string,
    isFirstTask: boolean = false
  ): string {
    const template = this.template;
    if (!template) {
      throw new Error('Failed to load task guidance template from OpenAPI specification');
    }

    const firstSubtask = this.extractFirstUncompletedSubtask(tasksContent);
    const parts: string[] = [];

    // Add separator line
    parts.push(template.separator);
    parts.push('');

    // Add task header
    parts.push(template.header);
    parts.push(tasksContent);
    parts.push('');

    // Add model instructions
    parts.push(template.instructions.prefix);
    const taskFocusText = OpenApiLoader.replaceVariables(template.instructions.taskFocus, { firstSubtask });
    parts.push(taskFocusText);

    parts.push('');
    parts.push(template.instructions.progressTracking);
    parts.push(template.instructions.workflow);
    parts.push('');

    // Add model prompt based on scenario
    let prompt: string;
    if (isFirstTask) {
      prompt = OpenApiLoader.replaceVariables(template.prompts.firstTask, { firstSubtask });
    } else if (completedTaskNumber) {
      if (completedTaskNumber.includes('.')) {
        prompt = OpenApiLoader.replaceVariables(template.prompts.continueTask, { taskNumber: completedTaskNumber, firstSubtask });
      } else {
        prompt = OpenApiLoader.replaceVariables(template.prompts.nextTask, { taskNumber: completedTaskNumber, firstSubtask });
      }
    } else {
      prompt = OpenApiLoader.replaceVariables(template.prompts.batchContinue, { firstSubtask });
    }

    parts.push(prompt);
    return parts.join('\n');
  }

  /**
   * Extract the first uncompleted task with its context using TaskLexer.
   */
  static extractFirstUncompletedSubtask(tasksContent: string): string {
    const tokens = TaskLexer.lex(tasksContent);
    
    // Find the first list item that is NOT checked
    const uncompletedTaskToken = tokens.find(token => token.type === 'list_item' && !token.checked);

    if (uncompletedTaskToken) {
      // Clean the text to return only the task description
      return uncompletedTaskToken.text.replace(/\[\s?\]\s*/, '').trim();
    }

    return 'Next task';
  }

  /**
   * Get formatted completion message.
   */
  static getCompletionMessage(type: 'taskCompleted' | 'allCompleted' | 'alreadyCompleted' | 'batchSucceeded' | 'batchCompleted', taskNumber?: string): string {
    const template = this.template;
    if (!template) {
      throw new Error('Failed to load task guidance template from OpenAPI specification');
    }

    const message = template.completionMessages[type];
    if (taskNumber && message.includes('${taskNumber}')) {
      return OpenApiLoader.replaceVariables(message, { taskNumber });
    }
    return message;
  }
}

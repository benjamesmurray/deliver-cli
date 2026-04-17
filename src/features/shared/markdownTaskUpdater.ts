import { TaskLexer } from './taskLexer.js';

/**
 * MarkdownTaskUpdater performs surgical updates to task checkboxes in Markdown content.
 */
export class MarkdownTaskUpdater {
  /**
   * Updates the checkbox for a task and its ancestors if they become fully completed.
   */
  static updateTaskStatus(content: string, taskId: string, completed: boolean): string {
    const taskTokens = TaskLexer.lex(content);
    let lines = content.split('\n');

    const tasksToUpdate = new Set<string>();
    tasksToUpdate.add(taskId);

    // Auto-mark parent tasks if all siblings are completed
    if (completed && taskId.includes('.')) {
      const parts = taskId.split('.');
      let currentId = taskId;
      
      while (currentId.includes('.')) {
        const parentId = currentId.split('.').slice(0, -1).join('.');
        const siblingTokens = taskTokens.filter(t => {
          if (t.type !== 'list_item') return false;
          const match = t.text.match(/^(\d+(?:\.\d+)*)\.?/);
          if (!match) return false;
          const id = match[1];
          return id.startsWith(parentId + '.') && id.split('.').length === parentId.split('.').length + 1;
        });

        const allSiblingsDone = siblingTokens.every(t => {
          const match = t.text.match(/^(\d+(?:\.\d+)*)\.?/);
          const id = match ? match[1] : '';
          return id === currentId ? true : !!t.checked;
        });

        if (allSiblingsDone) {
          tasksToUpdate.add(parentId);
          currentId = parentId;
        } else {
          break;
        }
      }
    }

    for (const id of tasksToUpdate) {
      const taskToken = taskTokens.find(token => {
        if (token.type !== 'list_item') return false;
        const idMatch = token.text.match(/^(\d+(?:\.\d+)*)\.?/);
        return idMatch && idMatch[1] === id;
      });

      if (taskToken) {
        const lineIndex = taskToken.line - 1;
        const originalLine = lines[lineIndex];
        const newStatus = completed ? '[x]' : '[ ]';
        lines[lineIndex] = originalLine.replace(/\[\s?[x ]?\s?\]/, newStatus);
      }
    }

    return lines.join('\n');
  }

  /**
   * Updates the checkbox for multiple tasks specified by their IDs.
   */
  static updateBatchTaskStatus(content: string, taskIds: string[], completed: boolean): string {
    let updatedContent = content;
    for (const taskId of taskIds) {
      try {
        updatedContent = this.updateTaskStatus(updatedContent, taskId, completed);
      } catch (error) {
        console.warn(`Could not update task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return updatedContent;
  }
}

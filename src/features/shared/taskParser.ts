import { TaskLexer, TaskToken } from './taskLexer.js';

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  indent: number;
  line: number;
  isParent?: boolean;
  children: Task[];
}

/**
 * TaskParser builds a hierarchical task structure from Markdown tokens.
 */
export class TaskParser {
  /**
   * Parses task list content into a hierarchical structure.
   */
  static parse(content: string): Task[] {
    const tokens = TaskLexer.lex(content);
    const tasks: Task[] = [];
    let currentSection = '';

    for (const token of tokens) {
      if (token.type === 'heading') {
        currentSection = token.text;
        continue;
      }

      if (token.type === 'list_item') {
        const firstLine = token.text.split('\n')[0];
        const textToMatch = firstLine.replace(/^\[[ xX]\]\s+/, '').trim();
        const match = textToMatch.match(/^(\d+(?:\.\d+)*)\.?(.*)$/);
        if (match) {
          const id = match[1];
          const text = match[2].trim();
          const indent = (id.split('.').length - 1) * 2; // Basic indent estimation based on ID dots
          
          tasks.push({
            id,
            text,
            completed: !!token.checked,
            indent,
            line: token.line,
            children: []
          });
        }
      }
    }

    return this.buildHierarchy(tasks);
  }

  /**
   * Build hierarchical relationships based on task IDs.
   */
  private static buildHierarchy(flatTasks: Task[]): Task[] {
    const rootTasks: Task[] = [];
    const taskMap = new Map<string, Task>();

    flatTasks.forEach(task => {
      taskMap.set(task.id, task);
      const parts = task.id.split('.');
      if (parts.length === 1) {
        rootTasks.push(task);
      } else {
        const parentId = parts.slice(0, -1).join('.');
        const parent = taskMap.get(parentId);
        if (parent) {
          parent.children.push(task);
          parent.isParent = true;
        } else {
          // If parent not found, treat as root (should not happen in valid docs)
          rootTasks.push(task);
        }
      }
    });

    return rootTasks;
  }
}

/**
 * TaskPresenter handles formatting task structures for CLI display.
 */
export class TaskPresenter {
  /**
   * Formats a hierarchical task structure for full display.
   */
  static formatFullDisplay(tasks: Task[]): string {
    const lines: string[] = [];
    const processTask = (task: Task, level: number) => {
      const indent = ' '.repeat(level * 2);
      const checkbox = task.completed ? '[x]' : '[ ]';
      lines.push(`${indent}${task.id}. ${checkbox} ${task.text}`);
      task.children.forEach(child => processTask(child, level + 1));
    };

    tasks.forEach(task => processTask(task, 0));
    return lines.join('\n');
  }

  /**
   * Formats a single task for detailed display.
   */
  static formatTaskDetail(task: Task): string {
    const status = task.completed ? '✅ Completed' : '⏳ Pending';
    return `${task.id}. ${task.text} (${status})`;
  }
}

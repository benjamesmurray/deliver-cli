import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TaskParser, TaskPresenter, Task } from '../shared/taskParser.js';
import { MarkdownTaskUpdater } from '../shared/markdownTaskUpdater.js';
import { TaskGuidancePresenter } from './taskGuidancePresenter.js';
import { WorkflowStateRepository } from '../shared/workflowStateRepository.js';

export interface WorkflowResult {
  displayText: string;
  data?: any;
}

export interface CompleteTaskOptions {
  path: string;
  taskNumber: string | string[];
}

/**
 * Orchestrates task completion.
 */
export async function completeTask(options: CompleteTaskOptions): Promise<WorkflowResult> {
  const { path, taskNumber } = options;
  const taskNumbers = Array.isArray(taskNumber) ? taskNumber : [taskNumber];

  if (!existsSync(path)) {
    return { displayText: '❌ Error: Directory does not exist', data: { success: false, error: 'Directory does not exist' } };
  }

  const tasksPath = join(path, WorkflowStateRepository.getStageFileName('tasks'));
  if (!existsSync(tasksPath)) {
    return { displayText: `❌ Error: ${WorkflowStateRepository.getStageFileName('tasks')} file does not exist\n\nPlease complete writing the tasks document first.`, data: { success: false, error: `${WorkflowStateRepository.getStageFileName('tasks')} does not exist` } };
  }

  const batchResult = await completeBatchTasks(tasksPath, taskNumbers);
  return { displayText: batchResult.displayText, data: { ...batchResult } };
}

/**
 * Handles batch completion of tasks.
 */
async function completeBatchTasks(tasksPath: string, taskNumbers: string[]): Promise<any> {
  const originalContent = readFileSync(tasksPath, 'utf-8');
  const allTasks = TaskParser.parse(originalContent);
  
  const alreadyCompleted: string[] = [];
  const canBeCompleted: string[] = [];
  const failedTasks: Array<{ taskNumber: string, reason: string }> = [];
  
  // Recursively find a task by its ID
  const findTask = (id: string, tasks: Task[]): Task | null => {
    for (const t of tasks) {
      if (t.id === id) return t;
      const found = findTask(id, t.children);
      if (found) return found;
    }
    return null;
  };

  for (const id of taskNumbers) {
    const task = findTask(id, allTasks);
    if (!task) {
      failedTasks.push({ taskNumber: id, reason: 'Task does not exist' });
    } else if (task.completed) {
      alreadyCompleted.push(id);
    } else if (task.children.some(child => !child.completed)) {
      failedTasks.push({ taskNumber: id, reason: 'Has uncompleted subtasks' });
    } else {
      canBeCompleted.push(id);
    }
  }

  if (failedTasks.length > 0) {
    return {
      success: false,
      completedTasks: [],
      alreadyCompleted,
      failedTasks,
      displayText: `❌ Batch task completion failed\n\nThe following tasks cannot be completed:\n${failedTasks.map(f => `- ${f.taskNumber}: ${f.reason}`).join('\n')}`
    };
  }

  if (canBeCompleted.length === 0 && alreadyCompleted.length > 0) {
    const nextTask = allTasks.find(t => !t.completed); // Simplified next task search
    return {
      success: true,
      completedTasks: [],
      alreadyCompleted,
      displayText: `${TaskGuidancePresenter.getCompletionMessage('batchCompleted')}\n\nTasks already completed:\n${alreadyCompleted.map(t => `- ${t}`).join('\n')}\n\n${nextTask ? `Next task: ${nextTask.id}. ${nextTask.text}` : TaskGuidancePresenter.getCompletionMessage('allCompleted')}`
    };
  }

  try {
    // Perform updates
    const updatedContent = MarkdownTaskUpdater.updateBatchTaskStatus(originalContent, canBeCompleted, true);
    writeFileSync(tasksPath, updatedContent, 'utf-8');

    // Build success response
    const updatedTasks = TaskParser.parse(updatedContent);
    const nextUncompleted = findFirstUncompleted(updatedTasks);

    let displayText = `${TaskGuidancePresenter.getCompletionMessage('batchSucceeded')}\n\nNewly completed tasks:\n${canBeCompleted.map(t => `- ${t}`).join('\n')}`;
    
    if (nextUncompleted) {
      // Find parent context for guidance
      const parentId = nextUncompleted.id.split('.')[0];
      const parentTask = findTask(parentId, updatedTasks) || nextUncompleted;
      const mainTaskContent = TaskPresenter.formatFullDisplay([parentTask]);
      
      displayText += '\n\n' + TaskGuidancePresenter.buildNextStepGuidance(mainTaskContent, canBeCompleted[canBeCompleted.length - 1]);
    } else {
      displayText += '\n\n' + TaskGuidancePresenter.getCompletionMessage('allCompleted');
    }

    return {
      success: true,
      completedTasks: canBeCompleted,
      alreadyCompleted,
      nextTask: nextUncompleted ? { number: nextUncompleted.id, description: nextUncompleted.text } : undefined,
      displayText
    };

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), displayText: `❌ Error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function findFirstUncompleted(tasks: Task[]): Task | null {
  for (const t of tasks) {
    if (!t.completed) return t;
    const found = findFirstUncompleted(t.children);
    if (found) return found;
  }
  return null;
}

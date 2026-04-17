import { openApiLoader } from './openApiLoader.js';

/**
 * WorkflowStateRepository manages progress rules, stage names, and file mapping.
 */
export class WorkflowStateRepository {
  /**
   * Gets the display name for a given stage.
   */
  static getStageDisplayName(stage: string): string {
    openApiLoader.loadSpec();
    const stageNames = openApiLoader.getStageNames();
    return (stageNames as any)[stage] || stage;
  }

  /**
   * Gets the file name associated with a stage.
   */
  static getStageFileName(stage: string): string {
    openApiLoader.loadSpec();
    const fileNames = openApiLoader.getFileNames();
    return (fileNames as any)[stage] || `${stage}.md`;
  }

  /**
   * Calculates overall progress based on the state of each stage.
   */
  static calculateOverallProgress(requirementsStatus: number, designStatus: number, tasksStatus: number): number {
    // Current simple logic, could be moved to spec later
    return Math.round((requirementsStatus + designStatus + tasksStatus) / 3);
  }
}

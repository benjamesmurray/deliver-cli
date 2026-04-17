import { openApiLoader } from './openApiLoader.js';

/**
 * TaskGuidanceRepository manages guidance-related data from the OpenAPI spec.
 */
export class TaskGuidanceRepository {
  /**
   * Loads the guidance template structure from the spec.
   */
  static getGuidanceTemplate() {
    openApiLoader.loadSpec();
    return openApiLoader.getTaskGuidanceTemplate();
  }

  /**
   * Gets a specific completion message by key.
   */
  static getCompletionMessage(key: string): string {
    const template = this.getGuidanceTemplate();
    if (!template) throw new Error('Task guidance template not found');
    return (template.completionMessages as any)[key] || '';
  }
}

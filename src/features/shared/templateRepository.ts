import { openApiLoader, OpenApiLoader } from './openApiLoader.js';

/**
 * TemplateRepository manages document templates from the OpenAPI spec.
 */
export class TemplateRepository {
  /**
   * Gets a document template by stage and interpolates variables.
   */
  static getInterpolatedTemplate(stage: 'requirements' | 'design' | 'tasks' | 'testing' | 'skipped', variables: Record<string, any>): string {
    openApiLoader.loadSpec();
    const template = openApiLoader.getDocumentTemplate(stage);
    if (!template) {
      throw new Error(`Template not found for stage: ${stage}`);
    }

    return this.formatTemplate(template, variables);
  }

  /**
   * Internal formatter for document templates.
   */
  private static formatTemplate(template: any, values: Record<string, any>): string {
    const lines: string[] = [];
    
    if (template.title) {
      lines.push(`# ${OpenApiLoader.replaceVariables(template.title, values)}`);
      lines.push('');
    }
    
    if (Array.isArray(template.sections)) {
      for (const section of template.sections) {
        if (section.content) {
          lines.push(OpenApiLoader.replaceVariables(section.content, values));
        } else if (section.placeholder) {
          lines.push(section.placeholder);
        }
        lines.push('');
      }
    }
    
    return lines.join('\n').trim();
  }
}

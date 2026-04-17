import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { isObject } from './typeGuards.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// OpenAPI specification type definitions
export interface OpenApiSpec {
  paths: Record<string, any>;
  components: {
    schemas: Record<string, any>;
  };
  'x-error-responses': Record<string, { displayText: string }>;
  'x-shared-resources': Record<string, { uri: string; title?: string; mimeType: string; text?: string }>;
  'x-global-config': Record<string, any>;
  'x-document-templates': Record<string, any>;
  'x-task-guidance-template'?: {
    separator: string;
    header: string;
    instructions: { prefix: string; taskFocus: string; progressTracking: string; workflow: string };
    prompts: { firstTask: string; nextTask: string; continueTask: string; batchContinue: string };
    completionMessages: { taskCompleted: string; allCompleted: string; alreadyCompleted: string; batchSucceeded: string; batchCompleted: string };
  };
  'x-workflow-config'?: {
    stage_names: Record<string, string>;
    file_names: Record<string, string>;
  };
}

/**
 * OpenApiLoader is a singleton for loading and accessing the raw spec data.
 */
export class OpenApiLoader {
  private static instance: OpenApiLoader;
  private spec: OpenApiSpec | null = null;

  private constructor() {}

  static getInstance(): OpenApiLoader {
    if (!OpenApiLoader.instance) {
      OpenApiLoader.instance = new OpenApiLoader();
    }
    return OpenApiLoader.instance;
  }

  loadSpec(): OpenApiSpec {
    if (this.spec) return this.spec;
    const specPath = path.join(__dirname, '../../../api/spec-workflow.openapi.yaml');
    const specContent = fs.readFileSync(specPath, 'utf8');
    this.spec = yaml.load(specContent) as OpenApiSpec;
    return this.spec;
  }

  getStageNames(): Record<string, string> {
    return (this.spec?.['x-global-config'] as any)?.stage_names || {};
  }

  getFileNames(): Record<string, string> {
    return (this.spec?.['x-global-config'] as any)?.file_names || {};
  }

  getDocumentTemplate(type: string): any {
    return this.spec?.['x-document-templates']?.[type] || null;
  }

  getSharedResourceText(uri: string): string | null {
    if (!this.spec?.['x-shared-resources']) return null;
    const resources = Object.values(this.spec['x-shared-resources']);
    const resource = resources.find((r: any) => r.uri === uri);
    return resource?.text || null;
  }

  getTaskGuidanceTemplate() {
    return this.spec?.['x-task-guidance-template'] || null;
  }

  // Still useful for interpolation across repositories
  static replaceVariables(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }
}

export const openApiLoader = OpenApiLoader.getInstance();

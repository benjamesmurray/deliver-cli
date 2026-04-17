import { describe, it, expect } from 'vitest';
import { WorkflowStateRepository } from '../../src/features/shared/workflowStateRepository.js';
import { TemplateRepository } from '../../src/features/shared/templateRepository.js';
import { TaskGuidanceRepository } from '../../src/features/shared/taskGuidanceRepository.js';

describe('Repositories', () => {
  describe('WorkflowStateRepository', () => {
    it('should return correct display names from spec', () => {
      expect(WorkflowStateRepository.getStageDisplayName('requirements')).toBe('Requirements Document');
      expect(WorkflowStateRepository.getStageDisplayName('design')).toBe('Design Document');
    });

    it('should return correct file names from spec', () => {
      expect(WorkflowStateRepository.getStageFileName('requirements')).toBe('Requirements.md');
      expect(WorkflowStateRepository.getStageFileName('design')).toBe('Design.md');
    });
  });

  describe('TemplateRepository', () => {
    it('should fetch and interpolate templates', () => {
      const output = TemplateRepository.getInterpolatedTemplate('requirements', { 
        featureName: 'MyFeature', 
        introduction: 'Intro' 
      });
      expect(output).toContain('# MyFeature - Requirements Document');
      expect(output).toContain('Intro');
    });
  });

  describe('TaskGuidanceRepository', () => {
    it('should fetch completion messages', () => {
      const msg = TaskGuidanceRepository.getCompletionMessage('taskCompleted');
      expect(msg).toBeDefined();
      expect(typeof msg).toBe('string');
    });
  });
});

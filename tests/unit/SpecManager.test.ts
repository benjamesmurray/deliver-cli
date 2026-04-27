import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { SpecManager } from '../../src/features/shared/SpecManager.js';
import { WorkflowStateRepository } from '../../src/features/shared/workflowStateRepository.js';

describe('SpecManager', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    tempDir = join(tmpdir(), `spec-cli-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('resolveFeaturePath', () => {
    it('should resolve an exact match in the base directory', () => {
      const featureName = 'auth';
      const expectedPath = join(tempDir, featureName);
      mkdirSync(expectedPath); // Create the exact match

      const resolvedPath = SpecManager.resolveFeaturePath(tempDir, featureName);
      expect(resolvedPath).toBe(expectedPath);
      
      // Verify .spec_last_used was updated
      const lastUsed = readFileSync(join(tempDir, '.spec_last_used'), 'utf-8');
      expect(lastUsed).toBe(featureName);
    });

    it('should search common subdirectories (docs, specs) if exact match not found', () => {
      const featureName = 'billing';
      const expectedPath = join(tempDir, 'specs', featureName);
      mkdirSync(expectedPath, { recursive: true });

      const resolvedPath = SpecManager.resolveFeaturePath(tempDir, featureName);
      expect(resolvedPath).toBe(expectedPath);

      // Verify .spec_last_used
      const lastUsed = readFileSync(join(tempDir, '.spec_last_used'), 'utf-8');
      expect(lastUsed).toBe(join('specs', featureName));
    });

    it('should fallback to creating in projects/active if not found anywhere', () => {
      const featureName = 'new-feature';
      const expectedPath = join(tempDir, 'projects', 'active', featureName);

      const resolvedPath = SpecManager.resolveFeaturePath(tempDir, featureName);
      expect(resolvedPath).toBe(expectedPath);

      const lastUsed = readFileSync(join(tempDir, '.spec_last_used'), 'utf-8');
      expect(lastUsed).toBe(join('projects', 'active', featureName));
    });

    it('should resolve implicitly via .spec_last_used if featureName is omitted', () => {
      const featureName = 'implicit-feature';
      const featurePath = join(tempDir, featureName);
      mkdirSync(featurePath);
      writeFileSync(join(tempDir, '.spec_last_used'), featureName, 'utf-8');

      const resolvedPath = SpecManager.resolveFeaturePath(tempDir);
      expect(resolvedPath).toBe(featurePath);
    });

    it('should throw an error if no featureName provided and .spec_last_used is missing or invalid', () => {
      expect(() => SpecManager.resolveFeaturePath(tempDir)).toThrowError(/Could not determine project context/);
    });

    it('should return baseDir if basename(baseDir) matches featureName', () => {
      const featureName = 'feature-x';
      const featurePath = join(tempDir, featureName);
      mkdirSync(featurePath);

      const resolvedPath = SpecManager.resolveFeaturePath(featurePath, featureName);
      expect(resolvedPath).toBe(featurePath);
    });

    it('should find project root and avoid nesting if package.json exists', () => {
      const featureName = 'nested-feature';
      writeFileSync(join(tempDir, 'package.json'), '{}', 'utf-8');
      
      const subDir = join(tempDir, 'some', 'deep', 'folder');
      mkdirSync(subDir, { recursive: true });

      const resolvedPath = SpecManager.resolveFeaturePath(subDir, featureName);
      // It should resolve relative to tempDir (project root)
      expect(resolvedPath).toBe(join(tempDir, 'projects', 'active', featureName));
    });
  });

  describe('getWorkflowState & getStatusSummary', () => {
    it('should return missing state when no documents exist', () => {
      const featureName = 'test-feature';
      const summary = SpecManager.getStatusSummary(tempDir, featureName);
      
      expect(summary).toContain('spec_status:');
      expect(summary).toContain('phase: requirements');
      expect(summary).toContain('next_step: use mcpx spec sc_init to initialize requirements.');
    });

    it('should return draft status and blocker if document contains <template-*> tags', () => {
      const featureName = 'test-feature';
      const featurePath = join(tempDir, featureName);
      mkdirSync(featurePath);
      
      const reqFile = WorkflowStateRepository.getStageFileName('requirements');
      writeFileSync(join(featurePath, reqFile), 'Content\n<template-requirements>\nPlaceholder\n</template-requirements>', 'utf-8');
      
      const summary = SpecManager.getStatusSummary(tempDir, featureName);
      expect(summary).toContain('status: drafting');
      expect(summary).toContain('blockers: [template_tags_present]');
      expect(summary).toContain('next_step: Write requirements.md and use mcpx spec sc_plan to advance.');
    });

    it('should return reviewing if document exists and has no <template-*> tags', () => {
      const featureName = 'test-feature';
      const featurePath = join(tempDir, 'projects', 'active', featureName);
      mkdirSync(featurePath, { recursive: true });
      
      const reqFile = WorkflowStateRepository.getStageFileName('requirements');
      writeFileSync(join(featurePath, reqFile), 'Completed requirements without tags', 'utf-8');
      
      const summary = SpecManager.getStatusSummary(tempDir, featureName);
      expect(summary).toContain('status: reviewing');
      expect(summary).toContain('phase: requirements');
      expect(summary).toContain('next_step: Review and use mcpx spec sc_approve.');
    });

    it('should return one-shot specific instructions when mode is one-shot', () => {
      const featureName = 'test-feature';
      const featurePath = join(tempDir, 'projects', 'active', featureName);
      mkdirSync(featurePath, { recursive: true });
      SpecManager.setMode(featurePath, 'one-shot');
      
      const reqFile = WorkflowStateRepository.getStageFileName('requirements');
      writeFileSync(join(featurePath, reqFile), 'Completed requirements without tags', 'utf-8');
      
      const summary = SpecManager.getStatusSummary(tempDir, featureName);
      expect(summary).toContain('status: reviewing');
      expect(summary).toContain('mode: one-shot');
      expect(summary).toContain('next_step: Resolve ambiguities then use mcpx spec sc_plan.');
    });
    
    it('should handle full workflow Reviewing state', () => {
      const featureName = 'test-feature';
      const featurePath = join(tempDir, featureName);
      mkdirSync(featurePath);
      
      writeFileSync(join(featurePath, WorkflowStateRepository.getStageFileName('requirements')), 'Req', 'utf-8');
      writeFileSync(join(featurePath, WorkflowStateRepository.getStageFileName('design')), 'Des', 'utf-8');
      writeFileSync(join(featurePath, WorkflowStateRepository.getStageFileName('tasks')), 'Tsk', 'utf-8');
      
      const summary = SpecManager.getStatusSummary(tempDir, featureName);
      expect(summary).toContain('status: reviewing');
      expect(summary).toContain('phase: requirements'); // It picks the first non-approved phase
    });

    it('should return Action Required if a middle stage is pending edits', () => {
      const featureName = 'test-feature';
      const featurePath = join(tempDir, 'projects', 'active', featureName);
      mkdirSync(featurePath, { recursive: true });
      SpecManager.setMode(featurePath, 'one-shot');
      
      writeFileSync(join(featurePath, WorkflowStateRepository.getStageFileName('requirements')), 'Req', 'utf-8');
      writeFileSync(join(featurePath, '.spec-requirements-approved'), 'ok', 'utf-8');
      writeFileSync(join(featurePath, WorkflowStateRepository.getStageFileName('design')), '<template-design>placeholder</template-design>', 'utf-8');
      
      const summary = SpecManager.getStatusSummary(tempDir, featureName);
      expect(summary).toContain('phase: design');
      expect(summary).toContain('status: drafting');
      expect(summary).toContain('next_step: Write design.md and use mcpx spec sc_plan to advance.');
    });

    it('should return approved state when approval marker exists', () => {
      const featureName = 'test-feature';
      const featurePath = join(tempDir, 'projects', 'active', featureName);
      mkdirSync(dirname(featurePath), { recursive: true });
      mkdirSync(featurePath);
      
      writeFileSync(join(featurePath, WorkflowStateRepository.getStageFileName('requirements')), 'Req', 'utf-8');
      writeFileSync(join(featurePath, '.spec-requirements-approved'), '2026-04-10', 'utf-8');
      
      const summary = SpecManager.getStatusSummary(tempDir, featureName);
      expect(summary).toContain('status: approved');
      expect(summary).toContain('next_step: use mcpx spec sc_plan to scaffold design.');
    });

    it('should include epoch context in status summary if file exists', () => {
      const featureName = 'test-feature';
      const featurePath = join(tempDir, featureName);
      mkdirSync(featurePath);
      
      const epochContent = '# Epoch Context\n\n## Active Focus\n* Working on tests';
      writeFileSync(join(featurePath, '.epoch-context.md'), epochContent, 'utf-8');
      
      const summary = SpecManager.getStatusSummary(tempDir, featureName);
      expect(summary).toContain('epoch_context:');
      expect(summary).toContain('Active Focus');
      expect(summary).toContain('Working on tests');
    });
  });
});

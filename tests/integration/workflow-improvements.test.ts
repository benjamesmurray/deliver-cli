import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSpecTools } from '../../src/tools/specTools.js';
import { WorkflowStateRepository } from '../../src/features/shared/workflowStateRepository.js';

describe('Workflow Improvements Integration', () => {
  let tempDir: string;
  let tools: Record<string, any>;
  let originalCwd: () => string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `spec-cli-improvements-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Mock process.cwd for SpecManager
    originalCwd = process.cwd;
    process.cwd = () => tempDir;

    const server = new McpServer({
      name: 'test-server',
      version: '1.0'
    });
    registerSpecTools(server);
    // @ts-ignore - access registered tools for direct testing
    tools = server._registeredTools;
  });

  afterEach(() => {
    process.cwd = originalCwd;
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Archiving Feedback', () => {
    it('should show appropriate feedback when a project is archived', async () => {
      const featureName = 'archive-feedback-test';
      await tools['sc_init'].callback({ name: featureName }, {});
      
      const archiveRes = await tools['sc_archive'].callback({ feature: featureName }, {});
      const output = archiveRes.content[0].text;
      
      expect(output).toContain('Successfully archived project');
      expect(output).toContain('phase: completed');
      expect(output).toContain('next_step: Feature workflow complete.');
      expect(output).not.toContain('STRICT MANDATE: You are in the Planning Phase');
      expect(output).not.toContain('Run `sc_init` to initialize requirements');
    });
  });

  describe('sc_feedback tool', () => {
    it('should clear open questions in epoch context when feedback is provided', async () => {
      const featureName = 'feedback-test';
      await tools['sc_init'].callback({ name: featureName }, {});
      
      // Add open question via sc_epoch
      await tools['sc_epoch'].callback({ 
        feature: featureName, 
        openQuestions: 'What is the target audience?' 
      }, {});
      
      const featurePath = join(tempDir, 'projects', 'active', featureName);
      const epochPath = join(featurePath, '.epoch-context.md');
      
      let epochContent = readFileSync(epochPath, 'utf-8');
      expect(epochContent).toContain('What is the target audience?');

      // Provide feedback
      await tools['sc_feedback'].callback({ 
        feature: featureName, 
        feedback: 'The target audience is developers.' 
      }, {});
      
      epochContent = readFileSync(epochPath, 'utf-8');
      expect(epochContent).toContain('None (Feedback received: The target audience is developers.)');
      expect(epochContent).not.toContain('What is the target audience?');
    });
  });

  describe('Approval Cooling-off Period', () => {
    it('should strictly enforce a 2-second delay between sc_feedback and sc_approve', async () => {
      const featureName = 'cooling-off-test';
      await tools['sc_init'].callback({ name: featureName }, {});
      const featurePath = join(tempDir, 'projects', 'active', featureName);
      const reqFile = WorkflowStateRepository.getStageFileName('requirements');
      writeFileSync(join(featurePath, reqFile), '# Requirements\nDone.', 'utf-8');

      // Provide feedback
      await tools['sc_feedback'].callback({ feature: featureName, feedback: 'Acknowledged.' }, {});
      
      // Immediate approval should fail
      const approveResFail = await tools['sc_approve'].callback({ feature: featureName }, {});
      expect(approveResFail.isError).toBe(true);
      expect(approveResFail.content[0].text).toContain('Approval blocked: Recent feedback was recorded');

      // Wait 2.1 seconds
      await new Promise(resolve => setTimeout(resolve, 2100));

      // Now approve should work
      const approveResSuccess = await tools['sc_approve'].callback({ feature: featureName }, {});
      expect(approveResSuccess.content[0].text).toContain('Requirements Document" approved');
      }, 10000); // 10s timeout for the delay

      describe('One-shot Mode Design', () => {
      it('should skip explicit approval requirement in one-shot mode', async () => {
        const featureName = 'oneshot-bypass-test';
        // Init in one-shot mode
        await tools['sc_init'].callback({ name: featureName, mode: 'one-shot' }, {});

        const featurePath = join(tempDir, 'projects', 'active', featureName);
        const reqFile = WorkflowStateRepository.getStageFileName('requirements');
        const desFile = WorkflowStateRepository.getStageFileName('design');

        writeFileSync(join(featurePath, reqFile), '# Requirements\nDone.', 'utf-8');

        // Now sc_plan should succeed IMMEDIATELY without sc_approve
        const planResSuccess = await tools['sc_plan'].callback({ feature: featureName }, {});
        expect(planResSuccess.content[0].text).toContain('Requirements complete. Scaffolding Design.md.');
        expect(existsSync(join(featurePath, desFile))).toBe(true);
      });
      });
});
});
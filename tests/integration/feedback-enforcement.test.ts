import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSpecTools } from '../../src/tools/specTools.js';
import { WorkflowStateRepository } from '../../src/features/shared/workflowStateRepository.js';

describe('Feedback Enforcement Integration', () => {
  let tempDir: string;
  let tools: Record<string, any>;
  let originalCwd: () => string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `spec-cli-enforcement-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    originalCwd = process.cwd;
    process.cwd = () => tempDir;

    const server = new McpServer({
      name: 'test-server',
      version: '1.0'
    });
    registerSpecTools(server);
    // @ts-ignore
    tools = server._registeredTools;
  });

  afterEach(() => {
    process.cwd = originalCwd;
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should enforce no open questions before sc_approve', async () => {
    const featureName = 'questions-test';
    await tools['sc_init'].callback({ name: featureName }, {});
    
    const reqFile = WorkflowStateRepository.getStageFileName('requirements');
    const featurePath = join(tempDir, 'projects', 'active', featureName);
    writeFileSync(join(featurePath, reqFile), '# Requirements\nDone.', 'utf-8');

    // Add open question
    await tools['sc_epoch'].callback({ feature: featureName, openQuestions: 'What color should the logo be?' }, {});

    // Attempt approve with open question
    const approveRes = await tools['sc_approve'].callback({ feature: featureName }, {});
    expect(approveRes.isError).toBe(true);
    expect(approveRes.content[0].text).toContain('Cannot advance while there are active open questions in the epoch context.');

    // Resolve question
    await tools['sc_epoch'].callback({ feature: featureName, openQuestions: 'None' }, {});

    // Now approve should work
    const approveRes2 = await tools['sc_approve'].callback({ feature: featureName }, {});
    expect(approveRes2.content[0].text).toContain('Requirements Document" has been approved');
  });

  it('should enforce no open questions in one-shot mode sc_plan', async () => {
    const featureName = 'oneshot-enforcement';
    await tools['sc_init'].callback({ name: featureName, mode: 'one-shot' }, {});
    
    const reqFile = WorkflowStateRepository.getStageFileName('requirements');
    const featurePath = join(tempDir, 'projects', 'active', featureName);
    writeFileSync(join(featurePath, reqFile), '# Requirements\nDone.', 'utf-8');

    // Add open question
    await tools['sc_epoch'].callback({ feature: featureName, openQuestions: 'How to handle errors?' }, {});

    // Attempt plan with open question
    const planRes2 = await tools['sc_plan'].callback({ feature: featureName }, {});
    expect(planRes2.content[0].text).toContain('Cannot advance while there are active open questions in the epoch context.');

    // Resolve question
    await tools['sc_epoch'].callback({ feature: featureName, openQuestions: 'None' }, {});

    // Now plan should work
    const planRes3 = await tools['sc_plan'].callback({ feature: featureName }, {});
    expect(planRes3.content[0].text).toContain('Requirements complete. Scaffolding Design.md.');
  });

  it('should prevent sc_approve immediately after sc_feedback', async () => {
    const featureName = 'feedback-delay-test';
    await tools['sc_init'].callback({ name: featureName }, {});
    
    const reqFile = WorkflowStateRepository.getStageFileName('requirements');
    const featurePath = join(tempDir, 'projects', 'active', featureName);
    writeFileSync(join(featurePath, reqFile), '# Requirements\nDone.', 'utf-8');

    // Provide feedback
    const feedbackRes = await tools['sc_feedback'].callback({ feature: featureName, feedback: 'Use blue for the logo.' }, {});
    expect(feedbackRes.content[0].text).toContain('Feedback acknowledged and recorded');

    // Attempt approve immediately
    const approveRes = await tools['sc_approve'].callback({ feature: featureName }, {});
    expect(approveRes.isError).toBe(true);
    expect(approveRes.content[0].text).toContain('Approval blocked: Recent feedback was recorded');

    // Wait 2.1 seconds
    await new Promise(resolve => setTimeout(resolve, 2100));

    // Now approve should work
    const approveRes2 = await tools['sc_approve'].callback({ feature: featureName }, {});
    expect(approveRes2.content[0].text).toContain('Requirements Document" has been approved');
  }, 10000);
});

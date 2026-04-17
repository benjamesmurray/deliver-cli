import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { registerSpecTools } from '../../src/tools/specTools.js';
import { WorkflowStateRepository } from '../../src/features/shared/workflowStateRepository.js';
import { SpecManager } from '../../src/features/shared/SpecManager.js';

describe('Lifecycle and Modes Integration', () => {
  let tempDir: string;
  let tools: any;

  beforeEach(() => {
    tempDir = join(tmpdir(), `spec-cli-lifecycle-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    process.chdir(tempDir);

    const mockServer: any = {
      registerTool: (name: string, schema: any, callback: any) => {
        tools[name] = { schema, callback };
      }
    };
    tools = {};
    registerSpecTools(mockServer);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should support one-shot mode and toggle instructions', async () => {
    const featureName = 'mode-test';
    const featurePath = join(tempDir, 'projects', 'active', featureName);

    // 1. Init with one-shot
    await tools['sc_init'].callback({ name: featureName, mode: 'one-shot' }, {});

    // Simulate finishing requirements
    const reqFile = WorkflowStateRepository.getStageFileName('requirements');
    writeFileSync(join(featurePath, reqFile), '# Requirements\nDone.', 'utf-8');

    // 2. Check status (should show one-shot instructions)
    const statusRes1 = await tools['sc_status'].callback({ feature: featureName }, {});
    expect(statusRes1.content[0].text).toContain('🤖 [AUTONOMOUS REVIEW] Resolve ambiguities autonomously. Once resolved, run `spec sc_plan` to scaffold the design phase.');

    // 3. Toggle back to step-through
    await tools['sc_mode'].callback({ mode: 'step-through', feature: featureName }, {});

    // 4. Check status (should show normal loop instructions)
    const statusRes2 = await tools['sc_status'].callback({ feature: featureName }, {});
    expect(statusRes2.content[0].text).not.toContain('🤖 [AUTONOMOUS REVIEW]');
    expect(statusRes2.content[0].text).toContain('🔍 [REVIEW]');
  });

  it('should automatically archive the project when the workflow is finished', async () => {
    const featureName = 'auto-archive-test';
    const activePath = join(tempDir, 'projects', 'active', featureName);
    const completedPath = join(tempDir, 'projects', 'completed', featureName);

    // 1. Setup a "finished" project state
    await tools['sc_init'].callback({ name: featureName }, {});

    const reqFile = WorkflowStateRepository.getStageFileName('requirements');
    const desFile = WorkflowStateRepository.getStageFileName('design');
    const tskFile = WorkflowStateRepository.getStageFileName('tasks');

    // Requirements
    writeFileSync(join(activePath, reqFile), 'Done', 'utf-8');
    await tools['sc_approve'].callback({}, {});
    await tools['sc_plan'].callback({}, {}); // Scaffolds Design

    // Design
    writeFileSync(join(activePath, desFile), 'Done', 'utf-8');
    await tools['sc_approve'].callback({}, {});
    await tools['sc_plan'].callback({}, {}); // Scaffolds Tasks

    // Tasks (complete all)
    writeFileSync(join(activePath, tskFile), '- [x] 1.1 Task 1\n- [x] 1.2 Task 2', 'utf-8');
    await tools['sc_approve'].callback({}, {});
    
    // Final sc_plan should archive
    const planRes = await tools['sc_plan'].callback({}, {});

    expect(planRes.content[0].text).toContain('Workflow is completely finished');
    expect(planRes.content[0].text).toContain('Successfully archived project');
    expect(existsSync(completedPath)).toBe(true);
    expect(existsSync(activePath)).toBe(false);
  });
});

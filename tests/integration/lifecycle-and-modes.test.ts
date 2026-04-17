import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSpecTools } from '../../src/tools/specTools.js';
import { WorkflowStateRepository } from '../../src/features/shared/workflowStateRepository.js';

describe('Lifecycle and Modes Integration', () => {
  let tempDir: string;
  let tools: Record<string, any>;
  let originalCwd: () => string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `spec-cli-lifecycle-${Date.now()}`);
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

  it('should create projects in projects/active and move to projects/completed upon archival', async () => {
    const featureName = 'archival-test';
    const activePath = join(tempDir, 'projects', 'active', featureName);
    const completedPath = join(tempDir, 'projects', 'completed', featureName);

    // 1. Init
    await tools['sc_init'].callback({ name: featureName }, {});
    expect(existsSync(activePath)).toBe(true);

    // 2. Manual Archive
    const archiveRes = await tools['sc_archive'].callback({ feature: featureName }, {});
    expect(archiveRes.content[0].text).toContain('Successfully archived project');
    expect(existsSync(activePath)).toBe(false);
    expect(existsSync(completedPath)).toBe(true);

    // 3. Verify .spec_last_used points to new location
    const lastUsed = readFileSync(join(tempDir, '.spec_last_used'), 'utf-8');
    expect(lastUsed).toBe(join('projects', 'completed', featureName));

    // 4. sc_status should still work
    const statusRes = await tools['sc_status'].callback({ feature: featureName }, {});
    expect(statusRes.content[0].text).toContain('Feature: projects/completed/archival-test');
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
    expect(statusRes1.content[0].text).toContain('🤖 [AUTONOMOUS REVIEW] Resolve ambiguities autonomously. Run `spec sc_analyze` followed by `spec sc_guidance`. Once resolved, run `spec sc_plan` to scaffold the design phase.');

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
    const tstFile = WorkflowStateRepository.getStageFileName('testing');

    writeFileSync(join(activePath, reqFile), 'Done', 'utf-8');
    await tools['sc_guidance'].callback({}, {});
    await tools['sc_analyze'].callback({}, {});
    await tools['sc_approve'].callback({}, {});
    await tools['sc_plan'].callback({}, {}); // Scaffolds Design
    
    writeFileSync(join(activePath, desFile), 'Done', 'utf-8');
    await tools['sc_guidance'].callback({}, {});
    await tools['sc_analyze'].callback({}, {});
    await tools['sc_approve'].callback({}, {});
    await tools['sc_plan'].callback({}, {}); // Scaffolds Tasks
    
    writeFileSync(join(activePath, tskFile), '# Tasks\n- [x] 1.1 Done', 'utf-8');
    await tools['sc_guidance'].callback({}, {});
    await tools['sc_analyze'].callback({}, {});
    await tools['sc_approve'].callback({}, {});
    await tools['sc_plan'].callback({}, {}); // Scaffolds Testing
    
    writeFileSync(join(activePath, tstFile), 'Testing Done', 'utf-8');
    await tools['sc_guidance'].callback({}, {});
    await tools['sc_analyze'].callback({}, {});
    await tools['sc_approve'].callback({}, {});
    
    // 2. Final plan call to finish and archive
    const finalPlanRes = await tools['sc_plan'].callback({}, {});
    
    expect(finalPlanRes.content[0].text).toContain('Workflow is completely finished.');
    expect(finalPlanRes.content[0].text).toContain('Successfully archived project');
    expect(existsSync(activePath)).toBe(false);
    expect(existsSync(completedPath)).toBe(true);
  }, 30000);
});
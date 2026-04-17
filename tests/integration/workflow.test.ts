import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSpecTools } from '../../src/tools/specTools.js';
import { WorkflowStateRepository } from '../../src/features/shared/workflowStateRepository.js';

describe('Spec CLI Workflow Integration', () => {
  let tempDir: string;
  let tools: Record<string, any>;
  let originalCwd: () => string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `spec-cli-integration-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Mock process.cwd() to return our temp dir
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

  it('should execute a full spec workflow lifecycle', async () => {
    const featureName = 'payment-system';
    const reqFile = WorkflowStateRepository.getStageFileName('requirements');
    const desFile = WorkflowStateRepository.getStageFileName('design');
    const tskFile = WorkflowStateRepository.getStageFileName('tasks');

    // 1. Initialize
    const initRes = await tools['sc_init'].callback({ name: featureName, description: 'Add payments' }, {});
    expect(initRes.content[0].text).toContain('Requirements: Pending Edits');
    expect(initRes.content[0].text).toContain('⚠️ [ACTION REQUIRED] Complete drafting requirements and remove all `<template-requirements>` tags.');

    // 2. plan (with requirements not finished)
    const planRes1 = await tools['sc_plan'].callback({ instruction: 'Use Stripe' }, {});
    expect(planRes1.content[0].text).toContain(`Please finish editing ${reqFile}`);
    expect(planRes1.content[0].text).toContain('Reminder instruction: Use Stripe');

    // 3. Simulate AI finishing the requirements document (removing tags)
    const reqPath = join(tempDir, 'projects', 'active', featureName, reqFile);
    writeFileSync(reqPath, '# Requirements\nWe will use Stripe.', 'utf-8');

    // 3.5. Approve requirements
    const approveReqRes = await tools['sc_approve'].callback({}, {});
    expect(approveReqRes.content[0].text).toContain('Requirements Document" has been approved');

    // 4. plan (advancing to Design)
    const planRes2 = await tools['sc_plan'].callback({}, {});
    expect(planRes2.content[0].text).toContain(`Requirements complete. Scaffolding ${desFile}.`);
    expect(planRes2.content[0].text).toContain('Design: Pending Edits');

    // 5. Simulate AI finishing the design document
    const desPath = join(tempDir, 'projects', 'active', featureName, desFile);
    writeFileSync(desPath, '# Design\nStripe API design.', 'utf-8');

    // 5.5. Approve design
    const approveDesRes = await tools['sc_approve'].callback({}, {});
    expect(approveDesRes.content[0].text).toContain('Design Document" has been approved');

    // 6. plan (advancing to Tasks)
    const planRes3 = await tools['sc_plan'].callback({}, {});
    expect(planRes3.content[0].text).toContain(`Design complete. Scaffolding ${tskFile}.`);
    expect(planRes3.content[0].text).toContain('Tasks: Pending Edits');

    // 7. Simulate AI writing tasks
    const tasksPath = join(tempDir, 'projects', 'active', featureName, tskFile);
    writeFileSync(tasksPath, '# Tasks\n- [ ] 1.1 Setup Stripe webhook\n- [ ] 1.2 Implement checkout', 'utf-8');

    // 7.5. Approve tasks
    const approveTskRes = await tools['sc_approve'].callback({}, {});
    expect(approveTskRes.content[0].text).toContain('Task List" has been approved');

    // 8. sc_status (everything ready)
    const statusRes = await tools['sc_status'].callback({}, {});
    expect(statusRes.content[0].text).toContain('Tasks: Active');
    expect(statusRes.content[0].text).toContain('🚀 [IMPLEMENTATION] Proceed with tasks. Run `spec sc_todo_start` to begin.');

    // 9. todo (Complete a task)
    const todoRes = await tools['sc_todo_complete'].callback({ feature: featureName, id: '1.1' }, {});
    expect(todoRes.content[0].text).toContain('1.1');
    // Ensure file was modified
    const tasksContent = readFileSync(tasksPath, 'utf-8');
    expect(tasksContent).toContain('- [x] 1.1 Setup Stripe webhook');
    expect(tasksContent).toContain('- [ ] 1.2 Implement checkout');
  }, 15000);
});
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSpecTools } from '../../src/tools/specTools.js';
import { WorkflowStateRepository } from '../../src/features/shared/workflowStateRepository.js';

describe('Workflow State Diagram Integration', () => {
  let tempDir: string;
  let tools: Record<string, any>;
  let originalCwd: () => string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `spec-cli-state-${Date.now()}`);
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

  it('should follow the documented state diagram process', async () => {
    const featureName = 'state-test-feature';
    const reqFile = WorkflowStateRepository.getStageFileName('requirements');
    const desFile = WorkflowStateRepository.getStageFileName('design');
    const tskFile = WorkflowStateRepository.getStageFileName('tasks');

    // [*] --> Requirements: sc_init
    const initRes = await tools['sc_init'].callback({ 
      name: featureName, description: 'Testing state transitions' 
    }, {});
    expect(initRes.content[0].text).toContain('status: drafting');
    expect(initRes.content[0].text).toContain('phase: requirements');

    // Requirements --> Design: sc_plan (resolve ambiguities & approve)
    // First call shows pending edits
    const planReqPending = await tools['sc_plan'].callback({}, {});
    expect(planReqPending.content[0].text).toContain(`Please finish editing ${reqFile}`);

    // Simulate approval (remove tags)
    const reqPath = join(tempDir, 'projects', 'active', featureName, reqFile);
    writeFileSync(reqPath, '# Requirements\nConfirmed requirements.', 'utf-8');

    // Second call advances to Design
    await tools['sc_approve'].callback({}, {});
    const planToDesign = await tools['sc_plan'].callback({}, {});
    expect(planToDesign.content[0].text).toContain(`Requirements complete. Scaffolding ${desFile}.`);
    expect(planToDesign.content[0].text).toContain('status: drafting');
    expect(planToDesign.content[0].text).toContain('phase: design');

    // Design --> Tasks: sc_plan (resolve ambiguities & approve)
    // First call shows pending edits
    const planDesPending = await tools['sc_plan'].callback({}, {});
    expect(planDesPending.content[0].text).toContain(`Please finish editing ${desFile}`);

    // Simulate approval
    const desPath = join(tempDir, 'projects', 'active', featureName, desFile);
    writeFileSync(desPath, '# Design\nConfirmed design.', 'utf-8');

    // Second call advances to Tasks
    await tools['sc_approve'].callback({}, {});
    const planToTasks = await tools['sc_plan'].callback({}, {});
    expect(planToTasks.content[0].text).toContain(`Design complete. Scaffolding ${tskFile}.`);
    expect(planToTasks.content[0].text).toContain('status: drafting');
    expect(planToTasks.content[0].text).toContain('phase: tasks');

    // Tasks --> Implementation: sc_todo_* (add dependencies, annotate tasks from design, & approve)
    // Simulate approval of tasks
    const tasksPath = join(tempDir, 'projects', 'active', featureName, tskFile);
    writeFileSync(tasksPath, '# Tasks\n- [ ] 1.1 First task\n- [ ] 1.2 Second task', 'utf-8');

    // Approve tasks to move to Implementation
    await tools['sc_approve'].callback({}, {});

    // Transition to Implementation phase
    const statusRes = await tools['sc_status'].callback({ feature: featureName }, {});
    expect(statusRes.content[0].text).toContain('phase: implementation');
    expect(statusRes.content[0].text).toContain('status: active');

    // Implementation --> [*]: (start/complete) All tasks completed
    // Complete 1.1
    const complete1 = await tools['sc_todo_complete'].callback({ 
      feature: featureName, id: '1.1' 
    }, {});
    expect(complete1.content[0].text).toContain('Newly completed tasks:');
    expect(complete1.content[0].text).toContain('- 1.1');

    // Complete 1.2
    const complete2 = await tools['sc_todo_complete'].callback({ 
      feature: featureName, id: '1.2' 
    }, {});
    expect(complete2.content[0].text).toContain('Newly completed tasks:');
    expect(complete2.content[0].text).toContain('- 1.2');
    expect(complete2.content[0].text).toContain('All tasks completed!');
    
    // Final check - in reality, "All tasks completed" might still show "Implementation" 
    // but we verify the status summary reflects the completion.
    const finalStatus = await tools['sc_status'].callback({ feature: featureName }, {});
    expect(finalStatus.content[0].text).toContain('status: finished');
    expect(finalStatus.content[0].text).toContain('phase: completed');
    expect(finalStatus.content[0].text).toContain('Workflow complete.');

    const tasksContent = readFileSync(tasksPath, 'utf-8');
    expect(tasksContent).not.toContain('- [ ]');
    }, 30000);
    });
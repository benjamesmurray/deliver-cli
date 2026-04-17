import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSpecTools } from '../../src/tools/specTools.js';
import { WorkflowStateRepository } from '../../src/features/shared/workflowStateRepository.js';

describe('Epoch Context Integration', () => {
  let tempDir: string;
  let tools: Record<string, any>;
  let originalCwd: () => string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `spec-cli-epoch-test-${Date.now()}`);
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

  it('should handle epoch context lifecycle', async () => {
    const featureName = 'epoch-feature';
    const epochFile = '.epoch-context.md';
    const reqFile = WorkflowStateRepository.getStageFileName('requirements');

    // 1. Initialize feature - should create epoch file
    await tools['sc_init'].callback({ name: featureName }, {});
    const epochPath = join(tempDir, 'projects', 'active', featureName, epochFile);
    expect(existsSync(epochPath)).toBe(true);
    expect(readFileSync(epochPath, 'utf-8')).toContain('**Current Phase:** Requirements');

    // 2. Update epoch context via tool
    await tools['sc_epoch'].callback({ 
      feature: featureName, 
      focus: 'Initial research',
      intentions: 'Write requirements'
    }, {});
    
    let content = readFileSync(epochPath, 'utf-8');
    expect(content).toContain('## Active Focus\n*   Initial research');
    expect(content).toContain('## Pending Intentions\n*   Write requirements');

    // 3. Status should show epoch context
    const statusRes = await tools['sc_status'].callback({ feature: featureName }, {});
    expect(statusRes.content[0].text).toContain('--- Epoch Context ---');
    expect(statusRes.content[0].text).toContain('Initial research');

    // 4. Surgical update - change focus only
    await tools['sc_epoch'].callback({ 
      feature: featureName, 
      focus: 'Updated focus'
    }, {});
    
    content = readFileSync(epochPath, 'utf-8');
    expect(content).toContain('## Active Focus\n*   Updated focus');
    expect(content).toContain('## Pending Intentions\n*   Write requirements'); // Should remain untouched

    // 5. Advance phase - should reset epoch context
    // First finish requirements
    writeFileSync(join(tempDir, 'projects', 'active', featureName, reqFile), '# Requirements\nDone.', 'utf-8');
    
    // Approve requirements
    await tools['sc_guidance'].callback({ feature: featureName }, {});
    await tools['sc_analyze'].callback({ feature: featureName }, {});
    await tools['sc_approve'].callback({ feature: featureName }, {});
    
    await tools['sc_plan'].callback({ feature: featureName }, {});
    
    content = readFileSync(epochPath, 'utf-8');
    expect(content).toContain('**Current Phase:** Design');
    expect(content).not.toContain('Updated focus'); // Should be cleared
    expect(content).not.toContain('Write requirements'); // Should be cleared
  }, 20000);
});

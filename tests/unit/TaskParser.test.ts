import { describe, it, expect } from 'vitest';
import { TaskParser, TaskPresenter } from '../../src/features/shared/taskParser.js';

describe('TaskParser', () => {
  it('should parse hierarchical task structure from markdown content', () => {
    const content = `# Implementation Tasks
- [ ] 1. **Main Task**
- [ ] 1.1 Subtask A
- [x] 1.2 Subtask B`;
    
    const tasks = TaskParser.parse(content);
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('1');
    expect(tasks[0].children).toHaveLength(2);
    expect(tasks[0].children[0].id).toBe('1.1');
    expect(tasks[0].children[1].id).toBe('1.2');
    expect(tasks[0].children[1].completed).toBe(true);
  });

  it('should build deeper hierarchy correctly', () => {
    const content = `- [ ] 1. A
- [ ] 1.1. B
- [ ] 1.1.1. C`;
    
    const tasks = TaskParser.parse(content);
    expect(tasks[0].children[0].children[0].id).toBe('1.1.1');
  });
});

describe('TaskPresenter', () => {
  it('should format hierarchical tasks for display', () => {
    const tasks = [
      {
        id: '1',
        text: 'Task 1',
        completed: true,
        children: [
          { id: '1.1', text: 'Sub 1.1', completed: false, children: [] }
        ]
      }
    ];
    
    // @ts-ignore
    const output = TaskPresenter.formatFullDisplay(tasks);
    expect(output).toContain('[x] Task 1');
    expect(output).toContain('  1.1. [ ] Sub 1.1');
  });
});

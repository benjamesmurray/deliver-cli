import { describe, it, expect } from 'vitest';
import { TaskLexer } from '../../src/features/shared/taskLexer.js';
import { MarkdownTaskUpdater } from '../../src/features/shared/markdownTaskUpdater.js';

describe('TaskLexer', () => {
  it('should extract heading and list item tokens with correct line numbers', () => {
    const content = `# Tasks
- [ ] 1.1 Task A
- [x] 1.2 Task B
    - [ ] 1.2.1 Subtask C`;
    
    const tokens = TaskLexer.lex(content);
    
    expect(tokens).toHaveLength(4);
    
    expect(tokens[0]).toMatchObject({ type: 'heading', text: 'Tasks', line: 1 });
    expect(tokens[1]).toMatchObject({ type: 'list_item', checked: false, line: 2 });
    expect(tokens[1].text).toContain('1.1 Task A');
    
    expect(tokens[2]).toMatchObject({ type: 'list_item', checked: true, line: 3 });
    expect(tokens[2].text).toContain('1.2 Task B');
    
    expect(tokens[3]).toMatchObject({ type: 'list_item', checked: false, line: 4 });
    expect(tokens[3].text).toContain('1.2.1 Subtask C');
  });

  it('should handle complex markdown structures', () => {
    const content = `# Project
  Some intro text.

  ## Features
  - [ ] 1. **Feature 1**
   - [ ] 1.1 Subfeature
     Some details here.
   - [x] 1.2 Done feature`;

    const tokens = TaskLexer.lex(content);

    const feature1 = tokens.find(t => t.text.includes('1. **Feature 1**'));
    expect(feature1).toBeDefined();
    expect(feature1?.line).toBe(5);

    const subfeature = tokens.find(t => t.text.includes('1.1 Subfeature'));
    expect(subfeature).toBeDefined();
    expect(subfeature?.line).toBe(6);
  });

});

describe('MarkdownTaskUpdater', () => {
  it('should update a single task checkbox surgically', () => {
    const content = `# Tasks
- [ ] 1.1 Task A
- [ ] 1.2 Task B`;
    
    const updated = MarkdownTaskUpdater.updateTaskStatus(content, '1.1', true);
    expect(updated).toBe(`# Tasks
- [x] 1.1 Task A
- [ ] 1.2 Task B`);
  });

  it('should auto-mark parent tasks when all subtasks are completed', () => {
    const content = `# Tasks
- [ ] 1. **Main Task**
    - [ ] 1.1 Subtask A
    - [x] 1.2 Subtask B`;
    
    const updated = MarkdownTaskUpdater.updateTaskStatus(content, '1.1', true);
    expect(updated).toContain('- [x] 1. **Main Task**');
    expect(updated).toContain('- [x] 1.1 Subtask A');
  });

  it('should not auto-mark parent if some subtasks remain uncompleted', () => {
    const content = `# Tasks
- [ ] 1. **Main Task**
    - [ ] 1.1 Subtask A
    - [ ] 1.2 Subtask B`;
    
    const updated = MarkdownTaskUpdater.updateTaskStatus(content, '1.1', true);
    expect(updated).toContain('- [ ] 1. **Main Task**');
    expect(updated).toContain('- [x] 1.1 Subtask A');
  });

  it('should handle batch updates', () => {
    const content = `# Tasks
- [ ] 1.1 Task A
- [ ] 1.2 Task B
- [ ] 1.3 Task C`;
    
    const updated = MarkdownTaskUpdater.updateBatchTaskStatus(content, ['1.1', '1.3'], true);
    expect(updated).toContain('- [x] 1.1 Task A');
    expect(updated).toContain('- [ ] 1.2 Task B');
    expect(updated).toContain('- [x] 1.3 Task C');
  });
});

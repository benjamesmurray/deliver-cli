import { lexer, Token } from 'marked';

export interface TaskToken {
  type: 'heading' | 'list_item';
  text: string;
  depth?: number; // For headings
  checked?: boolean; // For list items
  raw: string;
  line: number; // 1-based line number where the token starts
}

/**
 * TaskLexer uses 'marked' to extract relevant task tokens and their line numbers.
 */
export class TaskLexer {
  /**
   * Lexes the markdown content into a stream of task-related tokens.
   */
  static lex(content: string): TaskToken[] {
    const tokens = lexer(content);
    const taskTokens: TaskToken[] = [];
    const lines = content.split('\n');

    const findLineNumber = (raw: string, startFrom: number): number => {
      for (let i = startFrom; i < lines.length; i++) {
        const lineContent = lines[i].trim();
        const rawFirstLine = raw.split('\n')[0].trim();
        if (lineContent.includes(rawFirstLine) || rawFirstLine.includes(lineContent)) {
          return i + 1;
        }
      }
      return -1;
    };

    let currentLine = 0;
    const processTokens = (tokens: Token[]) => {
      for (const token of tokens) {
        if (token.type === 'heading') {
          const line = findLineNumber(token.raw, currentLine);
          if (line !== -1) {
            taskTokens.push({
              type: 'heading',
              text: token.text,
              depth: token.depth,
              raw: token.raw,
              line
            });
            currentLine = line;
          }
        } else if (token.type === 'list_item') {
          const line = findLineNumber(token.raw, currentLine);
          if (line !== -1) {
            taskTokens.push({
              type: 'list_item',
              text: token.text,
              checked: token.checked,
              raw: token.raw,
              line
            });
            currentLine = line;
          }
        }
        
        // Recursively process tokens if any
        if ('tokens' in token && token.tokens) {
          processTokens(token.tokens as Token[]);
        }
        // Recursively process items for lists
        if ('items' in token && token.items) {
          processTokens(token.items as Token[]);
        }
      }
    };

    processTokens(tokens as Token[]);
    return taskTokens;
  }
}

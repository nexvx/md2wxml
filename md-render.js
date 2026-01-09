/**
 * Markdown 解析器组件
 */

// 正则表达式常量
const PATTERNS = {
  ordered: /^\d+\.\s+(.+)$/,
  unordered: /^[-*+]\s+(.+)$/,
  heading: /^(#{1,6})\s+(.+)$/,
  hr: /^(-{3,}|\*{3,}|_{3,})$/,
  codeBlockStart: /^```/
};

Component({
  properties: {
    content: {
      type: String,
      value: '',
      observer(newVal) {
        this.setData({ nodes: newVal ? this.parseMarkdown(newVal) : [] });
      }
    }
  },

  data: { nodes: [] },

  lifetimes: {
    attached() {
      if (this.properties.content) {
        this.setData({ nodes: this.parseMarkdown(this.properties.content) });
      }
    }
  },

  methods: {
    parseMarkdown(text) {
      const lines = text.split('\n');
      const nodes = [];
      let i = 0;

      while (i < lines.length) {
        const { node, nextIndex } = this.parseLine(lines, i);
        if (node) nodes.push(node);
        i = nextIndex;
      }
      return nodes;
    },

    parseLine(lines, index) {
      const line = lines[index].trim();

      if (!line) return { node: null, nextIndex: index + 1 };

      // 代码块
      if (PATTERNS.codeBlockStart.test(line)) {
        return this.parseCodeBlock(lines, index);
      }

      // 标题
      const headingMatch = line.match(PATTERNS.heading);
      if (headingMatch) {
        return {
          node: { type: 'heading', level: headingMatch[1].length, children: this.parseInline(headingMatch[2]) },
          nextIndex: index + 1
        };
      }

      // 分隔线
      if (PATTERNS.hr.test(line)) {
        return { node: { type: 'hr' }, nextIndex: index + 1 };
      }

      // 引用块
      if (line.startsWith('>')) {
        return this.parseBlockquote(lines, index);
      }

      // 列表（统一处理有序和无序）
      if (PATTERNS.ordered.test(line) || PATTERNS.unordered.test(line)) {
        return this.parseList(lines, index);
      }

      // 普通段落
      return {
        node: { type: 'paragraph', children: this.parseInline(line) },
        nextIndex: index + 1
      };
    },

    parseCodeBlock(lines, startIndex) {
      const language = lines[startIndex].trim().slice(3).trim();
      const codeLines = [];
      let i = startIndex + 1;

      while (i < lines.length && !PATTERNS.codeBlockStart.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }

      return {
        node: { type: 'codeblock', language, content: codeLines.join('\n') },
        nextIndex: i + 1
      };
    },

    parseBlockquote(lines, startIndex) {
      const quoteLines = [];
      let i = startIndex;

      while (i < lines.length) {
        const line = lines[i].trim();
        if (line.startsWith('>')) {
          quoteLines.push(line.slice(1).trim());
          i++;
        } else if (line === '' && i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
          quoteLines.push('');
          i++;
        } else {
          break;
        }
      }

      return {
        node: { type: 'blockquote', children: this.parseInline(quoteLines.join('\n')) },
        nextIndex: i
      };
    },

    /**
     * 统一解析列表（支持有序/无序及嵌套）
     */
    parseList(lines, startIndex) {
      const firstLine = lines[startIndex].trim();
      const isOrdered = PATTERNS.ordered.test(firstLine);
      const mainPattern = isOrdered ? PATTERNS.ordered : PATTERNS.unordered;
      const items = [];
      let i = startIndex;

      while (i < lines.length) {
        const line = lines[i].trim();
        const match = line.match(mainPattern);

        if (match) {
          const item = { type: 'listitem', children: this.parseInline(match[1]), nestedList: null };
          i++;

          // 解析嵌套列表（有序列表可嵌套无序，无序列表可嵌套有序）
          const nestedPattern = isOrdered ? PATTERNS.unordered : PATTERNS.ordered;
          const nestedItems = [];

          while (i < lines.length) {
            const nextLine = lines[i].trim();
            const nestedMatch = nextLine.match(nestedPattern);

            if (nestedMatch) {
              nestedItems.push({ type: 'listitem', children: this.parseInline(nestedMatch[1]) });
              i++;
            } else if (nextLine === '' && this.peekNextNonEmpty(lines, i, nestedPattern, mainPattern)) {
              i++;
            } else {
              break;
            }
          }

          if (nestedItems.length > 0) {
            item.nestedList = { type: 'list', ordered: !isOrdered, items: nestedItems };
          }
          items.push(item);
        } else if (line === '' && this.peekNextNonEmpty(lines, i, mainPattern)) {
          i++;
        } else {
          break;
        }
      }

      return {
        node: { type: 'list', ordered: isOrdered, items },
        nextIndex: i
      };
    },

    /**
     * 检查空行后是否有匹配的列表项
     */
    peekNextNonEmpty(lines, index, ...patterns) {
      if (index + 1 >= lines.length) return false;
      const nextLine = lines[index + 1].trim();
      return patterns.some(p => p.test(nextLine));
    },

    parseInline(text) {
      if (!text) return [{ type: 'text', content: '' }];

      const rules = [
        { pattern: /^!\[([^\]]*)\]\(([^)]+)\)/, handler: m => ({ type: 'image', alt: m[1], src: m[2] }) },
        { pattern: /^\[([^\]]+)\]\(([^)]+)\)/, handler: m => ({ type: 'link', text: m[1], href: m[2] }) },
        { pattern: /^`([^`]+)`/, handler: m => ({ type: 'code', content: m[1] }) },
        { pattern: /^(\*\*|__)([^*_]+)\1/, handler: m => ({ type: 'bold', content: m[2] }) },
        { pattern: /^(\*|_)([^*_]+)\1/, handler: m => ({ type: 'italic', content: m[2] }) },
        { pattern: /^~~([^~]+)~~/, handler: m => ({ type: 'strike', content: m[1] }) }
      ];

      const tokens = [];
      let remaining = text;

      while (remaining.length > 0) {
        let matched = false;

        for (const { pattern, handler } of rules) {
          const match = remaining.match(pattern);
          if (match) {
            tokens.push(handler(match));
            remaining = remaining.slice(match[0].length);
            matched = true;
            break;
          }
        }

        if (!matched) {
          const nextSpecial = remaining.search(/[`*_~!\[]/);
          const len = nextSpecial === -1 ? remaining.length : (nextSpecial === 0 ? 1 : nextSpecial);
          tokens.push({ type: 'text', content: remaining.slice(0, len) });
          remaining = remaining.slice(len);
        }
      }

      // 合并相邻文本节点
      return tokens.reduce((acc, token) => {
        const last = acc[acc.length - 1];
        if (token.type === 'text' && last?.type === 'text') {
          last.content += token.content;
        } else {
          acc.push(token);
        }
        return acc;
      }, []);
    },

    onLinkTap(e) {
      const { href } = e.currentTarget.dataset;
      if (!href) return;

      this.triggerEvent('linktap', { href });

      if (href.startsWith('/pages/')) {
        wx.navigateTo({ url: href });
      } else {
        wx.setClipboardData({
          data: href,
          success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
        });
      }
    },

    onImageTap(e) {
      const { src } = e.currentTarget.dataset;
      if (!src) return;

      this.triggerEvent('imagetap', { src });
      wx.previewImage({ urls: [src], current: src });
    }
  }
});

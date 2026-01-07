/**
 * Markdown 解析器组件
 * 直接将 Markdown 解析成 WXML 可渲染的节点树
 */

Component({
  properties: {
    // Markdown 文本内容
    content: {
      type: String,
      value: '',
      observer: function(newVal) {
        if (newVal) {
          this.parseMarkdown(newVal);
        } else {
          this.setData({ nodes: [] });
        }
      }
    }
  },

  data: {
    nodes: [] // 解析后的节点树
  },

  lifetimes: {
    attached() {
      if (this.properties.content) {
        this.parseMarkdown(this.properties.content);
      }
    }
  },

  methods: {
    /**
     * 解析 Markdown 文本
     */
    parseMarkdown(text) {
      if (!text) {
        this.setData({ nodes: [] });
        return;
      }

      const lines = text.split('\n');
      const nodes = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];
        const result = this.parseLine(line, lines, i);
        if (result.node) {
          nodes.push(result.node);
        }
        i = result.nextIndex;
      }

      this.setData({ nodes });
    },

    /**
     * 解析单行
     */
    parseLine(line, lines, index) {
      const trimmedLine = line.trim();

      // 空行
      if (trimmedLine === '') {
        return { node: null, nextIndex: index + 1 };
      }

      // 代码块
      if (trimmedLine.startsWith('```')) {
        return this.parseCodeBlock(lines, index);
      }

      // 标题
      const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        return {
          node: {
            type: 'heading',
            level: level,
            children: this.parseInline(text)
          },
          nextIndex: index + 1
        };
      }

      // 分隔线
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) {
        return {
          node: { type: 'hr' },
          nextIndex: index + 1
        };
      }

      // 引用块
      if (trimmedLine.startsWith('>')) {
        return this.parseBlockquote(lines, index);
      }

      // 无序列表
      if (/^[-*+]\s+/.test(trimmedLine)) {
        return this.parseUnorderedList(lines, index);
      }

      // 有序列表
      if (/^\d+\.\s+/.test(trimmedLine)) {
        return this.parseOrderedList(lines, index);
      }

      // 普通段落
      return {
        node: {
          type: 'paragraph',
          children: this.parseInline(trimmedLine)
        },
        nextIndex: index + 1
      };
    },

    /**
     * 解析代码块
     */
    parseCodeBlock(lines, startIndex) {
      const firstLine = lines[startIndex].trim();
      const language = firstLine.slice(3).trim();
      const codeLines = [];
      let i = startIndex + 1;

      while (i < lines.length) {
        const line = lines[i];
        if (line.trim().startsWith('```')) {
          break;
        }
        codeLines.push(line);
        i++;
      }

      return {
        node: {
          type: 'codeblock',
          language: language,
          content: codeLines.join('\n')
        },
        nextIndex: i + 1
      };
    },

    /**
     * 解析引用块
     */
    parseBlockquote(lines, startIndex) {
      const quoteLines = [];
      let i = startIndex;

      while (i < lines.length) {
        const line = lines[i].trim();
        if (line.startsWith('>')) {
          quoteLines.push(line.slice(1).trim());
          i++;
        } else if (line === '') {
          // 检查下一行是否还是引用
          if (i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
            quoteLines.push('');
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      return {
        node: {
          type: 'blockquote',
          children: this.parseInline(quoteLines.join('\n'))
        },
        nextIndex: i
      };
    },

    /**
     * 解析无序列表
     */
    parseUnorderedList(lines, startIndex) {
      const items = [];
      let i = startIndex;

      while (i < lines.length) {
        const line = lines[i].trim();
        const match = line.match(/^[-*+]\s+(.+)$/);
        if (match) {
          items.push({
            type: 'listitem',
            children: this.parseInline(match[1])
          });
          i++;
        } else if (line === '') {
          // 检查下一行是否还是列表项
          if (i + 1 < lines.length && /^[-*+]\s+/.test(lines[i + 1].trim())) {
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      return {
        node: {
          type: 'list',
          ordered: false,
          items: items
        },
        nextIndex: i
      };
    },

    /**
     * 解析有序列表
     */
    parseOrderedList(lines, startIndex) {
      const items = [];
      let i = startIndex;

      while (i < lines.length) {
        const line = lines[i].trim();
        const match = line.match(/^\d+\.\s+(.+)$/);
        if (match) {
          items.push({
            type: 'listitem',
            children: this.parseInline(match[1])
          });
          i++;
        } else if (line === '') {
          // 检查下一行是否还是列表项
          if (i + 1 < lines.length && /^\d+\.\s+/.test(lines[i + 1].trim())) {
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      return {
        node: {
          type: 'list',
          ordered: true,
          items: items
        },
        nextIndex: i
      };
    },

    /**
     * 解析行内元素
     */
    parseInline(text) {
      if (!text) return [{ type: 'text', content: '' }];

      const tokens = [];
      let remaining = text;

      while (remaining.length > 0) {
        let matched = false;

        // 图片 ![alt](url)
        const imgMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
        if (imgMatch) {
          tokens.push({
            type: 'image',
            alt: imgMatch[1],
            src: imgMatch[2]
          });
          remaining = remaining.slice(imgMatch[0].length);
          matched = true;
          continue;
        }

        // 链接 [text](url)
        const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          tokens.push({
            type: 'link',
            text: linkMatch[1],
            href: linkMatch[2]
          });
          remaining = remaining.slice(linkMatch[0].length);
          matched = true;
          continue;
        }

        // 行内代码 `code`
        const codeMatch = remaining.match(/^`([^`]+)`/);
        if (codeMatch) {
          tokens.push({
            type: 'code',
            content: codeMatch[1]
          });
          remaining = remaining.slice(codeMatch[0].length);
          matched = true;
          continue;
        }

        // 粗体 **text** 或 __text__
        const boldMatch = remaining.match(/^(\*\*|__)([^*_]+)\1/);
        if (boldMatch) {
          tokens.push({
            type: 'bold',
            content: boldMatch[2]
          });
          remaining = remaining.slice(boldMatch[0].length);
          matched = true;
          continue;
        }

        // 斜体 *text* 或 _text_
        const italicMatch = remaining.match(/^(\*|_)([^*_]+)\1/);
        if (italicMatch) {
          tokens.push({
            type: 'italic',
            content: italicMatch[2]
          });
          remaining = remaining.slice(italicMatch[0].length);
          matched = true;
          continue;
        }

        // 删除线 ~~text~~
        const strikeMatch = remaining.match(/^~~([^~]+)~~/);
        if (strikeMatch) {
          tokens.push({
            type: 'strike',
            content: strikeMatch[1]
          });
          remaining = remaining.slice(strikeMatch[0].length);
          matched = true;
          continue;
        }

        // 普通文本 - 找到下一个特殊字符或结束
        if (!matched) {
          const nextSpecial = remaining.search(/[`*_~!\[]/);
          if (nextSpecial === -1) {
            // 没有特殊字符，剩余全部是文本
            tokens.push({
              type: 'text',
              content: remaining
            });
            remaining = '';
          } else if (nextSpecial === 0) {
            // 特殊字符在开头但未匹配，作为普通文本处理
            tokens.push({
              type: 'text',
              content: remaining[0]
            });
            remaining = remaining.slice(1);
          } else {
            // 特殊字符在中间
            tokens.push({
              type: 'text',
              content: remaining.slice(0, nextSpecial)
            });
            remaining = remaining.slice(nextSpecial);
          }
        }
      }

      // 合并相邻的文本节点
      const merged = [];
      for (const token of tokens) {
        if (token.type === 'text' && merged.length > 0 && merged[merged.length - 1].type === 'text') {
          merged[merged.length - 1].content += token.content;
        } else {
          merged.push(token);
        }
      }

      return merged.length > 0 ? merged : [{ type: 'text', content: '' }];
    },

    /**
     * 处理链接点击
     */
    onLinkTap(e) {
      const { href } = e.currentTarget.dataset;
      if (href) {
        // 触发事件让父组件处理
        this.triggerEvent('linktap', { href });
        
        // 如果是小程序页面路径，直接跳转
        if (href.startsWith('/pages/')) {
          wx.navigateTo({ url: href });
        } else {
          // 复制链接到剪贴板
          wx.setClipboardData({
            data: href,
            success: () => {
              wx.showToast({
                title: '链接已复制',
                icon: 'success'
              });
            }
          });
        }
      }
    },

    /**
     * 处理图片点击
     */
    onImageTap(e) {
      const { src } = e.currentTarget.dataset;
      if (src) {
        this.triggerEvent('imagetap', { src });
        wx.previewImage({
          urls: [src],
          current: src
        });
      }
    }
  }
});

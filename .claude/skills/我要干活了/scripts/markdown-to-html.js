// .claude/skills/我要干活了/scripts/markdown-to-html.js
const fs = require('fs');
const Path = require('path');
const { execSync } = require('child_process');

class MarkdownToHTML {
    static convertMarkdownFile(markdownFilePath) {
        try {
            const markdownContent = fs.readFileSync(markdownFilePath, 'utf8');

            // Collect git commit times per RQ
            this._rqGitInfo = this.collectGitInfo(markdownContent);

            // Verify file links in the markdown
            this._baseDir = Path.dirname(Path.resolve(markdownFilePath));

            const htmlContent = this.renderMarkdownToHTML(markdownContent);

            const htmlFilePath = markdownFilePath.replace('.md', '.html');
            fs.writeFileSync(htmlFilePath, htmlContent, 'utf8');

            console.log(`✅ 成功生成HTML: ${htmlFilePath}`);
            return htmlFilePath;
        } catch (error) {
            console.error('❌ Markdown转HTML失败:', error.message);
            return null;
        }
    }

    static collectGitInfo(markdownContent) {
        const info = {};
        try {
            // Extract all RQ-xxx from the markdown
            const rqMatches = markdownContent.match(/RQ-\d+/g);
            if (!rqMatches) return info;

            const rqSet = new Set(rqMatches);

            for (const rq of rqSet) {
                try {
                    // Get all commits mentioning this RQ
                    const log = execSync(
                        `git log --oneline --no-decorate --grep="${rq}" --format="%H|%ai"`,
                        { encoding: 'utf8', timeout: 10000 }
                    ).trim();

                    if (!log) continue;

                    const commits = log.split('\n').map(line => {
                        const [hash, date] = line.split('|');
                        return { hash, date: date ? date.split(' ')[0] : '' };
                    });

                    info[rq] = {
                        specCommit: null,
                        planCommit: null,
                        firstCodeCommit: null,
                        lastCodeCommit: null,
                    };

                    for (const commit of commits) {
                        try {
                            const msg = execSync(`git log -1 --format="%s" ${commit.hash}`, {
                                encoding: 'utf8', timeout: 5000
                            }).trim();

                            if (msg.startsWith('docs(') && msg.includes('spec')) {
                                if (!info[rq].specCommit) info[rq].specCommit = commit.date;
                            } else if (msg.startsWith('docs(') && msg.includes('plan')) {
                                if (!info[rq].planCommit) info[rq].planCommit = commit.date;
                            } else {
                                if (!info[rq].firstCodeCommit) info[rq].firstCodeCommit = commit.date;
                                info[rq].lastCodeCommit = commit.date;
                            }
                        } catch (e) { /* skip individual commit errors */ }
                    }
                } catch (e) { /* skip individual RQ errors */ }
            }
        } catch (error) {
            console.warn('⚠️ Git信息收集失败:', error.message);
        }
        return info;
    }

    static verifyFileLink(url) {
        if (!url || !this._baseDir) return false;
        const fullPath = Path.join(this._baseDir, url);
        return fs.existsSync(fullPath);
    }

    static renderMarkdownToHTML(markdownContent) {
        const title = this.extractTitle(markdownContent);

        const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            padding: 40px;
        }
        h1 { color: #2c3e50; font-size: 2rem; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #667eea; display: flex; align-items: center; gap: 15px; }
        h2 { color: #34495e; font-size: 1.5rem; margin: 30px 0 15px; padding-left: 15px; border-left: 4px solid #667eea; }
        h3 { color: #555; font-size: 1.25rem; margin: 20px 0 10px; }
        h4 { color: #666; font-size: 1.1rem; margin: 15px 0 8px; }
        p { line-height: 1.8; color: #555; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-weight: bold; position: sticky; top: 0; }
        tr:nth-child(even) { background: #f8f9fa; }
        tr:hover { background: #f1f8ff; }
        pre { background: #282c34; color: #abb2bf; padding: 20px; border-radius: 8px; overflow-x: auto; margin: 20px 0; font-family: 'Courier New', Courier, monospace; font-size: 0.9rem; }
        code { font-family: 'Courier New', Courier, monospace; font-size: 0.9rem; }
        ul, ol { margin: 15px 0; padding-left: 30px; }
        li { line-height: 1.8; margin: 8px 0; }
        li ul, li ol { margin: 4px 0; }
        .status-completed { color: #27ae60; font-weight: bold; }
        .status-in-progress { color: #f39c12; font-weight: bold; }
        .status-pending { color: #7f8c8d; font-weight: bold; }
        .status-planning { color: #f39c12; font-weight: bold; }
        hr { border: 0; height: 1px; background: linear-gradient(90deg, transparent, #ddd, transparent); margin: 40px 0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 0.9rem; }
        a { color: #667eea; text-decoration: none; }
        a:hover { text-decoration: underline; }
        strong { font-weight: 600; }
        @media (max-width: 768px) {
            body { padding: 10px; }
            .container { padding: 20px; }
            h1 { font-size: 1.5rem; }
            table { font-size: 0.85rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        ${this.parseMarkdown(markdownContent)}
        <div class="footer">
            <p>📊 由 "我要干活了" 技能自动生成 • ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>`;

        return htmlContent;
    }

    static parseMarkdown(markdownContent) {
        // Extract reference link definitions first, then remove them
        const refLinks = {};
        const refDefRegex = /^\[([^\]]+)\]:\s+(\S+)/gm;
        let refMatch;
        while ((refMatch = refDefRegex.exec(markdownContent)) !== null) {
            refLinks[refMatch[1]] = refMatch[2];
        }
        let content = markdownContent.replace(/^\[([^\]]+)\]:\s+\S+.*$/gm, '');

        // Store refLinks for use in processInline
        this._refLinks = refLinks;

        // Split into lines for block-level processing
        const lines = content.split('\n');
        const blocks = [];
        let currentBlock = [];
        let inCodeBlock = false;

        // Step 1: Group lines into blocks separated by blank lines
        for (const line of lines) {
            if (line.trim().startsWith('```')) {
                if (inCodeBlock) {
                    currentBlock.push(line);
                    blocks.push(currentBlock);
                    currentBlock = [];
                    inCodeBlock = false;
                } else {
                    if (currentBlock.length > 0) {
                        blocks.push(currentBlock);
                        currentBlock = [];
                    }
                    currentBlock.push(line);
                    inCodeBlock = true;
                }
                continue;
            }
            if (inCodeBlock) {
                currentBlock.push(line);
                continue;
            }
            if (line.trim() === '') {
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock);
                    currentBlock = [];
                }
            } else if (/^#{1,4}\s+/.test(line)) {
                // Heading lines always start a new block
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock);
                    currentBlock = [];
                }
                currentBlock.push(line);
                // Heading is a single-line block, flush it immediately
                blocks.push(currentBlock);
                currentBlock = [];
            } else {
                currentBlock.push(line);
            }
        }
        if (currentBlock.length > 0) {
            blocks.push(currentBlock);
        }

        // Step 2: Process each block
        const htmlBlocks = blocks.map(block => this.processBlock(block));

        return htmlBlocks.join('\n');
    }

    static processBlock(lines) {
        if (lines.length === 0) return '';

        const firstLine = lines[0];

        // Code block
        if (firstLine.trim().startsWith('```')) {
            const lang = firstLine.trim().replace(/^```/, '').trim();
            const codeLines = lines.slice(1, lines.length - 1);
            // Don't process inline formatting inside code
            const escapedCode = codeLines.join('\n')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${escapedCode}</code></pre>`;
        }

        // Horizontal rule
        if (lines.length === 1 && /^---+\s*$/.test(firstLine.trim())) {
            return '<hr>';
        }

        // Heading
        if (lines.length === 1) {
            const headingMatch = firstLine.match(/^(#{1,4})\s+(.*)$/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const text = this.processInline(headingMatch[2]);
                return `<h${level}>${text}</h${level}>`;
            }
        }

        // Table
        if (firstLine.trim().startsWith('|')) {
            return this.processTable(lines);
        }

        // List (unordered: starts with "- " or "* ")
        if (lines.some(l => /^\s*[-*]\s+/.test(l))) {
            return this.processList(lines);
        }

        // List (ordered: starts with "1. ")
        if (lines.some(l => /^\s*\d+\.\s+/.test(l))) {
            return this.processOrderedList(lines);
        }

        // Paragraph (fallback)
        const text = lines.map(l => this.processInline(l)).join('<br>\n');
        return `<p>${text}</p>`;
    }

    static processList(lines) {
        const items = [];
        let currentItem = null;

        for (const line of lines) {
            const listMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
            if (listMatch) {
                if (currentItem) {
                    items.push(currentItem);
                }
                currentItem = { indent: listMatch[1].length, text: listMatch[2], children: [] };
            } else if (currentItem && line.trim() !== '') {
                // Continuation line for current item
                currentItem.text += ' ' + line.trim();
            }
        }
        if (currentItem) {
            items.push(currentItem);
        }

        const html = items.map(item => {
            const text = this.processInline(item.text);
            return `<li>${text}</li>`;
        }).join('\n');

        return `<ul>\n${html}\n</ul>`;
    }

    static processOrderedList(lines) {
        const items = [];

        for (const line of lines) {
            const listMatch = line.match(/^\s*\d+\.\s+(.*)$/);
            if (listMatch) {
                items.push(listMatch[1]);
            }
        }

        const html = items.map(text => `<li>${this.processInline(text)}</li>`).join('\n');
        return `<ol>\n${html}\n</ol>`;
    }

    static processTable(lines) {
        const rows = lines.filter(l => l.trim() !== '' && l.trim().startsWith('|'));

        if (rows.length < 2) {
            // Not a valid table, render as paragraph
            return `<p>${lines.map(l => this.processInline(l)).join('<br>\n')}</p>`;
        }

        const headerRow = rows[0];
        const separatorRow = rows[1];
        const dataRows = rows.slice(2);

        // Validate separator row (must be | --- | --- | pattern)
        const isSeparator = /^\|[\s\-:|]+\|$/.test(separatorRow.trim());
        if (!isSeparator) {
            // No separator, treat all rows as data
            return this.processTableRows([headerRow, ...dataRows], 0);
        }

        return this.processTableRows(dataRows, headerRow);
    }

    static processTableRows(dataRows, headerRow) {
        // Detect if this is the RQ tracking table by checking header
        const isRqTable = headerRow && /需求编号/.test(headerRow);

        let html = '<table>\n';

        if (headerRow) {
            const cells = this.splitTableCells(headerRow);
            html += '  <thead>\n    <tr>\n';
            cells.forEach(cell => {
                html += `      <th>${this.processInline(cell.trim())}</th>\n`;
            });
            // Add commit time columns for RQ table
            if (isRqTable) {
                html += `      <th>规格提交</th>\n`;
                html += `      <th>计划提交</th>\n`;
                html += `      <th>代码提交</th>\n`;
            }
            html += '    </tr>\n  </thead>\n';
        }

        html += '  <tbody>\n';
        dataRows.forEach(row => {
            const cells = this.splitTableCells(row);
            if (cells.length > 0) {
                // Extract RQ number for git info lookup
                let rqNumber = null;
                if (isRqTable && cells.length > 0) {
                    const rqMatch = cells[0].trim().match(/RQ-\d+/);
                    if (rqMatch) rqNumber = rqMatch[0];
                }

                html += '    <tr>\n';
                cells.forEach(cell => {
                    const cellContent = this.processInline(cell.trim());
                    html += `      <td>${cellContent}</td>\n`;
                });

                // Add git commit time cells for RQ table
                if (isRqTable && rqNumber) {
                    const gitInfo = this._rqGitInfo && this._rqGitInfo[rqNumber];
                    html += `      <td>${gitInfo && gitInfo.specCommit ? gitInfo.specCommit : '—'}</td>\n`;
                    html += `      <td>${gitInfo && gitInfo.planCommit ? gitInfo.planCommit : '—'}</td>\n`;
                    html += `      <td>${gitInfo && gitInfo.lastCodeCommit ? gitInfo.lastCodeCommit : '—'}</td>\n`;
                } else if (isRqTable) {
                    html += `      <td>—</td>\n`;
                    html += `      <td>—</td>\n`;
                    html += `      <td>—</td>\n`;
                }

                html += '    </tr>\n';
            }
        });
        html += '  </tbody>\n</table>';

        return html;
    }

    static splitTableCells(row) {
        return row.split('|').slice(1, -1);
    }

    static processInline(text) {
        let result = text;

        // Inline code (must be before links to avoid breaking code spans)
        result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Markdown links: [text](url)
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
            const fileExists = this.verifyFileLink(url);
            if (fileExists) {
                return `<a href="${url}" target="_blank">${text}</a>`;
            }
            return `<a href="${url}" target="_blank" style="color:#e74c3c;text-decoration:line-through" title="文件不存在">${text}</a>`;
        });

        // Reference-style links: [text][ref]
        result = result.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, ref) => {
            const key = ref || text;
            const url = this._refLinks && this._refLinks[key];
            if (url) {
                return `<a href="${url}" target="_blank">${text}</a>`;
            }
            return text;
        });

        // Bold: **text**
        result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Italic: *text* (but not inside bold)
        result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

        // Status markers (apply after other inline processing, only to text nodes)
        result = this.applyStatusMarkers(result);

        return result;
    }

    static applyStatusMarkers(text) {
        // Replace status markers only when they appear as standalone tokens,
        // not inside HTML tags or attribute values
        const statusMap = {
            '✅': 'status-completed',
            '🟢': 'status-completed',
            '🚧': 'status-in-progress',
            '📝': 'status-pending',
        };

        const statusTextMap = {
            '已完成': 'status-completed',
            '进行中': 'status-in-progress',
            '待开始': 'status-pending',
            '规划中': 'status-planning',
        };

        // First handle emoji markers
        for (const [marker, className] of Object.entries(statusMap)) {
            // Only replace when not inside an HTML tag
            const regex = new RegExp(this.escapeRegex(marker), 'g');
            text = text.replace(regex, (match, offset) => {
                // Check if we're inside an HTML tag
                const before = text.substring(0, offset);
                const openTags = (before.match(/</g) || []).length;
                const closeTags = (before.match(/>/g) || []).length;
                if (openTags > closeTags) return match; // Inside a tag
                return `<span class="${className}">${marker}</span>`;
            });
        }

        // Then handle text markers (only when they appear as whole words/phrases)
        for (const [marker, className] of Object.entries(statusTextMap)) {
            // Match marker as a standalone word, not inside a tag or already wrapped in a span
            const regex = new RegExp(`(?<![\\w/])${this.escapeRegex(marker)}(?![\\w/])`, 'g');
            text = text.replace(regex, (match, offset) => {
                const before = text.substring(0, offset);
                const openTags = (before.match(/</g) || []).length;
                const closeTags = (before.match(/>/g) || []).length;
                if (openTags > closeTags) return match;
                // Don't double-wrap if already inside a status span
                if (before.lastIndexOf('class="status-') > before.lastIndexOf('</span>')) return match;
                return `<span class="${className}">${marker}</span>`;
            });
        }

        return text;
    }

    static escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static extractTitle(markdownContent) {
        const firstLine = markdownContent.split('\n')[0];
        const match = firstLine.match(/^#\s+(.*)$/);
        if (match) {
            return match[1];
        }
        return '项目跟踪矩阵';
    }
}

module.exports = MarkdownToHTML;

if (require.main === module) {
    if (process.argv.length < 3) {
        console.log('使用方法: node markdown-to-html.js <markdown-file>');
        console.log('示例: node markdown-to-html.js 项目执行跟踪矩阵.md');
        process.exit(1);
    }
    const markdownFile = process.argv[2];
    MarkdownToHTML.convertMarkdownFile(markdownFile);
}

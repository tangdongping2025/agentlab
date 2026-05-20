export interface ThinkingSegment {
  type: 'thinking' | 'draft' | 'transition';
  text: string;
  lineNumber: number;
  isDraft: boolean;
  pattern?: string;
}

export interface DraftStats {
  draftCount: number;
  draftLineCount: number;
  totalLines: number;
  draftRatio: number;
}

// 草稿关键词/模式
const DRAFT_PATTERNS = [
  // 中文模式
  /^\s*等等[，,.。！？!?]/i,           // "等等，让我想想"
  /^\s*哦，对了/i,                     // "哦，对了"
  /^\s*不对[，,.。！？!?]/i,            // "不对，应该是"
  /^\s*让我重新/i,                     // "让我重新考虑"
  /^\s*等等，我刚才/i,                  // "等等，我刚才的分析"
  /^\s*等一下[，,.。！？!?]/i,          // "等一下，我漏了"
  /^\s*等等，不对/i,                    // "等等，不对"

  // 英文模式
  /^\s*wait[，,.。！？!?\s]/i,         // "Wait, let me think"
  /^\s*wait a minute/i,                // "Wait a minute"
  /^\s*wait no/i,                      // "Wait no"
  /^\s*actually/i,                     // "Actually, ..."
  /^\s*wait actually/i,                // "Wait actually"
  /^\s*hold on/i,                      // "Hold on"
  /^\s*wait let me/i,                  // "Wait let me"

  // 删除线模拟（如果文本中有 ~~ 标记）
  /^~~.*~~$/,

  // 修正标记
  /^\s*(?:修正|修正一下|修改|改一下)\s*[：:]/i,  // "修正：..."
  /^\s*(?:更正|纠正)\s*[：:]/i,                     // "更正："

  // 自我否定
  /^\s*不，?\s*(?:应该|应当|是|不对)/i,  // "不，应该是..."
  /^\s*(?:不对|不对不对|不对不对不对)/i,  // "不对不对..."
];

// 过渡模式（表示草稿结束，开始正式思考）
const TRANSITION_PATTERNS = [
  /^\s*好，?\s*/i,                       // "好，"
  /^\s*好的，?\s*/i,                     // "好的，"
  /^\s*好的吧[，,.。！？!?\s]/i,         // "好的吧，"
  /^\s*那(?:好|么|就)[，,.。！？!?\s]/i, // "那好，"
  /^\s*(?:所以|因此|总之)\s*[，,.。！？!?]/i, // "所以，"
  /^\s*(?:最终|最后|总结)\s*[：:，,.。！？!?]/i, // "最终，"
  /^\s*(?:现在|好现在)\s*[，,.。！？!?]/i, // "现在，"
];

export class ThinkingDraftParser {
  parse(thinkingText: string): ThinkingSegment[] {
    const lines = thinkingText.split('\n');
    const segments: ThinkingSegment[] = [];
    let inDraftMode = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 1. 检查是否匹配草稿模式
      const matchedDraft = DRAFT_PATTERNS.find(p => p.test(trimmed));
      if (matchedDraft) {
        inDraftMode = true;
        segments.push({
          type: 'draft',
          text: line,
          lineNumber: i,
          isDraft: true,
          pattern: matchedDraft.toString(),
        });
        continue;
      }

      // 2. 检查是否匹配过渡模式（草稿结束）
      const matchedTransition = TRANSITION_PATTERNS.find(p => p.test(trimmed));
      if (matchedTransition && inDraftMode) {
        inDraftMode = false;
        segments.push({
          type: 'transition',
          text: line,
          lineNumber: i,
          isDraft: false,
        });
        continue;
      }

      // 3. 检查空行是否结束草稿
      if (inDraftMode && trimmed === '') {
        // 看后面几行是否都是草稿
        const nextLines = lines.slice(i + 1, i + 3);
        const hasMoreDraft = nextLines.some(l =>
          DRAFT_PATTERNS.some(p => p.test(l.trim()))
        );

        if (!hasMoreDraft) {
          inDraftMode = false;
        }
      }

      // 4. 默认：延续当前模式
      segments.push({
        type: inDraftMode ? 'draft' : 'thinking',
        text: line,
        lineNumber: i,
        isDraft: inDraftMode,
      });
    }

    return this.mergeSegments(segments);
  }

  private mergeSegments(segments: ThinkingSegment[]): ThinkingSegment[] {
    const merged: ThinkingSegment[] = [];
    let current: ThinkingSegment | null = null;

    for (const seg of segments) {
      if (current && current.type === seg.type) {
        current.text += '\n' + seg.text;
      } else {
        if (current) merged.push(current);
        current = { ...seg };
      }
    }

    if (current) merged.push(current);
    return merged;
  }

  // 统计草稿
  getDraftStats(segments: ThinkingSegment[]): DraftStats {
    const draftSegments = segments.filter(s => s.isDraft);
    const draftLines = draftSegments.reduce((sum, s) =>
      sum + s.text.split('\n').filter(l => l.trim() !== '').length, 0
    );
    const totalLines = segments.filter(s => s.text.trim() !== '').length;
    return {
      draftCount: draftSegments.length,
      draftLineCount: draftLines,
      totalLines: totalLines,
      draftRatio: totalLines > 0 ? draftLines / totalLines : 0,
    };
  }
}

// 单例导出
export const thinkingDraftParser = new ThinkingDraftParser();

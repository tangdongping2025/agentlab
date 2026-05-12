import { SceneConfig } from '../types';

export class SceneService {
  private scenes: SceneConfig[] = [
    {
      id: 'restaurant',
      name: '餐厅预订助手',
      systemPrompt: '你是一个专业的餐厅预订助手，帮助用户处理各种餐厅预订相关的问题。',
      tools: ['weather', 'restaurant-search', 'booking']
    },
    {
      id: 'research',
      name: '研究论文助手',
      systemPrompt: '你是一个学术研究助手，帮助用户查找、分析和整理研究论文相关的信息。',
      tools: ['search', 'citation', 'analysis']
    },
    {
      id: 'dialog',
      name: '对话分析',
      systemPrompt: '你是一个对话分析专家，帮助用户分析和理解对话内容的结构和含义。',
      tools: ['sentiment', 'summarize', 'topic']
    },
    {
      id: 'custom',
      name: '自定义场景',
      systemPrompt: '你是一个多功能助手，可以根据用户的需求提供各种帮助。',
      tools: []
    }
  ];

  getAllScenes(): SceneConfig[] {
    return [...this.scenes];
  }

  getScene(id: string): SceneConfig | null {
    const scene = this.scenes.find(scene => scene.id === id);
    return scene || null;
  }

  getSystemPrompt(id: string): string {
    const scene = this.getScene(id);
    return scene?.systemPrompt || '';
  }

  getTools(id: string): string[] {
    const scene = this.getScene(id);
    return scene?.tools || [];
  }
}

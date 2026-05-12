// __tests__/services/sceneService.test.ts
import { SceneService } from '../../src/services/sceneService';

describe('SceneService', () => {
  let sceneService: SceneService;

  beforeEach(() => {
    sceneService = new SceneService();
  });

  test('should load predefined scenes', () => {
    const scenes = sceneService.getAllScenes();
    expect(scenes.length).toBeGreaterThan(0);

    const sceneIds = scenes.map(s => s.id);
    expect(sceneIds).toContain('restaurant');
    expect(sceneIds).toContain('research');
    expect(sceneIds).toContain('dialog');
    expect(sceneIds).toContain('custom');
  });

  test('should load scene by ID', () => {
    const scene = sceneService.getScene('restaurant');
    expect(scene).not.toBeNull();
    expect(scene!.name).toBe('餐厅预订助手');
  });

  test('should load system prompt for scene', () => {
    const prompt = sceneService.getSystemPrompt('restaurant');
    expect(prompt).not.toBe('');
    expect(prompt).toContain('餐厅');
  });

  test('should load tools for scene', () => {
    const tools = sceneService.getTools('restaurant');
    expect(tools.length).toBeGreaterThan(0);
  });

  test('should return null for unknown scene', () => {
    const scene = sceneService.getScene('unknown' as any);
    expect(scene).toBeNull();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, beforeEach, test, expect } from 'vitest';
import ChatInteraction from '../../src/components/ChatInteraction';
import { useAppStore } from '../../src/stores/appStore';

Element.prototype.scrollIntoView = vi.fn();

vi.mock('../../src/stores/appStore');
vi.mock('../../src/services/agentService', () => ({
  agentService: {
    isAgentInitialized: vi.fn(() => false),
    initialize: vi.fn(),
    setApiRecordingMethods: vi.fn(),
    setTimelineCallbacks: vi.fn(),
    runConversation: vi.fn(),
  },
}));
vi.mock('../../src/components/ToolSelectorBar', () => ({
  default: () => <div data-testid="tool-selector-bar" />,
}));

const mockScenes = [
  { id: 'restaurant', name: '餐厅预订', icon: '🍽️', systemPrompt: '你是餐厅助手', tools: ['search'], isPreset: true },
  { id: 'research', name: '投资研究', icon: '📊', systemPrompt: '你是研究助手', tools: ['search', 'data'], isPreset: true },
  { id: 'dialog', name: '对话分析', icon: '💬', systemPrompt: '你是对话分析师', tools: [], isPreset: true },
  { id: 'custom', name: '自定义', icon: '✏️', systemPrompt: '', tools: [], isPreset: true },
];

const mockSetScene = vi.fn();

const baseStoreMock = {
  scenes: mockScenes,
  currentScene: 'restaurant',
  setScene: mockSetScene,
  systemPrompt: '',
  selectedTools: ['search'],
  contextStrategy: 'sliding' as const,
  resetTimeline: vi.fn(),
  addTimelineStep: vi.fn(),
  completeTimelineStep: vi.fn(),
  updateTimelineStepData: vi.fn(),
  addMessage: vi.fn(),
  conversationHistory: [],
  addApiRequest: vi.fn(),
  addApiResponse: vi.fn(),
  saveCurrentSession: vi.fn(),
  setLastUserInput: vi.fn(),
};

// The trigger button is the first element matching the scene name
function getSceneTrigger() {
  return screen.getAllByText(/餐厅预订/)[0].closest('div')!;
}

describe('ChatInteraction Scene Selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAppStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(baseStoreMock);
  });

  test('renders scene selector button with current scene name', () => {
    render(<ChatInteraction />);
    expect(screen.getAllByText(/餐厅预订/)[0]).toBeInTheDocument();
  });

  test('renders scene selector button with current scene icon', () => {
    render(<ChatInteraction />);
    const trigger = getSceneTrigger();
    expect(trigger.textContent).toContain('🍽️');
  });

  test('popup is not visible by default', () => {
    render(<ChatInteraction />);
    expect(screen.queryByText(/投资研究/)).not.toBeInTheDocument();
    expect(screen.queryByText(/对话分析/)).not.toBeInTheDocument();
  });

  test('clicking scene button opens popup with all scenes', () => {
    render(<ChatInteraction />);
    fireEvent.click(getSceneTrigger());

    // Popup now visible: all scene names present (may appear in trigger + popup)
    mockScenes.forEach(scene => {
      expect(screen.getAllByText(new RegExp(scene.name)).length).toBeGreaterThanOrEqual(1);
    });
  });

  test('current scene has checkmark indicator in popup', () => {
    render(<ChatInteraction />);
    fireEvent.click(getSceneTrigger());

    const checkmarks = screen.getAllByText('✓');
    expect(checkmarks.length).toBe(1);
  });

  test('clicking a scene calls setScene and closes popup', () => {
    render(<ChatInteraction />);
    fireEvent.click(getSceneTrigger());

    // Find the research option in the popup menu
    const researchItems = screen.getAllByText(/投资研究/);
    const popupItem = researchItems[0].closest('div')!;
    fireEvent.click(popupItem);

    expect(mockSetScene).toHaveBeenCalledWith('research');
    // Popup should close after selection
    expect(screen.queryByText(/对话分析/)).not.toBeInTheDocument();
  });

  test('clicking outside closes the popup', () => {
    render(<ChatInteraction />);
    fireEvent.click(getSceneTrigger());

    expect(screen.getByText(/投资研究/)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText(/投资研究/)).not.toBeInTheDocument();
  });

  test('clicking scene button toggles popup open and closed', () => {
    render(<ChatInteraction />);

    fireEvent.click(getSceneTrigger());
    expect(screen.getByText(/投资研究/)).toBeInTheDocument();

    fireEvent.click(getSceneTrigger());
    expect(screen.queryByText(/投资研究/)).not.toBeInTheDocument();
  });

  test('displays custom fallback when current scene is not in list', () => {
    (useAppStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...baseStoreMock,
      currentScene: 'unknown-scene',
    });

    render(<ChatInteraction />);
    const trigger = screen.getAllByText(/自定义/)[0].closest('div')!;
    expect(trigger.textContent).toContain('✏️');
  });
});

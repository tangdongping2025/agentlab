// src/components/SceneSelector.tsx
import { useAppStore } from '../stores/appStore';
import { SceneService } from '../services/sceneService';

const sceneService = new SceneService();

function SceneSelector() {
  const { currentScene, setScene } = useAppStore();
  const scenes = sceneService.getAllScenes();

  const handleSceneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setScene(e.target.value as any);
  };

  return (
    <div className="mb-4">
      <label htmlFor="scene-select" className="block text-sm font-medium text-gray-700 mb-2">
        场景配置
      </label>
      <select
        id="scene-select"
        value={currentScene}
        onChange={handleSceneChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {scenes.map(scene => (
          <option key={scene.id} value={scene.id}>
            {scene.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SceneSelector;
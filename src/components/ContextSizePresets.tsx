import { useAppStore } from '../stores/appStore';

const presets = [
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '32K', value: 32768 },
  { label: '128K', value: 131072 },
  { label: '1M', value: 1048576 },
];

export default function ContextSizePresets() {
  const { contextSize, setContextSize } = useAppStore();

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {presets.map((preset) => (
        <button
          key={preset.value}
          onClick={() => setContextSize(preset.value)}
          style={{
            padding: '5px 10px',
            background: contextSize === preset.value ? 'rgba(91,156,245,0.1)' : 'var(--bg-surface)',
            border: `1px solid ${contextSize === preset.value ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
            borderRadius: '5px',
            color: contextSize === preset.value ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

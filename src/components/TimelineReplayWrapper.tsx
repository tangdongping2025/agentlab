import { useAppStore } from '../stores/appStore';
import TimelineReplay from './TimelineReplay';

interface Props {
  onViewFullPayload?: (title: string, content: string) => void;
  autoExpandPayload?: boolean;
  isMaximized?: boolean;
}

export default function TimelineReplayWrapper({ onViewFullPayload, autoExpandPayload, isMaximized }: Props) {
  const timelineSteps = useAppStore(s => s.timelineSteps);
  return <TimelineReplay steps={timelineSteps} onViewFullPayload={onViewFullPayload} autoExpandPayload={autoExpandPayload} isMaximized={isMaximized} />;
}

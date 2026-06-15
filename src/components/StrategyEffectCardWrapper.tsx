import { useAppStore } from '../stores/appStore';
import StrategyEffectCard from './StrategyEffectCard';

export default function StrategyEffectCardWrapper() {
  const strategyEffect = useAppStore(s => s.strategyEffect);
  const contextStrategy = useAppStore(s => s.contextStrategy);
  return <StrategyEffectCard effect={strategyEffect as any} strategy={contextStrategy} />;
}

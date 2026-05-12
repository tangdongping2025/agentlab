import { render, screen } from '@testing-library/react';
import App from './App';

test('renders context lab title', () => {
  render(<App />);
  const titleElement = screen.getByText(/context lab/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders description', () => {
  render(<App />);
  const descriptionElement = screen.getByText(/智能体上下文管理实验平台/i);
  expect(descriptionElement).toBeInTheDocument();
});
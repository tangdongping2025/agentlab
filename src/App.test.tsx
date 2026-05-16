import { render, screen } from '@testing-library/react';
import App from './App';

test('renders context lab title', () => {
  render(<App />);
  const titleElement = screen.getByText(/context lab/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders welcome screen when no active session', () => {
  render(<App />);
  expect(screen.getByText(/context lab/i)).toBeInTheDocument();
});
import chalk from 'chalk';

// Palette from the "a1 panel triage layout" design (truecolor; Ghostty and cmux both support it)
export const C = {
  accent: '#e5b567',
  blue: '#7fb8d8',
  green: '#7ec699',
  red: '#e06c75',
  purple: '#c9a0dc',
  session: '#e5c07b',
  bright: '#e6edf3',
  text: '#c9d1d9',
  muted: '#a9b1ba',
  dim: '#8b949e',
  faint: '#6e7781',
  border: '#3a4f5c',
  boxBorder: '#4a5562',
  selectedBg: '#2a323c',
} as const;

export const fg = (color: string) => chalk.hex(color);

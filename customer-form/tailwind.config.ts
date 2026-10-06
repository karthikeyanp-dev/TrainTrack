import type { Config } from 'tailwindcss';
import parentConfig from '../tailwind.config';

export default {
  ...parentConfig,
  content: ['./src/**/*.{ts,tsx}', '../src/components/ui/**/*.{ts,tsx}'],
} satisfies Config;

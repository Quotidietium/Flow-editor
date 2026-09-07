import { toast } from 'svelte-sonner';

interface NotifyOptions {
  /** toast 上的行动钮（如「撤销」）。 */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** 毫秒；带行动钮时适当延长，给用户反应窗口。 */
  duration?: number;
}

export const notify = (message: string, options?: NotifyOptions): void => {
  toast(message, options);
};

export const prompt = (message: string): boolean => {
  return confirm(message);
};

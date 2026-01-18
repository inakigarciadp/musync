export const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
export const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

export const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 3)}...` : s;

export const padRight = (s: string, width: number): string => s.padEnd(width);

export const padLeft = (s: string, width: number): string => s.padStart(width);

export const pluralize = (
  count: number,
  singular: string,
  plural?: string,
): string => (count === 1 ? singular : (plural ?? `${singular}s`));

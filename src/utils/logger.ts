const isProd = import.meta.env.PROD;

export function logError(...args: any[]) {
  if (!isProd) {
    console.error(...args);
  }
}

export function logWarn(...args: any[]) {
  if (!isProd) {
    console.warn(...args);
  }
}

export function logInfo(...args: any[]) {
  if (!isProd) {
    console.info(...args);
  }
}

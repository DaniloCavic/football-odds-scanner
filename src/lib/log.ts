/** Strukturisani logovi (JSON u jednom redu) – lako se pretražuju u Railway „Deploy Logs“. */
type Level = "info" | "warn" | "error";

function write(level: Level, area: string, msg: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, area, msg, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (area: string, msg: string, data?: Record<string, unknown>) => write("info", area, msg, data),
  warn: (area: string, msg: string, data?: Record<string, unknown>) => write("warn", area, msg, data),
  error: (area: string, msg: string, data?: Record<string, unknown>) => write("error", area, msg, data),
};

/** Maskira email za logove (a***@gmail.com). */
export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

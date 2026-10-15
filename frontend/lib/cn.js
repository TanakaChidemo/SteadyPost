// Tiny classnames helper (clsx is already a dependency).
import { clsx } from "clsx";

export function cn(...args) {
  return clsx(...args);
}

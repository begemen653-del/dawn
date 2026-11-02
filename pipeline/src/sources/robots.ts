/**
 * Minimal robots.txt support (RFC 9309): groups by user-agent, Allow/Disallow with `*` and `$`,
 * longest match wins, Allow wins ties.
 */

interface Rule {
  readonly allow: boolean;
  readonly pattern: string;
  readonly regex: RegExp;
}

export interface RobotsRules {
  isAllowed(pathAndQuery: string): boolean;
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

export function parseRobots(text: string, userAgent: string): RobotsRules {
  const agent = userAgent.toLowerCase().split("/")[0] ?? "";
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      if (value === "") continue; // "Disallow:" with nothing means allow all
      current.rules.push({ allow: key === "allow", pattern: value, regex: toRegex(value) });
    } else {
      lastWasAgent = false;
    }
  }

  // Our own group if one names us, otherwise the "*" group.
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const chosen = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);

  return {
    isAllowed(pathAndQuery: string) {
      let best: Rule | null = null;
      for (const rule of rules) {
        if (!rule.regex.test(pathAndQuery)) continue;
        if (
          !best ||
          rule.pattern.length > best.pattern.length ||
          (rule.pattern.length === best.pattern.length && rule.allow)
        ) {
          best = rule;
        }
      }
      return best?.allow ?? true;
    },
  };
}

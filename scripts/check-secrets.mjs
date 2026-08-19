import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const repositoryFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !["package-lock.json", "LICENSE"].includes(file));

const rules = [
  { name: "private key block", pattern: /BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY/i },
  { name: "assignment-style secret", pattern: /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|bearer[_-]?token|password|seed[_-]?phrase|mnemonic)\b\s*[:=]\s*["']?([^"'\s][^"'\r\n]{7,})/i },
  { name: "generic bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i }
];

const allowedValueFragments = ["[redacted]", "<redacted>", "example", "placeholder", "your_", "not-a-secret"];
const findings = [];

for (const file of repositoryFiles) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of rules) {
      const match = line.match(rule.pattern);
      if (!match) continue;
      const value = (match[1] ?? match[0]).toLowerCase();
      if (allowedValueFragments.some((fragment) => value.includes(fragment))) continue;
      findings.push(`${file}:${index + 1} ${rule.name}`);
    }
  });
}

if (findings.length > 0) {
  console.error("Potential secret-like content found. Values are intentionally not printed.");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("No secret-like tracked content found by the lightweight repository scan.");

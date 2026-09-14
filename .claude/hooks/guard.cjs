#!/usr/bin/env node
/*
 * PreToolUse-Sicherheits-Hook für AuftragsBoss (Bash + PowerShell).
 *
 * Zweite, harte Sicherheitsschicht ZUSÄTZLICH zu permissions.deny/ask in
 * .claude/settings.json. Prüft den GESAMTEN Befehl (auch in &&, ||, ;, |,
 * Subshells, Backticks, Zeilenumbrüchen) und erkennt Interpreter-/Shell-Wrapper.
 *
 * ENTSCHEIDUNGS-REIHENFOLGE (streng):
 *   1. DENY  — gefährliche/irreversible Aktion IRGENDWO im Befehl (inkl. in
 *              einem Wrapper wie bash -c/node -e/cmd /c/eval …). Ein Wrapper darf
 *              eine DENY-Aktion NICHT auf ASK abschwächen.
 *   2. ASK   — riskanter Wrapper/Remote-Zugriff ohne konkrete DENY-Aktion.
 *   3. (nichts) — normale Entwicklung: an Permission-Regeln + Auto-Modus durchreichen.
 *
 * SICHERHEITSPRINZIP: Der Hook gibt NIEMALS "allow" zurück (nur deny/ask oder
 * still durchreichen) -> er kann bestehende DENY-Regeln nur verschärfen, nie
 * umgehen.
 *
 * FAIL-CLOSED: Kann der Guard nicht zuverlässig entscheiden (stdin nicht
 * parsebar, unerwartete Struktur, fehlende Felder, interne Exception,
 * Zeitüberschreitung), wird der Tool-Aufruf per permissionDecision "deny"
 * BLOCKIERT — niemals stillschweigend durchgelassen. Ein bekannter, aber
 * harmloser (leerer/unauffälliger) Befehl ist KEIN Fehler und wird normal
 * durchgereicht, damit normale Arbeit nicht blockiert wird.
 */
"use strict";

const path = require("path");

/** Blockiert fail-closed (echter Guard-Fehler).
 *  Offizielle Semantik: Deny-JSON + Exit 0 blockiert; scheitert die JSON-Ausgabe,
 *  blockiert Exit 2 (Grund via stderr). Ein anderer Exit-Code würde fail-open
 *  bedeuten — deshalb hier NIE ein zufälliger Code. */
function block(reason) {
  try {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Sicherheits-Hook (fail-closed): " + reason,
        },
      }),
    );
    process.exit(0);
  } catch (_e) {
    try { process.stderr.write("Sicherheits-Hook (fail-closed): " + reason); } catch (_e2) {}
    process.exit(2); // harte Blockade, wenn die JSON-Ausgabe nicht möglich war
  }
}

// Globale Absicherung gegen unerwartete Fehler -> blockieren, nicht durchlassen.
process.on("uncaughtException", (e) => block("interne Ausnahme: " + (e && e.message)));
process.on("unhandledRejection", (e) => block("interne Ausnahme (async): " + (e && (e.message || e))));
// Watchdog: hängt stdin, blockieren wir selbst (vor dem Hook-Timeout).
const watchdog = setTimeout(() => block("Zeitüberschreitung bei der Prüfung"), 8000);

/** Muster, das ein Kommando NUR in Befehlsposition trifft (nicht mitten im
 *  Argument/String) — hält Fehlalarme bei Commit-Messages etc. gering. */
function cp(body) {
  return new RegExp("(^|&&|\\|\\||[;|&`(\\n\\r{]|\\bthen\\b|\\bdo\\b)\\s*" + body, "i");
}

// Gefahren-Bausteine (Policy = DENY). Werden in Befehlsposition (Top-Level)
// geprüft — UND, sobald ein Wrapper erkannt wird, ZUSÄTZLICH überall im String
// (im Wrapper ist der Rest ausführbarer Code).
const DANGER = [
  ["sudo\\b", "sudo (Rechteausweitung)"],
  ["rm\\s+-[a-z]*r[a-z]*f", "rm -rf (rekursives, erzwungenes Löschen)"],
  ["rm\\s+-[a-z]*f[a-z]*r", "rm -fr (rekursives, erzwungenes Löschen)"],
  ["rm\\s+(-r\\S*\\s+-f|-f\\S*\\s+-r)", "rm -r -f (rekursives, erzwungenes Löschen)"],
  ["git\\s+push\\b[^\\n;|&`]*(--force\\b|--force-with-lease\\b|\\s-f\\b)", "git push --force (überschreibt Remote-Historie)"],
  ["npm\\s+(install|i|add)\\b[^\\n;|&`]*(\\s-g\\b|--global\\b)", "systemweite npm-Installation (-g)"],
  ["npm\\s+publish\\b", "npm publish (Veröffentlichung)"],
  ["(apt|apt-get)\\s+(install|remove|purge)\\b", "systemweite Paketänderung (apt)"],
  ["brew\\s+install\\b", "systemweite Paketinstallation (brew)"],
  ["(choco|winget)\\s+install\\b", "systemweite Paketinstallation (choco/winget)"],
  ["dropdb\\b", "dropdb (Datenbank löschen)"],
  ["systemctl\\b", "systemctl (Dienste-/Systemsteuerung)"],
  ["mkfs\\b", "mkfs (Dateisystem formatieren)"],
  ["dd\\s+(if|of)=", "dd (roher Datenträgerzugriff)"],
  ["netsh\\b", "netsh (Netzwerk-/Firewall-Konfiguration)"],
  ["reg\\s+(add|delete)\\b", "Windows-Registry ändern"],
  ["bcdedit\\b", "bcdedit (Boot-Konfiguration)"],
];

// Eindeutige Substrings -> immer überall DENY (kaum Fehlalarm-Risiko).
const ALWAYS_DENY = [
  [/--accept-data-loss\b/i, "prisma --accept-data-loss (Datenverlust)"],
  [/prisma\s+migrate\s+reset\b/i, "prisma migrate reset (setzt die Datenbank zurück)"],
  [/\bdrop\s+(database|table)\b/i, "SQL DROP DATABASE/TABLE (irreversibel)"],
  [/\.ssh[\/\\]/i, "Zugriff auf ~/.ssh (private Schlüssel)"],
  [/\bid_(rsa|ed25519|ecdsa|dsa)\b/i, "Zugriff auf privaten SSH-Schlüssel"],
  [/-----BEGIN\s+[A-Z ]*PRIVATE\s+KEY/i, "Umgang mit privatem Schlüsselmaterial"],
  [/\.pem\b/i, "Zugriff auf .pem (Schlüssel/Zertifikat)"],
  [/New-NetFirewallRule|Set-NetFirewallProfile/i, "Firewall-Änderung"],
  [/\b(Stop|Start|Set)-Service\b/i, "Windows-Dienst ändern"],
  [/(curl|wget|iwr|invoke-webrequest)\b[^\n]*\|\s*(sudo\s+)?(sh|bash|zsh|pwsh|powershell)\b/i, "Download direkt in eine Shell gepiped (Remote-Code-Ausführung)"],
];

const DENY_ANCHORED = DANGER.map(([b, r]) => [cp(b), r]);
const DENY_PLAIN = DANGER.map(([b, r]) => [new RegExp(b, "i"), r]);

// Code-ausführende Wrapper: wenn vorhanden, wird der Rest als möglicher Code
// behandelt und ÜBERALL auf DENY-Gefahren geprüft.
const WRAPPERS = [
  cp("(bash|sh|zsh)\\s+-c\\b"),
  cp("node\\s+(-e|--eval|-p\\b|--print)\\b"),
  cp("(tsx|ts-node)\\s+-e\\b"),
  cp("(python3?|py)\\s+-c\\b"),
  cp("(perl|ruby)\\s+-e\\b"),
  cp("(pwsh|powershell)\\s+-c(ommand)?\\b"),
  cp("cmd(\\.exe)?\\s+/c\\b"),
  cp("eval\\b"),
  /\b(Invoke-Expression|iex)\b/i,
  /\|\s*(sudo\s+)?(sh|bash|zsh|pwsh|powershell)\b/i,
];

// ASK: riskanter Wrapper/Remote-Zugriff ohne konkrete DENY-Aktion.
const ASK = [
  [cp("(ssh|scp|rsync|sftp)\\s"), "Zugriff auf externen/Produktiv-Server"],
  [/(^|&&|\|\||[;|&`(\n\r{])\s*(env|nohup|nice|time|timeout|command|xargs|stdbuf|setsid)\s+([^\n;|&`]*\s)?(ssh|scp|rsync|sftp)\b/i, "Remote-Zugriff über einen Wrapper (env/nohup/…)"],
  [cp("git\\s+push\\b"), "Push auf ein Remote-Repository"],
  [cp("eval\\b"), "eval (dynamische Ausführung)"],
  [/\b(Invoke-Expression|iex)\b/i, "Invoke-Expression/iex (dynamische Ausführung)"],
  [/\|\s*(sudo\s+)?(sh|bash|zsh|pwsh|powershell)\b/i, "Ausgabe in eine Shell gepiped"],
  [cp("(bash|sh|zsh)\\s+-c\\b"), "Shell-Wrapper (-c) — könnte Sicherheitsgrenzen umgehen"],
  [cp("node\\s+(-e|--eval|-p\\b|--print)\\b"), "node -e (Inline-Code, könnte Grenzen umgehen)"],
  [cp("(tsx|ts-node)\\s+-e\\b"), "tsx/ts-node -e (Inline-Code)"],
  [cp("(python3?|py)\\s+-c\\b"), "python -c (Inline-Code)"],
  [cp("(perl|ruby)\\s+-e\\b"), "perl/ruby -e (Inline-Code)"],
  [cp("(pwsh|powershell)\\s+-c(ommand)?\\b"), "PowerShell -Command-Wrapper"],
  [cp("cmd(\\.exe)?\\s+/c\\b"), "cmd /c-Wrapper"],
  [/child_process|subprocess\.(Popen|call|run|check_output)|os\.system\b/i, "Prozess-Spawn aus Skriptcode"],
  [cp("pip3?\\s+install\\b"), "pip install (Paketinstallation)"],
  [cp("git\\s+reset\\s+--hard\\b"), "git reset --hard (nicht committete Arbeit kann verloren gehen)"],
  [/Remove-Item\b[^\n;|&`]*-Recurse\b[^\n;|&`]*-Force|Remove-Item\b[^\n;|&`]*-Force\b[^\n;|&`]*-Recurse/i, "Remove-Item -Recurse -Force (rekursives, erzwungenes Löschen)"],
];

// ---------------------------------------------------------------------------
// PROJEKT-PFADGRENZE
// Die breiten allow-Regeln fuer cd/rm -f/Get-ChildItem/Get-Item/Get-Content
// duerfen nur INNERHALB von ${CLAUDE_PROJECT_DIR} automatisch laufen. Zeigt ein
// solcher Befehl nach AUSSERHALB -> ASK. Sensible Dateien (.env, .env.*, Keys,
// Credentials) -> ASK (SSH-Keys/.pem sind bereits ALWAYS_DENY). Es wird KANONISCH
// aufgeloest (kein reiner String-Praefix): ".." wird normalisiert, relative Pfade
// gegen das cwd aufgeloest, und ein "cd" im selben Befehl wird verfolgt, damit ein
// spaeteres relatives rm/Get nicht heimlich ausserhalb landet.
// ---------------------------------------------------------------------------
function msys(p) {
  // Git-Bash-Laufwerksschreibweise /c/... -> C:/...
  return String(p).replace(/^\/([a-zA-Z])(?=\/|$)/, (m, d) => d.toUpperCase() + ":");
}
function norm(p) {
  return path.win32.normalize(p).replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
}
function toAbs(base, p) {
  return norm(path.win32.resolve(msys(base), msys(p)));
}
const PROJECT = (function () {
  const e = process.env.CLAUDE_PROJECT_DIR;
  if (typeof e !== "string" || !e.trim()) return null;
  try { return norm(path.win32.resolve(msys(e))); } catch (_e) { return null; }
})();
function insideProject(abs) {
  return !!PROJECT && (abs === PROJECT || abs.startsWith(PROJECT + "/"));
}
function baseName(p) {
  return msys(p).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
}
function isSensitive(p) {
  const b = baseName(p).toLowerCase();
  return (
    /^\.env(\..+)?$/.test(b) ||
    /\.(pem|key|p12|pfx|ppk|asc|gpg|crt)$/.test(b) ||
    /^id_(rsa|dsa|ecdsa|ed25519)$/.test(b) ||
    /^(\.netrc|\.pgpass|\.npmrc|\.git-credentials|\.htpasswd|credentials|secret|secrets)$/.test(b) ||
    /^(credentials|secret|secrets)\.(json|ya?ml|txt|env|ini|cfg|xml)$/.test(b)
  );
}
const CD_CMDS = new Set(["cd", "chdir", "set-location", "sl"]);
const CONTAIN_CMDS = new Set(["rm", "get-childitem", "get-item", "get-content"]);
const SENSITIVE_CMDS = new Set(["rm", "get-childitem", "get-item", "get-content", "cat", "head", "tail", "less", "more", "nl", "type"]);

// Zerlegt in einfache Kommandos (Trenner && || ; | & Zeilenumbruch), Quotes beachtet.
function splitCommands(s) {
  const cmds = [];
  let cur = [], word = "", q = null, started = false;
  const endWord = () => { if (started) cur.push(word); word = ""; started = false; };
  const endCmd = () => { endWord(); if (cur.length) cmds.push(cur); cur = []; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; else word += c; started = true; continue; }
    if (c === '"' || c === "'") { q = c; started = true; continue; }
    if (c === "&" && s[i + 1] === "&") { i++; endCmd(); continue; }
    if (c === "|" && s[i + 1] === "|") { i++; endCmd(); continue; }
    if (c === ";" || c === "|" || c === "&" || c === "\n" || c === "\r") { endCmd(); continue; }
    if (c === " " || c === "\t") { endWord(); continue; }
    word += c; started = true;
  }
  endCmd();
  return cmds;
}
// Positionale Pfad-Argumente: Flags (-x) und Redirects (>, 2>, &1 …) raus.
function pathArgs(toks) {
  return toks.slice(1).filter((t) => t && !/^-/.test(t) && !/^\d*[<>&]/.test(t));
}
/** @returns ["ask", reason] wenn ein Pfad-Befehl das Projekt verlaesst / sensibel ist, sonst null. */
function pathScope(cmd, cwd) {
  let eff = (typeof cwd === "string" && cwd.trim()) ? norm(path.win32.resolve(msys(cwd))) : PROJECT;
  if (!eff) eff = PROJECT;
  let cmds;
  try { cmds = splitCommands(cmd); } catch (_e) { return null; }
  for (const toks of cmds) {
    if (!toks.length) continue;
    const name = toks[0].toLowerCase().replace(/.*[\\/]/, "");
    const isCd = CD_CMDS.has(name);
    const inContain = CONTAIN_CMDS.has(name);
    const inSens = SENSITIVE_CMDS.has(name);
    if (!isCd && !inContain && !inSens) continue;
    const args = pathArgs(toks);
    if (isCd) {
      const tgt = args[0];
      // "cd" ohne Ziel wechselt ins Home (ausserhalb); "cd -" ist nicht aufloesbar.
      if (!tgt) return ["ask", "cd ohne Ziel (wechselt ins Home-Verzeichnis)"];
      if (tgt === "-") return ["ask", "cd - (Zielverzeichnis nicht bestimmbar)"];
      if (/^~(?:[\\/]|$)/.test(tgt)) return ["ask", "cd ins Home-Verzeichnis (ausserhalb des Projekts)"];
      if (!PROJECT) return ["ask", "Projektverzeichnis (CLAUDE_PROJECT_DIR) nicht bestimmbar"];
      const abs = toAbs(eff, tgt);
      if (!insideProject(abs)) return ["ask", "cd ausserhalb des Projektbereichs"];
      eff = abs; // Wechsel verfolgen, damit spaetere relative Pfade korrekt aufloesen
      continue;
    }
    if (inSens) {
      for (const p of args) if (isSensitive(p)) return ["ask", "Zugriff auf sensible Datei (" + baseName(p) + ")"];
    }
    if (inContain) {
      for (const p of args) {
        if (/^~(?:[\\/]|$)/.test(p)) return ["ask", name + " im Home-Verzeichnis (ausserhalb des Projekts)"];
        if (!PROJECT) return ["ask", "Projektverzeichnis (CLAUDE_PROJECT_DIR) nicht bestimmbar"];
        if (!insideProject(toAbs(eff, p))) return ["ask", name + " ausserhalb des Projektbereichs"];
      }
    }
  }
  return null;
}

/** @returns ["deny"|"ask", reason] oder null (keine Entscheidung nötig) */
function decide(cmd, cwd) {
  for (const [re, r] of ALWAYS_DENY) if (re.test(cmd)) return ["deny", r];
  for (const [re, r] of DENY_ANCHORED) if (re.test(cmd)) return ["deny", r];
  if (WRAPPERS.some((re) => re.test(cmd))) {
    for (const [re, r] of DENY_PLAIN) if (re.test(cmd)) return ["deny", r + " — innerhalb eines Wrappers"];
  }
  for (const [re, r] of ASK) if (re.test(cmd)) return ["ask", r];
  const ps = pathScope(cmd, cwd);
  if (ps) return ps;
  return null;
}

function out(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: "Sicherheits-Hook: " + reason,
      },
    }),
  );
  process.exit(0);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("error", () => block("stdin nicht lesbar"));
process.stdin.on("end", () => {
  let j;
  try {
    j = JSON.parse(raw || "");
  } catch (_e) {
    return block("Eingabe (stdin-JSON) nicht parsebar");
  }
  if (!j || typeof j !== "object") return block("unerwartete Eingabestruktur");
  const ti = j.tool_input;
  if (!ti || typeof ti !== "object") return block("tool_input fehlt oder ist ungültig");
  const cmd = ti.command != null ? ti.command : ti.script;
  if (typeof cmd !== "string") return block("Befehl (command) fehlt oder ist kein String");
  // Befehl ist BEKANNT: leer/unauffällig = keine relevante Entscheidung -> durchreichen.
  if (!cmd.trim()) return process.exit(0);
  const cwd = typeof j.cwd === "string" ? j.cwd : null;
  let d;
  try {
    d = decide(cmd, cwd);
  } catch (e) {
    return block("Regelauswertung fehlgeschlagen: " + (e && e.message));
  }
  clearTimeout(watchdog);
  if (!d) return process.exit(0); // keine Entscheidung nötig
  return out(d[0], d[1]);
});

#!/usr/bin/env node
/**
 * Be Guided Studio (local).
 *
 *   be-guided-studio mcp        MCP server over stdio for Claude Code, Claude Desktop or Codex.
 *                                   It forwards every tool to your Be Guided editor connector
 *                                   (signed in with your personal key) and shows the Studio app in
 *                                   chats that support MCP Apps.
 *   be-guided-studio open       Opens the Studio in your browser at http://127.0.0.1:4317
 *                                   (runs on this computer only; nothing goes through Cloudflare
 *                                   except the calls to your guide's API).
 *   be-guided-studio run-due    If checks are waiting, starts Claude Code (or Codex) to run them.
 *   be-guided-studio schedule   Prints (or with --install, installs) a macOS launchd job that
 *                                   runs "run-due" every 15 minutes.
 *   be-guided-studio doctor     Checks the address and key without changing anything.
 *
 * Settings come from environment variables, or ~/.be-guided/studio.json (written by install.sh):
 *   BE_GUIDED_URL   the editor connector address, e.g. https://…workers.dev/api/v1/editor
 *   BE_GUIDED_KEY   your personal key (bgk_…)
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONFIG_FILE = path.join(os.homedir(), '.be-guided', 'studio.json');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

function settings() {
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    // No file: environment variables only.
  }
  const url = (process.env.BE_GUIDED_URL || file.url || '').trim().replace(/\/+$/, '');
  const key = (process.env.BE_GUIDED_KEY || file.key || '').trim();
  if (!url || !/^https?:\/\//.test(url)) fail('Set BE_GUIDED_URL (the editor connector address) or run install.sh again.');
  if (!/^bgk_[A-Za-z0-9_-]{20,}$/.test(key)) fail('Set BE_GUIDED_KEY (your personal bgk_… key) or run install.sh again.');
  return { url, key, agent: process.env.BE_GUIDED_AGENT || file.agent || 'claude' };
}

function fail(message) {
  process.stderr.write(`be-guided-studio: ${message}\n`);
  process.exit(1);
}

/** One connection to the editor connector (it is stateless, so a fresh one per use is fine). */
async function remote() {
  const { url, key } = settings();
  const client = new Client({ name: 'be-guided-studio', version: VERSION });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${key}` } } });
  await client.connect(transport);
  return client;
}

async function callTool(name, args = {}) {
  const client = await remote();
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await client.close().catch(() => {});
  }
}

/** The tool's data: structuredContent, unwrapped like the Studio app does. */
function dataOf(result) {
  let data = result.structuredContent;
  if (data && Object.keys(data).length === 1 && 'result' in data) data = data.result;
  return data ?? null;
}

// ── mcp: stdio proxy ──────────────────────────────────────────────────────
async function runMcp() {
  settings(); // fail early with a clear message
  const server = new Server(
    { name: 'be-guided-studio', title: 'Be Guided Studio', version: VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        'Be Guided Studio: update plans and schedules, the check log, writing and QA skills and reader feedback for the Be Guided user guide, plus the guide-editing tools. Call get_writing_standard before writing. To open Be Guided, the admin or the Studio, open the full admin in the chat (open_be_guided_admin; it lands on Pages), and use it for set-up instead of asking questions in chat. To run queued checks: claim_update_check, then report_update_check, then apply and mark_changes_applied, or stop for approval.',
    },
  );
  const forward = async (fn) => {
    const client = await remote();
    try {
      return await fn(client);
    } finally {
      await client.close().catch(() => {});
    }
  };
  server.setRequestHandler(ListToolsRequestSchema, (req) => forward((c) => c.listTools(req.params)));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      return await forward((c) => c.callTool(req.params));
    } catch (error) {
      return { content: [{ type: 'text', text: `Be Guided could not be reached: ${error instanceof Error ? error.message : 'unknown error'}` }], isError: true };
    }
  });
  server.setRequestHandler(ListResourcesRequestSchema, (req) => forward((c) => c.listResources(req.params)));
  server.setRequestHandler(ReadResourceRequestSchema, (req) => forward((c) => c.readResource(req.params)));
  await server.connect(new StdioServerTransport());
}

// ── open: the Studio in a browser, on this computer only ──────────────────
async function runOpen(argv) {
  settings();
  const port = Number(flag(argv, '--port') || 4317);
  const html = fs.readFileSync(path.join(ROOT, 'ui', 'studio.html'), 'utf8');
  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || '';
    // Only this computer, and never another site's page (DNS rebinding / CSRF).
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, { success: false, message: 'Open the Studio from this computer.' });
    if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/?'))) {
      if (!req.url.includes('transport=')) {
        res.writeHead(302, { Location: '/?transport=http&base=' });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" });
      return res.end(html);
    }
    if (req.method === 'POST' && req.url === '/call') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return send(res, 403, { success: false, message: 'Not allowed.' });
      if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { success: false, message: 'Send JSON.' });
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 400_000) return send(res, 413, { success: false, message: 'Too large.' });
      }
      try {
        const { tool, args } = JSON.parse(body || '{}');
        if (typeof tool !== 'string' || !/^[a-z_]{3,40}$/.test(tool)) return send(res, 422, { success: false, message: 'Unknown tool.' });
        const result = await callTool(tool, args && typeof args === 'object' ? args : {});
        if (result.isError) return send(res, 422, { success: false, message: (result.content || []).map((c) => c.text).join(' ') });
        return send(res, 200, { success: true, message: 'OK', data: dataOf(result) });
      } catch (error) {
        return send(res, 502, { success: false, message: `Be Guided could not be reached: ${error instanceof Error ? error.message : 'unknown error'}` });
      }
    }
    send(res, 404, { success: false, message: 'Not found.' });
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/?transport=http&base=`;
    process.stdout.write(`Be Guided Studio is open at ${url}\nKeep this window open while you use it. Press Ctrl+C to stop.\n`);
    if (!argv.includes('--no-browser')) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
    }
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

// ── run-due: start an AI for waiting checks ───────────────────────────────
const RUN_PROMPT =
  'Use the be-guided-studio MCP tools. Run every queued Be Guided update check: call claim_update_check, follow the job steps exactly (get_writing_standard, the writing and QA skills it returns), compare the code and screens with the guide pages, call report_update_check, and if the answer says applyNow update those pages in the given content mode and call mark_changes_applied; otherwise stop for approval. Repeat until claim_update_check returns job null. Never change application code or staging data.';

async function runDue(argv) {
  const { agent: configured } = settings();
  const agent = flag(argv, '--agent') || configured;
  const log = data => process.stdout.write(`[${new Date().toISOString()}] ${data}\n`);
  const result = await callTool('list_update_checks', { status: ['queued'], limit: 20 });
  if (result.isError) fail((result.content || []).map((c) => c.text).join(' '));
  const checks = dataOf(result)?.checks ?? [];
  if (!checks.length) return log('No checks waiting.');
  log(`${checks.length} check(s) waiting: ${checks.map((c) => c.product).join(', ')}. Starting ${agent}.`);
  if (argv.includes('--dry-run')) return log('Dry run: not starting the AI.');
  const cmd = agent === 'codex' ? ['codex', ['exec', '--full-auto', RUN_PROMPT]] : ['claude', ['-p', RUN_PROMPT, '--allowedTools', 'mcp__be-guided-studio__*,Read,Glob,Grep,Bash(git log:*),Bash(git diff:*)']];
  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd[0]], { encoding: 'utf8' });
  if (found.status !== 0) fail(`"${cmd[0]}" is not installed or not on the PATH. Install ${agent === 'codex' ? 'Codex' : 'Claude Code'} first.`);
  const child = spawn(cmd[0], cmd[1], { stdio: 'inherit', cwd: flag(argv, '--cwd') || os.homedir() });
  child.on('exit', (code) => log(`${agent} finished (exit ${code}).`));
}

// ── schedule: macOS launchd job for run-due ───────────────────────────────
function runSchedule(argv) {
  const label = 'com.beguided.studio';
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const logFile = path.join(os.homedir(), '.be-guided', 'run-due.log');
  const agent = flag(argv, '--agent') || 'claude';
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${path.join(HERE, 'be-guided-studio.mjs')}</string><string>run-due</string><string>--agent</string><string>${agent}</string></array>
  <key>StartInterval</key><integer>900</integer>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${process.env.PATH}</string></dict>
  <key>StandardOutPath</key><string>${logFile}</string>
  <key>StandardErrorPath</key><string>${logFile}</string>
</dict></plist>
`;
  if (process.platform !== 'darwin') fail('The schedule helper is for macOS. On other systems, run "be-guided-studio run-due" every 15 minutes with your own scheduler (cron or Task Scheduler).');
  if (argv.includes('--remove')) {
    spawnSync('launchctl', ['unload', plistPath]);
    fs.rmSync(plistPath, { force: true });
    return process.stdout.write('Removed the Be Guided schedule from this Mac.\n');
  }
  if (!argv.includes('--install')) {
    process.stdout.write(`This would run "run-due" every 15 minutes with ${agent} and log to ${logFile}.\nTo switch it on: be-guided-studio schedule --install${agent !== 'claude' ? ` --agent ${agent}` : ''}\n\n${plist}`);
    return;
  }
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(plistPath, plist);
  spawnSync('launchctl', ['unload', plistPath]);
  const r = spawnSync('launchctl', ['load', plistPath], { encoding: 'utf8' });
  if (r.status !== 0) fail(`launchctl could not load the job: ${r.stderr}`);
  process.stdout.write(`Switched on: every 15 minutes this Mac checks for waiting update checks and starts ${agent} for them. Log: ${logFile}\nTo switch it off: be-guided-studio schedule --remove\n`);
}

// ── doctor ────────────────────────────────────────────────────────────────
async function runDoctor() {
  const { url } = settings();
  process.stdout.write(`Address: ${url}\nKey: set (not shown)\n`);
  const client = await remote();
  const { tools } = await client.listTools();
  const { resources } = await client.listResources().catch(() => ({ resources: [] }));
  await client.close();
  process.stdout.write(`Connected. ${tools.length} tools; admin app ${resources.some((r) => r.uri === 'ui://be-guided/admin.html') ? 'available' : 'NOT available (update the guide API)'}.\n`);
}

const [command, ...argv] = process.argv.slice(2);
const commands = { mcp: runMcp, open: runOpen, 'run-due': runDue, schedule: runSchedule, doctor: runDoctor };
if (!commands[command]) {
  process.stdout.write('Usage: be-guided-studio <mcp | open | run-due | schedule | doctor>\nSee README.md.\n');
  process.exit(command ? 1 : 0);
}
Promise.resolve(commands[command](argv)).catch((error) => fail(error instanceof Error ? error.message : String(error)));

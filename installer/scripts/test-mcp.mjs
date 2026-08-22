/**
 * MCP HTTP 服务器（installer/app/mcp-server.cjs）的 Node 级测试：
 * 不启 Electron，用 mock executor 直接验证协议面与安全防线。
 * build.ps1 在打包前运行；任何一步失败以非零码退出。
 */
import http from 'node:http';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, 'noop.cjs'));
const { createMcpServer, MAX_BODY_BYTES } = require('../app/mcp-server.cjs');

const results = [];
function check(name, ok, detail = '') {
  results.push({ detail, name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function post(port, body, contentType = 'application/json') {
  return new Promise((resolve) => {
    const req = http.request(
      {
        headers: { 'Content-Type': contentType },
        host: '127.0.0.1',
        method: 'POST',
        path: '/',
        port,
        timeout: 5000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ body: Buffer.concat(chunks).toString('utf8'), status: res.statusCode })
        );
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end(body);
  });
}

function get(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', path: '/', port, timeout: 5000 }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

// —— 用与页面桥一致的 mock executor ——
const executor = async (request) => {
  const id = request?.id ?? null;
  switch (request?.method) {
    case 'initialize': {
      return {
        id,
        jsonrpc: '2.0',
        result: {
          capabilities: { tools: {} },
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'flow-editor', version: '1.0.0' }
        }
      };
    }
    case 'tools/call': {
      if (request?.params?.name === 'explode') throw new Error('boom');
      return { id, jsonrpc: '2.0', result: { content: [{ text: 'ok', type: 'text' }] } };
    }
    default: {
      return { error: { code: -32601, message: 'method not found' }, id, jsonrpc: '2.0' };
    }
  }
};

const server = createMcpServer({ executor });
const PORT = 38_599;

let startError = null;
try {
  await server.start(PORT);
} catch (error) {
  startError = error;
}
check('server starts on loopback port', startError === null && server.status().running === true);

const init = await post(PORT, JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'initialize' }));
check(
  'POST initialize -> 200 + serverInfo',
  init?.status === 200 && JSON.parse(init.body).result?.serverInfo?.name === 'flow-editor'
);

const call = await post(
  PORT,
  JSON.stringify({ id: 2, jsonrpc: '2.0', method: 'tools/call', params: { name: 'x' } })
);
check(
  'POST tools/call -> result echoed with id',
  call?.status === 200 && JSON.parse(call.body).result?.content?.[0]?.text === 'ok'
);

const unknown = await post(PORT, JSON.stringify({ id: 3, jsonrpc: '2.0', method: 'nope' }));
check('unknown method -> -32601', JSON.parse(unknown?.body ?? '{}').error?.code === -32601);

const garbage = await post(PORT, 'this is not json');
check('invalid JSON -> -32700', JSON.parse(garbage?.body ?? '{}').error?.code === -32700);

const batch = await post(PORT, JSON.stringify([{ id: 1, method: 'initialize' }]));
check('batch array -> -32600', JSON.parse(batch?.body ?? '{}').error?.code === -32600);

const plain = await post(PORT, JSON.stringify({ id: 1, method: 'initialize' }), 'text/plain');
check('wrong Content-Type -> 415', plain?.status === 415);

const getRes = await get(PORT);
check('GET -> 405', getRes?.status === 405);

const oversized = await post(PORT, Buffer.alloc(MAX_BODY_BYTES + 1, 0x20));
check('oversized body -> 413', oversized?.status === 413);

const boom = await post(
  PORT,
  JSON.stringify({ id: 9, jsonrpc: '2.0', method: 'tools/call', params: { name: 'explode' } })
);
check(
  'executor throw -> -32603 with request id',
  (() => {
    const parsed = JSON.parse(boom?.body ?? '{}');
    return boom?.status === 200 && parsed.error?.code === -32603 && parsed.id === 9;
  })()
);

// 端口冲突：第二个实例必须拒绝且进入错误状态
const second = createMcpServer({ executor });
let conflict = null;
try {
  await second.start(PORT);
} catch (error) {
  conflict = error;
}
check(
  'port conflict -> start rejects + status.error',
  conflict !== null && second.status().running === false && Boolean(second.status().error)
);

await server.stop();
check('stop() -> not running', server.status().running === false);
const afterStop = await post(PORT, JSON.stringify({ id: 1, method: 'initialize' }));
check('after stop -> connection refused', afterStop === null);

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `\nMCP SERVER OK — ${results.length}/${results.length} checks passed`
    : `\nMCP SERVER FAILED — ${failed.length}/${results.length} checks failed`
);
process.exit(failed.length === 0 ? 0 : 1);

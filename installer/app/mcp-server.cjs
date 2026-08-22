'use strict';

/**
 * 桌面版 MCP HTTP 服务器：把页面内的 MCP 桥（postMessage 频道 flow-editor）
 * 以 http://127.0.0.1:<port>/ 暴露给本地 AI 客户端（Claude Desktop 经
 * stdio↔HTTP 转发、curl、自建脚本……）。线格式即 MCP JSON-RPC 2.0。
 *
 * 安全设计（与站点服务器同级）：
 *  - 仅绑定 127.0.0.1 回环——局域网/公网不可达；
 *  - 仅 POST 且要求 Content-Type: application/json——浏览器的跨域「简单
 *    请求」无法构造该组合，恶意网页不能静默调用本服务（不输出 CORS 头）；
 *  - 请求体 6MB 上限（页面桥对 set_code 文本另有 5MB 上限）；
 *  - 单请求语义，batch 数组按 JSON-RPC 规范回 -32600；
 *  - 执行经 executor 注入（页面 evaluate 双重 JSON 编码），本模块不 eval
 *    任何请求内容。
 */

const http = require('node:http');

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const JSON_TYPE = 'application/json; charset=utf-8';

function jsonRpcError(id, code, message) {
  return { error: { code, message }, id: id ?? null, jsonrpc: '2.0' };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Length': Buffer.byteLength(body), 'Content-Type': JSON_TYPE });
  res.end(body);
}

/**
 * @param {{ executor: (request: unknown) => Promise<unknown> }} options
 *   executor 把请求对象送进页面桥并取回响应对象。
 */
function createMcpServer({ executor }) {
  let server = null;
  let boundPort = 0;
  let lastError = null;

  const handleRequest = (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, jsonRpcError(null, -32_601, 'Only POST is supported'));
      return;
    }
    const contentType = String(req.headers['content-type'] ?? '');
    if (!contentType.toLowerCase().includes('application/json')) {
      sendJson(res, 415, jsonRpcError(null, -32_600, 'Content-Type must be application/json'));
      return;
    }

    const chunks = [];
    let received = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) {
        return; // 413 已发出：继续丢弃剩余字节，让连接干净结束（不 RST）
      }
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        aborted = true;
        sendJson(res, 413, jsonRpcError(null, -32_600, 'Request body too large (max 6MB)'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      let request;
      try {
        request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        sendJson(res, 200, jsonRpcError(null, -32_700, 'Parse error'));
        return;
      }
      if (Array.isArray(request)) {
        sendJson(res, 200, jsonRpcError(null, -32_600, 'Batch requests are not supported'));
        return;
      }
      const id = request && typeof request === 'object' ? (request.id ?? null) : null;
      Promise.resolve()
        .then(() => executor(request))
        .then((response) => {
          sendJson(
            res,
            200,
            response && typeof response === 'object'
              ? response
              : jsonRpcError(id, -32_002, 'editor page not ready')
          );
        })
        .catch((error) => {
          sendJson(res, 200, jsonRpcError(id, -32_603, `Internal error: ${error.message}`));
        });
    });
    req.on('error', () => {
      // 客户端中断：静默丢弃
    });
  };

  return {
    /** 开始监听；失败（如端口占用）记录 lastError 并 reject。 */
    start(port) {
      if (server) {
        return Promise.reject(new Error('MCP server already running'));
      }
      lastError = null;
      return new Promise((resolve, reject) => {
        const candidate = http.createServer(handleRequest);
        const onError = (error) => {
          lastError = error.code === 'EADDRINUSE' ? `端口 ${port} 被占用` : error.message;
          server = null;
          reject(new Error(lastError));
        };
        candidate.once('error', onError);
        candidate.listen(port, '127.0.0.1', () => {
          candidate.removeListener('error', onError);
          candidate.on('error', (error) => {
            lastError = error.message;
          });
          server = candidate;
          boundPort = port;
          resolve();
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        if (!server) {
          resolve();
          return;
        }
        const current = server;
        server = null;
        boundPort = 0;
        current.close(() => resolve());
        current.closeAllConnections?.();
      });
    },
    status() {
      return lastError
        ? { error: lastError, port: boundPort, running: false }
        : { port: boundPort, running: Boolean(server) };
    }
  };
}

module.exports = { createMcpServer, MAX_BODY_BYTES };

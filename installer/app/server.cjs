'use strict';

/**
 * 内嵌静态文件服务器：把打包进 asar 的站点（SvelteKit adapter-static 产物）
 * 以 http://127.0.0.1:<port>/ 提供给 Electron 渲染进程。
 *
 * 为什么不用 file:// 或自定义协议：
 *  - ES module 脚本在 file:// 下被 CORS 拦截；
 *  - localStorage 按 origin 隔离，需要「跨启动稳定」的 origin（固定端口）才能持久化草稿；
 *  - Service Worker（PWA）要求安全上下文，http://127.0.0.1 满足。
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8'
};

const IMMUTABLE_PREFIX = '/_app/immutable/';

/** 解析请求路径为站点内文件；越界（.. 逃逸）返回 null。 */
function resolveFile(root, pathname) {
  const decoded = decodeURIComponent(pathname);
  const resolved = path.resolve(root, `.${decoded}`);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;

  const candidates = [
    resolved,
    `${resolved}.html`, // adapter-static（trailingSlash:'never'）产出 edit.html 等
    path.join(resolved, 'index.html')
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // 不存在则尝试下一个候选
    }
  }
  return undefined; // 未找到
}

function createStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const notFoundPage = path.join(root, '404.html');

  return http.createServer((req, res) => {
    try {
      const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');
      const file = resolveFile(root, pathname);

      if (file === null) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      if (file === undefined) {
        // SPA 兜底页（adapter-static fallback），保持 404 状态码
        res.writeHead(404, { 'Content-Type': MIME_TYPES['.html'] });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(notFoundPage)
          .on('error', () => res.end('Not Found'))
          .pipe(res);
        return;
      }

      const ext = path.extname(file).toLowerCase();
      const headers = {
        'Content-Length': fs.statSync(file).size,
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream'
      };
      if (pathname.startsWith(IMMUTABLE_PREFIX)) {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      } else if (path.basename(file) === 'service-worker.js') {
        headers['Cache-Control'] = 'no-cache';
        headers['Service-Worker-Allowed'] = '/';
      } else {
        headers['Cache-Control'] = 'no-cache';
      }
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end(`Internal Server Error: ${error.message}`);
    }
  });
}

module.exports = { createStaticServer };

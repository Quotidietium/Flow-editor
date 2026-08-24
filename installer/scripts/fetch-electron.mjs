/**
 * 拉取 Electron 运行时 zip 到 installer/.cache/electron-dist/（目录自包含）。
 *
 * 背景：electron 的 npm postinstall 经 @electron/get 下载运行时，其缓存固定在
 * 用户目录（%LOCALAPPDATA%\electron）且无环境变量可改道；本工程改为——
 *   1. pnpm.ignoredBuiltDependencies 跳过 postinstall（不下载、零副作用）；
 *   2. 本脚本以编程方式指定 cacheRoot 下载同一 zip；
 *   3. build.ps1 把 zip 路径经 -c.electronDist 传给 electron-builder。
 * 镜像：设置 ELECTRON_MIRROR 环境变量即走镜像（build.ps1 统一管理）。
 */
import { downloadArtifact } from '@electron/get';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const installerRoot = path.resolve(here, '..');
const cacheRoot = path.join(installerRoot, '.cache', 'electron-dist');

const electronPkg = JSON.parse(
  fs.readFileSync(path.join(installerRoot, 'node_modules', 'electron', 'package.json'), 'utf8')
);
const version = electronPkg.version;

// 缓存优先：@electron/get 的缓存键含下载 URL（换镜像/直连即 miss → 强制
// 联网），而代理拦截 TLS 的环境会握手失败。同版本 zip 已在缓存目录时
// 直接短路（离线可构建，与 fetch-toolchain 的本机优先策略同哲学）。
const wanted = `electron-v${version}-win32-x64.zip`;
const findCached = (root) => {
  if (!fs.existsSync(root)) {
    return undefined;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const hit = findCached(p);
      if (hit) {
        return hit;
      }
    } else if (entry.name === wanted && fs.statSync(p).size > 50_000_000) {
      return p;
    }
  }
  return undefined;
};
const cached = findCached(cacheRoot);
if (cached) {
  console.log(`cache hit: ${cached}`);
  console.log(cached);
  process.exit(0);
}

const request = {
  arch: 'x64',
  artifactName: 'electron',
  cacheRoot,
  platform: 'win32',
  version
};
if (process.env.ELECTRON_MIRROR) {
  request.mirrorOptions = { mirror: process.env.ELECTRON_MIRROR.replace(/\/+$/, '') + '/' };
}

console.log(`fetching electron v${version} win32-x64 -> ${cacheRoot}`);
const zipPath = await downloadArtifact(request);
if (!fs.existsSync(zipPath)) {
  console.error(`download reported success but zip missing: ${zipPath}`);
  process.exit(1);
}
console.log(zipPath);

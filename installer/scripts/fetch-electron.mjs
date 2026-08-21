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

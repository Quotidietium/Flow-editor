/**
 * 拉取 MC 插件离线编译工具链（12 个 jar，javac 实测最小 compile classpath）：
 * 优先从本机 Maven 仓库（~/.m2）复制（构建机离线可用），缺失时回退
 * repo.papermc.io 下载（REF 工程 pom 只声明该仓库，全部 12 件均可达）。
 * 产物：installer/toolchain/lib/*.jar + THIRD_PARTY_NOTICES.txt（不入库）。
 *
 * 注意：本脚本刻意【不】下载任何 JDK/JRE——为避免版权纠纷，运行离线编译的
 * 最终用户须自行安装 JDK 21+（见 mc-build.cjs 的检测与引导）。
 *
 * 用法：node scripts/fetch-toolchain.mjs
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import url from 'node:url';

const here = dirname(url.fileURLToPath(import.meta.url));
const libDir = join(here, '..', 'toolchain', 'lib');
const M2 = join(homedir(), '.m2', 'repository');
const REPO = 'https://repo.papermc.io/repository/maven-public';

/** name=打包后的统一文件名；m2=仓库相对路径；license 已经 GitHub/pom 原文核实。 */
const JARS = [
  {
    license: 'GPL-3.0（Paper 继承自 Spigot/Bukkit/CraftBukkit）',
    m2: 'io/papermc/paper/paper-api/1.21.11-R0.1-SNAPSHOT/paper-api-1.21.11-R0.1-20260511.115010-91.jar',
    m2Fallback:
      'io/papermc/paper/paper-api/1.21.11-R0.1-SNAPSHOT/paper-api-1.21.11-R0.1-SNAPSHOT.jar',
    name: 'paper-api-1.21.11.jar',
    project: 'https://github.com/PaperMC/Paper'
  },
  {
    license: 'MIT',
    m2: 'net/kyori/adventure-api/4.26.1/adventure-api-4.26.1.jar',
    name: 'adventure-api-4.26.1.jar',
    project: 'https://github.com/KyoriPowered/adventure'
  },
  {
    license: 'MIT',
    m2: 'net/kyori/adventure-key/4.26.1/adventure-key-4.26.1.jar',
    name: 'adventure-key-4.26.1.jar',
    project: 'https://github.com/KyoriPowered/adventure'
  },
  {
    license: 'MIT',
    m2: 'net/kyori/adventure-text-serializer-plain/4.12.0/adventure-text-serializer-plain-4.12.0.jar',
    name: 'adventure-text-serializer-plain-4.12.0.jar',
    project: 'https://github.com/KyoriPowered/adventure'
  },
  {
    license: 'MIT',
    m2: 'net/kyori/adventure-text-logger-slf4j/4.26.1/adventure-text-logger-slf4j-4.26.1.jar',
    name: 'adventure-text-logger-slf4j-4.26.1.jar',
    project: 'https://github.com/KyoriPowered/adventure'
  },
  {
    license: 'MIT',
    m2: 'net/kyori/examination-api/1.3.0/examination-api-1.3.0.jar',
    name: 'examination-api-1.3.0.jar',
    project: 'https://github.com/KyoriPowered/examination'
  },
  {
    license: 'MIT',
    m2: 'net/kyori/examination-string/1.3.0/examination-string-1.3.0.jar',
    name: 'examination-string-1.3.0.jar',
    project: 'https://github.com/KyoriPowered/examination'
  },
  {
    license: 'Apache-2.0',
    m2: 'org/jetbrains/annotations/26.0.2-1/annotations-26.0.2-1.jar',
    name: 'annotations-26.0.2-1.jar',
    project: 'https://github.com/JetBrains/java-annotations'
  },
  {
    license: 'Apache-2.0',
    m2: 'com/google/guava/guava/33.3.1-jre/guava-33.3.1-jre.jar',
    name: 'guava-33.3.1-jre.jar',
    project: 'https://github.com/google/guava'
  },
  {
    license: 'MIT',
    m2: 'com/mojang/brigadier/1.3.10/brigadier-1.3.10.jar',
    name: 'brigadier-1.3.10.jar',
    project: 'https://github.com/Mojang/brigadier'
  },
  {
    license: 'BSD-3-Clause（md_5）',
    m2: 'net/md-5/bungeecord-chat/1.21-R0.2-deprecated+build.21/bungeecord-chat-1.21-R0.2-deprecated+build.21.jar',
    name: 'bungeecord-chat-1.21-R0.2.jar',
    project: 'https://github.com/SpigotMC/BungeeCord'
  },
  {
    license: 'MIT',
    m2: 'org/slf4j/slf4j-api/2.0.16/slf4j-api-2.0.16.jar',
    name: 'slf4j-api-2.0.16.jar',
    project: 'https://github.com/qos-ch/slf4j'
  }
];

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

async function download(target, relPath) {
  const res = await fetch(`${REPO}/${relPath}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('下载产物不是 zip/jar（缺少 PK 头）');
  }
  writeFileSync(target, bytes);
}

mkdirSync(libDir, { recursive: true });
const notices = [];
let failed = 0;
for (const jar of JARS) {
  const target = join(libDir, jar.name);
  try {
    if (existsSync(target) && statSync(target).size > 0) {
      console.log(`SKIP  ${jar.name}（已存在）`);
    } else {
      const m2Path = join(M2, jar.m2);
      const m2Fallback = jar.m2Fallback ? join(M2, jar.m2Fallback) : null;
      if (existsSync(m2Path)) {
        copyFileSync(m2Path, target);
        console.log(`COPY  ${jar.name}  <- 本机 .m2`);
      } else if (m2Fallback && existsSync(m2Fallback)) {
        copyFileSync(m2Fallback, target);
        console.log(`COPY  ${jar.name}  <- 本机 .m2（SNAPSHOT 别名）`);
      } else {
        await download(target, jar.m2Fallback ?? jar.m2);
        console.log(`GET   ${jar.name}  <- repo.papermc.io`);
      }
    }
    notices.push(`- ${jar.name}（${jar.license}）\n  ${jar.project}\n  sha256: ${sha256(target)}`);
  } catch (error) {
    failed++;
    console.error(`FAIL  ${jar.name}: ${error.message}`);
  }
}

const header = `# 第三方组件声明（MC 插件离线编译工具链）

本目录（toolchain/lib/）的 jar 仅作为 **javac 编译期 classpath** 分发，用于在
用户本机离线编译「MC 进度设计器」插件生成的 Paper 插件源码；它们不会被链接进
Flow 编辑器本体，也不会在运行时加载。各组件许可证如下（经各项目官方仓库/
pom 原文核实），文本见各项目链接。

**JDK 不在分发之列**：为避免版权纠纷，离线编译要求最终用户自行安装
JDK 21+（如 Eclipse Temurin：https://adoptium.net/zh-CN/temurin/releases/?version=21）。

`;
writeFileSync(
  join(libDir, '..', 'THIRD_PARTY_NOTICES.txt'),
  header + notices.join('\n\n') + '\n',
  'utf8'
);

if (failed > 0) {
  console.error(`\n${failed} 个 jar 拉取失败`);
  process.exit(1);
}
console.log(`\n工具链就绪：${JARS.length} 个 jar + THIRD_PARTY_NOTICES.txt → toolchain/`);

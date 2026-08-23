'use strict';

/**
 * MC 成就插件离线编译器（桌面版主进程能力）。
 *
 * 输入：插件生成的 Maven 布局源文件（仅取 src/main/java 与 src/main/resources）。
 * 流程：严格校验 → 定位用户自装 JDK（>= 21）→ javac（工具链 classpath）→
 *       资源 staging → jar 打包 → 返回 base64。
 *
 * 版权红线：本模块【不会】也不应捆绑或自动下载任何 JDK/JRE——检测不到时返回
 * JDK_NOT_FOUND / JDK_TOO_OLD，由页面引导用户自行安装 JDK 21+。
 * 工具链 jar（toolchain/lib/）只是编译期 classpath，见 THIRD_PARTY_NOTICES.txt。
 *
 * 安全面（渲染进程不可信，全部主进程复核）：
 * - 文件路径白名单（^src/main/(java|resources)/…，拒绝 .. 与绝对路径）；
 * - 条目数 / 单文件 / 总量上限；
 * - 工作目录在系统临时目录下 mkdtemp，javac/jar 以参数数组 spawn（无 shell）；
 * - 所有外部输入只作为文件内容落盘，永不以代码身份求值。
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_FILES = 200;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const COMPILE_TIMEOUT_MS = 120_000;
const PATH_RE =
  /^src\/main\/(java|resources)\/[A-Za-z0-9_./-]+\.(java|yml|yaml|json|mcmeta|mcfunction)$/;
const FILENAME_RE = /^[A-Za-z0-9_.-]+\.jar$/;

const fail = (code, message, detail) => ({ error: { code, detail, message }, ok: false });

/** 校验并规整输入文件清单。 */
function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) {
    return fail('INVALID_FILES', `文件清单需要 1–${MAX_FILES} 个条目`);
  }
  let total = 0;
  const clean = [];
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || typeof file.text !== 'string') {
      return fail('INVALID_FILES', '每个条目需要 { path, text } 字符串');
    }
    if (!PATH_RE.test(file.path) || file.path.includes('..')) {
      return fail('INVALID_FILES', `非法文件路径：${file.path}`);
    }
    const bytes = Buffer.byteLength(file.text, 'utf8');
    if (bytes > MAX_FILE_BYTES) {
      return fail('INVALID_FILES', `单文件超过 1MB：${file.path}`);
    }
    total += bytes;
    clean.push({ path: file.path, text: file.text });
  }
  if (total > MAX_TOTAL_BYTES) {
    return fail('INVALID_FILES', '文件总量超过 8MB');
  }
  return { files: clean };
}

/** 运行一个命令（参数数组、无 shell），返回 { code, stderr }。 */
function run(executable, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { ...options, shell: false, windowsHide: true });
    let stderr = '';
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: -1, stderr: `${stderr}\nTIMEOUT`, stdout });
    }, options.timeout ?? COMPILE_TIMEOUT_MS);
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: String(error), stdout });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, stdout });
    });
  });
}

/** 解析 `javac -version` 输出（走 stderr）的主版本号。 */
function javacMajor(versionText) {
  const match = /javac\s+(\d+)/.exec(versionText);
  return match ? Number(match[1]) : 0;
}

/** 解析 PATH 上命令的真实路径（where/which 的第一个结果）。 */
async function resolveTool(name) {
  const probe = await run(process.platform === 'win32' ? 'where' : 'which', [name], {
    timeout: 10_000
  });
  if (probe.code !== 0) {
    return null;
  }
  const first = probe.stdout.split(/\r?\n/).find((line) => line.trim());
  return first && fs.existsSync(first.trim()) ? first.trim() : null;
}

/** 收集可能包含完整 JDK 的 bin 目录（支持 latest/jdk-25 式一层嵌套）。 */
function jdkBinDirs() {
  const dirs = [];
  const exe = process.platform === 'win32' ? 'javac.exe' : 'javac';
  const addIfJavac = (binDir) => {
    if (fs.existsSync(path.join(binDir, exe))) {
      dirs.push(binDir);
    }
  };
  if (process.env.JAVA_HOME) {
    addIfJavac(path.join(process.env.JAVA_HOME, 'bin'));
  }
  if (process.platform === 'win32') {
    const roots = [
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Amazon Corretto',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files\\Zulu'
    ];
    for (const root of roots) {
      let entries;
      try {
        entries = fs.readdirSync(root);
      } catch {
        continue; // 目录不存在
      }
      for (const entry of entries) {
        addIfJavac(path.join(root, entry, 'bin'));
        // latest/jdk-25 式嵌套
        try {
          for (const nested of fs.readdirSync(path.join(root, entry))) {
            addIfJavac(path.join(root, entry, nested, 'bin'));
          }
        } catch {
          // 非目录即跳过
        }
      }
    }
    const scoop = process.env.SCOOP ?? path.join(os.homedir(), 'scoop');
    try {
      for (const appDir of fs.readdirSync(path.join(scoop, 'apps'))) {
        addIfJavac(path.join(scoop, 'apps', appDir, 'current', 'bin'));
      }
    } catch {
      // 无 scoop 即跳过
    }
  } else {
    addIfJavac('/usr/bin');
    addIfJavac('/usr/local/bin');
  }
  return dirs;
}

/**
 * 定位 JDK >= 21 的 javac 与 jar（两者缺一不可——PATH shim 目录可能只有
 * javac 没有 jar）。只探测不下载：用户须自行安装 JDK（版权红线）。
 */
async function findJdk(overridePath) {
  const exe = process.platform === 'win32' ? 'javac.exe' : 'javac';
  const jarExe = process.platform === 'win32' ? 'jar.exe' : 'jar';
  const dirs = [];
  if (overridePath) {
    dirs.push(path.dirname(overridePath));
  }
  dirs.push(...jdkBinDirs());
  const pathJavac = await resolveTool('javac');
  if (pathJavac) {
    dirs.push(path.dirname(pathJavac));
  }
  const pathJar = await resolveTool('jar');

  const seen = new Set();
  let tooOld = 0;
  for (const dir of dirs) {
    const javac = path.join(dir, exe);
    const key = javac.toLowerCase();
    if (seen.has(key) || !fs.existsSync(javac)) {
      continue;
    }
    seen.add(key);
    const probe = await run(javac, ['-version'], { timeout: 15_000 });
    if (probe.code !== 0) {
      continue;
    }
    const major = javacMajor(probe.stderr + probe.stdout);
    if (major < 21) {
      if (major > 0) {
        tooOld = major;
      }
      continue;
    }
    const jarSibling = path.join(dir, jarExe);
    const jar = fs.existsSync(jarSibling) ? jarSibling : pathJar;
    if (!jar) {
      continue; // javac 无配对 jar 工具（如 Oracle javapath shim）——换下一个候选
    }
    return { javac, jar, version: (probe.stderr + probe.stdout).trim() };
  }
  return tooOld ? { tooOld } : null;
}

/**
 * 编译并打包。
 * @param {Array<{path:string,text:string}>} files Maven 布局源文件
 * @param {{ toolchainDir: string, filename?: string, javacPath?: string }} options
 */
async function build(files, options) {
  const checked = validateFiles(files);
  if (checked.error) {
    return checked;
  }
  const filename = FILENAME_RE.test(String(options.filename ?? ''))
    ? String(options.filename)
    : 'MyAchievements-1.0.0.jar';

  const libDir = path.join(options.toolchainDir, 'lib');
  let jars;
  try {
    jars = fs
      .readdirSync(libDir)
      .filter((f) => f.endsWith('.jar'))
      .map((f) => path.join(libDir, f));
  } catch {
    jars = []; // 读取失败按缺失处理
  }
  if (jars.length === 0) {
    return fail(
      'TOOLCHAIN_MISSING',
      '安装包缺少编译工具链（toolchain/lib/*.jar），请重新安装或重新构建安装包'
    );
  }

  const jdk = await findJdk(options.javacPath);
  if (!jdk) {
    return fail(
      'JDK_NOT_FOUND',
      '未检测到 JDK。为避免版权纠纷，本应用不捆绑 Java——请您自行安装 JDK 21 或更高版本（如 Eclipse Temurin：https://adoptium.net/zh-CN/temurin/releases/?version=21 ），安装后重启本应用再试。'
    );
  }
  if (jdk.tooOld) {
    return fail(
      'JDK_TOO_OLD',
      `检测到 JDK ${jdk.tooOld}，版本过低。请自行安装 JDK 21 或更高版本（如 Eclipse Temurin）后重试。`
    );
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-mc-build-'));
  try {
    const classesDir = path.join(workDir, 'classes');
    fs.mkdirSync(classesDir, { recursive: true });
    const sources = [];
    for (const file of checked.files) {
      const relative = file.path.replace(/^src\/main\//, '');
      if (file.path.startsWith('src/main/java/')) {
        const target = path.join(workDir, 'src', ...relative.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.text, 'utf8');
        sources.push(target);
      } else {
        // resources → 直接 staging 进 classes（jar 根）
        const target = path.join(classesDir, ...relative.replace(/^resources\//, '').split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.text, 'utf8');
      }
    }
    if (sources.length === 0) {
      return fail('INVALID_FILES', '文件清单中没有 src/main/java 下的 .java 源文件');
    }
    const argFile = path.join(workDir, 'sources.txt');
    fs.writeFileSync(
      argFile,
      sources.map((s) => `"${s.replaceAll('\\', '\\\\')}"`).join('\n'),
      'utf8'
    );

    const compile = await run(
      jdk.javac,
      [
        '-encoding',
        'UTF-8',
        '--release',
        '21',
        '-cp',
        jars.join(path.delimiter),
        '-d',
        classesDir,
        `@${argFile}`
      ],
      { timeout: COMPILE_TIMEOUT_MS }
    );
    if (compile.code !== 0) {
      const tail = (compile.stderr || compile.stdout).trim().split('\n').slice(-12).join('\n');
      return fail('COMPILE_FAILED', `javac 编译失败：\n${tail}`);
    }

    const jarPath = path.join(workDir, filename);
    const packed = await run(jdk.jar, ['--create', '--file', jarPath, '-C', classesDir, '.'], {
      timeout: 60_000
    });
    if (packed.code !== 0 || !fs.existsSync(jarPath)) {
      return fail('JAR_FAILED', `jar 打包失败：${(packed.stderr || packed.stdout).trim()}`);
    }

    return {
      filename,
      jarBase64: fs.readFileSync(jarPath).toString('base64'),
      jdkVersion: jdk.version,
      ok: true
    };
  } catch (error) {
    return fail('IO_FAILED', `构建过程异常：${error.message}`);
  } finally {
    fs.rmSync(workDir, { force: true, recursive: true });
  }
}

module.exports = { build };

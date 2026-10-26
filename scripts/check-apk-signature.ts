/// <reference types="node" />
/**
 * 核对一个 apk 到底有没有签名、签给谁、和手上的 keystore 对不对得上。
 *
 * 用法：
 *   node scripts/check-apk-signature.ts dist/ember-0.0.1.apk
 *   node scripts/check-apk-signature.ts dist/ember-0.0.1.apk --keystore @jasperdai__ember.jks
 *   （旧版 Node 加 --experimental-transform-types；Node 24 直接跑）
 *
 * ---- 为什么需要这个脚本 ----
 *
 * 2026-10-26 用户报「安装包没有签名文件」。核实之后：包**有签名**，而且签名是完整的
 * （签名值验过、内容摘要验过）。误会来自一个很自然的地方——**用解压工具打开 apk，
 * 在 `META-INF/` 里找不到 `*.SF` / `*.RSA`**。
 *
 * 那三个文件属于 **v1 签名（JAR signing）**，是 2013 年以前的方案。现在的 AGP
 * （这里打这个包的是 9.2.1）默认只签 **v2 / v3**，而 v2 的签名**不在 zip 的条目里**：
 * 它写在「APK Signing Block」——一段夹在「最后一个文件」和「中央目录」之间的
 * 二进制块，zip 工具按目录列表遍历，看不到它。
 *
 * 所以「文件夹里没有签名文件」不是缺陷，是 v1 已经被淘汰。反过来说，**能装进
 * Android 7 以上的包必须带 v2**；只有 v1 的包在 Android 11+ 反而装不上。
 *
 * ---- 它在验什么 ----
 *
 * 四件事，任何一件不过就是「没签好」，不是「看起来没问题」：
 *   1. 签名块在不在、v2 块解不解得开；
 *   2. 每个 signer 的**签名值**能不能用它的公钥验过（防改 signed_data）；
 *   3. **内容摘要**对不对：按 v2 的规则把 zip 重新摘要一遍，与 signer 里写死的比
 *      （防改内容——换掉一个 .so、改一行 dex，摘要立刻对不上）；
 *   4. signer 的公钥与它第一张证书的公钥是不是同一把。
 *
 * 加 `--keystore` 时再比一次：apk 的签名证书是否等于 keystore 里的证书。
 * 这一条对应 HANDOFF §2.1「签名必须一致，否则必须先卸载」——**它是唯一能提前
 * 发现「EAS 那边换了钥匙」的办法**。
 */

import { createHash, createPublicKey, verify as cryptoVerify, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 签名块的结尾标记。位置固定：紧挨着中央目录之前。 */
const MAGIC = Buffer.from('APK Sig Block 42', 'utf8');
/** v2 签名方案的块 id。 */
const V2_BLOCK_ID = 0x7109871a;
/** v3 / v3.1 的块 id，只用来报告「有没有」。 */
const V3_BLOCK_ID = 0xf05368c0;
const V31_BLOCK_ID = 0x1b93ad61;

/** 内容摘要的分块大小。v2 规范写死 1 MiB——**不是可调参数**。 */
const CHUNK_SIZE = 1024 * 1024;

/**
 * 签名算法 id → 怎么验。
 *
 * 只列 v2 规范里定义过的四种 RSA/EC + 一种 DSA。映射来自 Android 文档
 * `SignatureAlgorithm`；写成表而不是 if 链，是因为遇到不认识的 id 必须**报错**，
 * 不能默默跳过——跳过等于给一个来路不明的包盖 PASS 章。
 */
const ALGORITHMS: Record<number, { name: string; hash: 'sha256' | 'sha512' }> = {
  0x0103: { name: 'RSASSA-PKCS1-v1_5 / SHA-256', hash: 'sha256' },
  0x0104: { name: 'RSASSA-PKCS1-v1_5 / SHA-512', hash: 'sha512' },
  0x0201: { name: 'ECDSA / SHA-256', hash: 'sha256' },
  0x0202: { name: 'ECDSA / SHA-512', hash: 'sha512' },
  0x0301: { name: 'DSA / SHA-256', hash: 'sha256' },
};

/** 这个项目自己的签名证书。发布前 apk 的指纹必须等于它（见 HANDOFF §2.5）。 */
export const EXPECTED_CERT_SHA256 =
  'a9e2dba48043b27f7228cf34b0c3e2f3cc441b68f2b25d3364e97f26a9212056';

// ---------------------------------------------------------------------------
// 读 zip 的三块骨头
// ---------------------------------------------------------------------------

export type ZipLayout = {
  /** 中央目录的起点（相对文件开头）。 */
  cdOffset: number;
  /** 中央目录有多长。 */
  cdSize: number;
  /** 中央目录结束记录（EOCD）的位置。 */
  eocdOffset: number;
  /** EOCD 本身（含可能存在的注释）。 */
  eocd: Buffer;
};

/**
 * 找 EOCD。
 *
 * 从文件尾部往前搜 `PK\x05\x06`，并校验「注释长度」这个字段能不能对上
 * 文件剩余长度——不然一个内容里碰巧含 `PK\x05\x06` 的 apk 会解析错。
 */
export function findZipLayout(buf: Buffer): ZipLayout {
  const minEocd = 22;
  if (buf.length < minEocd) throw new Error('文件太小，连 zip 都不是');

  const limit = Math.min(buf.length, minEocd + 0xffff);
  for (let i = buf.length - minEocd; i >= buf.length - limit; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const commentLen = buf.readUInt16LE(i + 20);
    if (i + minEocd + commentLen !== buf.length) continue;
    return {
      cdOffset: buf.readUInt32LE(i + 16),
      cdSize: buf.readUInt32LE(i + 12),
      eocdOffset: i,
      eocd: buf.subarray(i),
    };
  }
  throw new Error('找不到 zip 的中央目录结束记录（EOCD）——这不是一个完整的 apk');
}

/**
 * 读签名块。
 *
 * 布局（`sbOffset` 处开始）：
 *   [uint64 块长度][若干 pair][uint64 块长度（与第一个相同）]["APK Sig Block 42"]
 *
 * 「块长度」不含开头那 8 字节，所以整块 = 长度 + 8，而 `sbOffset` = 中央目录起点 - 整块。
 */
export function readSigningBlock(
  buf: Buffer,
  cdOffset: number
): { sbOffset: number; pairs: Map<number, Buffer> } | null {
  if (cdOffset < 24) return null;
  const magicAt = cdOffset - 16;
  if (!buf.subarray(magicAt, cdOffset).equals(MAGIC)) return null;

  const size2 = Number(buf.readBigUInt64LE(cdOffset - 24));
  const sbOffset = cdOffset - size2 - 8;
  if (sbOffset < 0) throw new Error('签名块长度越界——块被截断了');

  const size1 = Number(buf.readBigUInt64LE(sbOffset));
  if (size1 !== size2) throw new Error('签名块头尾两处长度不一致——块被改过');

  const pairs = new Map<number, Buffer>();
  let p = sbOffset + 8;
  const end = cdOffset - 24;
  while (p < end) {
    const pairLen = Number(buf.readBigUInt64LE(p));
    const id = buf.readUInt32LE(p + 8);
    pairs.set(id, buf.subarray(p + 12, p + 8 + pairLen));
    p += 8 + pairLen;
  }
  return { sbOffset, pairs };
}

// ---------------------------------------------------------------------------
// v2 块
// ---------------------------------------------------------------------------

/** 读一个「长度前缀」的片段，返回片段本身和下一个偏移。 */
export function readLengthPrefixed(buf: Buffer, at: number): [Buffer, number] {
  const len = buf.readUInt32LE(at);
  const start = at + 4;
  if (start + len > buf.length) throw new Error('长度前缀越界——v2 块被截断');
  return [buf.subarray(start, start + len), start + len];
}

/** 把一段「长度前缀序列」拆成数组。 */
export function splitSequence(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let at = 0;
  while (at < buf.length) {
    const [item, next] = readLengthPrefixed(buf, at);
    out.push(item);
    at = next;
  }
  return out;
}

type AlgorithmRecord = { algorithmId: number; value: Buffer };

function parseAlgorithmRecords(buf: Buffer): AlgorithmRecord[] {
  return splitSequence(buf).map((rec) => ({
    algorithmId: rec.readUInt32LE(0),
    value: readLengthPrefixed(rec, 4)[0],
  }));
}

export type V2Signer = {
  /** signed_data 的原始字节。验签名时**必须用这一份**（重编码会变）。 */
  signedDataRaw: Buffer;
  digests: AlgorithmRecord[];
  certificates: Buffer[];
  signatures: AlgorithmRecord[];
  publicKey: Buffer;
};

export function parseV2Block(value: Buffer): V2Signer[] {
  // v2 块里没有版本号字段，只有一层「signer 序列」。
  // 注意嵌套：块的值本身 = 长度前缀包住的「signer 序列」，序列里每一项再是长度前缀包住的 signer。
  // 少剥一层就会把第一个 signer 的内容当成序列长度来读（报「signer 少于三段」）。
  const [sequence] = readLengthPrefixed(value, 0);
  return splitSequence(sequence).map((signer) => {
    const parts = splitSequence(signer);
    if (parts.length < 3) throw new Error('signer 少于三段（signed_data / signatures / public_key）');
    const signedDataRaw = parts[0];
    const signedParts = splitSequence(signedDataRaw);
    if (signedParts.length < 2) throw new Error('signed_data 少于两段（digests / certificates）');
    return {
      signedDataRaw,
      digests: parseAlgorithmRecords(signedParts[0]),
      certificates: splitSequence(signedParts[1]),
      signatures: parseAlgorithmRecords(parts[1]),
      publicKey: parts[2],
    };
  });
}

// ---------------------------------------------------------------------------
// 内容摘要
// ---------------------------------------------------------------------------

function chunkDigest(chunk: Buffer, hash: 'sha256' | 'sha512'): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(chunk.length);
  return createHash(hash).update(Buffer.from([0xa5])).update(len).update(chunk).digest();
}

/**
 * 按 v2 规则算内容摘要。
 *
 * 规则（三块内容拼起来，按 1 MiB 分块，再把各块摘要拼起来再摘要一次）：
 *   1. 「最后一个文件结束」到「签名块开始」——也就是全部文件条目；
 *   2. 中央目录；
 *   3. EOCD，但**其中「中央目录偏移」被改写成签名块的起点**（这样签名块本身的
 *      位置也被保护住了，挪动它会让摘要变）。
 *
 * 第三条是最容易写错的地方：直接拿原始 EOCD 去算是算不出来的。
 */
export function contentDigest(
  buf: Buffer,
  layout: ZipLayout,
  sbOffset: number,
  hash: 'sha256' | 'sha512'
): Buffer {
  const eocd = Buffer.from(layout.eocd);
  eocd.writeUInt32LE(sbOffset, 16);

  const parts = [
    buf.subarray(0, sbOffset),
    buf.subarray(layout.cdOffset, layout.cdOffset + layout.cdSize),
    eocd,
  ];

  const digests: Buffer[] = [];
  for (const part of parts) {
    for (let at = 0; at < part.length; at += CHUNK_SIZE) {
      digests.push(chunkDigest(part.subarray(at, at + CHUNK_SIZE), hash));
    }
  }

  const count = Buffer.alloc(4);
  count.writeUInt32LE(digests.length);
  return createHash(hash)
    .update(Buffer.from([0x5a]))
    .update(count)
    .update(Buffer.concat(digests))
    .digest();
}

// ---------------------------------------------------------------------------
// 核对入口
// ---------------------------------------------------------------------------

export type CertInfo = {
  sha256: string;
  sha256Colon: string;
  serial: string;
  notBefore: string;
  notAfter: string;
  subject: string;
};

function describeCert(der: Buffer): CertInfo {
  const x509 = new X509Certificate(der);
  const sha256 = createHash('sha256').update(der).digest('hex');
  return {
    sha256,
    sha256Colon: sha256.toUpperCase().match(/.{2}/g)!.join(':'),
    serial: x509.serialNumber,
    notBefore: x509.validFrom,
    notAfter: x509.validTo,
    subject: x509.subject.replace(/\n/g, ', ') || '(空)',
  };
}

export type CheckResult = {
  hasSigningBlock: boolean;
  schemes: string[];
  certs: CertInfo[];
  problems: string[];
};

export function checkApk(buf: Buffer): CheckResult {
  const problems: string[] = [];
  const layout = findZipLayout(buf);
  const block = readSigningBlock(buf, layout.cdOffset);

  if (!block) {
    return {
      hasSigningBlock: false,
      schemes: [],
      certs: [],
      problems: [
        '中央目录前没有签名块：这个 apk **没有 v2/v3 签名**。' +
          '如果 META-INF 里也没有 *.SF/*.RSA，那它是完全没有签名的包，装不上。',
      ],
    };
  }

  const schemes: string[] = [];
  const certs: CertInfo[] = [];

  if (block.pairs.has(V2_BLOCK_ID)) schemes.push('v2');
  if (block.pairs.has(V3_BLOCK_ID)) schemes.push('v3');
  if (block.pairs.has(V31_BLOCK_ID)) schemes.push('v3.1');

  const v2Value = block.pairs.get(V2_BLOCK_ID);
  if (!v2Value) {
    problems.push(
      '有签名块，但里面没有 v2。Android 7+ 要求 v2（或 v3）；只有 v1 的包在 Android 11+ 装不上。'
    );
    return { hasSigningBlock: true, schemes, certs, problems };
  }

  const signers = parseV2Block(Buffer.from(v2Value));
  if (signers.length === 0) problems.push('v2 块里一个 signer 都没有');

  signers.forEach((signer, index) => {
    const label = `signer#${index}`;

    if (signer.certificates.length === 0) {
      problems.push(`${label}: 没有证书`);
      return;
    }
    const cert = signer.certificates[0];
    certs.push(describeCert(cert));

    // 4. 公钥与证书一致
    try {
      const certKey = new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' });
      if (!certKey.equals(signer.publicKey)) {
        problems.push(`${label}: signer 的公钥与它第一张证书的公钥不是同一把`);
      }
    } catch (err) {
      problems.push(`${label}: 读不出证书的公钥（${(err as Error).message}）`);
    }

    let publicKey;
    try {
      publicKey = createPublicKey({ key: signer.publicKey, format: 'der', type: 'spki' });
    } catch (err) {
      problems.push(`${label}: 公钥解不开（${(err as Error).message}）`);
      return;
    }

    // 2. 签名值
    if (signer.signatures.length === 0) {
      problems.push(`${label}: 没有签名值`);
      return;
    }
    const digestIds = signer.digests.map((d) => d.algorithmId).sort().join(',');
    const signatureIds = signer.signatures.map((s) => s.algorithmId).sort().join(',');
    if (digestIds !== signatureIds) {
      problems.push(`${label}: 摘要算法与签名算法对不上（${digestIds} vs ${signatureIds}）`);
    }

    for (const sig of signer.signatures) {
      const algo = ALGORITHMS[sig.algorithmId];
      if (!algo) {
        problems.push(
          `${label}: 不认识的签名算法 id 0x${sig.algorithmId.toString(16)}——不猜，直接判失败`
        );
        continue;
      }
      let ok = false;
      try {
        ok = cryptoVerify(algo.hash, signer.signedDataRaw, publicKey, sig.value);
      } catch (err) {
        problems.push(`${label}: 验签抛错（${(err as Error).message}）`);
      }
      if (!ok) problems.push(`${label}: 签名值验不过（${algo.name}）——signed_data 被改过`);
    }

    // 3. 内容摘要
    for (const dig of signer.digests) {
      const algo = ALGORITHMS[dig.algorithmId];
      if (!algo) {
        problems.push(
          `${label}: 不认识的摘要算法 id 0x${dig.algorithmId.toString(16)}——不猜，直接判失败`
        );
        continue;
      }
      const actual = contentDigest(buf, layout, block.sbOffset, algo.hash);
      if (!actual.equals(dig.value)) {
        problems.push(
          `${label}: 内容摘要对不上\n` +
            `    签名里写的：${dig.value.toString('hex')}\n` +
            `    重新算出来：${actual.toString('hex')}\n` +
            '    说明 apk 的内容被改过（哪怕只换了一个文件）'
        );
      }
    }
  });

  return { hasSigningBlock: true, schemes, certs, problems };
}

// ---------------------------------------------------------------------------
// keystore（只读证书链，不碰私钥、不需要口令）
// ---------------------------------------------------------------------------

/**
 * 从 JKS 里取出所有证书的 SHA-256。
 *
 * 只解析**证书链**（明文存放的那部分）。私钥是加密的，本脚本不需要也不去解密——
 * 核对「apk 是哪个钥匙签的」，有证书就够了。
 *
 * JKS 格式（version 2）：
 *   magic(4)="FEEDFEED" version(4)=2 count(4)
 *   每条：tag(4) alias(utf) 时间戳(8)
 *     tag=1 私钥条目：加密私钥(uint32+bytes) 证书数(uint32) 再逐张 [类型(utf) 证书(uint32+bytes)]
 *     tag=2 信任证书条目：证书类型(utf) 证书(uint32+bytes)
 *   末尾附 SHA-1 摘要（有口令才有意义，这里跳过）
 *
 * **小心「证书数」那个字段**：它是**张数**（本文件里是 1），不是一个包的字节长度。
 * 把它当长度读会在证书尾部踩出越界（2026-10-26 踩过，Node 报 ERR_BUFFER_OUT_OF_BOUNDS）。
 */
export function readJksCertSha256(buf: Buffer): { alias: string; sha256: string }[] {
  if (buf.readUInt32BE(0) !== 0xfeedfeed) throw new Error('这不是 JKS（magic 不是 FEEDFEED）');
  const version = buf.readUInt32BE(4);
  if (version !== 2) throw new Error(`只认识 JKS version 2，这个文件是 ${version}`);
  const count = buf.readUInt32BE(8);

  const out: { alias: string; sha256: string }[] = [];
  let at = 12;

  const readUtf = () => {
    const len = buf.readUInt16BE(at);
    const s = buf.subarray(at + 2, at + 2 + len).toString('utf8');
    at += 2 + len;
    return s;
  };
  const readBlob = () => {
    const len = buf.readUInt32BE(at);
    const b = buf.subarray(at + 4, at + 4 + len);
    at += 4 + len;
    return b;
  };

  for (let i = 0; i < count; i++) {
    const tag = buf.readUInt32BE(at);
    at += 4;
    const alias = readUtf();
    at += 8; // 时间戳

    if (tag === 1) {
      readBlob(); // 加密的私钥，跳过
      const certCount = buf.readUInt32BE(at);
      at += 4;
      for (let c = 0; c < certCount; c++) {
        readUtf(); // 类型，都是 "X.509"
        const cert = readBlob();
        out.push({ alias, sha256: createHash('sha256').update(cert).digest('hex') });
      }
    } else if (tag === 2) {
      readUtf(); // 证书类型（"X.509"）
      const cert = readBlob();
      out.push({ alias, sha256: createHash('sha256').update(cert).digest('hex') });
    } else {
      throw new Error(`第 ${i + 1} 条的 tag 是 ${tag}，只认识 1（私钥）/ 2（信任证书）`);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// 命令行
// ---------------------------------------------------------------------------

function formatColon(hex: string): string {
  return hex.toUpperCase().match(/.{2}/g)!.join(':');
}

export type Report = { ok: boolean; lines: string[] };

/**
 * 把结果排成人读得懂的几段。抽出来是为了让测试能直接断言「哪些话必须出现」，
 * 而不是去截获 stdout。
 */
export function buildReport(args: {
  apkPath: string;
  size: number;
  result: CheckResult;
  keystore?: { path: string; certs: { alias: string; sha256: string }[] };
  expected?: string;
}): Report {
  const { apkPath, size, result, keystore, expected } = args;
  const lines: string[] = [];
  const add = (s: string) => lines.push(s);

  add(`apk      ${basename(apkPath)}  (${(size / 1048576).toFixed(1)} MB, ${size} 字节)`);
  add(
    `签名方案 ${result.hasSigningBlock ? result.schemes.join(' + ') || '（签名块里没有认识的方案）' : '无'}`
  );

  for (const cert of result.certs) {
    add('');
    add(`签名证书 ${cert.subject}`);
    add(`  序列号    ${cert.serial}`);
    add(`  有效期    ${cert.notBefore} → ${cert.notAfter}`);
    add(`  SHA-256   ${cert.sha256Colon}`);
  }

  if (keystore) {
    add('');
    const wanted = new Set(result.certs.map((c) => c.sha256));
    const match = keystore.certs.filter((c) => wanted.has(c.sha256));
    if (match.length > 0) {
      for (const m of match) add(`keystore ${basename(keystore.path)} 里的 ${m.alias} 就是这把钥匙 ✓`);
    } else {
      add(`keystore ${basename(keystore.path)} 里没有任何一张证书对得上这个 apk 的签名证书 ✗`);
      for (const c of keystore.certs) add(`  keystore 有：${c.alias}  ${formatColon(c.sha256)}`);
    }
  }

  if (expected) {
    add('');
    const hit = result.certs.some((c) => c.sha256 === expected);
    add(
      hit
        ? `项目指纹   ${formatColon(expected)} 对得上 ✓`
        : `项目指纹   ${formatColon(expected)} 对不上 ✗ —— 这个包会让老用户装不上`
    );
    if (!hit) lines.push('');
  }

  if (result.problems.length > 0) {
    add('');
    add('问题：');
    for (const p of result.problems) add(`  - ${p}`);
  }

  const ok =
    result.problems.length === 0 &&
    result.certs.length > 0 &&
    (!expected || result.certs.some((c) => c.sha256 === expected)) &&
    (!keystore || keystore.certs.some((c) => result.certs.some((ac) => ac.sha256 === c.sha256)));

  add('');
  add(ok ? '结论     签名有效' : '结论     不要发布这个包');

  return { ok, lines };
}

function main(argv: string[]): number {
  const args = argv.slice(2);
  const apkPath = args.find((a) => !a.startsWith('--'));
  const keystoreFlag = args.indexOf('--keystore');
  const keystorePath = keystoreFlag >= 0 ? args[keystoreFlag + 1] : undefined;
  const noExpected = args.includes('--no-expected');
  const asJson = args.includes('--json');

  if (!apkPath) {
    console.error(
      '用法：node scripts/check-apk-signature.ts <apk> [--keystore <jks>] [--no-expected] [--json]'
    );
    return 2;
  }

  const buf = readFileSync(apkPath);
  const result = checkApk(buf);

  const keystore = keystorePath
    ? { path: keystorePath, certs: readJksCertSha256(readFileSync(keystorePath)) }
    : undefined;

  const expected = noExpected ? undefined : EXPECTED_CERT_SHA256;
  const report = buildReport({ apkPath, size: buf.length, result, keystore, expected });

  if (asJson) {
    console.log(JSON.stringify({ ok: report.ok, ...result, size: buf.length }, null, 2));
  } else {
    for (const line of report.lines) console.log(line);
  }
  return report.ok ? 0 : 1;
}

// 只在「被直接执行」时跑命令行。被测试 import 时不动。
if (process.argv[1] && basename(process.argv[1]).startsWith('check-apk-signature')) {
  process.exit(main(process.argv));
}

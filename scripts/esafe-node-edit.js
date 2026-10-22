// esafe-node-edit.js
// 通过受信进程 node.exe 透明解密读取 / 精确替换写回文本文件。
// .js 扩展名不受亿赛通加密范围管控，node.exe 是白名单进程，可透明解密读、透明加密写。
//
// 用法:
//   node esafe-node-edit.js read    <path>                解密读取，输出规范化(\n)后的全文
//   node esafe-node-edit.js replace <path> <old> <new>    精确替换全文中的 old -> new 并写回（保留 CRLF）
//   node esafe-node-edit.js help                          打印本帮助
//
// 说明:
//   - 写回会自动保留原文件的换行风格（CRLF 源文件写回仍为 CRLF）。
//   - old/new 里的 "\n" 会被当作换行；替换按规范化后的 \n 文本进行。

const fs = require('fs');

function usage() {
  console.log([
    'esafe-node-edit.js — 受信进程 node 解密读写文本文件',
    '用法:',
    '  node esafe-node-edit.js read    <path>',
    '  node esafe-node-edit.js replace <path> <old> <new>',
    '  node esafe-node-edit.js help',
  ].join('\n'));
}

function readRaw(path) {
  if (!path) { console.error('缺少路径参数'); process.exit(2); }
  const buf = fs.readFileSync(path);
  return buf.toString('utf8');
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === 'help' || cmd === '--help' || cmd === '-h' || !cmd) {
    usage();
    process.exit(0);
  }

  if (cmd === 'read') {
    const content = readRaw(args[1]);
    // 规范化 CRLF -> LF，方便编辑端处理
    process.stdout.write(content.replace(/\r\n/g, '\n'));
    return;
  }

  if (cmd === 'replace') {
    const path = args[1];
    const oldStr = args[2];
    const newStr = args[3];
    if (!path || oldStr === undefined || newStr === undefined) {
      usage();
      process.exit(2);
    }
    const raw = readRaw(path);
    const crlf = raw.includes('\r\n');
    const norm = raw.replace(/\r\n/g, '\n');
    const count = norm.split(oldStr).length - 1;
    const outNorm = norm.split(oldStr).join(newStr);
    const out = crlf ? outNorm.replace(/\n/g, '\r\n') : outNorm;
    fs.writeFileSync(path, out, 'utf8');
    console.log(`已替换 ${count} 处（原换行=${crlf ? 'CRLF' : 'LF'}），写回完成：${path}`);
    return;
  }

  usage();
  process.exit(2);
}

main();

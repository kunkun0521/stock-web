import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9236;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = mkdtempSync(join(tmpdir(), 'stock-cdp-'));
const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--window-size=1440,900', '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log(...args);

async function waitPort() {
    for (let i = 0; i < 50; i++) {
        try {
            const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
            if (r.ok) return;
        } catch { /* 继续等待 */ }
        await sleep(300);
    }
    throw new Error('chrome 未启动');
}

let ws;
let seq = 0;
const pending = new Map();
const consoleErrors = [];

function send(method, params = {}) {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
        pending.set(id, (msg) => msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result));
        setTimeout(() => {
            if (pending.has(id)) { pending.delete(id); reject(new Error(`超时 ${method}`)); }
        }, 30000);
    });
}

const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
};

async function waitFor(expression, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (await evaluate(expression)) return true;
        await sleep(250);
    }
    return false;
}

const snapshot = () => evaluate(`(() => {
    const q = (s) => document.querySelector(s);
    const boxes = [...document.querySelectorAll('.t-result .chart-box')].map((el) => ({
        height: Math.round(el.getBoundingClientRect().height),
        canvas: !!el.querySelector('canvas'),
    }));
    return {
        hasResult: !!q('.t-result'),
        paramsOpen: !!q('.t-form'),
        collapsed: !!q('.t-panel-collapsed'),
        boxes,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        viewResultBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('查看结果')),
        chartTitle: q('.t-chart-row .panel-head h2')?.textContent || '',
        simulateCalls: performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/t-trading/simulate')).length,
    };
})()`);

try {
    await waitPort();
    const tab = await (await fetch(
        `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('http://localhost:5173/t-trading')}`,
        { method: 'PUT' },
    )).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            consoleErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
        }
    };
    await send('Page.enable');
    await send('Runtime.enable');

    // 1. 首次自动模拟完成
    const ready = await waitFor(`!!document.querySelector('.t-result canvas')`);
    log('① 首次自动模拟出图:', ready);
    const first = await snapshot();
    log('   默认态:', JSON.stringify(first));

    // 2. 手动改一个参数再点「开始模拟」
    await evaluate(`(() => {
        const input = document.querySelector('.t-form input[type="number"]');
        if (input) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(input, '260000');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '开始模拟');
        btn.click();
        return true;
    })()`);
    await waitFor(`document.querySelectorAll('.t-result canvas').length >= 2`, 15000);
    await sleep(1200);
    const after = await snapshot();
    log('② 点击开始模拟后:', JSON.stringify(after));
    log('   参数仍展开:', after.paramsOpen && !after.collapsed ? 'PASS' : 'FAIL');
    log('   图表高度 >= 230:', after.boxes.every((b) => b.height >= 230) ? 'PASS' : 'FAIL');

    // 3. 「查看结果」跳转
    await evaluate(`(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('查看结果'));
        btn.click(); window.scrollTo({ top: 0 });
        const again = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('查看结果'));
        again.click(); return true;
    })()`);
    await sleep(1000);
    const scrollInfo = await evaluate(`(() => ({
        scrollY: Math.round(window.scrollY),
        resultTop: Math.round(document.querySelector('.t-result').getBoundingClientRect().top),
        topbarHeight: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
    }))()`);
    log('③ 查看结果跳转:', JSON.stringify(scrollInfo),
        scrollInfo.resultTop >= scrollInfo.topbarHeight ? 'PASS（未被顶栏遮挡）' : 'FAIL（被遮挡）');

    // 4. 图表区截图
    const rect = await evaluate(`(() => {
        window.scrollTo(0, 0);
        const el = document.querySelector('.t-chart-row');
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    })()`);
    const shot = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1.4 },
        captureBeyondViewport: true,
    });
    writeFileSync('D:\\code\\WebStormProject\\stock-web\\_t_chart_new.png', Buffer.from(shot.data, 'base64'));
    log('④ 图表区尺寸:', JSON.stringify(rect));
    log('⑤ 控制台错误:', consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 3)) : '无');
} catch (error) {
    log('验证异常:', error.message);
} finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    chrome.kill();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

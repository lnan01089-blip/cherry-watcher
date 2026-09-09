// Cherry Apple 上新监视器（零依赖 Node 18+，用于 GitHub Actions 定时运行）
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = process.cwd();               // 在 GitHub Actions 中即仓库根目录
var STATE_DIR = path.join(ROOT, '.watcher');
var STATE_FILE = path.join(STATE_DIR, 'state.json');
var HOME_URL = 'https://cherryapple.myallvalue.com/m/pages/home/index';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var BARK_URL = String(process.env.BARK_URL || '').trim().replace(/\/+$/, '');

function log() { console.log.apply(console, ['[' + new Date().toISOString() + ']'].concat([].slice.call(arguments))); }

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return null; }
}
function saveState(s) {
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1), 'utf8'); }
  catch (e) { log('[warn] 保存状态失败:', e.message); }
}

async function fetchText(url, timeoutMs) {
  var ac = new AbortController();
  var timer = setTimeout(function () { ac.abort(); }, timeoutMs || 25000);
  try {
    var res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: ac.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(timer); }
}

// 递归收集“商品卡”：主页配置里带 variants 数组的商品对象
function walkProducts(obj, out, seen) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { for (var i = 0; i < obj.length; i++) walkProducts(obj[i], out, seen); return; }
  if (obj.goodsId && Array.isArray(obj.variants) && (obj.goodsTitle || obj.title)) {
    var id = String(obj.goodsId);
    if (!seen.has(id)) {
      seen.add(id);
      var vs = (obj.variants || []).map(function (v) {
        var opt = '';
        if (Array.isArray(v.optionValues)) {
          opt = v.optionValues.map(function (o) { return o && o.title ? String(o.title) : ''; }).filter(Boolean).join(' / ');
        }
        return {
          id: String(v.variantId != null ? v.variantId : v.id != null ? v.id : ''),
          t: opt || String(v.title || ''),
          q: v.quantity != null ? Number(v.quantity) : null
        };
      }).filter(function (x) { return !/售后|封号|退款|介意|请注意|卖超|修改地址|默认除|多本也/i.test(x.t); });      out.push({
        id: id,
        t: String(obj.goodsTitle || obj.title),
        st: String(obj.goodsStatusStr || (obj.goodsStatus != null ? obj.goodsStatus : '')),
        ss: String(obj.goodsSoldStatusStr || ''),
        v: vs
      });
    }
  }
  for (var k in obj) { try { walkProducts(obj[k], out, seen); } catch (e) {} }
}

// 收集公告/跑马灯/提示类文案，用于感知“页面有预告但商品未变”
function collectTexts(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { for (var i = 0; i < obj.length; i++) collectTexts(obj[i], out); return; }
  for (var k in obj) {
    var v = obj[k];
    if (typeof v === 'string' && /notice|announce|marquee|tips|top_bar|ad_text|headline/i.test(k)) {
      var s = v.trim();
      if (s.length >= 2 && s.length <= 300) out.push(s);
    } else { try { collectTexts(v, out); } catch (e) {} }
  }
}

function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex'); }

function prodMap(list) {
  var m = {};
  list.forEach(function (p) { m[p.id] = p; });
  return m;
}
function vMap(p) {
  var m = {};
  (p.v || []).forEach(function (v) { m[v.id] = v; });
  return m;
}

// 对比前后两个商品快照，返回要给用户看的提醒文本列表
function diffProducts(prev, cur) {
  var msgs = [];
  var pMap = prodMap(prev || []);
  var cMap = prodMap(cur || []);
  // 1) 全新商品卡
  Object.keys(cMap).forEach(function (id) {
    if (!pMap[id]) msgs.push('🆕 首页出现新商品：' + (cMap[id].t || id));
  });
  // 2) 已有商品改名 / 状态变化
  Object.keys(cMap).forEach(function (id) {
    var p = pMap[id], c = cMap[id];
    if (!p) return;
    if (p.t !== c.t && c.t) msgs.push('✏️ 商品标题变化：' + (p.t || id) + ' → ' + c.t);
    if (c.st && p.st !== c.st && /down|sold|off/i.test(c.st)) msgs.push('🚫 已下架/停售：' + (c.t || id));
  });
  // 3) 新款式 / 补货
  Object.keys(cMap).forEach(function (id) {
    var p = pMap[id], c = cMap[id];
    if (!p) return;
    var pv = vMap(p), cv = vMap(c);
    var added = [], restocked = [];
    Object.keys(cv).forEach(function (vid) {
      if (!pv[vid]) { added.push((cv[vid].t || ('款式' + vid)).slice(0, 60)); }
      else {
        var pq = pv[vid].q, cq = cv[vid].q;
        if (pq != null && cq != null && pq === 0 && cq > 0) restocked.push((cv[vid].t || ('款式' + vid)).slice(0, 60));
      }
    });
    if (added.length) msgs.push('🆕 「' + (c.t || id) + '」新增款式：' + added.slice(0, 6).join('、') + (added.length > 6 ? ' 等' + added.length + ' 个' : ''));
    if (restocked.length) msgs.push('🔁 补货可拍：「' + (c.t || id) + '」' + restocked.slice(0, 6).join('、'));
  });
  // 4) 消失的商品卡（商家轮换首页时常见，静默记录，不打扰）
  Object.keys(pMap).forEach(function (id) {
    if (!cMap[id]) log('[info] 首页下架(不推送)：', pMap[id].t || id);
  });
  return msgs;
}

async function pushBark(title, body) {
  if (!BARK_URL) { log('[push] 跳过推送：未设置 BARK_URL（本地试跑时正常）'); return; }
  var url = BARK_URL + '/' + encodeURIComponent(title) + '/' + encodeURIComponent(body) + '?group=cherryapple&level=active';
  try {
    var res = await fetch(url, { headers: { 'User-Agent': UA } });
    var txt = await res.text();
    log('[push] Bark HTTP', res.status, txt.slice(0, 120));
    if (res.status === 200 && /"code"\s*:\s*200/i.test(txt)) { /* ok */ }
  } catch (e) { log('[push] 推送失败:', e.message); }
}

async function main() {
  log('开始检查 Cherry Apple…');
  var html, cfg, configUrl;
  try {
    html = await fetchText(HOME_URL, 30000);
    var m = html.match(/https:\/\/intl-file\.yzcdn\.cn\/files\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{32}\.json/i);
    if (!m) throw new Error('未在首页找到店铺配置地址');
    configUrl = m[0];
    var raw = await fetchText(configUrl, 30000);
    cfg = JSON.parse(raw);
  } catch (e) {
    log('[warn] 抓取失败（网络/站点临时问题），保留原快照，本轮不推送。原因:', e.message);
    process.exit(0);
  }
  var products = [];
  walkProducts(cfg, products, new Set());
  products.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  var texts = [];
  collectTexts(cfg, texts);
  texts.sort();
  var pageFp = sha1(JSON.stringify(texts));

  var prev = readState();
  if (!prev) {
    var st0 = { v: 1, at: new Date().toISOString(), configUrl: configUrl, pageFp: pageFp, products: products };
    saveState(st0);
    var cnt = products.length;
    log('首次运行：已记录基准快照，共', cnt, '个商品');
    await pushBark('✅ Cherry Apple 上新监视已启动', '已记录当前首页 ' + cnt + ' 个商品。今后每 5 分钟自动检查，发现上新/补货/页面预告会立刻推送到这里。');
    return;
  }
  var msgs = [];
  if (products.length) {
    msgs = diffProducts(prev.products || [], products);
  }
  var changedPage = false;
  if (pageFp !== prev.pageFp && !msgs.length) {
    changedPage = true;
    msgs.push('📣 店铺页面内容有更新（可能是上新预告/公告），去网站看看吧');
  }
  if (!msgs.length) {
    log('无变化，保持静默。');
  } else {
    var title = msgs.length === 1 ? '🍒 Cherry Apple 提醒' : '🍒 Cherry Apple 有更新';
    var body = msgs.join('\n');
    log('检测到变化:\n' + body);
    await pushBark(title, body);
  }
  var st = { v: 1, at: new Date().toISOString(), configUrl: configUrl, pageFp: pageFp, products: products };
  saveState(st);
}

main().catch(function (e) { log('[error]', e && e.stack || e); process.exit(1); });
'use strict';
/* ===== 설정 상수 ===== */
const SIDE_MS = 10 * 1000;      // 부작용 확인 알림 대기시간 (시연 10초). 실제 30분이면: 30 * 60 * 1000
const REASK_MS = 10 * 1000;     // "식사 후 30분 뒤에 다시 알려주기" 대기시간 (시연 10초). 실제: 30 * 60 * 1000
const PATIENT = { name: '김순자', age: 72 };
const SLOTS = { '아침': '08:00', '점심': '12:00', '저녁': '18:00', '잠자기 전': '22:00' };
const KEY = 'ssuk_app_v1';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const DOWL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const SCORE_COL = ['', '#2E7D32', '#8BC34A', '#FDD835', '#FB8C00', '#E53935'];
const FACES = ['', '😄', '🙂', '😐', '😣', '😫'];
const SCORE_DESC = ['', '증상이 없어요', '조금 불편해요', '보통으로 불편해요', '많이 불편해요', '매우 심하게 불편해요'];
const KINDS = ['어지러움', '구역', '두통', '발진', '기타'];
const SYMS = [['어지러움', '😵'], ['졸림', '😴'], ['두통', '🤕'], ['속쓰림', '🔥'], ['메스꺼움', '🤢'], ['발진·가려움', '🔴'], ['호흡곤란', '😮‍💨'], ['심한 복통', '😖'], ['없음', '👍']];

/* ===== 모의 데이터 (실제 서비스에서는 식약처/약학정보원 API, 병원 검색 API로 교체) ===== */
const DRUGS = [
  { name: '타이레놀정 500mg', ing: '아세트아미노펜', form: '정제', use: '열을 내리고 통증을 줄여 줘요', how: '물과 함께 삼키세요. 약 사이 간격을 4~6시간 두세요', warn: '술과 함께 드시지 마세요. 하루 최대량을 지키세요', side: '드물게 발진, 구역' },
  { name: '아모디핀정 5mg', ing: '암로디핀', form: '정제', use: '혈압을 낮춰 줘요', how: '매일 같은 시간에 드세요', warn: '자몽 주스는 피하세요. 갑자기 끊지 마세요', side: '발목 부종, 어지러움, 두통' },
  { name: '메트포르민정 500mg', ing: '메트포르민', form: '정제', use: '혈당을 조절해 줘요', how: '식사 직후에 드세요', warn: '심한 구토·설사 시 의사에게 알리세요', side: '속쓰림, 메스꺼움, 설사' },
  { name: '오메프라졸캡슐 20mg', ing: '오메프라졸', form: '캡슐', use: '위산을 줄여 속쓰림을 가라앉혀요', how: '식사 전 공복에 물과 함께 드세요', warn: '캡슐을 씹지 마세요', side: '두통, 복통' }
];
const HOSPS = [
  { id: 'h1', name: '푸른내과의원', dept: '내과', addr: '서울시 강남구 푸른로 12', tel: '02-111-2222' },
  { id: 'h2', name: '햇살정형외과의원', dept: '정형외과', addr: '서울시 서초구 햇살길 5', tel: '02-333-4444' },
  { id: 'h3', name: '튼튼대학병원', dept: '순환기내과', addr: '서울시 송파구 튼튼대로 100', tel: '02-555-6666' },
  { id: 'h4', name: '맑은안과의원', dept: '안과', addr: '서울시 마포구 맑은길 33', tel: '02-777-8888' },
  { id: 'h5', name: '사랑가정의학과의원', dept: '가정의학과', addr: '서울시 종로구 사랑로 8', tel: '02-999-0000' },
  { id: 'h6', name: '온누리내과병원', dept: '내과', addr: '경기도 성남시 온누리로 21', tel: '031-123-4567' }
];
/* 처방전 OCR 자리: 실제 구현 시 OCR 서버(또는 외부 OCR API) 호출 후 식약처 의약품 API로 대조 */
function recognizePrescription(file) {
  return new Promise(res => setTimeout(() => res([
    { name: '타이레놀정 500mg', dose: 1, times: 3, days: 7, matched: true },
    { name: '아모디핀정 5mg', dose: 1, times: 1, days: 30, matched: true },
    { name: '○○정', dose: 1, times: 2, days: 7, matched: false, cand: ['메트포르민정 500mg', '오메프라졸캡슐 20mg'] }
  ]), 1800));
}
function lookupDrug(name) {
  const n = (name || '').replace(/\s/g, '');
  return DRUGS.find(d => d.name.replace(/\s/g, '') === n) || DRUGS.find(d => n && (d.name.replace(/\s/g, '').startsWith(n) || n.startsWith(d.name.split(/\s/)[0]))) || null;
}

/* ===== 저장소 ===== */
const def = () => ({ startDate: null, meds: [], logs: {}, hospitals: [], appts: [], guardians: [], chat: [], pending: [], reask: [], shown: {}, scores: [], gAlerts: [], dAlerts: [], seq: 1 });
function load() { try { const r = localStorage.getItem(KEY); if (r) return Object.assign(def(), JSON.parse(r)); } catch (e) { } return def(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
let S = load();
const photos = {};   // 약 사진(큰 데이터)은 저장하지 않고 메모리에만 보관

/* ===== 시간 도구 (한국 표준시) ===== */
const kst = () => new Date(Date.now() + 9 * 3600e3);
const pad = n => String(n).padStart(2, '0');
const dk = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const today = () => dk(kst());
const toD = k => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addD = (k, n) => dk(new Date(toD(k).getTime() + n * 864e5));
const diff = (a, b) => Math.round((toD(a) - toD(b)) / 864e5);
const md = k => { const d = toD(k); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${DOW[d.getUTCDay()]})`; };
const md2 = k => { const d = toD(k); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const nowMin = () => { const d = kst(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hm12 = (h, m) => `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad(m)}`;
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const slotMin = s => toMin(SLOTS[s] || s);
const slotLabel = s => s === '하루' ? '하루 1번' : SLOTS[s] ? s : (() => { const [h, m] = s.split(':').map(Number); return hm12(h, m); })();
const slotMed = s => s === '하루' ? '오늘 약' : SLOTS[s] ? s + '약' : slotLabel(s) + ' 약';
const startKey = () => S.startDate || today();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowLabel = () => { const d = kst(); return hm12(d.getUTCHours(), d.getUTCMinutes()); };

/* ===== 복약 데이터 계산 ===== */
function daySlots() {
  const set = new Set(); S.meds.forEach(m => m.slots.forEach(s => set.add(s)));
  if (!set.size) return ['하루'];
  return [...set].sort((a, b) => slotMin(a) - slotMin(b));
}
function dayStatus(k) {
  if (diff(k, startKey()) < 0) return '';
  const L = S.logs[k] || {}, sl = daySlots();
  if (sl.every(s => L[s] === true)) return 'O';
  if (sl.some(s => L[s] === false)) return 'X';
  return k < today() ? 'X' : '';
}
const oDays = () => Object.keys(S.logs).filter(k => dayStatus(k) === 'O').length;
const stageOf = n => n >= 21 ? 'flower' : n >= 14 ? 'bud' : n >= 7 ? 'sprout' : 'seed';
const STN = { seed: '씨앗', sprout: '새싹', bud: '꽃봉오리', flower: '꽃' };
const STE = { seed: '씨앗', sprout: '새싹 🌱', bud: '꽃봉오리 🌷', flower: '꽃 🌸' };
const curStage = () => stageOf(oDays());
const leftDays = () => { const n = oDays(); return n < 7 ? 7 - n : n < 14 ? 14 - n : n < 21 ? 21 - n : 0; };
const curCycle = () => Math.max(0, Math.min(4, Math.floor(diff(today(), startKey()) / 7)));
function cycleInfo(c) {
  const st = startKey(), days = [...Array(7)].map((_, i) => addD(st, c * 7 + i));
  const o = days.filter(k => dayStatus(k) === 'O').length, x = days.filter(k => dayStatus(k) === 'X').length;
  return { days, o, x, pct: Math.round(o / 7 * 100) };
}
function medStats(m) {
  let taken = 0;
  Object.keys(S.logs).forEach(k => { if (k < m.start) return; m.slots.forEach(s => { if (S.logs[k][s] === true) taken += m.dose; }); });
  const total = m.dose * m.times * m.days; taken = Math.min(taken, total);
  const pct = total ? Math.round(taken / total * 100) : 0;
  return { taken, total, pct, left: Math.max(0, total - taken) };
}
const fmt = n => Number.isInteger(n) ? n : n.toFixed(1);
let grow = null;
function record(k, slot, val) {
  const L = S.logs[k] = S.logs[k] || {};
  if (L[slot] !== undefined) return false;
  const before = stageOf(oDays());
  L[slot] = val;
  if (val && k === today()) {
    S.pending.push({ id: S.seq++, due: Date.now() + SIDE_MS, slot, date: k });
    S.reask = S.reask.filter(r => !(r.slot === slot && r.date === k));
  }
  save();
  const after = stageOf(oDays());
  if (before !== after) grow = { from: before, to: after };
  return true;
}
function afterRecord() { render(); if (grow) { const g = grow; grow = null; showOverlay(`<div class="pop grow"><div>${plantSVG(g.to, 150)}</div><h3>🎉 7일 복약 달성!<br>식물이 ${STN[g.from]}에서 ${STN[g.to]} 단계로 자랐어요!</h3><button class="big" data-a="popClose">확인</button></div>`); } tick(); }

/* ===== 화분 캐릭터 SVG (모든 화면 공통) ===== */
function plantSVG(st, px) {
  const stem = t => `<path d="M100 90 Q98 ${(90 + t) / 2} 100 ${t}" stroke="#4E9A2F" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  const leaf = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="17" ry="8" transform="rotate(${r} ${x} ${y})" fill="#7CC84A"/>`;
  let under = '', over = '';
  if (st === 'sprout') under = stem(54) + leaf(82, 56, -25) + leaf(118, 56, 25);
  if (st === 'bud') under = stem(48) + leaf(82, 68, -25) + leaf(118, 68, 25) + `<ellipse cx="100" cy="32" rx="11" ry="16" fill="#F48FB1"/><path d="M89 38 Q100 50 111 38 Q100 44 89 38Z" fill="#4E9A2F"/>`;
  if (st === 'flower') {
    let p = ''; for (let i = 0; i < 8; i++) p += `<ellipse cx="100" cy="21" rx="9" ry="15" transform="rotate(${i * 45} 100 36)" fill="#F8A5C2"/>`;
    under = stem(50) + leaf(82, 72, -25) + leaf(118, 72, 25) + p + `<circle cx="100" cy="36" r="10" fill="#FFD43B"/>`;
  }
  if (st === 'seed') over = `<circle cx="86" cy="94" r="5" fill="#5A3A24"/><circle cx="116" cy="97" r="6" fill="#5A3A24"/><circle cx="100" cy="102" r="5" fill="#5A3A24"/><circle cx="92" cy="88" r="3" fill="#5A3A24"/>
    <path d="M99 80 L101 90" stroke="#FFD54F" stroke-width="3" stroke-dasharray="2 3" stroke-linecap="round"/>
    <ellipse cx="103" cy="95" rx="6" ry="10" transform="rotate(40 103 95)" fill="#D9B26A"/><ellipse cx="101" cy="92" rx="2" ry="4" transform="rotate(40 101 92)" fill="#fff" opacity=".8"/>`;
  return `<svg viewBox="0 0 200 215" width="${px}" role="img" aria-label="화분 캐릭터 ${STN[st]}">
    ${under}
    <path d="M40 112 L160 112 L148 196 Q147 206 138 206 L62 206 Q53 206 52 196Z" fill="#E9A685"/>
    <path d="M54 128 Q51 162 59 192" stroke="#fff" stroke-opacity=".4" stroke-width="7" fill="none" stroke-linecap="round"/>
    <rect x="34" y="100" width="132" height="22" rx="11" fill="#F4C4A8"/>
    <path d="M44 103 Q100 56 156 103 Q100 113 44 103Z" fill="#8B5E3C"/>
    ${over}
    <ellipse cx="80" cy="152" rx="7" ry="9" fill="#3B2A20"/><ellipse cx="120" cy="152" rx="7" ry="9" fill="#3B2A20"/>
    <circle cx="82" cy="148" r="2.6" fill="#fff"/><circle cx="122" cy="148" r="2.6" fill="#fff"/>
    <ellipse cx="66" cy="168" rx="9" ry="5.5" fill="#F28B82" opacity=".65"/><ellipse cx="134" cy="168" rx="9" ry="5.5" fill="#F28B82" opacity=".65"/>
    <path d="M87 166 Q100 184 113 166Z" fill="#8B2E2E"/><ellipse cx="100" cy="174" rx="6.5" ry="4" fill="#F48FB1"/>
  </svg>`;
}
const pillSVG = () => `<svg viewBox="0 0 100 100" width="70%"><rect x="12" y="38" width="76" height="26" rx="13" transform="rotate(-30 50 50)" fill="#F58A4B"/><rect x="12" y="38" width="38" height="26" rx="13" transform="rotate(-30 50 50)" fill="#fff" stroke="#F58A4B" stroke-width="3"/></svg>`;

/* ===== 상태 ===== */
let cur = 'home', params = {};
const ym0 = () => { const d = kst(); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); };
const shiftM = (s, d) => { let [y, m] = s.split('-').map(Number); m += d; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + pad(m); };
const ui = {
  med: null, rx: null, hosp: { q: '', sel: null },
  appt: { m: ym0(), form: null, tp: null }, care: { form: false, rel: '', name: '', phone: '' },
  side: { view: 'cal', m: ym0(), sel: null, score: 0, slot: null, date: null, kind: '', memo: '' },
  plant: { c: null }, log: { m: ym0(), c: null }, md: null
};
const resetMedForm = () => ui.med = { name: '', dose: 1, times: 1, timesCustom: false, slots: [], customOn: false, customTime: '', days: 7, daysCustom: false, photo: null };
resetMedForm();
const $ = s => document.querySelector(s);
const TABS = ['log', 'plant', 'side'];

function go(s, p) {
  cur = s; params = p || {}; ui.plant.c = null; ui.log.c = null; ui.md = null;
  if (s === 'med') { resetMedForm(); ui.rx = null; }
  if (s === 'hosp') ui.hosp = { q: '', sel: null };
  if (s === 'appt') { ui.appt.form = null; ui.appt.tp = null; }
  if (s === 'care') ui.care = { form: false, rel: '', name: '', phone: '' };
  if (s === 'side') { ui.side.sel = null; ui.side.kind = ''; ui.side.memo = ''; ui.side.score = 0;
    if (p && p.score) { ui.side.view = 'score'; ui.side.slot = p.score.slot; ui.side.date = p.score.date; } else ui.side.view = 'cal'; }
  if (s === 'chat') enterChat();
  render(); $('#phone').scrollTop = 0; window.scrollTo(0, 0); tick();
}

/* ===== 공통 조각 ===== */
const hdr = (t, to) => `<div class="hdr"><button class="back" data-a="go" data-s="${to || 'home'}" aria-label="뒤로가기">←</button><h1>${t}</h1></div>`;
function showOverlay(h) { const o = $('#overlay'); o.innerHTML = h; o.hidden = false; }
function hideOverlay() { const o = $('#overlay'); o.hidden = true; o.innerHTML = ''; }
function doneOverlay(msg, ms, cb) { showOverlay(`<div class="pop"><div class="check">✅</div><h3>${msg}</h3></div>`); setTimeout(() => { hideOverlay(); cb && cb(); }, ms); }
let toastT; function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3000); }
function medNames(slot) { const l = S.meds.filter(m => slot === '하루' || m.slots.includes(slot)).map(m => m.name); return l; }
function monthCells(ym) {
  const [y, m] = ym.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const c = []; for (let i = 0; i < first; i++) c.push(null); for (let d = 1; d <= n; d++) c.push(`${y}-${pad(m)}-${pad(d)}`); return c;
}
const calHead = () => DOW.map(d => `<div class="dw">${d}</div>`).join('');
const mnav = (w, ym) => `<div class="mnav"><button class="circ" data-a="mon" data-w="${w}" data-d="-1" aria-label="이전 달">‹</button><b>${ym.split('-')[0]}년 ${+ym.split('-')[1]}월</b><button class="circ" data-a="mon" data-w="${w}" data-d="1" aria-label="다음 달">›</button></div>`;
const wkNav = (w, c, mid) => `<div class="wk"><button class="arr ${c <= 0 ? 'dim' : ''}" data-a="wk" data-w="${w}" data-d="-1">‹</button><div class="mid">${mid}</div><button class="arr ${c >= 4 ? 'dim' : ''}" data-a="wk" data-w="${w}" data-d="1">›</button></div>`;

/* ===== 화면: 1 홈 ===== */
function untaken() { const t = today(), L = S.logs[t] || {}; let n = 0; S.meds.forEach(m => m.slots.forEach(s => { if (L[s] !== true) n++; })); return n; }
function vHome() {
  const n = untaken();
  return `<h1 class="hello">안녕하세요, ${PATIENT.name}님</h1>
  <p class="sub">${S.meds.length ? `오늘 복용할 약 ${n}개가 있어요` : '등록된 약이 아직 없어요'}</p>
  <div class="row2"><button class="menu" data-a="go" data-s="med"><span class="e">💊</span>약물 등록</button><button class="menu" data-a="go" data-s="hosp"><span class="e">🏥</span>병원 등록</button></div>
  <button class="potbtn" data-a="go" data-s="log" aria-label="복약 기록 보기">${plantSVG(curStage(), 230)}</button>
  <button class="big orange" data-a="go" data-s="mymeds">나의 등록된 약물 보기</button>
  <div class="row2"><button class="menu" data-a="go" data-s="appt"><span class="e">📅</span>다음 진료 일정</button><button class="menu" data-a="go" data-s="care"><span class="e">👨‍👩‍👧</span>보호자·의료진 연계</button></div>
  <div class="fabwrap"><button class="fab" data-a="go" data-s="chat" aria-label="쑥쑥이 챗봇">🪴</button><small>쑥쑥이</small></div>`;
}

/* ===== 화면: 2 약물 등록 ===== */
const stepsBar = n => `<div class="steps">${['① 사진 촬영', '② 처방전', '③ 자동 입력'].map((t, i) => `<span class="${i < n ? 'on' : ''}">${t}</span>`).join('')}</div>`;
function vMed() {
  if (ui.rx) return vRx();
  const f = ui.med, sl = ['아침', '점심', '저녁', '잠자기 전'];
  return `${hdr('약물 정보 등록')}
  <button class="shoot" data-a="shoot">${f.photo ? `<img src="${f.photo}" alt="약물 사진">` : '<span class="e">📷</span>'}<span>약물 사진을 찍어주세요</span></button>
  <button class="big orange" style="margin-top:14px" data-a="rxpick">🧾 처방전을 촬영하면 입력이 돼요</button>
  ${stepsBar(f.photo ? 1 : 0)}
  <div class="q">약물 이름</div><input class="inp" data-i="name" value="${esc(f.name)}" placeholder="약 이름을 적어주세요">
  <div class="q">한 번에 몇 정 드세요?</div><div class="chips">${[0.5, 1, 2].map(v => `<button class="chip ${f.dose === v ? 'on' : ''}" data-a="setDose" data-v="${v}">${v}정</button>`).join('')}</div>
  <div class="q">하루에 몇 번 드세요?</div><div class="chips">${[1, 2, 3].map(v => `<button class="chip ${!f.timesCustom && f.times === v ? 'on' : ''}" data-a="setTimes" data-v="${v}">${v}번</button>`).join('')}<button class="chip ${f.timesCustom ? 'on' : ''}" data-a="setTimes" data-v="c">직접 입력</button></div>
  ${f.timesCustom ? `<input class="inp" type="number" min="1" max="10" data-i="times" value="${f.times}" placeholder="몇 번인지 적어주세요" style="margin-top:-8px;margin-bottom:12px">` : ''}
  <div class="q">언제 드세요?</div><div class="chips">${sl.map(s => `<button class="chip ${f.slots.includes(s) ? 'on' : ''}" data-a="toggleSlot" data-v="${s}">${s}</button>`).join('')}<button class="chip ${f.customOn ? 'on' : ''}" data-a="toggleCustom">직접 입력</button></div>
  ${f.customOn ? `<input class="inp" type="time" data-i="ctime" value="${f.customTime}" style="margin-top:-8px;margin-bottom:12px">` : ''}
  <div class="q">며칠 동안 드세요?</div><div class="chips">${[7, 14, 30].map(v => `<button class="chip ${!f.daysCustom && f.days === v ? 'on' : ''}" data-a="setDays" data-v="${v}">${v}일</button>`).join('')}<button class="chip ${f.daysCustom ? 'on' : ''}" data-a="setDays" data-v="c">직접 입력</button></div>
  ${f.daysCustom ? `<input class="inp" type="number" min="1" max="365" data-i="days" value="${f.days}" placeholder="며칠인지 적어주세요" style="margin-top:-8px;margin-bottom:12px">` : ''}
  <div class="total" id="total"></div>
  <div id="regWrap"><button class="big" data-a="regMed">등록하기</button><p class="sm center">입력한 정보가 맞는지 확인해주세요</p></div>`;
}
function medReady() { const f = ui.med; return f.name.trim() && (f.slots.length || (f.customOn && f.customTime)) && f.dose > 0 && f.times > 0 && f.days > 0; }
function refreshMed() {
  const f = ui.med, t = $('#total'); if (t) t.innerHTML = `${fmt(f.dose)}정 × 하루 ${f.times}번 × ${f.days}일 = <b>총 ${fmt(f.dose * f.times * f.days)}정</b>`;
  const r = $('#regWrap'); if (r) r.hidden = !medReady();
}
function makeMed(o) {
  const id = S.seq++, d = lookupDrug(o.name);
  if (!S.meds.length && !Object.keys(S.logs).length) S.startDate = today();
  const m = { id, name: d ? d.name : o.name, dose: o.dose, times: o.times, slots: o.slots, days: o.days, start: today(), regAt: Date.now(), info: d };
  S.meds.push(m); return m;
}
function regMed() {
  if (!medReady()) return;
  const f = ui.med, slots = f.slots.slice(); if (f.customOn && f.customTime && !slots.includes(f.customTime)) slots.push(f.customTime);
  slots.sort((a, b) => slotMin(a) - slotMin(b));
  const m = makeMed({ name: f.name.trim(), dose: f.dose, times: f.times, slots, days: f.days });
  if (f.photo) photos[m.id] = f.photo; save(); go('home');
}

/* 처방전 확인 화면 */
function vRx() {
  const r = ui.rx;
  const st = n => `<div class="steps">${['① 처방전 촬영', '② 자동 확인', '③ 내용 확인', '④ 등록 완료'].map((t, i) => `<span class="${i < n ? 'on' : ''}">${t}</span>`).join('')}</div>`;
  if (r.loading) return `${hdr('처방전 확인')}${st(2)}<div class="spin">🔍</div><p class="center q">처방전을 읽고 있어요</p>`;
  const items = r.items.map((it, i) => {
    const d = it.matched ? lookupDrug(it.name) : null;
    return `<div class="rxitem"><div class="top">${it.matched ? `<button class="chip ${it.on ? 'on' : ''}" style="min-height:48px" data-a="rxToggle" data-i="${i}">${it.on ? '☑' : '☐'}</button><span>${esc(it.name)}</span>` : `<span>❓ ${esc(it.name)}</span>`}</div>
      ${it.matched ? `<div class="sm">${fmt(it.dose)}정 · 하루 ${it.times}번 · ${it.days}일</div>
        <div class="acts"><button data-a="rxInfo" data-i="${i}">정보 확인</button><button data-a="rxEdit" data-i="${i}">수정</button></div>
        ${it.info && d ? `<div class="info"><b>성분</b> ${d.ing} · ${d.form}<br><b>효능</b> ${d.use}<br><b>복용</b> ${d.how}<br><b>주의</b> ${d.warn}</div>` : ''}
        ${it.edit ? `<input class="inp" data-i="rxname" data-n="${i}" value="${esc(it.name)}"><button class="ob" data-a="rxEditOk" data-i="${i}">확인</button>` : ''}`
        : `<div class="warn">약물명을 정확하게 확인하지 못했습니다.<br>직접 확인해주세요.</div>
        <div class="chips" style="margin-bottom:6px">${it.cand.map(c => `<button class="chip" data-a="rxCand" data-i="${i}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <input class="inp" data-i="rxown" data-n="${i}" placeholder="약 이름 직접 입력"><button class="ob" data-a="rxOwn" data-i="${i}">이 이름으로 확인</button>`}</div>`;
  }).join('');
  const ok = r.items.some(i => i.matched && i.on) && r.items.every(i => i.matched || i.skip);
  return `${hdr('처방전 확인')}${st(3)}<p class="q" style="margin-top:4px">처방전에서 다음 약물을 확인했습니다</p>${items}
    <div class="sticky-bot"><button class="big ${r.items.some(i => i.matched && i.on) ? '' : 'dis'}" data-a="rxReg">이대로 약물 등록하기</button></div>`;
}

/* ===== 화면: 3 병원 등록 ===== */
function hospRegHTML() {
  if (!S.hospitals.length) return `<p class="sm center">아직 등록된 병원이 없습니다</p>`;
  return `<div class="stitle">등록된 병원</div>` + S.hospitals.map(h => `<div class="hc reg"><span class="tag">✔ 등록 완료</span><button class="del" data-a="hospDel" data-id="${h.id}">삭제</button><b>${h.name}</b>${h.dept}<br>${h.addr}<br>📞 ${h.tel}</div>`).join('');
}
function hospResHTML() {
  const q = ui.hosp.q.trim(); if (!q) return '';
  const l = HOSPS.filter(h => h.name.includes(q) || h.dept.includes(q));
  if (!l.length) return `<p class="sm center" style="margin-top:14px">검색 결과가 없어요</p>`;
  return l.map(h => `<button class="hc ${ui.hosp.sel === h.id ? 'sel' : ''}" data-a="hospSel" data-id="${h.id}">${ui.hosp.sel === h.id ? '<span class="tag" style="background:var(--o);color:#fff">✔ 선택됨</span>' : ''}<b>${h.name}</b>${h.dept}<br>${h.addr}<br>📞 ${h.tel}</button>`).join('');
}
function vHosp() {
  return `${hdr('병원 등록')}<label class="srch"><span style="font-size:28px">🔍</span><input data-i="hq" value="${esc(ui.hosp.q)}" placeholder="다니는 병원을 검색해주세요"></label>
  <div id="hreg">${hospRegHTML()}</div><div id="hres">${hospResHTML()}</div>
  <div class="sticky-bot" style="margin-top:14px"><button class="big ${ui.hosp.sel ? '' : 'dis'}" id="hbtn" data-a="hospReg">이 병원 등록하기</button></div>`;
}

/* ===== 화면: 4 다음 외래 일정 ===== */
const apptT = a => hm12(a.h, a.min);
const sortedAppts = () => S.appts.slice().sort((a, b) => (a.date + pad(a.h) + pad(a.min)).localeCompare(b.date + pad(b.h) + pad(b.min)));
function vAppt() {
  const A = ui.appt, t = today(), up = sortedAppts().filter(a => a.date >= t), has = new Set(S.appts.map(a => a.date));
  const cells = monthCells(A.m).map(k => !k ? '<div class="cell e"></div>' : `<div class="cell ${k === t ? 'today' : ''}">${+k.slice(8)}${has.has(k) ? '<small>🏥</small>' : ''}</div>`).join('');
  const nx = up[0], d = nx && toD(nx.date);
  let h = `${hdr('다음 외래 일정')}${mnav('appt', A.m)}<div class="cal">${calHead()}${cells}</div>
  <div class="stitle center">가장 가까운 진료 일정</div>`;
  h += nx ? `<div class="nextc"><div class="nm">${nx.hosp}</div><div>${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${DOWL[d.getUTCDay()]}</div><div class="tm">${apptT(nx)}</div><div>${esc(nx.dept)}</div></div>` : `<p class="empty">예정된 진료가 없어요</p>`;
  h += up.slice(1).map(a => { const dd = toD(a.date); return `<div class="ac"><div class="t"><b>${a.hosp}</b><br>${dd.getUTCMonth() + 1}월 ${dd.getUTCDate()}일 ${DOW[dd.getUTCDay()]} · ${apptT(a)}<br>${esc(a.dept)}</div><button class="ed" data-a="apptEdit" data-id="${a.id}">수정</button></div>`; }).join('');
  if (nx) h += `<div style="text-align:center;margin-bottom:8px"><button class="ed" style="min-height:56px;padding:0 18px;border-radius:28px;background:var(--gl);border:2px solid var(--line);font-weight:800" data-a="apptEdit" data-id="${nx.id}">가장 가까운 일정 수정</button></div>`;
  h += `<div class="sticky-bot"><button class="big" data-a="apptAdd">진료 일정 추가하기</button></div>`;
  if (A.form) {
    const f = A.form;
    h += `<div class="overlay"><div class="pop" style="text-align:left"><h3>${f.id ? '일정 수정' : '진료 일정 추가'}</h3>
    <div class="q" style="margin-top:4px">병원</div><input class="inp" list="hl" data-i="ahosp" value="${esc(f.hosp)}" placeholder="병원 이름"><datalist id="hl">${S.hospitals.map(x => `<option value="${x.name}">`).join('')}</datalist>
    <div class="q">날짜</div><input class="inp" type="date" data-i="adate" value="${f.date}">
    <div class="q">시간</div><button class="inp time ${f.h == null ? 'gray' : ''}" data-a="apptTime" style="font-weight:700">${f.h == null ? '진료 시간' : hm12(f.h, f.min)}</button>
    <div class="q">진료과</div><input class="inp" data-i="adept" value="${esc(f.dept)}" placeholder="진료과">
    <div class="frm"><div class="btns"><button class="cancel" data-a="apptCancel">취소</button><button class="ok" data-a="apptSave">저장</button></div></div></div></div>`;
  }
  if (A.tp) {
    const p = A.tp;
    h += `<div class="overlay" style="z-index:80"><div class="pop"><h3>진료 시간</h3><div style="display:flex;gap:8px"><select class="inp" data-i="tpap"><option ${p.ap === '오전' ? 'selected' : ''}>오전</option><option ${p.ap === '오후' ? 'selected' : ''}>오후</option></select>
    <select class="inp" data-i="tph">${[...Array(12)].map((_, i) => `<option value="${i + 1}" ${p.h === i + 1 ? 'selected' : ''}>${i + 1}시</option>`).join('')}</select>
    <select class="inp" data-i="tpm">${[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => `<option value="${m}" ${p.m === m ? 'selected' : ''}>${pad(m)}분</option>`).join('')}</select></div>
    <button class="big" style="margin-top:14px" data-a="tpOk">확인</button></div></div>`;
  }
  return h;
}
function apptSave() {
  const f = ui.appt.form;
  if (!f.hosp.trim() || !f.date || f.h == null) { toast('병원, 날짜, 시간을 입력해주세요'); return; }
  const edit = !!f.id, o = { id: f.id || S.seq++, hosp: f.hosp.trim(), date: f.date, h: f.h, min: f.min, dept: f.dept.trim() };
  if (edit) S.appts = S.appts.map(a => a.id === f.id ? o : a); else S.appts.push(o);
  save(); ui.appt.form = null; render(); doneOverlay(edit ? '일정 수정이 완료되었습니다' : '진료 일정 등록이 완료되었습니다', 3000);
}

/* ===== 화면: 5 보호자·의료진 연계 ===== */
function vCare() {
  const c = ui.care;
  return `${hdr('보호자 연계 & 의료진 연계')}
  <div class="half"><div class="ttl"><span>등록된 보호자</span><button class="addb" data-a="careAdd"><span style="font-size:26px">👤＋</span>보호자 추가하기</button></div>
   ${c.form ? `<div class="frm"><input class="inp" data-i="crel" value="${esc(c.rel)}" placeholder="환자와의 관계 (예: 아들)"><input class="inp" data-i="cname" value="${esc(c.name)}" placeholder="보호자 이름"><input class="inp" type="tel" data-i="cphone" value="${esc(c.phone)}" placeholder="전화번호">
     <div class="btns"><button class="cancel" data-a="careCancel">취소</button><button class="ok" data-a="careReg">등록</button></div></div>` : ''}
   ${S.guardians.map(g => `<div class="pc"><div class="t">${esc(g.rel)} ${esc(g.name)}님</div><a class="call" href="tel:${esc(g.phone)}">📞 연락하기</a></div>`).join('')}</div>
  <div class="half"><div class="ttl"><span>등록된 병원</span></div>${S.hospitals.map(h => `<div class="pc"><div class="t">${h.name}</div><a class="call" href="tel:${h.tel}">💬 문의하기</a></div>`).join('')}</div>`;
}

/* ===== 화면: 6~8 쑥쑥이 챗봇 ===== */
function vChat() { return `<div class="chat"><div class="hdr"><button class="back" data-a="go" data-s="home" aria-label="뒤로가기">←</button><h1>쑥쑥이</h1></div><div id="chatlist"></div></div>`; }
function pillHTML(m) {
  const names = medNames(m.slot), first = S.meds.find(x => x.slot === m.slot || x.slots.includes(m.slot)) || S.meds[0];
  const ph = first && photos[first.id];
  return `<div class="pill">${ph ? `<img src="${ph}" alt="약 사진">` : pillSVG()}<span class="nm">${esc(names.join(', ') || '약')}</span></div>`;
}
function msgHTML(m) {
  const isU = m.from === 'user', av = isU ? '' : '<div class="av">🪴</div>';
  let body = esc(m.text || '');
  if (m.type === 'dose') body += pillHTML(m) + (m.done ? '' : `<button class="ob" data-a="cDose" data-id="${m.id}" data-v="y">예</button><button class="ob no" data-a="cDose" data-id="${m.id}" data-v="n">아니요</button>`);
  if (m.type === 'meal' && !m.done) body += `<button class="ob" data-a="cMeal" data-id="${m.id}" data-v="n">아직 안 먹었어요</button><button class="ob no" data-a="cMeal" data-id="${m.id}" data-v="y">식사했어요</button>`;
  if (m.type === 'act' && !m.done) body += `<button class="ob act" data-a="cAct" data-id="${m.id}">${m.label}</button>`;
  if (m.type === 'sym' && !m.done) body += `<div class="sym">${SYMS.map(s => `<button data-a="cSym" data-id="${m.id}" data-v="${s[0]}"><span class="e">${s[1]}</span>${s[0]}</button>`).join('')}</div><div class="own"><input id="own${m.id}" placeholder="직접 입력"><button data-a="cSymOwn" data-id="${m.id}">보내기</button></div>`;
  return `<div class="msg ${isU ? 'user' : ''}">${av}<div class="bub">${body}</div></div>`;
}
function renderChatList() { const l = $('#chatlist'); if (!l) return; l.innerHTML = S.chat.map(msgHTML).join(''); $('#phone').scrollTop = $('#phone').scrollHeight; }
function say(from, text, extra) { const m = Object.assign({ id: S.seq++, from, text }, extra || {}); S.chat.push(m); if (S.chat.length > 120) S.chat.shift(); return m; }
const openQ = () => S.chat.some(m => m.type && !m.done);
function askDose(slot, date) {
  date = date || today();
  if (S.chat.some(m => m.type === 'dose' && !m.done && m.slot === slot)) return;
  say('bot', `${slotMed(slot)} 드셨나요?`, { type: 'dose', slot, date });
}
function askSym(p) { S.pending = S.pending.filter(x => x.id !== p.id); say('bot', '약을 복용하신지 30분이 지났습니다. 불편하신 점이 있으신가요?', { type: 'sym', slot: p.slot, date: p.date }); }
function unrecorded() { const L = S.logs[today()] || {}; return S.meds.length ? daySlots().filter(s => L[s] === undefined) : []; }
function slotByTime() { const h = kst().getUTCHours(); return h >= 5 && h < 12 ? '아침' : h >= 12 && h < 18 ? '점심' : h >= 18 && h < 22 ? '저녁' : '잠자기 전'; }
function enterChat() {
  const b = banner; banner = null; drawBanner();
  if (!S.chat.length) say('bot', `안녕하세요? 저는 ${PATIENT.name}님의 건강 길잡이 쑥쑥이라고 해요!`);
  if (b && b.type === 'side') { const p = S.pending.find(x => x.id === b.id); if (p) askSym(p); }
  else if (b && b.type === 'dose') askDose(b.slot);
  else if (!openQ()) {
    const u = unrecorded().filter(s => !S.reask.some(r => r.slot === s && r.date === today()));
    if (u.length) { const asked = S.chat.some(m => m.type === 'dose' && m.date === today()); askDose(!asked && u.includes(slotByTime()) ? slotByTime() : u[0]); }
  }
  save();
}
const findMsg = id => S.chat.find(m => m.id === +id);
function chatAct(a, d) {
  const m = findMsg(d.id); if (!m) return;
  if (a === 'cDose') {
    m.done = true;
    if (d.v === 'y') { say('user', '예'); record(m.date, m.slot, true); say('bot', '잘하셨어요! 약을 드셨군요 😊'); }
    else { say('user', '아니요'); say('bot', '혹시 식사를 안 하셨나요?', { type: 'meal', slot: m.slot, date: m.date }); }
  } else if (a === 'cMeal') {
    m.done = true;
    if (d.v === 'n') say('user', '아직 안 먹었어요'), say('bot', '아, 식사 전이시군요! 빈속에 약을 드시면 속이 쓰릴 수 있어요. 식사를 가볍게 하신 후에 약을 드시는 것이 좋답니다. 식사 후에 약을 드시면 알림을 다시 보내드릴까요?', { type: 'act', kind: 'remind', label: '식사 후 30분 뒤에 다시 알려주기', slot: m.slot, date: m.date });
    else say('user', '식사했어요'), say('bot', '식사를 챙겨 드셨군요! 다행이에요. 그럼 지금 바로 물과 함께 약을 드셔주세요.', { type: 'act', kind: 'taken', label: '약 복용 완료했어요', slot: m.slot, date: m.date });
  } else if (a === 'cAct') {
    m.done = true; say('user', m.label);
    if (m.kind === 'taken') { record(m.date, m.slot, true); say('bot', '잘하셨어요! 복용 기록을 저장했어요 😊'); }
    else { S.reask.push({ id: S.seq++, due: Date.now() + REASK_MS, slot: m.slot, date: m.date }); say('bot', '알겠어요! 식사 후에 다시 여쭤볼게요.'); }
  } else if (a === 'cSym' || a === 'cSymOwn') {
    let v = d.v; if (a === 'cSymOwn') { v = ($('#own' + d.id).value || '').trim(); if (!v) return; }
    m.done = true; say('user', v); say('bot', '이어서 불편한 정도를 점수로 골라 주세요');
    save(); renderChatList(); setTimeout(() => go('side', { score: { slot: m.slot, date: m.date } }), 1500); return;
  }
  save(); renderChatList(); afterRecordLite();
}
function afterRecordLite() { if (grow) { const g = grow; grow = null; showOverlay(`<div class="pop grow"><div>${plantSVG(g.to, 150)}</div><h3>🎉 7일 복약 달성!<br>식물이 ${STN[g.from]}에서 ${STN[g.to]} 단계로 자랐어요!</h3><button class="big" data-a="popClose">확인</button></div>`); } }

/* ===== 화면: 9 부작용 상태 ===== */
function maxScore(k) { const l = S.scores.filter(s => s.date === k); return l.length ? Math.max(...l.map(s => s.score)) : 0; }
function vSide() {
  const Z = ui.side;
  if (Z.view === 'done') return `<div class="done"><div style="font-size:70px">💚</div><p>답해 주셔서 감사합니다</p><p>오늘 상태가 잘 기록되었어요</p></div>`;
  if (Z.view === 'score') {
    const n = Z.score;
    return `<div class="hdr"><button class="back" data-a="go" data-s="home" aria-label="뒤로가기">←</button></div>
    <h1 style="font-size:24px;margin:0 0 6px">약을 드신 지 30분 지났어요.<br>지금 부작용 상태는 어떠세요?</h1><p class="sm" style="margin:0">불편한 정도에 맞는 얼굴을 눌러 주세요</p>
    <div class="faces">${[1, 2, 3, 4, 5].map(i => `<button class="face ${n === i ? 'on' : ''}" style="border-color:${SCORE_COL[i]}" data-a="sScore" data-v="${i}" aria-label="${i}점"><span class="f">${FACES[i]}</span><span class="n" style="color:${SCORE_COL[i]}">${i}</span></button>`).join('')}</div>
    <div class="selrow">${n ? `<span class="f">${FACES[n]}</span><span class="n" style="color:${SCORE_COL[n]}">${n}점</span><span class="d">${SCORE_DESC[n]}</span>` : '<span class="d gray">얼굴을 눌러 주세요</span>'}</div>
    <div class="ends"><span>1 증상 없음</span><span>5 증상 매우 심함</span></div>
    ${n >= 4 ? `<div class="q" style="margin-top:0">어떤 증상인가요?</div><div class="chips">${KINDS.map(k => `<button class="chip ${Z.kind === k ? 'on' : ''}" data-a="sKind" data-v="${k}">${k}</button>`).join('')}</div><input class="inp" data-i="smemo" value="${esc(Z.memo)}" placeholder="메모 (선택)"><div class="notice">증상이 계속되면 의료진과 상담하세요</div>` : ''}
    <div class="sticky-bot"><button class="big ${n ? '' : 'dis'}" data-a="sDone">선택 완료</button></div>`;
  }
  const [y, m] = Z.m.split('-').map(Number), pre = Z.m;
  const wk = [...Array(7)].map((_, i) => addD(today(), -i)), hi = wk.some(k => maxScore(k) >= 4);
  const cells = monthCells(Z.m).map(k => {
    if (!k) return '<div class="cell e"></div>';
    const sc = maxScore(k), tk = k === today() ? 'tb' : '', L = S.logs[k] || {}, took = Object.values(L).some(v => v === true);
    const day = +k.slice(8);
    if (sc) return `<button class="cell sc ${sc === 3 ? 'sc3' : ''} ${tk}" style="background:${SCORE_COL[sc]}" data-a="sPick" data-k="${k}"><span>${day}</span><span class="big2">${sc}</span></button>`;
    return `<button class="cell off ${tk}" data-a="sPick" data-k="${k}"><span>${day}</span>${took ? '<span class="big2" style="color:var(--tx)">-</span>' : ''}</button>`;
  }).join('');
  const mon = S.scores.filter(s => s.date.startsWith(Z.m)), avg = mon.length ? (mon.reduce((a, s) => a + s.score, 0) / mon.length).toFixed(1) : '-', hi4 = mon.filter(s => s.score >= 4).length;
  const cnt = {}; mon.forEach(s => { if (s.symptom) cnt[s.symptom] = (cnt[s.symptom] || 0) + 1; }); const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '없음';
  let det = '';
  if (Z.sel) { const l = S.scores.filter(s => s.date === Z.sel); det = `<div class="stitle">${md(Z.sel)} 기록</div>` + (l.length ? l.map(s => `<div class="rec"><b>${s.time}</b> · ${esc(s.meds.join(', ') || '약')}<br>${FACES[s.score]} <b style="color:${SCORE_COL[s.score]}">${s.score}점</b>${s.symptom ? ' · ' + esc(s.symptom) : ''}${s.memo ? `<br><span class="sm">메모: ${esc(s.memo)}</span>` : ''}</div>`).join('') : '<p class="sm">기록이 없어요</p>'); }
  return `<div class="hdr"><button class="back" data-a="go" data-s="home" aria-label="뒤로가기">←</button><h1>부작용 상태 기록</h1></div>
  <div class="plantrow"><div class="pb">${plantSVG(curStage(), 96)}</div><div class="bubble">${hi ? '4점 이상이 있었어요, 상태를 꼭 확인해 주세요' : '이번 주 컨디션은 괜찮았어요'}</div></div>
  ${mnav('side', Z.m)}<div class="cal">${calHead()}${cells}</div>${det}
  <div class="stat"><div>이번 달 평균<b>${avg}</b></div><div>4점 이상<b>${hi4}회</b></div><div>가장 많은 증상<b>${top}</b></div></div>
  <button class="big orange" data-a="sRecord">오늘 부작용 기록하기</button>`;
}
function sDone() {
  const Z = ui.side, n = Z.score; if (!n) return;
  const slot = Z.slot, t = today();
  S.scores.push({ id: S.seq++, date: t, time: nowLabel(), slot, meds: slot ? medNames(slot) : S.meds.map(m => m.name), score: n, symptom: n >= 4 ? Z.kind : '', memo: n >= 4 ? Z.memo : '' });
  if (n >= 3) {
    S.guardians.forEach(g => S.gAlerts.push({ date: t, score: n, g: { rel: g.rel, name: g.name, phone: g.phone } }));
    const todays = S.scores.filter(s => s.date === t && s.score >= 3);
    if (todays.length >= 3) S.hospitals.forEach(h => {
      S.dAlerts = S.dAlerts.filter(a => !(a.date === t && a.h.id === h.id));
      S.dAlerts.push({ date: t, h: { id: h.id, name: h.name, tel: h.tel } });
    });
  }
  save(); Z.view = 'done'; render(); setTimeout(() => { if (cur === 'side' && ui.side.view === 'done') go('home'); }, 2500);
}

/* ===== 화면: 10 내 식물 ===== */
function vPlant() {
  const c = ui.plant.c == null ? curCycle() : ui.plant.c, info = cycleInfo(c), isCur = c === curCycle(), t = today();
  const dots = info.days.map(k => { const s = dayStatus(k); return `<div><div class="dot ${s} ${k === t ? 'today' : ''}">${s === 'O' ? '✓' : s === 'X' ? '×' : ''}</div>${md2(k)}</div>`; }).join('');
  return `<div class="hdr"><button class="back" data-a="go" data-s="home" aria-label="뒤로가기">←</button><h1>내 식물</h1></div>
  ${wkNav('plant', c, `<b style="font-size:21px">${isCur ? '이번 주' : (c + 1) + '주차'} 복약 달성률</b><div class="sm">${c + 1}주차 · ${md2(info.days[0])}~${md2(info.days[6])} (7일 단위로 한 달 진행)</div>`)}
  <div class="bigno">${info.o}/7일</div><div class="pct">${info.pct}%</div><div class="bar"><i style="width:${info.pct}%"></i></div>
  <div class="dots">${dots}</div>
  <button class="plantbox" data-a="go" data-s="log" aria-label="복약 기록으로">${plantSVG(curStage(), 240)}</button>
  <p class="stage">현재 단계: ${STE[curStage()]}</p>
  <p class="center" style="font-size:21px;font-weight:800;color:var(--gd)">${curStage() === 'flower' ? '꽃이 활짝 피었어요! 계속 잘 유지해 주세요' : `다음 성장까지 ${leftDays()}일 남았어요!`}</p>`;
}

/* ===== 화면: 11 복약 기록 ===== */
function vLog() {
  const cc = curCycle(), cur_ = cycleInfo(cc), c = ui.log.c == null ? cc : ui.log.c, info = cycleInfo(c), isCur = c === cc, t = today(), st = startKey(), end = addD(st, 30);
  const anyRec = cur_.days.some(k => S.logs[k] && Object.keys(S.logs[k]).length);
  const msg = cur_.o === 7 ? '대단하세요! 이번 주 약을 모두 드셨어요' : cur_.x > 0 ? '괜찮아요, 오늘부터 다시 챙겨 드세요' : !anyRec ? '오늘 약을 드셨나요?' : '꾸준히 복약하고 계시네요!';
  const cells = monthCells(ui.log.m).map(k => {
    if (!k) return '<div class="cell e"></div>';
    const s = dayStatus(k), can = k >= st && k <= end;
    return `<button class="cell ${s} ${k === t ? 'tb' : ''} ${can ? '' : 'off'}" ${can ? `data-a="logDay" data-k="${k}"` : 'disabled'}><span>${+k.slice(8)}</span>${s ? `<small>${s}</small>` : ''}</button>`;
  }).join('');
  return `<div class="hdr"><button class="back" data-a="go" data-s="home" aria-label="뒤로가기">←</button><h1>복약 기록</h1></div>
  <div class="plantrow"><div class="pb">${plantSVG(curStage(), 96)}</div><div class="bubble">${msg}</div></div>
  <p class="hint">${curStage() === 'flower' ? '꽃이 활짝 피었어요' : `${leftDays()}일 더 드시면 식물이 자라요`} · ${STE[curStage()]}</p>
  ${mnav('log', ui.log.m)}<div class="cal">${calHead()}${cells}</div>
  <p class="sm center">날짜를 누르면 약을 먹었는지 기록할 수 있어요</p><hr>
  ${wkNav('log', c, `<b style="font-size:20px">${isCur ? '이번 주기' : (c + 1) + '주차'} 복약 달성률</b><div class="sm">${c + 1}주차 · ${md2(info.days[0])}~${md2(info.days[6])}</div>`)}
  <div class="ach" style="margin-top:10px"><div class="circp">${plantSVG(curStage(), 56)}</div><div class="l"><div class="bar"><i style="width:${info.pct}%"></i></div><div style="text-align:right;font-weight:900">${info.pct}%</div></div>
  <div class="r"><div>복용완료<br>${info.o}일</div><div>미복용<br>${info.x}일</div></div></div>`;
}
function logPopup(k) {
  const L = S.logs[k] || {};
  showOverlay(`<div class="pop"><h3>${md(k)} 약을 드셨나요?</h3>${daySlots().map(s => `<div class="rowp"><b>${slotLabel(s)}</b>${L[s] === undefined ? `<button class="btn2 btn-yes" data-a="logRec" data-k="${k}" data-s="${esc(s)}" data-v="1">예, 먹었어요</button><button class="btn2 btn-no" data-a="logRec" data-k="${k}" data-s="${esc(s)}" data-v="0">아니요, 안 먹었어요</button>` : `<div class="ox ${L[s] ? 'O' : 'X'}">${L[s] ? 'O 먹었어요' : 'X 안 먹었어요'}</div>`}</div>`).join('')}<button class="btn-close" data-a="popClose">닫기</button></div>`);
}

/* ===== 화면: 12 등록된 약물 ===== */
function vMy() {
  if (ui.md) {
    const m = S.meds.find(x => x.id === ui.md); if (!m) { ui.md = null; return vMy(); }
    const s = medStats(m), d = m.info, ph = photos[m.id], end = addD(m.start, m.days - 1);
    return `<div class="hdr"><button class="back" data-a="mdBack" aria-label="뒤로가기">←</button><h1>${esc(m.name)}</h1></div>
    <div class="center" style="margin-bottom:8px"><div class="mc" style="display:block;text-align:center"><div class="ic" style="width:120px;height:120px;margin:0 auto">${ph ? `<img src="${ph}" alt="약 사진">` : '💊'}</div></div></div>
    <div class="card">${[['약물명', esc(m.name)], ['복용량', fmt(m.dose) + '정'], ['하루 복용 횟수', m.times + '번'], ['복용 기간', m.days + '일'], ['전체 처방량', fmt(s.total) + '정'], ['현재까지 복용한 양', fmt(s.taken) + '정'], ['남은 약 개수', fmt(s.left) + '정'], ['복용률', s.pct + '%'], ['복용 시작일', md(m.start)], ['복용 종료 예정일', md(end)]].map(r => `<div class="kv"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}</div>
    <div class="sec"><h4>💡 용도 및 효능</h4>${d ? d.use : '약사나 의사에게 확인해 주세요'}</div>
    <div class="sec"><h4>💧 올바른 복용 방법</h4>${d ? d.how : '처방받은 대로 드세요'}</div>
    <div class="sec w"><h4>⚠️ 특별 주의사항</h4>${d ? d.warn : '약사나 의사에게 확인해 주세요'}</div>
    <div class="sec w"><h4>🩺 예상되는 주요 부작용</h4>${d ? d.side : '불편하면 의료진과 상담하세요'}</div>`;
  }
  return `${hdr('나의 등록된 약물')}` + (S.meds.length ? S.meds.map(m => {
    const s = medStats(m), ph = photos[m.id];
    return `<button class="mc" data-a="mdOpen" data-id="${m.id}"><div class="ic">${ph ? `<img src="${ph}" alt="약 사진">` : '💊'}</div><div class="main"><div class="nm">${esc(m.name)}</div><div class="pr">복용 ${fmt(s.taken)}정 / 전체 ${fmt(s.total)}정</div><div class="bar" style="margin:6px 0"><i style="width:${s.pct}%"></i></div><div class="rt">복용률 ${s.pct}%</div><div class="rem">${fmt(s.left)}정 남음</div><div class="ok">처방대로 잘 복용하고 있어요</div></div></button>`;
  }).join('') : `<p class="empty">등록된 약물이 없어요</p>`);
}

/* ===== 하단 탭 ===== */
function drawTabs() {
  const t = $('#tabs'), on = TABS.includes(cur); t.hidden = !on; if (!on) return;
  t.innerHTML = `<button class="${cur === 'log' ? 'on' : ''}" data-a="go" data-s="log"><span class="e">📅</span>복약 기록</button>
  <button class="${cur === 'plant' ? 'on' : ''}" data-a="go" data-s="plant">${plantSVG(curStage(), 34)}내 식물</button>
  <button class="${cur === 'side' ? 'on' : ''}" data-a="go" data-s="side"><span class="e">🩺</span>부작용 상태</button>`;
}

/* ===== 보호자용 / 의료진용 화면 ===== */
function drawPanels() {
  $('#guardBody').innerHTML = S.gAlerts.length ? S.gAlerts.slice().reverse().map(a => `<div class="item">${PATIENT.name}님의 부작용이 3점 이상(${a.score}점)으로 기록되었어요 (${md(a.date)})<br><span class="sm">받는 보호자: ${esc(a.g.rel)} ${esc(a.g.name)} · ${esc(a.g.phone)}</span></div>`).join('') : '<div class="item">받은 알림이 없어요</div>';
  $('#docBody').innerHTML = S.dAlerts.length ? S.dAlerts.slice().reverse().map(a => `<div class="item"><b>3점 이상 누적 3회 이상으로 알람이 왔어요</b><br>이름: ${PATIENT.name} · 나이: ${PATIENT.age}세<br>복용약: ${esc(S.meds.map(m => m.name).join(', ') || '-')}<br>점수 이력: ${S.scores.slice(-10).map(s => `${md2(s.date)} ${s.score}점`).join(', ')}<br><span class="sm">받는 병원: ${esc(a.h.name)} · ${esc(a.h.tel)}</span></div>`).join('') : '<div class="item">받은 알림이 없어요</div>';
}

/* ===== 렌더 ===== */
const V = { home: vHome, med: vMed, hosp: vHosp, appt: vAppt, care: vCare, chat: vChat, side: vSide, plant: vPlant, log: vLog, mymeds: vMy };
function render() {
  const a = $('#app'); a.innerHTML = V[cur]();
  if (cur === 'chat') renderChatList();
  if (cur === 'med' && !ui.rx) refreshMed();
  drawTabs(); drawPanels();
}

/* ===== 알림 (앱 화면 맨 위) ===== */
let banner = null, bnKey = '';
function drawBanner() {
  const el = $('#banner'), key = banner ? banner.type + banner.id + banner.slot : '';
  if (key === bnKey) return; bnKey = key;
  if (!banner) { el.hidden = true; el.innerHTML = ''; return; }
  const txt = banner.type === 'side' ? '약을 복용하신지 30분이 지났습니다. 불편하신 점이 있으신가요?' : banner.type === 'dose' ? `${slotMed(banner.slot)} 드실 시간이에요. 약 드셨나요?` : `내일 ${esc(banner.hosp)} 진료가 있어요`;
  el.innerHTML = `<button class="bm" data-a="bnOpen">${banner.type === 'appt' ? '🏥' : '🪴'} <b>쑥쑥이</b><br>${txt}</button><button class="bx" data-a="bnClose" aria-label="알림 닫기">✕</button>`;
  el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}
function eligibleSlot() {
  if (!S.meds.length) return null;
  const t = today(), L = S.logs[t] || {}, sh = S.shown[t] || {};
  return daySlots().find(s => L[s] === undefined && !sh[s] && nowMin() >= slotMin(s) && S.meds.some(m => m.slots.includes(s) && m.regAt <= toD(t).getTime() + slotMin(s) * 60000 - 9 * 3600e3)) || null;
}
function markShown(s) { const t = today(); S.shown[t] = S.shown[t] || {}; S.shown[t][s] = true; save(); }
function valid(b) {
  if (b.type === 'side') return S.pending.some(p => p.id === b.id && !p.dismissed);
  if (b.type === 'dose') return (S.logs[today()] || {})[b.slot] === undefined;
  return true;
}
function tick() {
  const now = Date.now(), dueSide = S.pending.filter(p => p.due <= now && !p.dismissed), dueRe = S.reask.filter(r => r.due <= now);
  if (cur === 'chat') {
    let ch = false;
    dueSide.forEach(p => { askSym(p); ch = true; });
    dueRe.forEach(r => { S.reask = S.reask.filter(x => x.id !== r.id); askDose(r.slot, r.date); ch = true; });
    const s = eligibleSlot(); if (s) { markShown(s); askDose(s); ch = true; }
    if (ch) { save(); renderChatList(); }
    banner = null; drawBanner(); return;
  }
  if (banner && (!valid(banner) || (banner.type === 'side' && cur === 'side'))) banner = null;
  if (!banner) {
    if (dueSide.length) { if (cur !== 'side') banner = { type: 'side', id: dueSide[0].id, slot: '' }; }
    else if (dueRe.length) { const r = dueRe[0]; S.reask = S.reask.filter(x => x.id !== r.id); save(); if ((S.logs[r.date] || {})[r.slot] === undefined) banner = { type: 'dose', id: 'r' + r.id, slot: r.slot }; }
    else {
      const s = eligibleSlot();
      if (s) { markShown(s); banner = { type: 'dose', id: 'd', slot: s }; }
      else {
        const t = today(), tm = addD(t, 1); S.shown[t] = S.shown[t] || {};
        const a = S.appts.find(x => x.date === tm && !S.shown[t]['a' + x.id]);
        if (a && cur !== 'appt') { S.shown[t]['a' + a.id] = true; save(); banner = { type: 'appt', id: a.id, slot: '', hosp: a.hosp }; }
      }
    }
  }
  drawBanner();
}

/* ===== 이벤트 ===== */
const H = {
  go: d => go(d.s),
  mon: d => { const k = d.w === 'appt' ? ui.appt : d.w === 'side' ? ui.side : ui.log; k.m = shiftM(k.m, +d.d); render(); },
  wk: d => { const o = d.w === 'plant' ? ui.plant : ui.log, c = (o.c == null ? curCycle() : o.c) + +d.d; if (c < 0 || c > 4) return; o.c = c; render(); },
  shoot: () => $('#fileMed').click(),
  rxpick: () => $('#fileRx').click(),
  setDose: d => { ui.med.dose = +d.v; render(); },
  setTimes: d => { if (d.v === 'c') { ui.med.timesCustom = true; } else { ui.med.timesCustom = false; ui.med.times = +d.v; } render(); },
  toggleSlot: d => { const a = ui.med.slots, i = a.indexOf(d.v); i < 0 ? a.push(d.v) : a.splice(i, 1); render(); },
  toggleCustom: () => { ui.med.customOn = !ui.med.customOn; if (!ui.med.customOn) ui.med.customTime = ''; render(); },
  setDays: d => { if (d.v === 'c') { ui.med.daysCustom = true; } else { ui.med.daysCustom = false; ui.med.days = +d.v; } render(); },
  regMed,
  rxToggle: d => { const it = ui.rx.items[d.i]; it.on = !it.on; render(); },
  rxInfo: d => { const it = ui.rx.items[d.i]; it.info = !it.info; render(); },
  rxEdit: d => { const it = ui.rx.items[d.i]; it.edit = !it.edit; render(); },
  rxEditOk: d => { const it = ui.rx.items[d.i], v = ($('[data-i=rxname][data-n="' + d.i + '"]').value || '').trim(); if (v) { if (lookupDrug(v)) { it.name = lookupDrug(v).name; it.edit = false; } else { it.matched = false; it.cand = DRUGS.map(x => x.name).slice(0, 3); it.name = v; it.edit = false; } } render(); },
  rxCand: d => { const it = ui.rx.items[d.i]; it.name = d.v; it.matched = true; it.on = true; render(); },
  rxOwn: d => { const it = ui.rx.items[d.i], v = ($('[data-i=rxown][data-n="' + d.i + '"]').value || '').trim(), dr = lookupDrug(v); if (dr) { it.name = dr.name; it.matched = true; it.on = true; render(); } else toast('공식 약 정보에서 찾지 못했어요. 후보를 눌러주세요'); },
  rxReg: () => {
    const l = ui.rx.items.filter(i => i.matched && i.on); if (!l.length) return;
    const first = !S.meds.length;
    l.forEach(i => { const sl = { 1: ['아침'], 2: ['아침', '저녁'], 3: ['아침', '점심', '저녁'], 4: ['아침', '점심', '저녁', '잠자기 전'] }[i.times] || ['아침']; makeMed({ name: i.name, dose: i.dose, times: i.times, slots: sl, days: i.days }); });
    save(); ui.rx = null; doneOverlay('약물 등록이 완료되었습니다', 1500, () => go('home'));
  },
  hospSel: d => { ui.hosp.sel = d.id; $('#hres').innerHTML = hospResHTML(); $('#hbtn').classList.remove('dis'); },
  hospReg: () => {
    const h = HOSPS.find(x => x.id === ui.hosp.sel); if (!h) return;
    if (!S.hospitals.some(x => x.id === h.id)) S.hospitals.push(h); save();
    toast(`${h.name}이 등록되었습니다`); ui.hosp.sel = null; $('#hreg').innerHTML = hospRegHTML(); $('#hres').innerHTML = hospResHTML(); $('#hbtn').classList.add('dis');
  },
  hospDel: d => { S.hospitals = S.hospitals.filter(h => h.id !== d.id); save(); $('#hreg').innerHTML = hospRegHTML(); },
  apptAdd: () => { ui.appt.form = { id: null, hosp: S.hospitals[0] ? S.hospitals[0].name : '', date: today(), h: null, min: 0, dept: '' }; render(); },
  apptEdit: d => { const a = S.appts.find(x => x.id === +d.id); ui.appt.form = Object.assign({}, a); render(); },
  apptCancel: () => { ui.appt.form = null; render(); },
  apptTime: () => { const f = ui.appt.form; ui.appt.tp = { ap: f.h == null ? '오후' : f.h < 12 ? '오전' : '오후', h: f.h == null ? 2 : (f.h % 12 || 12), m: f.min || 0 }; render(); },
  tpOk: () => { const p = ui.appt.tp, f = ui.appt.form; f.h = (p.h % 12) + (p.ap === '오후' ? 12 : 0); f.min = p.m; ui.appt.tp = null; render(); },
  apptSave,
  careAdd: () => { ui.care.form = true; render(); },
  careCancel: () => { ui.care = { form: false, rel: '', name: '', phone: '' }; render(); },
  careReg: () => {
    const c = ui.care; if (!c.rel.trim() || !c.name.trim() || !c.phone.trim()) { toast('관계, 이름, 전화번호를 모두 입력해주세요'); return; }
    const g = { id: S.seq++, rel: c.rel.trim(), name: c.name.trim(), phone: c.phone.trim() };
    ui.care = { form: false, rel: '', name: '', phone: '' }; render();
    doneOverlay('보호자 등록이 완료되었습니다', 3000, () => { S.guardians.push(g); save(); if (cur === 'care') render(); });
  },
  cDose: d => chatAct('cDose', d), cMeal: d => chatAct('cMeal', d), cAct: d => chatAct('cAct', d), cSym: d => chatAct('cSym', d), cSymOwn: d => chatAct('cSymOwn', d),
  sScore: d => { ui.side.score = +d.v; render(); },
  sKind: d => { ui.side.kind = d.v; render(); },
  sDone,
  sPick: d => { ui.side.sel = d.k; render(); },
  sRecord: () => { ui.side.view = 'score'; ui.side.slot = null; ui.side.score = 0; ui.side.kind = ''; ui.side.memo = ''; render(); },
  logDay: d => logPopup(d.k),
  logRec: d => { hideOverlay(); record(d.k, d.s, d.v === '1'); afterRecord(); },
  popClose: hideOverlay,
  mdOpen: d => { ui.md = +d.id; render(); $('#phone').scrollTop = 0; },
  mdBack: () => { ui.md = null; render(); },
  bnOpen: () => {
    const b = banner; if (!b) return;
    if (b.type === 'appt') { banner = null; drawBanner(); go('appt'); } else go('chat');
  },
  bnClose: () => { const b = banner; if (b && b.type === 'side') { const p = S.pending.find(x => x.id === b.id); if (p) p.dismissed = true; save(); } banner = null; drawBanner(); setTimeout(tick, 50); },
  aDose: () => {
    if (!S.meds.length) return toast('등록된 약물이 없어요');
    const u = unrecorded(); if (!u.length) return toast('기록하지 않은 시간대가 없어요');
    if (cur === 'chat') { askDose(u[0]); save(); renderChatList(); } else { banner = { type: 'dose', id: 'adm', slot: u[0] }; drawBanner(); }
  },
  aLogs: () => { S.logs = {}; S.pending = []; S.reask = []; S.shown = {}; S.scores = []; S.gAlerts = []; S.dAlerts = []; S.chat.forEach(m => { if (m.type) m.done = true; }); save(); banner = null; bnKey = '?'; drawBanner(); ui.plant.c = null; ui.log.c = null; render(); toast('복약기록을 처음 상태로 되돌렸어요'); },
  aAll: () => { if (!confirm('모든 내용을 지울까요?')) return; try { localStorage.removeItem(KEY); } catch (e) { } S = def(); Object.keys(photos).forEach(k => delete photos[k]); banner = null; bnKey = '?'; drawBanner(); hideOverlay(); go('home'); }
};
document.addEventListener('click', e => { const t = e.target.closest('[data-a]'); if (!t || t.disabled) return; const f = H[t.dataset.a]; if (f) f(t.dataset, t); });
document.addEventListener('input', e => {
  const t = e.target, i = t.dataset.i; if (!i) return;
  const v = t.value;
  if (i === 'name') ui.med.name = v;
  else if (i === 'times') ui.med.times = Math.max(0, +v || 0);
  else if (i === 'days') ui.med.days = Math.max(0, +v || 0);
  else if (i === 'ctime') ui.med.customTime = v;
  if (['name', 'times', 'days', 'ctime'].includes(i)) refreshMed();
  else if (i === 'hq') { ui.hosp.q = v; $('#hres').innerHTML = hospResHTML(); }
  else if (i === 'ahosp') ui.appt.form.hosp = v;
  else if (i === 'adate') ui.appt.form.date = v;
  else if (i === 'adept') ui.appt.form.dept = v;
  else if (i === 'tpap') ui.appt.tp.ap = v;
  else if (i === 'tph') ui.appt.tp.h = +v;
  else if (i === 'tpm') ui.appt.tp.m = +v;
  else if (i === 'crel') ui.care.rel = v;
  else if (i === 'cname') ui.care.name = v;
  else if (i === 'cphone') ui.care.phone = v;
  else if (i === 'smemo') ui.side.memo = v;
});
$('#fileMed').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return; const r = new FileReader();
  r.onload = () => { ui.med.photo = r.result; render(); }; r.readAsDataURL(f); e.target.value = '';
});
$('#fileRx').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return; e.target.value = '';
  ui.rx = { loading: true, items: [] }; render();
  recognizePrescription(f).then(items => { ui.rx = { loading: false, items: items.map(i => Object.assign({ on: i.matched, info: false, edit: false }, i)) }; if (cur === 'med') render(); });
});

/* ===== 시작 ===== */
render(); tick(); setInterval(tick, 1000);

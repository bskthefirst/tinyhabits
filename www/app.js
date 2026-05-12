const $ = id => document.getElementById(id);
const DAY_NAMES = ['S','M','T','W','T','F','S'];

let habits = [];
let archived = [];
let settings = {};
let selectedColor = '#41B3A3';
let editingIdx = null;
let showingArchive = false;
let customDays = new Set();
let targetCount = 1;

// ===== Utilities =====
function localDateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function load() {
  try {
    habits = JSON.parse(localStorage.getItem('tinyhabits') || '[]');
    archived = JSON.parse(localStorage.getItem('tinyhabits_archived') || '[]');
    settings = JSON.parse(localStorage.getItem('tinyhabits_settings') || '{}');
  } catch(e) {
    habits = []; archived = []; settings = {};
  }
  applyTheme();
  if (!settings.seenOnboarding) showOnboarding();
  initAmbient();
}

function save() {
  localStorage.setItem('tinyhabits', JSON.stringify(habits));
  localStorage.setItem('tinyhabits_archived', JSON.stringify(archived));
  localStorage.setItem('tinyhabits_settings', JSON.stringify(settings));
  render();
}

function applyTheme() {
  if (settings.darkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
    $('themeMeta').setAttribute('content', '#1a1a1a');
  } else {
    document.documentElement.removeAttribute('data-theme');
    $('themeMeta').setAttribute('content', '#F8F6F3');
  }
}

function playSound(type) {
  if (settings.soundEnabled === false) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'check') {
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'complete') {
      [523, 659, 784].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = f;
        g.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.2);
        o.start(ctx.currentTime + i * 0.08);
        o.stop(ctx.currentTime + i * 0.08 + 0.2);
      });
    } else if (type === 'pop') {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(); osc.stop(ctx.currentTime + 0.08);
    }
  } catch(e) {}
}

function haptic(pattern = 6) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function springOpen(el) {
  el.classList.add('open');
  const content = el.querySelector('.modal-content');
  if (content) {
    content.animate([
      { transform: 'translateY(40px) scale(0.96)', opacity: 0 },
      { transform: 'translateY(0) scale(1)', opacity: 1 }
    ], { duration: 450, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  }
}

function isActiveDay(habit) {
  const freq = habit.freq || 'daily';
  if (freq === 'daily') return true;
  const day = new Date().getDay();
  if (freq === 'weekdays') return day >= 1 && day <= 5;
  if (freq === 'weekends') return day === 0 || day === 6;
  if (freq === 'custom' && habit.customDays) return habit.customDays.includes(day);
  return true;
}

function getStreak(habit) {
  let streak = 0;
  const log = habit.log || {};
  const target = habit.target || 1;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = localDateStr(d);
    const day = d.getDay();
    let shouldBeActive = false;
    const freq = habit.freq || 'daily';
    if (freq === 'daily') shouldBeActive = true;
    else if (freq === 'weekdays') shouldBeActive = day >= 1 && day <= 5;
    else if (freq === 'weekends') shouldBeActive = day === 0 || day === 6;
    else if (freq === 'custom' && habit.customDays) shouldBeActive = habit.customDays.includes(day);
    if (!shouldBeActive) continue;
    if ((log[ds] || 0) >= target) streak++;
    else break;
  }
  return streak;
}

function getBestStreak(habit) {
  let best = 0, current = 0;
  const log = habit.log || {};
  const target = habit.target || 1;
  for (let i = 365; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = localDateStr(d);
    const day = d.getDay();
    let shouldBeActive = false;
    const freq = habit.freq || 'daily';
    if (freq === 'daily') shouldBeActive = true;
    else if (freq === 'weekdays') shouldBeActive = day >= 1 && day <= 5;
    else if (freq === 'weekends') shouldBeActive = day === 0 || day === 6;
    else if (freq === 'custom' && habit.customDays) shouldBeActive = habit.customDays.includes(day);
    if (!shouldBeActive) continue;
    if ((log[ds] || 0) >= target) { current++; best = Math.max(best, current); }
    else current = 0;
  }
  return best;
}

function getTotalDone(habit) {
  const target = habit.target || 1;
  return Object.values(habit.log || {}).filter(v => v >= target).length;
}

function getCompletionRate(habit) {
  const log = habit.log || {};
  const target = habit.target || 1;
  const entries = Object.entries(log);
  if (!entries.length) return 0;
  const done = entries.filter(([,v]) => v >= target).length;
  return Math.round((done / entries.length) * 100);
}

function getWeekLog(habit) {
  const days = [];
  for (let i = 20; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = localDateStr(d);
    const dayName = DAY_NAMES[d.getDay()];
    const count = (habit.log || {})[ds] || 0;
    days.push({ date: ds, day: dayName, done: count >= (habit.target || 1) });
  }
  return days;
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ===== Ambient Canvas =====
function initAmbient() {
  const canvas = $('ambient');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, orbs = [];
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  for (let i = 0; i < 6; i++) {
    orbs.push({
      x: Math.random() * w, y: Math.random() * h,
      r: 60 + Math.random() * 120,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      color: `hsla(${160 + Math.random() * 60}, 60%, ${settings.darkMode ? 35 : 70}%, 0.08)`
    });
  }
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, w, h);
    orbs.forEach(o => {
      o.x += o.vx; o.y += o.vy;
      if (o.x < -o.r) o.x = w + o.r;
      if (o.x > w + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = h + o.r;
      if (o.y > h + o.r) o.y = -o.r;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, o.color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
    });
    frame++;
    if (frame % 2 === 0) requestAnimationFrame(draw);
    else requestAnimationFrame(draw);
  }
  draw();
}

// ===== Confetti =====
function fireConfetti() {
  if (settings.confettiEnabled === false) return;
  const canvas = $('confetti');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = [];
  const colors = ['#E8A87C','#85CDCA','#C38D9E','#41B3A3','#E27D60','#659DBD','#8FBC8F','#D4A574'];
  for (let i = 0; i < 100; i++) {
    particles.push({
      x: canvas.width / 2, y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 1) * 16 - 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 7 + 3,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      life: 1
    });
  }
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      if (p.life <= 0) return;
      alive = true;
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.35;
      p.vx *= 0.99;
      p.life -= 0.012;
      p.rotation += p.rotSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.roundRect(-p.size/2, -p.size/2, p.size, p.size, 2);
      ctx.fill();
      ctx.restore();
    });
    if (alive && frame < 150) { frame++; requestAnimationFrame(draw); }
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

// ===== Render =====
function render() {
  const list = $('habitsList');
  const empty = $('emptyState');
  const dateEl = $('date');
  const data = showingArchive ? archived : habits;

  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  dateEl.textContent = new Date().toLocaleDateString('en-US', opts);

  $('archiveToggle').textContent = showingArchive ? 'Active' : 'Archive';
  $('habitCount').textContent = `${data.length} habit${data.length !== 1 ? 's' : ''}`;

  if (!data.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    empty.querySelector('p').textContent = showingArchive ? 'No archived habits' : 'No habits yet';
    empty.querySelector('small').textContent = showingArchive ? 'Archive habits from their stats page' : 'Add your first tiny habit below';
    $('progressCircle').style.strokeDashoffset = 264;
    $('progressPercent').textContent = '0%';
    return;
  }

  empty.style.display = 'none';

  if (!showingArchive) {
    const todayStr = localDateStr();
    const activeHabits = habits.filter(h => isActiveDay(h));
    const doneToday = activeHabits.filter(h => (h.log || {})[todayStr] >= (h.target || 1)).length;
    const pct = activeHabits.length ? Math.round((doneToday / activeHabits.length) * 100) : 0;
    const offset = 264 - (264 * pct / 100);
    $('progressCircle').style.strokeDashoffset = offset;
    $('progressPercent').textContent = pct + '%';
    $('progressRing').classList.toggle('complete', pct === 100 && activeHabits.length > 0);
  } else {
    $('progressCircle').style.strokeDashoffset = 264;
    $('progressPercent').textContent = '--';
    $('progressRing').classList.remove('complete');
  }

  list.innerHTML = data.map((h, i) => {
    const todayStr = localDateStr();
    const isDone = !showingArchive && (h.log || {})[todayStr] >= (h.target || 1);
    const streak = getStreak(h);
    const streakText = streak > 1 ? `\u{1F525} ${streak} day streak` : streak === 1 ? '1 day streak' : '';
    const freqLabel = h.freq === 'weekdays' ? 'Mon-Fri' : h.freq === 'weekends' ? 'Sat-Sun' : h.freq === 'custom' ? 'Custom' : 'Daily';
    return `
      <div class="habit-card ${isDone ? 'done' : ''} ${showingArchive ? 'archived' : ''}" data-idx="${i}" style="--habit-color:${h.color}">
        ${!showingArchive ? `<div class="drag-handle" draggable="true">\u2630</div>` : ''}
        <div class="checkbox" onclick="toggleHabit(${i})">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="habit-info" onclick="showStats(${i})">
          <div class="habit-name">${esc(h.name)}</div>
          <div class="habit-meta">
            <div class="habit-streak ${streak > 2 ? 'hot' : ''}">${streakText}</div>
            <div class="habit-target">${freqLabel}${h.target > 1 ? ' \u00b7 ' + ((h.log || {})[todayStr] || 0) + '/' + h.target : ''}</div>
          </div>
        </div>
        ${showingArchive
          ? `<button class="delete-btn" onclick="unarchiveHabit(${i},event)">\u21bb</button>`
          : `<button class="delete-btn" onclick="deleteHabit(${i},event)">&times;</button>`
        }
      </div>
    `;
  }).join('');
}

let lastAllDone = false;
function toggleHabit(i) {
  if (showingArchive) return;
  const d = localDateStr();
  const h = habits[i];
  if (!h) return;
  if (!isActiveDay(h)) return;
  h.log = h.log || {};
  const target = h.target || 1;
  if ((h.log[d] || 0) >= target) {
    h.log[d] = 0;
    haptic(4);
  } else {
    h.log[d] = (h.log[d] || 0) + 1;
    if (h.log[d] >= target) {
      playSound('check');
      haptic([10, 30, 10]);
      const card = document.querySelector(`.habit-card[data-idx="${i}"]`);
      if (card) {
        card.classList.add('just-did');
        card.animate([
          { transform: 'scale(1)' },
          { transform: 'scale(1.04)' },
          { transform: 'scale(1)' }
        ], { duration: 350, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        setTimeout(() => card.classList.remove('just-did'), 400);
      }
    }
  }
  save();

  const todayStr = localDateStr();
  const activeHabits = habits.filter(h => isActiveDay(h));
  const doneToday = activeHabits.filter(h => (h.log || {})[todayStr] >= (h.target || 1)).length;
  const allDone = activeHabits.length > 0 && doneToday === activeHabits.length;
  if (allDone && !lastAllDone) {
    setTimeout(() => { playSound('complete'); fireConfetti(); haptic([20, 50, 20, 50, 20]); }, 300);
  }
  lastAllDone = allDone;
}

function deleteHabit(i, e) {
  e.stopPropagation();
  if (showingArchive) return;
  if (confirm('Archive this habit? You can restore it later.')) {
    archived.push(habits[i]);
    habits.splice(i, 1);
    save();
  }
}

function unarchiveHabit(i, e) {
  e.stopPropagation();
  habits.push(archived[i]);
  archived.splice(i, 1);
  save();
}

function showStats(i) {
  const data = showingArchive ? archived : habits;
  const h = data[i];
  if (!h) return;
  const streak = getStreak(h);
  const week = getWeekLog(h);
  const total = getTotalDone(h);
  const best = getBestStreak(h);
  const rate = getCompletionRate(h);

  $('statsTitle').textContent = h.name;
  $('streakCount').textContent = streak;
  $('totalDone').textContent = total;
  $('bestStreak').textContent = best;
  $('completionRate').textContent = rate + '%';

  $('weekGrid').innerHTML = week.slice(-7).map(d => `
    <div class="day-dot ${d.done ? 'done' : ''}">${d.day}</div>
  `).join('');

  $('calendarGrid').innerHTML = week.map(d => {
    const isToday = d.date === localDateStr();
    return `<div class="cal-day ${d.done ? 'done' : ''} ${isToday ? 'today' : ''}">${parseInt(d.date.split('-')[2])}</div>`;
  }).join('');

  const tips = [
    "Small steps every day.", "Consistency beats intensity.",
    "You're building something great.", "One day at a time.",
    "Keep the chain going!", "Progress, not perfection."
  ];
  $('statsTip').textContent = tips[Math.floor(Math.random() * tips.length)];

  $('archiveHabitBtn').textContent = showingArchive ? 'Restore' : 'Archive';
  $('archiveHabitBtn').onclick = () => {
    if (showingArchive) unarchiveHabit(i, { stopPropagation(){} });
    else deleteHabit(i, { stopPropagation(){} });
    $('statsModal').classList.remove('open');
  };
  $('editHabitBtn').onclick = () => {
    if (showingArchive) return;
    $('statsModal').classList.remove('open');
    openEdit(i);
  };
  $('editHabitBtn').style.display = showingArchive ? 'none' : 'block';

  springOpen($('statsModal'));
}

function openEdit(i) {
  editingIdx = i;
  const h = habits[i];
  $('modalTitle').textContent = 'Edit Habit';
  $('habitName').value = h.name;
  selectedColor = h.color || '#41B3A3';
  targetCount = h.target || 1;
  $('targetValue').textContent = targetCount;
  document.querySelectorAll('.color').forEach(b => {
    b.classList.toggle('active', b.dataset.color === selectedColor);
  });
  $('habitFreq').value = h.freq || 'daily';
  customDays = new Set(h.customDays || []);
  updateCustomDays();
  springOpen($('modal'));
  setTimeout(() => $('habitName').focus(), 100);
}

function openAdd() {
  editingIdx = null;
  $('modalTitle').textContent = 'New Habit';
  $('habitName').value = '';
  selectedColor = '#41B3A3';
  targetCount = 1;
  $('targetValue').textContent = '1';
  $('habitFreq').value = 'daily';
  customDays = new Set();
  updateCustomDays();
  document.querySelectorAll('.color').forEach(b => {
    b.classList.toggle('active', b.dataset.color === selectedColor);
  });
  springOpen($('modal'));
  setTimeout(() => $('habitName').focus(), 100);
}

function updateCustomDays() {
  const show = $('habitFreq').value === 'custom';
  $('customDaysGroup').style.display = show ? 'block' : 'none';
  document.querySelectorAll('.day-toggle').forEach(b => {
    b.classList.toggle('active', customDays.has(parseInt(b.dataset.day)));
  });
}

function saveHabit() {
  const name = $('habitName').value.trim();
  if (!name) return;
  const freq = $('habitFreq').value;
  const payload = {
    name, color: selectedColor, freq, target: targetCount,
    log: {}, created: Date.now()
  };
  if (freq === 'custom') payload.customDays = Array.from(customDays);
  if (editingIdx !== null) {
    payload.log = habits[editingIdx].log || {};
    payload.created = habits[editingIdx].created;
    habits[editingIdx] = payload;
  } else {
    habits.push(payload);
  }
  save();
  $('modal').classList.remove('open');
}

// ===== Settings =====
function openSettings() {
  $('darkToggle').checked = !!settings.darkMode;
  $('soundToggle').checked = settings.soundEnabled !== false;
  $('confettiToggle').checked = settings.confettiEnabled !== false;
  springOpen($('settingsModal'));
}

$('darkToggle').onchange = () => {
  settings.darkMode = $('darkToggle').checked;
  applyTheme();
  saveSettingsOnly();
};

$('soundToggle').onchange = () => {
  settings.soundEnabled = $('soundToggle').checked;
  saveSettingsOnly();
};

$('confettiToggle').onchange = () => {
  settings.confettiEnabled = $('confettiToggle').checked;
  saveSettingsOnly();
};

function saveSettingsOnly() {
  localStorage.setItem('tinyhabits_settings', JSON.stringify(settings));
}

$('exportBtn').onclick = () => {
  const data = { habits, archived, settings, exported: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tinyhabits-backup.json';
  a.click();
  URL.revokeObjectURL(url);
};

$('clearBtn').onclick = () => {
  if (confirm('Delete ALL data? This cannot be undone.')) {
    localStorage.removeItem('tinyhabits');
    localStorage.removeItem('tinyhabits_archived');
    localStorage.removeItem('tinyhabits_settings');
    habits = []; archived = []; settings = {};
    applyTheme();
    render();
    $('settingsModal').classList.remove('open');
  }
};

// ===== Onboarding =====
function showOnboarding() {
  $('step1').classList.remove('hidden');
  $('step2').classList.add('hidden');
  springOpen($('onboardingModal'));
}

function nextOnboarding() {
  playSound('pop');
  $('step1').classList.add('hidden');
  $('step2').classList.remove('hidden');
}

function finishOnboarding() {
  playSound('pop');
  settings.seenOnboarding = true;
  saveSettingsOnly();
  $('onboardingModal').classList.remove('open');
}

// ===== Events =====
$('addBtn').onclick = openAdd;
$('cancelBtn').onclick = () => $('modal').classList.remove('open');
$('cancelBtn2').onclick = () => $('modal').classList.remove('open');
$('closeStats').onclick = () => $('statsModal').classList.remove('open');
$('closeSettings').onclick = () => $('settingsModal').classList.remove('open');
$('settingsBtn').onclick = openSettings;
$('saveBtn').onclick = saveHabit;
$('habitName').onkeypress = e => { if (e.key === 'Enter') saveHabit(); };

$('archiveToggle').onclick = () => {
  showingArchive = !showingArchive;
  render();
};

$('targetUp').onclick = () => { targetCount = Math.min(10, targetCount + 1); $('targetValue').textContent = targetCount; playSound('pop'); };
$('targetDown').onclick = () => { targetCount = Math.max(1, targetCount - 1); $('targetValue').textContent = targetCount; playSound('pop'); };

$('habitFreq').onchange = updateCustomDays;

document.querySelectorAll('.day-toggle').forEach(btn => {
  btn.onclick = () => {
    const day = parseInt(btn.dataset.day);
    if (customDays.has(day)) customDays.delete(day);
    else customDays.add(day);
    updateCustomDays();
    playSound('pop');
  };
});

document.querySelectorAll('.color').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.color').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedColor = btn.dataset.color;
    playSound('pop');
  };
});

document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.onclick = () => el.closest('.modal').classList.remove('open');
});

// ===== Drag & Drop =====
let dragSrc = null;
document.addEventListener('dragstart', e => {
  if (e.target.classList.contains('drag-handle')) {
    dragSrc = e.target.closest('.habit-card');
    e.target.closest('.habit-card').setAttribute('draggable', 'true');
    e.dataTransfer.effectAllowed = 'move';
  }
});
document.addEventListener('dragover', e => {
  if (!dragSrc) return;
  e.preventDefault();
  const card = e.target.closest('.habit-card');
  if (card && card !== dragSrc) {
    const list = $('habitsList');
    const children = [...list.children];
    const srcIdx = children.indexOf(dragSrc);
    const tgtIdx = children.indexOf(card);
    if (srcIdx < tgtIdx) list.insertBefore(dragSrc, card.nextSibling);
    else list.insertBefore(dragSrc, card);
  }
});
document.addEventListener('dragend', () => {
  if (!dragSrc) return;
  const newOrder = [...document.querySelectorAll('.habit-card')].map(c => parseInt(c.dataset.idx));
  habits = newOrder.map(i => habits[i]);
  dragSrc = null;
  save();
});

// Touch drag
let touchDrag = null;
document.addEventListener('touchstart', e => {
  const handle = e.target.closest('.drag-handle');
  if (!handle) return;
  touchDrag = handle.closest('.habit-card');
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (!touchDrag) return;
  const touch = e.touches[0];
  const card = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.habit-card');
  if (card && card !== touchDrag) {
    const list = $('habitsList');
    const children = [...list.children];
    const srcIdx = children.indexOf(touchDrag);
    const tgtIdx = children.indexOf(card);
    if (srcIdx < tgtIdx) list.insertBefore(touchDrag, card.nextSibling);
    else list.insertBefore(touchDrag, card);
  }
}, { passive: true });

document.addEventListener('touchend', () => {
  if (!touchDrag) return;
  const newOrder = [...document.querySelectorAll('.habit-card')].map(c => parseInt(c.dataset.idx));
  habits = newOrder.map(i => habits[i]);
  touchDrag = null;
  save();
});

// ===== Init =====
load();
render();

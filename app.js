const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().split('T')[0];

let habits = JSON.parse(localStorage.getItem('tinyhabits') || '[]');
let selectedColor = '#41B3A3';

function save() {
  localStorage.setItem('tinyhabits', JSON.stringify(habits));
  render();
}

function getStreak(habit) {
  let streak = 0;
  const dates = Object.keys(habit.log).sort().reverse();
  for (const d of dates) {
    if (habit.log[d]) streak++;
    else break;
  }
  // If not done today, check if yesterday was done
  if (!habit.log[today()]) {
    const yesterday = new Date(Date.now() - 864e5).toISOString().split('T')[0];
    if (!habit.log[yesterday]) streak = 0;
  }
  return streak;
}

function getWeekLog(habit) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().split('T')[0];
    const dayName = ['S','M','T','W','T','F','S'][new Date(d).getDay()];
    days.push({ date: d, day: dayName, done: !!habit.log[d] });
  }
  return days;
}

function render() {
  const list = $('habitsList');
  const empty = $('emptyState');
  const dateEl = $('date');
  
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  dateEl.textContent = new Date().toLocaleDateString('en-US', opts);
  
  if (!habits.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    $('progressCircle').style.strokeDashoffset = 264;
    $('progressPercent').textContent = '0%';
    return;
  }
  
  empty.style.display = 'none';
  
  const todayStr = today();
  const doneToday = habits.filter(h => h.log[todayStr]).length;
  const pct = Math.round((doneToday / habits.length) * 100);
  const offset = 264 - (264 * pct / 100);
  $('progressCircle').style.strokeDashoffset = offset;
  $('progressPercent').textContent = pct + '%';
  
  list.innerHTML = habits.map((h, i) => {
    const isDone = !!h.log[todayStr];
    const streak = getStreak(h);
    const streakText = streak > 1 ? `\u{1F525} ${streak} day streak` : streak === 1 ? '1 day streak' : '';
    return `
      <div class="habit-card ${isDone ? 'done' : ''}" data-idx="${i}" style="--habit-color:${h.color}">
        <div class="checkbox" onclick="toggleHabit(${i})">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="habit-info" onclick="showStats(${i})">
          <div class="habit-name">${esc(h.name)}</div>
          <div class="habit-streak ${streak > 2 ? 'hot' : ''}">${streakText}</div>
        </div>
        <button class="delete-btn" onclick="deleteHabit(${i},event)">&times;</button>
      </div>
    `;
  }).join('');
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function toggleHabit(i) {
  const d = today();
  habits[i].log[d] = !habits[i].log[d];
  save();
  const card = document.querySelector(`.habit-card[data-idx="${i}"]`);
  if (card && habits[i].log[d]) card.classList.add('just-did');
}

function deleteHabit(i, e) {
  e.stopPropagation();
  if (confirm('Delete this habit?')) {
    habits.splice(i, 1);
    save();
  }
}

function showStats(i) {
  const h = habits[i];
  const streak = getStreak(h);
  const week = getWeekLog(h);
  
  $('statsTitle').textContent = h.name;
  $('streakCount').textContent = streak;
  
  $('weekGrid').innerHTML = week.map(d => `
    <div class="day-dot ${d.done ? 'done' : ''}">${d.day}</div>
  `).join('');
  
  const tips = [
    "Small steps every day.",
    "Consistency beats intensity.",
    "You're building something great.",
    "One day at a time.",
    "Keep the chain going!"
  ];
  $('statsTip').textContent = tips[Math.floor(Math.random() * tips.length)];
  
  $('statsModal').classList.add('open');
}

// Modal handling
$('addBtn').onclick = () => {
  $('modal').classList.add('open');
  $('habitName').value = '';
  $('habitName').focus();
};

$('cancelBtn').onclick = () => $('modal').classList.remove('open');
$('closeStats').onclick = () => $('statsModal').classList.remove('open');

$('saveBtn').onclick = () => {
  const name = $('habitName').value.trim();
  if (!name) return;
  habits.push({
    name,
    color: selectedColor,
    log: {},
    created: Date.now()
  });
  save();
  $('modal').classList.remove('open');
};

$('habitName').onkeypress = e => {
  if (e.key === 'Enter') $('saveBtn').click();
};

// Color picker
document.querySelectorAll('.color').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.color').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedColor = btn.dataset.color;
  };
});

// Close modals on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.onclick = () => el.closest('.modal').classList.remove('open');
});

// Init
render();

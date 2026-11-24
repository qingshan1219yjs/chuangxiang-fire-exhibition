import { artworks, artworkByBoard, artworkLabel } from '/artworks.js?v=5';

const $ = id => document.getElementById(id);
const notice = $('admin-message');
const toggle = $('toggle-voting');
const reload = $('reload');
const older = $('older');
const passwordForm = $('admin-password-form');
const passwordInput = $('admin-password');
const unlock = $('admin-unlock');
const formatDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium', hour12: false,
});
let currentState;
let nextCursor;
let busy = false;

function row(values) {
  const tr = document.createElement('tr');
  for (const value of values) {
    const td = document.createElement('td');
    td.textContent = value;
    tr.append(td);
  }
  return tr;
}

function refreshState(open) {
  currentState = open;
  const status = $('voting-state');
  status.textContent = open ? '投票进行中' : '投票已关闭';
  status.dataset.open = String(open);
  toggle.textContent = open ? '关闭投票' : '开放投票';
}

function setBusy(next) {
  busy = next;
  for (const button of [toggle, reload, older, unlock]) button.disabled = next;
}

function showAccess(response, data) {
  $('sign-in').hidden = response.status !== 401;
  passwordForm.hidden = !data.passwordRequired;
  if (response.status !== 401 && response.status !== 403) return;
  $('dashboard').hidden = true;
  $('results').replaceChildren();
  $('records').replaceChildren();
}

async function load(cursor) {
  if (busy) return;
  setBusy(true);
  notice.textContent = cursor ? '正在加载更早记录…' : '正在加载统计…';
  try {
    const response = await fetch(`/api/admin/statistics${cursor ? `?before=${cursor}` : ''}`, { cache: 'no-store' });
    const data = await response.json();
    showAccess(response, data);
    if (!response.ok) throw new Error(data.error || '加载失败。');
    refreshState(data.open);
    $('ballot-count').textContent = data.counts.ballots;
    $('student-count').textContent = data.counts.studentIds;
    $('selection-count').textContent = data.counts.selections;
    const counts = new Map(data.totals.map(item => [item.artwork, item.votes]));
    const sorted = [...artworks].sort((left, right) => (counts.get(right.id) || 0) - (counts.get(left.id) || 0) || left.id - right.id);
    $('results').replaceChildren(...sorted.map(art => {
      const tr = row([artworkLabel(art), art.title, counts.get(art.id) || 0]);
      tr.lastElementChild.className = 'tally';
      return tr;
    }));

    const records = data.records.map(ballot => row([
      ballot.id,
      formatDate.format(new Date(ballot.submittedAt)),
      ballot.studentId,
      ballot.choices.map(id => artworkLabel(artworkByBoard.get(id))).join('、'),
    ]));
    if (!cursor) $('records').replaceChildren();
    if (!cursor && !records.length) {
      const empty = row(['目前还没有投票记录。']);
      empty.firstElementChild.colSpan = 4;
      records.push(empty);
    }
    $('records').append(...records);
    nextCursor = data.next;
    older.hidden = !nextCursor;
    $('dashboard').hidden = false;
    notice.textContent = '';
  } catch (error) {
    notice.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

passwordForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  notice.textContent = '正在验证密码…';
  let verified = false;
  try {
    const response = await fetch('/api/admin/unlock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: passwordInput.value }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) showAccess(response, result);
      throw new Error(result.error || '密码验证失败。');
    }
    verified = true;
  } catch (error) {
    notice.textContent = error.message;
  } finally {
    passwordForm.reset();
    setBusy(false);
  }
  if (verified) await load();
  else if (!passwordForm.hidden) passwordInput.focus();
});

toggle.addEventListener('click', async () => {
  if (busy) return;
  if (currentState && !window.confirm('关闭后将暂停收票。确定关闭投票？')) return;
  setBusy(true);
  try {
    const response = await fetch('/api/admin/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ open: !currentState }),
    });
    const result = await response.json();
    if (!response.ok) {
      showAccess(response, result);
      throw new Error(result.error || '状态更新失败。');
    }
    refreshState(result.open);
    notice.textContent = result.open ? '已开放投票。' : '已关闭投票。展厅仍可浏览。';
  } catch (error) {
    notice.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

reload.addEventListener('click', () => load());
older.addEventListener('click', () => load(nextCursor));
load();

import { artworks, artworkByBoard, artworkLabel, artworkNumber, votesPerStudent } from '/artworks.js?v=5';
import { mountFeaturedCarousel } from '/featured-carousel.js?v=5';

const $ = id => document.getElementById(id);
const selected = new Set();
const cards = new Map();
const gallery = $('works');
const artDialog = $('art-dialog');
const ballotDialog = $('ballot-dialog');
const ballotForm = $('ballot-form');
const submitButton = $('submit-ballot');
const image = $('art-image');
const stage = $('art-stage');
const panels = $('art-panels');
let activeArtwork = 0;
let votingOpen = false;
let statusLoaded = false;
let ballotId = '';
let pending = false;
let toastTimer;

function flash(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function button(className, label, click) {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', click);
  return node;
}

for (const [index, art] of artworks.entries()) {
  const number = artworkLabel(art);
  const card = element('article', 'work');
  const view = button('work-image', '', () => openArtwork(index));
  view.setAttribute('aria-label', `查看 ${number} 号作品《${art.title}》大图`);
  const previews = element('span', 'art-previews');
  for (const board of art.boards) {
    const thumb = element('img');
    thumb.src = `/art/thumb-${artworkNumber(board)}.webp?v=2`;
    thumb.alt = '';
    thumb.loading = index < 4 ? 'eager' : 'lazy';
    thumb.decoding = 'async';
    previews.append(thumb);
  }
  const previewIcon = element('span', 'work-preview-icon', '↗');
  previewIcon.setAttribute('aria-hidden', 'true');
  view.append(previews, previewIcon);

  const info = element('div', 'work-info');
  const pick = button('button secondary work-select', '加入选票', () => toggleArtwork(art.id));
  info.append(
    element('p', 'work-meta', `${number} / ${art.type}`),
    element('h3', '', art.title),
    element('p', 'work-author', art.author),
    pick,
  );
  card.append(view, info);
  cards.set(art.id, { card, pick });
  gallery.append(card);
}

const filters = $('filters');
for (const type of ['全部', ...new Set(artworks.map(art => art.type))]) {
  const control = button('filter', type, () => {
    for (const filter of filters.children) filter.setAttribute('aria-pressed', String(filter === control));
    let visible = 0;
    for (const art of artworks) {
      const hide = type !== '全部' && art.type !== type;
      cards.get(art.id).card.hidden = hide;
      if (!hide) visible += 1;
    }
    $('gallery-count').textContent = `${visible} 件作品`;
  });
  control.setAttribute('aria-pressed', String(type === '全部'));
  filters.append(control);
}

function refreshSelection() {
  const full = selected.size >= votesPerStudent;
  for (const art of artworks) {
    const { card, pick } = cards.get(art.id);
    const checked = selected.has(art.id);
    card.dataset.selected = String(checked);
    pick.disabled = !votingOpen || (full && !checked);
    pick.textContent = checked ? '✓ 已加入' : '加入选票';
    pick.setAttribute('aria-pressed', String(checked));
    pick.setAttribute('aria-label', `${checked ? '移除' : '选择'}《${art.title}》`);
  }

  const art = artworks[activeArtwork];
  const checked = selected.has(art.id);
  $('select-art').textContent = checked ? '移出选票' : full ? `已选满 ${votesPerStudent} 件` : '加入选票';
  $('select-art').setAttribute('aria-pressed', String(checked));
  $('select-art').disabled = !votingOpen || (full && !checked);
  $('review-ballot').disabled = !votingOpen || !selected.size;
  $('selected-count').textContent = `已选 ${selected.size} / ${votesPerStudent} 件`;
  $('dock-note').textContent = votingOpen ? '每个学号仅可提交一次' : (statusLoaded ? '投票当前已关闭' : '正在获取投票状态');
}

function toggleArtwork(id) {
  if (!votingOpen || pending) return;
  if (selected.has(id)) selected.delete(id);
  else if (selected.size < votesPerStudent) selected.add(id);
  else return;
  ballotId = '';
  refreshSelection();
}

function resetZoom() {
  stage.classList.remove('zoomed');
  $('zoom-art').setAttribute('aria-pressed', 'false');
  $('zoom-art').textContent = '放大';
  stage.scrollTo(0, 0);
}

function displayBoard(art, board) {
  const number = artworkNumber(board);
  image.alt = `《${art.title}》完整展板 ${number}`;
  image.src = `/art/board-${number}.webp`;
  for (const panel of panels.children) panel.setAttribute('aria-pressed', String(Number(panel.dataset.board) === board));
  resetZoom();
}

function openArtwork(index) {
  const art = artworks[index];
  if (!art) return;
  activeArtwork = index;
  $('art-title').textContent = art.title;
  $('art-meta').textContent = `${artworkLabel(art)} · ${art.author} · ${art.type}`;
  panels.replaceChildren();
  panels.hidden = art.boards.length === 1;
  if (!panels.hidden) {
    for (const board of art.boards) {
      const panel = button('button secondary art-panel', `展板 ${artworkNumber(board)}`, () => displayBoard(art, board));
      panel.dataset.board = String(board);
      panels.append(panel);
    }
  }
  displayBoard(art, art.boards[0]);
  $('prev-art').disabled = index === 0;
  $('next-art').disabled = index === artworks.length - 1;
  refreshSelection();
  if (!artDialog.open) artDialog.showModal();
}

for (const close of document.querySelectorAll('[data-close]')) {
  close.addEventListener('click', () => close.closest('dialog').close());
}
$('prev-art').addEventListener('click', () => openArtwork(activeArtwork - 1));
$('next-art').addEventListener('click', () => openArtwork(activeArtwork + 1));
mountFeaturedCarousel(openArtwork);
$('select-art').addEventListener('click', () => toggleArtwork(artworks[activeArtwork].id));
$('zoom-art').addEventListener('click', () => {
  if (stage.classList.contains('zoomed')) return resetZoom();
  stage.classList.add('zoomed');
  $('zoom-art').setAttribute('aria-pressed', 'true');
  $('zoom-art').textContent = '适应屏幕';
  stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
});
artDialog.addEventListener('keydown', event => {
  if (stage.classList.contains('zoomed')) return;
  if (event.key === 'ArrowLeft') openArtwork(activeArtwork - 1);
  if (event.key === 'ArrowRight') openArtwork(activeArtwork + 1);
});

function showBallot() {
  const list = $('ballot-list');
  list.replaceChildren();
  for (const id of selected) {
    const art = artworkByBoard.get(id);
    const item = element('li');
    const remove = button('', '移除', () => {
      toggleArtwork(id);
      if (selected.size) showBallot();
      else ballotDialog.close();
    });
    remove.setAttribute('aria-label', `从选票移除《${art.title}》`);
    item.append(element('span', '', `${artworkLabel(art)} · ${art.title}`), remove);
    list.append(item);
  }
}

$('review-ballot').addEventListener('click', () => {
  showBallot();
  $('ballot-error').hidden = true;
  ballotForm.hidden = false;
  $('ballot-success').hidden = true;
  ballotDialog.showModal();
});
$('student-id').addEventListener('input', () => { if (!pending) ballotId = ''; });
ballotDialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });

ballotForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (pending || !selected.size) return;
  pending = true;
  submitButton.disabled = true;
  submitButton.textContent = '正在提交…';
  for (const control of ballotDialog.querySelectorAll('button, input')) control.disabled = true;
  const errorBox = $('ballot-error');
  errorBox.hidden = true;
  try {
    if (!ballotId) ballotId = crypto.randomUUID();
    const response = await fetch('/api/ballot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ballotId, studentId: $('student-id').value, choices: [...selected] }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.closed) {
        votingOpen = false;
        refreshSelection();
        submitButton.hidden = true;
      }
      throw new Error(result.error || '提交失败，请重试。');
    }
    selected.clear();
    ballotId = '';
    ballotForm.reset();
    ballotForm.hidden = true;
    $('ballot-success').hidden = false;
    refreshSelection();
  } catch (error) {
    errorBox.textContent = error instanceof TypeError ? '网络连接失败，请重试。' : error.message;
    errorBox.hidden = false;
  } finally {
    pending = false;
    for (const control of ballotDialog.querySelectorAll('button, input')) control.disabled = false;
    submitButton.textContent = '提交选票';
    if (!$('ballot-success').hidden) $('ballot-success').querySelector('button').focus();
  }
});

$('share-link').addEventListener('click', async () => {
  const link = new URL('/', location.href).href;
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(link);
    flash('展厅链接已复制');
  } catch {
    window.prompt('复制展厅链接', link);
  }
});

refreshSelection();
fetch('/api/status', { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error('Status unavailable');
    return response.json();
  })
  .then(status => {
    statusLoaded = true;
    votingOpen = status.open === true;
    refreshSelection();
  })
  .catch(() => { $('dock-note').textContent = '无法获取投票状态，请刷新页面'; });

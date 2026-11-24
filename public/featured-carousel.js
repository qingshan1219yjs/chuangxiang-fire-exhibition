import { artworks, artworkLabel, artworkNumber } from '/artworks.js?v=5';

const slideDelay = 2000;

export function mountFeaturedCarousel(openArtwork) {
  const carousel = document.getElementById('featured-carousel');
  const slide = document.getElementById('featured-art');
  const previews = document.getElementById('featured-previews');
  const title = document.getElementById('featured-title');
  const position = document.getElementById('featured-position');
  const toggle = document.getElementById('featured-toggle');
  const announce = document.getElementById('featured-status');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  document.getElementById('featured-total').textContent = artworks.length;
  let current = 0;
  let requested = current;
  let requestVersion = 0;
  let playing = !motion.matches;
  let onScreen = !('IntersectionObserver' in window);
  let hovering = false;
  let timer;

  function canAdvance() {
    return playing && onScreen && !hovering && !document.hidden &&
      !carousel.querySelector(':focus-visible:not(#featured-toggle)') && !document.querySelector('dialog[open]');
  }

  function schedule() {
    clearTimeout(timer);
    if (!canAdvance()) return;
    timer = setTimeout(() => {
      if (canAdvance()) move(1);
    }, slideDelay);
  }

  async function move(step, manual = false) {
    clearTimeout(timer);
    requested = (requested + step + artworks.length) % artworks.length;
    const version = ++requestVersion;
    const index = requested;
    const artwork = artworks[index];
    const next = artwork.boards.map(board => {
      const image = new Image();
      image.alt = '';
      image.src = board === 2 ? '/art/feature-02.webp' : `/art/thumb-${artworkNumber(board)}.webp?v=2`;
      return image;
    });
    try {
      await Promise.all(next.map(image => image.decode()));
      if (version !== requestVersion) return;
      current = index;
      previews.replaceChildren(...next);
      title.textContent = artwork.title;
      position.textContent = artworkNumber(index + 1);
      slide.setAttribute('aria-label', `查看 ${artworkLabel(artwork)} 号作品《${artwork.title}》大图`);
      if (manual) announce.textContent = `第 ${index + 1} 件，共 ${artworks.length} 件。${artwork.title}`;
      if (!motion.matches) previews.animate?.([{ opacity: .76 }, { opacity: 1 }], { duration: 200 });
    } catch {
      if (version !== requestVersion) return;
      requested = current;
      if (manual) announce.textContent = '封面加载失败，请重试。';
    } finally {
      if (version === requestVersion) schedule();
    }
  }

  function setPlaying(next) {
    playing = next;
    const label = playing ? '暂停自动轮播' : '开始自动轮播';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.dataset.playing = String(playing);
    schedule();
  }

  slide.addEventListener('click', () => openArtwork(current));
  document.getElementById('featured-prev').addEventListener('click', () => move(-1, true));
  document.getElementById('featured-next').addEventListener('click', () => move(1, true));
  toggle.addEventListener('click', () => setPlaying(!playing));
  carousel.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1, true);
  });
  carousel.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse') return;
    hovering = true;
    schedule();
  });
  carousel.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'mouse') return;
    hovering = false;
    schedule();
  });
  carousel.addEventListener('focusin', schedule);
  carousel.addEventListener('focusout', () => queueMicrotask(schedule));
  document.addEventListener('visibilitychange', schedule);
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', schedule);
  motion.addEventListener?.('change', event => { if (event.matches) setPlaying(false); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      schedule();
    }, { threshold: .2 }).observe(carousel);
  }

  setPlaying(playing);
  document.getElementById('featured-controls').hidden = false;
}

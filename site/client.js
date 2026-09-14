const fold = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const search = document.querySelector('#search');
search?.addEventListener('input', () => {
  const query = fold(search.value), cards = [...document.querySelectorAll('[data-search]')];
  for (const card of cards) card.hidden = !fold(card.dataset.search).includes(query);
  const count = cards.filter(c => !c.hidden).length;
  document.querySelector('#search-status').textContent = query ? `${count} ${count === 1 ? 'landmark' : 'landmarks'} found${count ? '.' : '. Try another name.'}` : '';
});
document.querySelector('#load-preview')?.addEventListener('click', async event => {
  const button = event.currentTarget, status = document.querySelector('#preview-status');
  button.disabled = true; status.textContent = 'Loading the interactive preview…';
  try {
    const { preview } = await import('./preview.js');
    await preview(document.querySelector('#viewer'), JSON.parse(document.querySelector('#preview-data').textContent));
    button.remove(); document.querySelector('#light-control').hidden = false;
    status.textContent = 'Drag to orbit · Scroll to zoom';
  } catch {
    button.disabled = false; status.textContent = 'The 3D preview could not load. You can retry or download the model.';
  }
});

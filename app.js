/* AIxMarketing: client rendering for the existing static editorial site.
   The public build is the publication boundary; these checks also keep raw
   draft data out of a remotely served source checkout. */
const state = {
  data: null, issues: [], interview: null, products: [], preview: false,
  latest: null, category: 'all', query: ''
};
const $ = (selector, root = document) => root.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const siteBase = new URL(document.baseURI);
const sitePath = path => new URL(path, siteBase).pathname;
const articleHref = story => sitePath('articles/' + encodeURIComponent(story.slug || story.id) + '/');
const issueHref = issue => sitePath('issues/' + encodeURIComponent(issue.id) + '/');
const interviewHref = interview => sitePath('special/' + encodeURIComponent(interview.slug) + '/');

function safeURL(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch { return null; }
}
function dateLabel(value, precision = 'day') {
  if (!value) return 'Дата уточняется';
  const options = precision === 'month'
    ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
    : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat('ru-RU', options).format(new Date(value + 'T12:00:00Z'));
}
function periodLabel(issue) {
  return dateLabel(issue.period_start) + ' — ' + dateLabel(issue.period_end);
}
function categoryById(id) {
  const category = state.data.categories.find(item => item.id === id) || {
    id, name: 'Материалы', short: 'Материалы', number: '—'
  };
  return id === 'cases' ? { ...category, name: 'Кейсы и аналитика', short: 'Кейсы и аналитика' } : category;
}
function topicLabel(topic) {
  return { cjm: 'Customer Journey', marketing: 'Практика маркетинга', legal: 'Рынок и право' }[topic] || '';
}
function regionLabel(region) {
  return { russia: 'Россия', global: 'Международный рынок', eu_uk: 'ЕС и Великобритания', apac: 'АТР' }[region] || region || '';
}
function materialCount(count) {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return count + ' материалов';
  const last = count % 10;
  return count + ' ' + (last === 1 ? 'материал' : last >= 2 && last <= 4 ? 'материала' : 'материалов');
}
function formatLabel(format) {
  return {
    news: 'Новость', research: 'Исследование', case: 'Кейс',
    practice: 'Практика', deep_dive: 'Аналитика',
    anti_case: 'Антикейс', interview: 'Интервью'
  }[format] || '';
}
function storyCategory(story) { return categoryById(story.category || story.topic); }
function storySummary(story) { return story.summary || story.deck || ''; }
function storyDate(story) { return story.date_published || story.event_date || null; }
function isApprovedStory(story) {
  return story.source_level !== 'private_interview' && story.content_format !== 'interview' &&
    story.status === 'approved' &&
    story.verification_status === 'verified' &&
    (!Object.hasOwn(story, 'approved_for_publication') || story.approved_for_publication === true) &&
    (!Object.hasOwn(story, 'publication_status') || story.publication_status === 'published');
}
function isApprovedInterview(interview, issues) {
  if (!interview) return false;
  return interview.consent_confirmed === true &&
    interview.final_text_approved_by_interviewee === true &&
    interview.approved_for_publication === true &&
    interview.publication_status === 'published' &&
    interview.verification_status === 'verified' &&
    interview.factcheck_status === 'verified' &&
    Boolean(interview.published_at) &&
    issues.some(issue => issue.id === interview.issue_id && issue.publication_status === 'published' && issue.approved_for_publication === true);
}
function isApprovedProduct(product) {
  return product.approved_for_publication === true && product.catalog_status === 'approved' &&
    product.publication_status === 'published';
}
function activeIssueStories(issue) {
  if (!issue) return [];
  const byId = new Map(state.data.stories.map(story => [story.id, story]));
  return (issue.story_ids || []).map(id => byId.get(id)).filter(Boolean);
}
function currentRoute() {
  const pathname = location.pathname;
  if (!pathname.startsWith(siteBase.pathname)) return '';
  try { return decodeURIComponent(pathname.slice(siteBase.pathname.length)).replace(/^\/+|\/+$/g, ''); }
  catch { return ''; }
}
function homeHref() { return sitePath(''); }
function listingHref() {
  const params = new URLSearchParams();
  if (state.category !== 'all') params.set('category', state.category);
  if (state.query.trim()) params.set('q', state.query.trim());
  return homeHref() + (params.size ? '?' + params.toString() : '') + '#stories';
}
function tagsHTML(tags = []) {
  return tags.map(tag => '<span class="tag">' + escapeHTML(tag) + '</span>').join('');
}
function draftWarning(kind = 'Материал') {
  return state.preview
    ? '<div class="article-warning"><strong>Закрытый редакционный просмотр.</strong> ' +
      escapeHTML(kind) + ' проходит финальное редакционное утверждение.</div>'
    : '';
}
function sourceLinks(story) {
  const sourceLinks = Array.isArray(story.source_links) && story.source_links.length
    ? story.source_links
    : (story.source_url ? [{ label: story.source_name || 'Источник', url: story.source_url }] : []);
  const links = sourceLinks.map(item => {
    const href = safeURL(item.url);
    return href ? '<li><a href="' + escapeHTML(href) +
      '" target="_blank" rel="noopener noreferrer">' +
      escapeHTML(item.label || new URL(href).hostname) + ' ↗</a></li>' :
      (story.content_format === 'interview' && item.label
        ? '<li>' + escapeHTML(item.label) + '</li>' : '');
  }).filter(Boolean).join('');
  return links
    ? '<section class="article-source"><h2>Источники</h2><ul>' + links + '</ul></section>'
    : '<section class="article-source"><h2>Источники</h2><p>Ссылка на первоисточник пока не подтверждена.</p></section>';
}
function storyCard(story) {
  const category = storyCategory(story);
  const href = articleHref(story);
  const meta = [category.short, formatLabel(story.content_format), topicLabel(story.topic)]
    .filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' / ');
  const status = state.preview && !isApprovedStory(story)
    ? '<span><span class="status-dot" aria-hidden="true"></span>РЕДАКЦИОННЫЙ ЧЕРНОВИК</span>'
    : '<span>ЧИТАТЬ МАТЕРИАЛ</span>';
  return '<article class="story-card"><a class="story-click" href="' + escapeHTML(href) +
    '" aria-label="Открыть материал: ' + escapeHTML(story.title) + '">' +
    '<div class="card-meta"><span class="card-number">' + escapeHTML(meta || 'Материал') +
    '</span><span>' + escapeHTML(dateLabel(storyDate(story), story.date_precision)) + '</span></div>' +
    '<h3>' + escapeHTML(story.title) + '</h3><p>' + escapeHTML(storySummary(story)) +
    '</p><div class="tag-row">' + tagsHTML((story.tags || []).slice(0, 4)) + '</div></a>' +
    '<div class="card-bottom">' + status + '<span class="card-arrow" aria-hidden="true">↗</span></div></article>';
}
function setPageTitle(title) {
  document.title = title + ' — ИИ в маркетинге | AIxMarketing by Artics';
}
function renderGlobalMeta() {
  const latest = state.latest;
  $('#notice-text').textContent = state.preview
    ? 'ЗАКРЫТЫЙ РЕДАКЦИОННЫЙ ПРОСМОТР · ПУБЛИКАЦИЯ НЕ РАЗРЕШЕНА'
    : latest ? 'РЕДАКЦИОННЫЙ ДАЙДЖЕСТ · ОПУБЛИКОВАННЫЙ ВЫПУСК'
      : 'ОДОБРЕННЫХ ВЫПУСКОВ ПОКА НЕТ';
  $('#footer-status').textContent = state.preview
    ? 'Закрытый просмотр материалов до финального утверждения выпуска.'
    : 'Публичная версия содержит только одобренные редакцией материалы.';
  const interviewNav = $('#nav-interview');
  interviewNav.hidden = !state.interview;
  if (state.interview) interviewNav.href = interviewHref(state.interview);
  else interviewNav.removeAttribute('href');
  const currentIssueNav = $('#nav-current-issue');
  currentIssueNav.hidden = false;
  currentIssueNav.href = latest ? issueHref(latest) : sitePath('') + '#stories';
}
function renderHomeMeta() {
  const issue = state.latest;
  const stories = activeIssueStories(issue);
  $('#issue-code').textContent = issue ? 'ВЫПУСК № ' + String(issue.number).padStart(2, '0') : 'ВЫПУСК ГОТОВИТСЯ';
  $('#hero-period').textContent = issue ? periodLabel(issue) : 'Одобренный выпуск пока не опубликован';
  $('#issue-story-count').textContent = issue ? String(stories.length).padStart(2, '0') : '—';
  $('#issue-story-label').innerHTML = issue ? 'материалов<br>в выпуске' : 'выпуск<br>готовится';
  $('#catalog-count').textContent = state.products.length ? String(state.products.length).padStart(2, '0') : '—';
  $('#catalog-count-label').innerHTML = state.products.length ? 'инструментов<br>в каталоге' : 'каталог<br>готовится';
  $('#latest-issue-link').hidden = !issue;
  if (issue) $('#latest-issue-link').href = issueHref(issue);
  const issueLink = $('#story-issue-link');
  issueLink.hidden = !issue;
  if (issue) issueLink.href = issueHref(issue);
  $('#stories .section-heading h2').textContent = 'Текущий выпуск';
  setPageTitle(state.preview ? 'Редакционный просмотр' : 'Главная');
}
function renderRubrics() {
  const main = state.data.categories.filter(category => category.id === 'cjm' || category.id === 'marketing');
  const cross = state.data.categories.filter(category => category.id !== 'cjm' && category.id !== 'marketing');
  $('#rubric-grid').innerHTML = [...main, ...cross].map(category => {
    const primary = category.id === 'cjm' || category.id === 'marketing';
    const title = category.id === 'marketing' ? category.short : category.name;
    const href = sitePath('') + '?category=' + encodeURIComponent(category.id) + '#stories';
    return '<a class="rubric-overview-card' + (primary ? ' rubric-overview-card--main' : '') +
      '" href="' + escapeHTML(href) + '"><span class="rubric-overview-meta">' +
      escapeHTML(primary ? 'ОСНОВНАЯ ТЕМА' : 'СКВОЗНАЯ РУБРИКА') + ' / ' +
      escapeHTML(category.number || '') + '</span><h3>' + escapeHTML(title) +
      '</h3><p>' + escapeHTML(category.description || '') +
      '</p><span class="rubric-overview-arrow" aria-hidden="true">↗</span></a>';
  }).join('');
}
function renderLead() {
  const issue = state.latest;
  const stories = activeIssueStories(issue);
  const featured = (issue?.featured_ids || []).map(id => stories.find(story => story.id === id)).filter(Boolean);
  const picks = [...featured];
  for (const story of stories) {
    if (picks.length >= 3) break;
    if (!picks.some(pick => pick.id === story.id)) picks.push(story);
  }
  const interview = state.interview && issue?.special_ids?.includes(state.interview.id)
    ? state.interview : null;
  const cards = picks.map(story => ({ type: 'story', item: story }));
  if (interview) cards.splice(Math.min(1, cards.length), 0, { type: 'interview', item: interview });
  const section = $('#lead');
  section.hidden = !cards.length;
  if (!cards.length) { $('#lead-story').replaceChildren(); return; }
  $('#lead-story').innerHTML = cards.map(({ type, item }, index) => {
    const special = type === 'interview';
    const label = special ? 'СПЕЦИАЛЬНАЯ РУБРИКА / ИНТЕРВЬЮ' :
      storyCategory(item).short.toUpperCase();
    const href = special ? interviewHref(item) : articleHref(item);
    const summary = special ? item.summary : storySummary(item);
    return '<article class="featured-card' + (special ? ' featured-special' : '') +
      '"><div class="featured-card-top"><span>' + String(index + 1).padStart(2, '0') +
      '</span><span>AIxMARKETING</span></div><div class="lead-label">' + escapeHTML(label) +
      '</div><h3>' + escapeHTML(item.title) + '</h3><p>' + escapeHTML(summary) +
      '</p><a class="lead-link" href="' + escapeHTML(href) +
      '">Читать материал <span aria-hidden="true">↗</span></a></article>';
  }).join('');
}
function readHomeFilters() {
  const params = new URLSearchParams(location.search);
  const category = params.get('category');
  state.category = state.data.categories.some(item => item.id === category) ? category : 'all';
  state.query = (params.get('q') || '').slice(0, 120);
  $('#search-input').value = state.query;
}
function syncHomeURL() {
  history.replaceState(null, '', listingHref());
}
function renderFilters() {
  $('#category-filters').innerHTML = [{ id: 'all', short: 'Все' }, ...state.data.categories.map(category => categoryById(category.id))]
    .map(category => '<button type="button" class="filter-chip" data-filter="' +
      escapeHTML(category.id) + '">' + escapeHTML(category.short) + '</button>').join('');
  document.querySelectorAll('[data-filter]').forEach(button => {
    const active = button.dataset.filter === state.category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function renderStories() {
  const all = activeIssueStories(state.latest);
  const query = state.query.trim().toLocaleLowerCase('ru-RU');
  const stories = all.filter(story => {
    const category = state.category === 'all' || story.category === state.category;
    const searchText = [story.title, storySummary(story), ...(story.tags || [])]
      .join(' ').toLocaleLowerCase('ru-RU');
    return category && (!query || searchText.includes(query));
  });
  $('#story-total').textContent = state.latest
    ? 'Найдено материалов: ' + stories.length + ' из ' + all.length
    : 'Первый выпуск готовится';
  if (!stories.length) {
    const selectedRubric = state.category !== 'all';
    const filtered = Boolean(state.latest) && (selectedRubric || Boolean(query));
    const title = !state.latest
      ? selectedRubric ? 'Материалы рубрики готовятся' : 'Первый выпуск готовится'
      : filtered ? 'Ничего не найдено' : 'Одобренных материалов пока нет';
    const detail = !state.latest
      ? selectedRubric
        ? 'Публикации в рубрике «' + categoryById(state.category).short + '» появятся после проверки фактов и редакционного утверждения.'
        : 'Материалы появятся после проверки фактов и редакционного утверждения. Пока можно изучить рубрики проекта.'
      : filtered ? 'Попробуйте другую рубрику или поисковую фразу.'
        : state.preview ? 'Выпуск ещё не собран в редакционных данных.'
          : 'Материалы появятся после редакционного одобрения выпуска.';
    $('#story-grid').innerHTML = '<div class="empty-state"><h3>' + title + '</h3><p>' +
      escapeHTML(detail) + '</p>' + (filtered || selectedRubric ? '<button type="button" class="reset-filters">Сбросить фильтры</button>' : '') + '</div>';
    return;
  }
  $('#story-grid').innerHTML = stories.map(storyCard).join('');
}
function renderSpecial() {
  const target = $('#special');
  const interview = state.interview;
  const inIssue = state.latest?.special_ids?.includes(interview?.id);
  target.hidden = !(interview && inIssue);
  if (target.hidden) { target.replaceChildren(); return; }
  target.innerHTML = '<div class="special-left"><p class="kicker">СПЕЦИАЛЬНАЯ РУБРИКА</p><h2>' +
    escapeHTML(interview.title) + '</h2><p>' + escapeHTML(interview.summary) +
    '</p><a href="' + escapeHTML(interviewHref(interview)) +
    '" class="text-link">Читать материал <span aria-hidden="true">↗</span></a></div>' +
    '<div class="special-right"><p class="kicker">ОПЫТ ПРАКТИКА</p><p class="special-impact">' +
    'Практический опыт одного рекламодателя требует отдельного контекста и проверки перед обобщениями.</p>' +
    '<span class="quote-caption">РЕДАКЦИОННЫЙ ФОРМАТ</span><span class="special-pattern" aria-hidden="true">↗↗↗</span></div>';
}
function renderCatalogPromo() {
  const target = $('#catalog-promo');
  target.hidden = false;
  if (!state.products.length) {
    target.innerHTML = '<div><p class="kicker">КАТАЛОГ ИНСТРУМЕНТОВ</p>' +
      '<h2>ИИ-продукты для маркетинга</h2><p>Каталог готовится. Карточки появятся после проверки и редакционного утверждения.</p>' +
      '<a class="text-link" href="' + escapeHTML(sitePath('tools/')) + '">О каталоге ↗</a></div>' +
      '<span class="catalog-promo-pending" aria-hidden="true">↗</span>';
    return;
  }
  target.innerHTML = '<div><p class="kicker">КАТАЛОГ ИНСТРУМЕНТОВ</p><h2>ИИ-продукты для маркетинга</h2>' +
    '<p>Решения для исследований, рекламы, аналитики и производства контента. В будущих обновлениях будем отмечать, что изменилось в каждом продукте после проверки источников.</p>' +
    '<a class="text-link" href="' + escapeHTML(sitePath('tools/')) + '">Открыть каталог ↗</a></div>' +
    '<span class="catalog-promo-number">' + state.products.length + '</span>';
}
function renderHomeArchive() {
  const older = state.issues.filter(issue => issue.id !== state.latest?.id);
  $('#archive-list').innerHTML = older.length
    ? older.map(issue => '<article class="archive-entry"><p>Выпуск № ' +
      escapeHTML(issue.number) + ' · ' + escapeHTML(periodLabel(issue)) + '</p><h3><a href="' +
      escapeHTML(issueHref(issue)) + '">' + escapeHTML(issue.title) +
      ' ↗</a></h3></article>').join('')
    : '<p class="archive-empty">' + (state.latest
      ? 'Это первый выпуск. Следующие выпуски появятся здесь после редакционного одобрения.'
      : 'Опубликованных выпусков пока нет.') + '</p>';
}
function renderHome() {
  readHomeFilters(); renderHomeMeta(); renderRubrics(); renderLead(); renderFilters(); renderStories();
  renderSpecial(); renderCatalogPromo(); renderHomeArchive();
}
function renderNotFound() {
  setPageTitle('Страница не найдена');
  $('#page-view').innerHTML = '<div class="article-shell"><a class="back-link" href="' +
    escapeHTML(homeHref()) + '">← На главную</a><h1>Страница не найдена</h1>' +
    '<p>Проверьте адрес или перейдите к выпускам.</p></div>';
}
function renderIssueArchive() {
  setPageTitle('Архив выпусков');
  $('#page-view').innerHTML = '<div class="container editorial-page"><a class="back-link" href="' +
    escapeHTML(homeHref()) + '">← На главную</a><p class="kicker">АРХИВ ДАЙДЖЕСТА</p>' +
    '<h1>Все выпуски</h1>' + (state.issues.length
      ? state.issues.map(issue => '<article class="archive-entry"><p>№ ' +
        escapeHTML(issue.number) + ' · ' + escapeHTML(periodLabel(issue)) +
        '</p><h2><a href="' + escapeHTML(issueHref(issue)) + '">' +
        escapeHTML(issue.title) + ' ↗</a></h2><p>' + escapeHTML(issue.teaser || '') +
        '</p></article>').join('')
      : '<div class="empty-state"><h2>Выпусков пока нет</h2><p>Они появятся после редакционного одобрения.</p></div>') +
    '</div>';
}
function issueSections(issue) {
  const stories = activeIssueStories(issue);
  const groups = [
    { id: 'cjm', title: 'ИИ и Customer Journey' },
    { id: 'marketing', title: 'ИИ в работе маркетолога' },
    { id: 'cases', title: 'Кейсы и аналитика' },
    { id: 'legal', title: 'Рынок и регулирование' }
  ].map(group => ({ ...group, stories: stories.filter(story => story.category === group.id) }))
    .filter(group => group.stories.length);
  return groups.map(group => '<section class="issue-group" id="section-' + group.id +
    '"><div class="section-heading"><div><p class="kicker">РУБРИКА</p><h2>' +
    group.title + '</h2></div><span class="issue-group-count">' +
    materialCount(group.stories.length) + '</span></div><div class="story-grid">' +
    group.stories.map(storyCard).join('') + '</div></section>').join('');
}
function renderIssue(issueId) {
  const issue = state.issues.find(item => item.id === issueId);
  if (!issue) { renderNotFound(); return; }
  setPageTitle('Выпуск № ' + issue.number);
  const stories = activeIssueStories(issue);
  const special = state.interview && issue.special_ids?.includes(state.interview.id)
    ? '<section class="issue-extra"><p class="kicker">СПЕЦИАЛЬНАЯ РУБРИКА</p><h2>' +
      escapeHTML(state.interview.title) + '</h2><p>' + escapeHTML(state.interview.summary) +
      '</p><a class="text-link" href="' + escapeHTML(interviewHref(state.interview)) + '">Читать материал ↗</a></section>' : '';
  const catalog = state.products.length && issue.products_section
    ? '<section class="issue-extra"><p class="kicker">КАТАЛОГ</p><h2>ИИ-инструменты</h2>' +
      '<p>Отдельная библиотека из ' + state.products.length +
      ' позиций с пометками о степени подтверждения.</p><a class="text-link" href="' +
      escapeHTML(sitePath('tools/')) + '">Открыть каталог ↗</a></section>' : '';
  $('#page-view').innerHTML = '<div class="container editorial-page"><a class="back-link" href="' +
    escapeHTML(homeHref()) + '">← На главную</a><p class="kicker">ВЫПУСК № ' +
    escapeHTML(issue.number) + ' · ' + escapeHTML(periodLabel(issue)) + '</p><h1>' +
    escapeHTML(issue.title) + '</h1><p class="editorial-intro">' +
    escapeHTML(issue.teaser || '') + '</p>' + draftWarning('Выпуск') +
    '<p class="issue-summary">' + materialCount(stories.length) + ' в выпуске</p>' +
    issueSections(issue) + special + catalog + '<p class="issue-bottom"><a class="back-link" href="' +
    escapeHTML(sitePath('issues/')) + '">← Все выпуски</a></p></div>';
}
function articleBody(story) {
  const body = Array.isArray(story.body) && story.body.length ? story.body : story.paragraphs || [];
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const roles = [
    { key: 'fact', label: 'Контекст', text: story.fact || storySummary(story) },
    { key: 'impact', label: 'Для маркетинга', text: story.impact || '' },
    { key: 'unknown', label: 'Ограничения', text: story.unknown || '' }
  ];
  const assigned = body.map(() => []);
  const unmatched = [];
  for (const role of roles) {
    const text = normalize(role.text);
    if (!text) continue;
    let index = body.findIndex(paragraph => normalize(paragraph) === text);
    if (index < 0 && text.length >= 80) {
      const opening = text.slice(0, 80);
      index = body.findIndex(paragraph => normalize(paragraph).startsWith(opening));
    }
    if (index < 0 && role.key === 'impact' && /редакционной оценки/i.test(text)) {
      index = body.findIndex(paragraph => /для маркетинговой команды|значение объявления состоит/i.test(paragraph));
    }
    if (index < 0 && role.key === 'unknown' && /редакционную проверку/i.test(text)) {
      index = body.findIndex(paragraph => /общерыночных сопоставимых данных|условия ещё могут измениться/i.test(paragraph));
    }
    if (index < 0) unmatched.push(role);
    else assigned[index].push(role);
  }
  const labeledParagraph = (text, paragraphRoles) => {
    const classes = paragraphRoles.map(role => 'has-' + role.key).join(' ');
    return '<div class="article-paragraph ' + classes + '">' +
      '<p>' + escapeHTML(text) + '</p></div>';
  };
  const narrative = body.map((paragraph, index) => assigned[index].length
    ? labeledParagraph(paragraph, assigned[index])
    : '<p>' + escapeHTML(paragraph) + '</p>').join('');
  const supplements = unmatched.map(role => {
    const text = role.key === 'impact' && /редакционной оценки/i.test(role.text)
      ? 'Значение для маркетинга пока не установлено.'
      : role.key === 'unknown' && /редакционную проверку/i.test(role.text)
        ? 'Условия доступности и применимость выводов ещё уточняются.'
        : role.text;
    return labeledParagraph(text, [role]);
  }).join('');
  return narrative + supplements;
}
function articleHighlights(story) {
  if (story.category !== 'cases' || !Array.isArray(story.highlights)) return '';
  const highlights = story.highlights.map(item => typeof item === 'string' ? item : item?.text || '')
    .filter(Boolean);
  return highlights.length ? '<aside class="article-highlights" aria-label="Ключевые выводы">' +
    '<h2>Ключевые выводы</h2><ul>' + highlights.map(item => '<li>' + escapeHTML(item) +
    '</li>').join('') + '</ul></aside>' : '';
}
function renderArticle(storySlug, allowLegacyId = false) {
  const story = state.data.stories.find(item =>
    (item.slug || item.id) === storySlug || (allowLegacyId && item.id === storySlug));
  if (!story) { renderNotFound(); return; }
  setPageTitle(story.title);
  const issue = state.issues.find(item => item.id === story.issue_id);
  const back = issue ? issueHref(issue) : listingHref();
  const date = storyDate(story);
  const meta = [storyCategory(story).name, topicLabel(story.topic), formatLabel(story.content_format),
    regionLabel(story.region), date && 'Исходная публикация: ' + dateLabel(date, story.date_precision)]
    .filter(Boolean).join(' · ');
  $('#page-view').innerHTML = '<article class="article-shell"><a class="back-link" href="' +
    escapeHTML(back) + '">← ' + (issue ? 'К выпуску' : 'К материалам') +
    '</a><div class="article-topline">' + escapeHTML(meta) + '</div><h1>' +
    escapeHTML(story.title) + '</h1><p class="article-deck">' +
    escapeHTML(storySummary(story)) + '</p><div class="article-tags">' +
    tagsHTML(story.tags || []) + '</div>' +
    articleHighlights(story) + '<section class="article-contents" aria-label="Основной текст">' +
    articleBody(story) + '</section>' + sourceLinks(story) +
    '<div class="article-bottom"><a class="back-link" href="' + escapeHTML(back) +
    '">← ' + (issue ? 'К выпуску' : 'К материалам') + '</a></div></article>';
}
function interviewBody(blocks) {
  return (blocks || []).map(value => {
    const line = String(value);
    if (line.startsWith('## ')) return '<h2>' + escapeHTML(line.slice(3)) + '</h2>';
    if (line.startsWith('**') && line.endsWith('**')) {
      return '<h3 class="interview-question">' + escapeHTML(line.slice(2, -2)) + '</h3>';
    }
    return '<p>' + escapeHTML(line) + '</p>';
  }).join('');
}
function renderInterview() {
  const interview = state.interview;
  if (!interview) { renderNotFound(); return; }
  setPageTitle(interview.title);
  const issue = state.issues.find(item => item.id === interview.issue_id);
  const back = issue ? issueHref(issue) : homeHref();
  const interviewWarning = state.preview && !isApprovedInterview(interview, state.issues)
    ? '<div class="article-warning"><strong>Закрытый редакционный просмотр.</strong> ' +
      (interview.consent_confirmed === true
        ? 'Согласие на публикацию получено. Финальный текст, факты и выпуск ожидают утверждения.'
        : 'Согласие на публикацию и финальное утверждение текста ещё не подтверждены.') + '</div>'
    : '';
  $('#page-view').innerHTML = '<article class="article-shell interview-article"><a class="back-link" href="' +
    escapeHTML(back) + '">← К выпуску</a><div class="article-topline">СПЕЦИАЛЬНАЯ РУБРИКА · ИНТЕРВЬЮ</div>' +
    '<h1>' + escapeHTML(interview.title) + '</h1><p class="article-deck">' +
    escapeHTML(interview.summary) + '</p><div class="article-tags">' +
    tagsHTML(interview.tags || []) + '</div>' + interviewWarning +
    '<section class="article-contents interview-body">' + interviewBody(interview.body) +
    '</section>' + sourceLinks(interview) + '<div class="article-bottom"><a class="back-link" href="' +
    escapeHTML(back) + '">← К выпуску</a></div></article>';
}
function toolCard(product) {
  const unconfirmed = product.verification_status === 'name_only_unconfirmed';
  const icon = product.icon && /^assets\/tools\/[a-z0-9-]+\.svg$/i.test(product.icon)
    ? '<img src="' + escapeHTML(sitePath(product.icon)) +
      '" width="54" height="54" alt="Нейтральная пиктограмма">' : '<span class="tool-monogram" aria-hidden="true">AI</span>';
  const urls = (product.source_urls || []).map(url => {
    const safe = safeURL(url);
    return safe ? '<a href="' + escapeHTML(safe) +
      '" target="_blank" rel="noopener noreferrer">' + escapeHTML(new URL(safe).hostname) +
      ' ↗</a>' : '';
  }).filter(Boolean).join(' ');
  return '<article class="tool-card" data-category="' + escapeHTML(product.category) +
    '" data-russia="' + String(product.russia_relevant === true) + '" data-unconfirmed="' +
    String(unconfirmed) + '" data-search="' +
    escapeHTML([product.name, product.category, product.summary].join(' ').toLocaleLowerCase('ru-RU')) +
    '"><div class="tool-top">' + icon + '<div><h2>' + escapeHTML(product.name) +
    '</h2><p>' + escapeHTML(product.category) + '</p></div></div>' +
    '<p class="tool-icon-note">Нейтральная пиктограмма · не логотип поставщика</p>' +
    '<p class="tool-summary">' + escapeHTML(product.summary || '') + '</p>' +
    '<p class="tool-status ' + (unconfirmed ? 'needs' : '') + '">' +
    (unconfirmed ? 'Функции не подтверждены' :
      product.verification_status === 'partially_confirmed' ? 'Часть возможностей не подтверждена' :
      'Возможности описаны по источникам поставщика') +
    '</p><details><summary>Подробнее об инструменте</summary>' +
    '<p>' + escapeHTML(product.detail || product.verification_notes || '') + '</p>' +
    (product.recent_updates ? '<div class="tool-updates"><h3>Что изменилось</h3><p>' +
      escapeHTML(product.recent_updates) + '</p></div>' : '') +
    (product.relevance_note ? '<p><strong>Релевантность:</strong> ' +
      escapeHTML(product.relevance_note) + '</p>' : '') +
    (urls ? '<div class="tool-sources">' + urls + '</div>' : '') +
    '</details></article>';
}
function filterTools() {
  const needle = $('#tool-search').value.trim().toLocaleLowerCase('ru-RU');
  const category = $('#tool-category').value;
  const russian = $('#tool-russia').checked;
  const includeUnconfirmed = $('#tool-unconfirmed').checked;
  let count = 0;
  document.querySelectorAll('.tool-card').forEach(card => {
    const shown = (!needle || card.dataset.search.includes(needle)) &&
      (category === 'all' || card.dataset.category === category) &&
      (!russian || card.dataset.russia === 'true') &&
      (includeUnconfirmed || card.dataset.unconfirmed !== 'true');
    card.hidden = !shown;
    if (shown) count++;
  });
  $('#tool-count').textContent = 'Найдено: ' + count + ' из ' + state.products.length;
  $('#tool-unconfirmed-note').hidden = !includeUnconfirmed;
}
function renderTools() {
  setPageTitle('ИИ-инструменты');
  if (!state.products.length) {
    $('#page-view').innerHTML = '<div class="container editorial-page tools-page"><a class="back-link" href="' +
      escapeHTML(homeHref()) + '">← На главную</a><p class="kicker">КАТАЛОГ ИНСТРУМЕНТОВ</p>' +
      '<h1>ИИ-продукты для маркетинга</h1><p class="editorial-intro">В будущих обновлениях будем отмечать, что изменилось в продуктах после проверки источников.</p>' +
      '<div class="empty-state"><h2>Каталог готовится</h2>' +
      '<p>Проверенные и одобренные карточки появятся после редакционной проверки.</p></div></div>';
    return;
  }
  const categories = [...new Set(state.products.map(product => product.category))].sort((a, b) => a.localeCompare(b, 'ru'));
  $('#page-view').innerHTML = '<div class="container editorial-page tools-page"><a class="back-link" href="' +
    escapeHTML(homeHref()) + '">← На главную</a><p class="kicker">КАТАЛОГ ИНСТРУМЕНТОВ</p>' +
    '<h1>ИИ-продукты для маркетинга</h1><p class="editorial-intro">' +
    'Пиктограммы нейтральные и не являются логотипами поставщиков. ' +
    'Описание продукта не подтверждает заявленные функции или доступность. ' +
    'В будущих обновлениях будем отмечать, что изменилось в продуктах после проверки источников.</p>' +
    (state.preview ? draftWarning('Каталог') : '') +
    '<div class="tool-controls"><label>Поиск по каталогу<input id="tool-search" type="search" ' +
    'placeholder="Название, категория или задача" maxlength="120"></label>' +
    '<label>Категория<select id="tool-category"><option value="all">Все категории</option>' +
    categories.map(category => '<option value="' + escapeHTML(category) + '">' +
      escapeHTML(category) + '</option>').join('') + '</select></label>' +
    '<label class="tool-check"><input id="tool-russia" type="checkbox"> Релевантные российскому рынку</label>' +
    '<label class="tool-check"><input id="tool-unconfirmed" type="checkbox"> Показать неподтверждённые позиции</label>' +
    '</div><p id="tool-unconfirmed-note" class="article-warning" hidden>У этих позиций подтверждено только название. ' +
    'Описание возможностей нельзя считать проверенным.</p><p id="tool-count" role="status" aria-live="polite"></p>' +
    '<div class="tool-grid">' + state.products.map(toolCard).join('') + '</div>' +
    '<section class="catalog-disclaimer"><h2>О данных каталога</h2><p>' +
    'Описания опираются на открытые источники. Условия, функции и географическую доступность ' +
    'нужно сверить с поставщиком перед использованием.</p></section></div>';
  ['tool-search', 'tool-category', 'tool-russia', 'tool-unconfirmed'].forEach(id =>
    $('#' + id).addEventListener('input', filterTools));
  filterTools();
}
function route() {
  const path = currentRoute();
  const legacyId = new URLSearchParams(location.search).get('article');
  const isHome = !path && !legacyId;
  $('#home-view').hidden = !isHome;
  $('#page-view').hidden = isHome;
  if (isHome) { renderHome(); return; }
  if (legacyId) { renderArticle(legacyId, true); return; }
  if (path === 'issues') { renderIssueArchive(); return; }
  if (path.startsWith('issues/')) { renderIssue(path.slice(7)); return; }
  if (path.startsWith('articles/')) { renderArticle(path.slice(9)); return; }
  if (path.startsWith('special/') && state.interview && path.slice(8) === state.interview.slug) {
    renderInterview(); return;
  }
  if (path === 'tools') { renderTools(); return; }
  renderNotFound();
}
function setupNavigation() {
  const menu = $('.menu-toggle');
  const nav = $('#primary-nav');
  $('#lead').addEventListener('click', event => {
    const button = event.target.closest('[data-feature-scroll]');
    if (!button) return;
    const strip = $('#lead-story');
    const firstCard = strip.querySelector('.featured-card');
    const step = (firstCard?.getBoundingClientRect().width || strip.clientWidth) + 16;
    strip.scrollBy({ left: Number(button.dataset.featureScroll) * step, behavior: 'smooth' });
  });
  menu.addEventListener('click', () => {
    const open = nav.dataset.open !== 'true';
    nav.dataset.open = String(open);
    menu.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) {
      nav.dataset.open = 'false';
      menu.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.dataset.open === 'true') {
      nav.dataset.open = 'false';
      menu.setAttribute('aria-expanded', 'false');
      menu.focus();
    }
  });
}
async function readJSON(path) {
  const response = await fetch(new URL(path, siteBase), { cache: 'no-store' });
  if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
  return response.json();
}
async function init() {
  setupNavigation();
  try {
    const [data, issues, interview, products] = await Promise.all([
      readJSON('content/stories.json'), readJSON('content/issues.json'),
      readJSON('content/interview.json'), readJSON('content/products.json')
    ]);
    if (!Array.isArray(data.stories) || !Array.isArray(data.categories) ||
      !Array.isArray(issues) || !Array.isArray(products)) throw new Error('Некорректная структура данных');
    const localHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
    state.preview = localHost && data.site?.mode !== 'public';
    state.data = { ...data, stories: state.preview ? data.stories : data.stories.filter(isApprovedStory) };
    state.issues = (state.preview ? issues : issues.filter(issue =>
      issue.publication_status === 'published' && issue.approved_for_publication === true))
      .sort((a, b) => String((state.preview ? b.period_end : b.release_date) || b.period_end || '')
        .localeCompare(String((state.preview ? a.period_end : a.release_date) || a.period_end || '')));
    state.interview = state.preview || isApprovedInterview(interview, state.issues) ? interview : null;
    state.products = state.preview ? products : products.filter(isApprovedProduct);
    state.latest = state.issues[0] || null;
    renderGlobalMeta(); route();
    $('#category-filters').addEventListener('click', event => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      state.category = button.dataset.filter;
      renderFilters(); syncHomeURL(); renderStories();
    });
    $('#search-input').addEventListener('input', event => {
      state.query = event.target.value.slice(0, 120);
      syncHomeURL(); renderStories();
    });
    $('#story-grid').addEventListener('click', event => {
      if (!event.target.closest('.reset-filters')) return;
      state.category = 'all'; state.query = ''; $('#search-input').value = '';
      renderFilters(); syncHomeURL(); renderStories(); $('#search-input').focus();
    });
    window.addEventListener('popstate', () => {
      if (currentRoute() === '') renderHome();
    });
  } catch (error) {
    const message = '<div class="empty-state"><h2>Не удалось загрузить материалы</h2>' +
      '<p>Проверьте локальный сервер и файлы сборки. Причина: ' +
      escapeHTML(error.message) + '</p></div>';
    $('#home-view').hidden = false;
    $('#page-view').hidden = true;
    $('#story-grid').innerHTML = message;
    $('#lead').hidden = true;
    console.error('Digest initialization failed:', error);
  }
}
init();

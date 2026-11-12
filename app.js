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
const issuePdfHref = issue => sitePath('issues/' + encodeURIComponent(issue.id) + '/issue.pdf');
const rubricHref = id => sitePath('rubrics/' + (id ? encodeURIComponent(id) + '/' : ''));
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
function storyAxis(story) {
  if (story.topic === 'cjm' || story.topic === 'marketing') return story.topic;
  if (story.category === 'cjm' || story.category === 'marketing') return story.category;
  return null;
}
function inRubric(story, id) {
  return id === 'cjm' || id === 'marketing'
    ? storyAxis(story) === id
    : story.category === id;
}
function visibleIssueStories() {
  const issueIds = new Set(state.issues.map(issue => issue.id));
  return state.data.stories.filter(story => issueIds.has(story.issue_id));
}
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
function listingHref() { return rubricHref(''); }
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
function storyRubricNames(story) {
  const names = [topicLabel(storyAxis(story))];
  if (story.category === 'cases' || story.category === 'legal') names.push(storyCategory(story).short);
  return names.filter(Boolean);
}
function storyRow(story, issue = null) {
  const displayRubric = issue ? displayRubrics.find(rubric => rubric.id === story.display_rubric)?.title : '';
  const meta = [displayRubric || storyRubricNames(story).join(' · '), formatLabel(story.content_format)]
    .filter((value, index, values) => value && values.indexOf(value) === index);
  const issueLabel = issue ? 'Выпуск № ' + issue.number : '';
  const date = storyDate(story) ? dateLabel(storyDate(story), story.date_precision) : '';
  const searchable = [story.title, storySummary(story), ...(story.tags || [])].join(' ').toLocaleLowerCase('ru-RU');
  const dateMarkup = date
    ? '<time class="story-row-date" datetime="' + escapeHTML(storyDate(story)) + '">' + escapeHTML(date) + '</time>'
    : '';
  const metaMarkup = issue
    ? '<div class="story-row-meta"><span>' + escapeHTML(meta.join(' · ')) +
      '</span><span>' + escapeHTML(issueLabel + (date ? ' · ' + date : '')) + '</span></div>'
    : dateMarkup;
  return '<article class="story-row' + (issue ? '' : ' story-row--issue') + '" data-search="' +
    escapeHTML(searchable) + '"><a href="' + escapeHTML(articleHref(story)) +
    '" class="story-row-link">' + metaMarkup + '<h3>' + escapeHTML(story.title) +
    '</h3><p>' + escapeHTML(storySummary(story)) +
    '</p><span class="story-row-arrow" aria-hidden="true">↘</span></a></article>';
}
function setPageTitle(title) {
  document.title = title + ' — ИИ в маркетинге | Артикс × TRUE DIGITAL';
}
function renderGlobalMeta() {
  const notice = $('#preview-notice');
  if (notice) notice.hidden = !state.preview;
  if ($('#notice-text')) $('#notice-text').textContent = 'ЗАКРЫТЫЙ РЕДАКЦИОННЫЙ ПРОСМОТР';
  const footerStatus = $('#footer-status');
  if (footerStatus) {
    footerStatus.hidden = !state.preview;
    footerStatus.textContent = 'Материалы проходят редакционную проверку.';
  }
}
function renderHomeMeta() {
  const issue = state.latest;
  const period = $('#hero-period');
  if (period) {
    if (!issue) {
      period.textContent = 'Выпуск готовится';
    } else {
      const issueMonth = dateLabel(issue.period_start, 'month').replace(/ г\.$/, '');
      period.textContent = issueMonth.charAt(0).toLocaleUpperCase('ru-RU') + issueMonth.slice(1);
    }
  }
  const link = $('#latest-issue-link');
  if (link) {
    link.hidden = !issue;
    if (issue) link.href = issueHref(issue);
  }
  const pdf = $('#latest-issue-pdf');
  if (pdf) {
    pdf.hidden = !issue || state.preview;
    if (issue) {
      pdf.href = issuePdfHref(issue);
      pdf.download = 'AIxMarketing-issue-' + issue.id + '.pdf';
    }
  }
  setPageTitle(state.preview ? 'Редакционный просмотр' : 'Главная');
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
  const section = $('#lead');
  section.hidden = !picks.length && !interview;
  if (!picks.length && !interview) { $('#lead-story').replaceChildren(); return; }
  const storyCards = picks.map((story, index) => {
    const meta = [...storyRubricNames(story), formatLabel(story.content_format)].filter(Boolean).join(' · ');
    return '<article class="home-pick' + (index === 0 ? ' home-pick--lead' : '') +
      '"><a class="home-pick-link" href="' + escapeHTML(articleHref(story)) +
      '"><span class="home-pick-meta">' + escapeHTML(meta) + '</span><h3>' +
      escapeHTML(story.title) + '</h3><p>' + escapeHTML(storySummary(story)) +
      '</p><span class="home-pick-read">Читать ↗</span></a></article>';
  }).join('');
  const interviewCard = interview
    ? '<article class="home-pick home-pick--special"><a class="home-pick-link" href="' +
      escapeHTML(interviewHref(interview)) + '"><span class="home-pick-meta">Специальная рубрика · Интервью</span><h3>' +
      escapeHTML(interview.title) + '</h3><p>' + escapeHTML(interview.summary) +
      '</p><span class="home-pick-read">Читать ↗</span></a></article>'
    : '';
  $('#lead-story').innerHTML = storyCards + interviewCard;
}
function renderCatalogPromo() {
  const target = $('#catalog-promo');
  target.hidden = false;
  if (!state.products.length) {
    target.innerHTML = '<div><h2>Инструменты</h2><p>Каталог готовится.</p>' +
      '<a class="text-link" href="' + escapeHTML(sitePath('tools/')) + '">Смотреть</a></div>';
    return;
  }
  target.innerHTML = '<div><h2>Инструменты</h2><p>Поиск ИИ-продуктов по задачам маркетинга.</p>' +
    '<a class="text-link" href="' + escapeHTML(sitePath('tools/')) + '">Смотреть</a></div>';
}
function renderHomeArchive() {
  const section = $('#archive');
  const older = state.issues.filter(issue => issue.id !== state.latest?.id);
  section.hidden = !older.length;
  $('#archive-list').innerHTML = older.length
    ? older.slice(0, 2).map(issue => '<article class="archive-entry"><p>Выпуск № ' +
      escapeHTML(issue.number) + ' · ' + escapeHTML(periodLabel(issue)) + '</p><h3><a href="' +
      escapeHTML(issueHref(issue)) + '">' + escapeHTML(issue.title) +
      ' ↗</a></h3></article>').join('')
    : '';
}
function renderHome() {
  renderHomeMeta(); renderLead(); renderCatalogPromo(); renderHomeArchive();
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
        '</p>' + (state.preview ? '' : '<a class="pdf-download" href="' + escapeHTML(issuePdfHref(issue)) +
        '" download="AIxMarketing-issue-' + escapeHTML(issue.id) + '.pdf">Скачать PDF ↓</a>') + '</article>').join('')
      : '<div class="empty-state"><h2>Выпусков пока нет</h2><p>Они появятся после редакционного одобрения.</p></div>') +
    '</div>';
}
function renderRubricPage(id = 'all') {
  const selected = displayRubrics.find(rubric => rubric.id === id);
  const legacy = state.data.categories.find(category => category.id === id);
  if (id !== 'all' && id !== 'special' && !selected && !legacy) { renderNotFound(); return; }
  const query = (new URLSearchParams(location.search).get('q') || '').slice(0, 120);
  const issueById = new Map(state.issues.map(issue => [issue.id, issue]));
  const stories = visibleIssueStories().filter(story =>
    id === 'all' || (selected ? story.display_rubric === id : legacy ? inRubric(story, id) : false))
    .sort((a, b) => String(issueById.get(b.issue_id)?.release_date || '').localeCompare(String(issueById.get(a.issue_id)?.release_date || '')) ||
      String(storyDate(b) || '').localeCompare(String(storyDate(a) || '')));
  const interview = (id === 'all' || id === 'special') && state.interview && issueById.has(state.interview.issue_id)
    ? state.interview : null;
  const title = selected?.title || (id === 'special' ? 'Специальная рубрика' : legacy?.name || 'Рубрики');
  setPageTitle(title);
  const tabs = [{ id: 'all', title: 'Все материалы' }, ...displayRubrics, { id: 'special', title: 'Специальная рубрика' }];
  const interviewRow = interview ? '<article class="story-row" data-search="' +
    escapeHTML([interview.title, interview.summary, ...(interview.tags || [])].join(' ').toLocaleLowerCase('ru-RU')) +
    '"><a class="story-row-link" href="' + escapeHTML(interviewHref(interview)) +
    '"><div class="story-row-meta"><span>Специальная рубрика · Интервью</span><span>Выпуск № ' +
    escapeHTML(issueById.get(interview.issue_id).number) + '</span></div><h3>' +
    escapeHTML(interview.title) + '</h3><p>' + escapeHTML(interview.summary) +
    '</p><span class="story-row-arrow" aria-hidden="true">↘</span></a></article>' : '';
  $('#page-view').innerHTML = '<div class="container editorial-page rubric-page"><a class="back-link" href="' +
    escapeHTML(homeHref()) + '">← На главную</a><h1>' + escapeHTML(title) +
    '</h1><nav class="rubric-tabs" aria-label="Рубрики">' + tabs.map(tab =>
      '<a href="' + escapeHTML(rubricHref(tab.id === 'all' ? '' : tab.id)) +
      '"' + (tab.id === id ? ' aria-current="page"' : '') + '>' +
      escapeHTML(tab.title) + '</a>').join('') +
    '</nav><div class="rubric-controls"><label>Поиск по материалам<input id="rubric-search" type="search" value="' +
    escapeHTML(query) + '" placeholder="Название или тема" maxlength="120"></label><span id="rubric-count" role="status">' +
    escapeHTML(materialCount(stories.length + (interview ? 1 : 0))) + '</span></div><div class="rubric-list story-list">' +
    stories.map(story => storyRow(story, issueById.get(story.issue_id))).join('') + interviewRow +
    '<div id="rubric-empty" class="empty-state" hidden><h2>Материалы не найдены</h2><p>Попробуйте другой запрос или рубрику.</p></div>' +
    '</div></div>';
  const updateSearch = (value, syncURL = true) => {
    const needle = value.trim().toLocaleLowerCase('ru-RU');
    const rows = Array.from(document.querySelectorAll('.rubric-list .story-row'));
    let count = 0;
    rows.forEach(row => {
      row.hidden = Boolean(needle) && !row.dataset.search.includes(needle);
      if (!row.hidden) count++;
    });
    $('#rubric-count').textContent = materialCount(count);
    $('#rubric-empty').hidden = count > 0;
    if (!syncURL) return;
    const params = new URLSearchParams();
    if (value.trim()) params.set('q', value.trim());
    history.replaceState(null, '', rubricHref(id === 'all' ? '' : id) + (params.size ? '?' + params.toString() : ''));
  };
  $('#rubric-search').addEventListener('input', event => updateSearch(event.target.value));
  updateSearch(query, false);
}
// These are reader-facing sections. The editorial topic/category fields retain
// the two analytical axes and the cross-cutting case/regulation classification.
const displayRubrics = Object.freeze([
  { id: 'product_news', title: 'Новости продуктов', splitRows: true },
  { id: 'user_experience', title: 'Пользовательский опыт', splitRows: true },
  { id: 'insights', title: 'Инсайты' },
  { id: 'creative_ai', title: 'Креатив + ИИ' },
  { id: 'cases', title: 'Кейсы' },
  { id: 'regulation', title: 'Рынок и регулирование' }
]);
function issueSections(issue) {
  const stories = activeIssueStories(issue);
  return displayRubrics.map(group => ({
    ...group, stories: stories.filter(story => story.display_rubric === group.id)
  })).filter(group => group.stories.length);
}
function renderIssue(issueId) {
  const issue = state.issues.find(item => item.id === issueId);
  if (!issue) { renderNotFound(); return; }
  setPageTitle('Выпуск № ' + issue.number);
  const stories = activeIssueStories(issue);
  const groups = issueSections(issue);
  const special = state.interview && issue.special_ids?.includes(state.interview.id)
    ? '<section class="issue-group issue-special" id="section-interview"><div class="section-heading">' +
      '<h2>Специальная рубрика</h2><span class="issue-group-count">1 материал</span></div>' +
      '<article class="story-row story-row--issue"><a class="story-row-link" href="' +
      escapeHTML(interviewHref(state.interview)) + '">' +
      (state.interview.published_at
        ? '<time class="story-row-date" datetime="' + escapeHTML(state.interview.published_at) + '">' +
          escapeHTML(dateLabel(state.interview.published_at)) + '</time>' : '') +
      '<h3>' + escapeHTML(state.interview.title) + '</h3><p>' +
      escapeHTML(state.interview.summary) + '</p><span class="story-row-arrow" aria-hidden="true">↘</span>' +
      '</a></article></section>' : '';
  const catalog = state.products.length && issue.products_section
    ? '<section class="issue-extra issue-catalog" id="section-catalog"><h2>Каталог инструментов</h2>' +
      '<p>Поиск ИИ-продуктов по задачам маркетинга.</p><a class="text-link" href="' +
      escapeHTML(sitePath('tools/')) + '">Смотреть инструменты</a></section>' : '';
  const toc = groups.map(group => '<a href="' + escapeHTML(issueHref(issue) + '#section-' + group.id) +
    '">' + escapeHTML(group.title) + '</a>').join('') +
    (special ? '<a href="' + escapeHTML(issueHref(issue) + '#section-interview') + '">Специальная рубрика</a>' : '') +
    (catalog ? '<a href="' + escapeHTML(issueHref(issue) + '#section-catalog') + '">Каталог инструментов</a>' : '');
  const sections = groups.map(group => '<section class="issue-group' +
    (group.splitRows ? ' issue-group--split' : '') + '" id="section-' + group.id +
    '"><div class="section-heading"><h2>' + escapeHTML(group.title) +
    '</h2><span class="issue-group-count">' + materialCount(group.stories.length) +
    '</span></div><div class="story-list">' + group.stories.map(story => storyRow(story)).join('') +
    '</div></section>').join('');
  $('#page-view').innerHTML = '<div class="container editorial-page issue-page"><a class="back-link" href="' +
    escapeHTML(sitePath('issues/')) + '">← Все выпуски</a><p class="kicker">ВЫПУСК №' +
    escapeHTML(issue.number) + '</p><h1>' +
    escapeHTML(issue.title) + '</h1><p class="editorial-intro">' +
    escapeHTML(issue.teaser || '') + '</p>' + (state.preview ? '' : '<a class="pdf-download issue-download" href="' +
    escapeHTML(issuePdfHref(issue)) + '" download="AIxMarketing-issue-' +
    escapeHTML(issue.id) + '.pdf">Скачать выпуск в PDF ↓</a>') +
    (state.preview && (issue.publication_status !== 'published' || issue.approved_for_publication !== true)
      ? draftWarning('Выпуск') : '') +
    '<nav class="issue-toc" aria-label="Разделы выпуска"><span>' + materialCount(stories.length) +
    '</span>' + toc + '</nav>' + sections + special + catalog + '<p class="issue-bottom"><a class="back-link" href="' +
    escapeHTML(sitePath('issues/')) + '">← Все выпуски</a></p></div>';
}
function articleBody(story) {
  const body = Array.isArray(story.body) && story.body.length ? story.body : story.paragraphs || [];
  const parts = [];
  let listOpen = false;
  for (const value of body) {
    const line = String(value);
    if (line.startsWith('- ')) {
      if (!listOpen) { parts.push('<ul class="article-points">'); listOpen = true; }
      const item = escapeHTML(line.slice(2)).replace(/^\*\*(.+?)\*\*/, '<strong>$1</strong>');
      parts.push('<li>' + item + '</li>');
      continue;
    }
    if (listOpen) { parts.push('</ul>'); listOpen = false; }
    if (/^#{2,3} /.test(line)) parts.push('<h2 class="story-subhead">' + escapeHTML(line.slice(line.indexOf(' ') + 1)) + '</h2>');
    else parts.push('<p>' + escapeHTML(line) + '</p>');
  }
  if (listOpen) parts.push('</ul>');
  return parts.join('');
}
function articleHighlights(story) {
  if (!Array.isArray(story.highlights)) return '';
  const highlights = story.highlights.map(item => typeof item === 'string' ? item : item?.text || '')
    .filter(Boolean);
  return highlights.length ? '<aside class="article-highlights" aria-label="Ключевые выводы">' +
    '<h2>Коротко</h2><ul>' + highlights.map(item => '<li>' + escapeHTML(item) +
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
  const meta = [...storyRubricNames(story), formatLabel(story.content_format),
    date && 'Источник от ' + dateLabel(date, story.date_precision)]
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
function interviewBody(blocks, quoteParagraphs = []) {
  const quotes = new Set(quoteParagraphs);
  return (blocks || []).map(value => {
    const line = String(value);
    if (line.startsWith('## ')) return '<h2>' + escapeHTML(line.slice(3)) + '</h2>';
    if (line.startsWith('**') && line.endsWith('**')) {
      return '<h3 class="interview-question">' + escapeHTML(line.slice(2, -2)) + '</h3>';
    }
    if (quotes.has(line) && line.startsWith('«') && line.includes('»')) {
      const end = line.indexOf('»') + 1;
      const suffix = line.slice(end);
      const punctuation = suffix.match(/^[,.;:!?]+/)?.[0] || '';
      const attribution = suffix.slice(punctuation.length).trim();
      return '<blockquote class="article-quote"><p><em>' + escapeHTML(line.slice(0, end)) +
        '</em>' + escapeHTML(punctuation) + '</p></blockquote>' +
        (attribution ? '<p class="quote-attribution">' + escapeHTML(attribution) + '</p>' : '');
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
    '<h1>' + escapeHTML(interview.title) + '</h1><p class="article-deck interview-lead">' +
    escapeHTML(interview.summary) + '</p><div class="article-tags">' +
    tagsHTML(interview.tags || []) + '</div>' + interviewWarning +
    '<section class="article-contents interview-body">' + interviewBody(interview.body, interview.quote_paragraphs) +
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
  return '<article class="tool-card" data-category="' + escapeHTML(product.task_group || 'unconfirmed') +
    '" data-russia="' + String(product.russia_relevant === true) + '" data-unconfirmed="' +
    String(unconfirmed) + '" data-search="' +
    escapeHTML([product.name, product.category, product.summary].join(' ').toLocaleLowerCase('ru-RU')) +
    '"><div class="tool-top">' + icon + '<div><h2>' + escapeHTML(product.name) +
     '</h2><p>' + escapeHTML(product.category) + '</p></div></div>' +
    '<p class="tool-summary">' + escapeHTML(product.summary || '') + '</p>' +
    '<p class="tool-status ' + (unconfirmed ? 'needs' : '') + '">' +
    (unconfirmed ? 'Функции не подтверждены' :
      product.verification_status === 'partially_confirmed' ? 'Часть возможностей не подтверждена' :
      'По данным поставщика') +
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
      '<h1>Каталог инструментов</h1>' +
      '<div class="empty-state"><h2>Каталог готовится</h2>' +
      '<p>Проверенные и одобренные карточки появятся после редакционной проверки.</p></div></div>';
    return;
  }
  const groups = [
    ['research', 'Исследования и инсайты'],
    ['ads', 'Реклама и размещение'],
    ['analytics', 'Аналитика и автоматизация'],
    ['creative', 'Контент и креатив'],
    ['unconfirmed', 'Назначение уточняется']
  ];
  $('#page-view').innerHTML = '<div class="container editorial-page tools-page"><a class="back-link" href="' +
    escapeHTML(homeHref()) + '">← На главную</a><h1>Каталог инструментов</h1><p class="editorial-intro">' +
    'ИИ-продукты для исследований, рекламы, аналитики и создания контента.</p>' +
    (state.preview ? draftWarning('Каталог') : '') +
    '<div class="tool-controls"><label>Поиск по каталогу<input id="tool-search" type="search" ' +
    'placeholder="Название, категория или задача" maxlength="120"></label>' +
    '<label>Задача<select id="tool-category"><option value="all">Все задачи</option>' +
    groups.filter(group => state.products.some(product => product.task_group === group[0]))
      .map(group => '<option value="' + group[0] + '">' + escapeHTML(group[1]) + '</option>').join('') + '</select></label>' +
    '<label class="tool-check"><input id="tool-russia" type="checkbox"> Релевантные российскому рынку</label>' +
    '<label class="tool-check"><input id="tool-unconfirmed" type="checkbox"> Показать неподтверждённые позиции</label>' +
    '</div><p id="tool-unconfirmed-note" class="article-warning" hidden>У этих позиций подтверждено только название. ' +
    'Описание возможностей нельзя считать проверенным.</p><p id="tool-count" role="status" aria-live="polite"></p>' +
    '<div class="tool-grid">' + state.products.map(toolCard).join('') + '</div>' +
    '<p class="catalog-disclaimer">Описания основаны на открытых источниках. Функции и доступность уточняйте у поставщика. Пиктограммы не являются логотипами.</p></div>';
  ['tool-search', 'tool-category', 'tool-russia', 'tool-unconfirmed'].forEach(id =>
    $('#' + id).addEventListener('input', filterTools));
  filterTools();
}
function route() {
  const path = currentRoute();
  const skipLink = $('.skip-link');
  const backToTop = $('.back-to-top');
  if (skipLink) skipLink.href = location.pathname + '#main';
  if (backToTop) backToTop.href = location.pathname + '#top';
  const legacyId = new URLSearchParams(location.search).get('article');
  const isHome = !path && !legacyId;
  $('#home-view').hidden = !isHome;
  $('#page-view').hidden = isHome;
  if (isHome) { renderHome(); return; }
  if (legacyId) { renderArticle(legacyId, true); return; }
  if (path === 'issues') { renderIssueArchive(); return; }
  if (path.startsWith('issues/')) { renderIssue(path.slice(7)); return; }
  if (path === 'rubrics') { renderRubricPage(); return; }
  if (path.startsWith('rubrics/')) { renderRubricPage(path.slice(8)); return; }
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
function setupBackToTop() {
  const control = $('.back-to-top');
  if (!control) return;
  const footer = $('.footer');
  const update = () => {
    const threshold = Math.min(800, Math.max(500, Math.round(window.innerHeight * .9)));
    control.hidden = window.scrollY < threshold;
    if (!control.hidden && footer) {
      const overlap = Math.max(0, window.innerHeight - footer.getBoundingClientRect().top);
      control.style.setProperty('--footer-overlap', Math.ceil(overlap) + 'px');
    }
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('pageshow', update);
  update();
}
async function readJSON(path) {
  const response = await fetch(new URL(path, siteBase), { cache: 'no-store' });
  if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
  return response.json();
}
async function init() {
  setupNavigation();
  setupBackToTop();
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
    window.addEventListener('popstate', () => {
      route();
    });
  } catch (error) {
    const message = '<div class="empty-state"><h2>Не удалось загрузить материалы</h2>' +
      '<p>Проверьте локальный сервер и файлы сборки. Причина: ' +
      escapeHTML(error.message) + '</p></div>';
    $('#home-view').hidden = false;
    $('#page-view').hidden = true;
    const target = $('#page-view');
    if (target) {
      $('#home-view').hidden = true;
      target.hidden = false;
      target.innerHTML = '<div class="container editorial-page">' + message + '</div>';
    }
    $('#lead').hidden = true;
    console.error('Digest initialization failed:', error);
  }
}
init();

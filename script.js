/* ============================================================
   CollegeROI Ireland - Main Script
   ============================================================ */

'use strict';

// State
let allCourses     = [];
let allCoursesData = [];
let investmentChartInstance = null;
let coursesLoaded  = false;
let currentCourseData = null;
let activeFilters  = { universities: [], fields: [], sortBy: 'roi-desc' };
let livingSituation = 'renting'; // 'renting' | 'home'

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:5000'
    : '';

/* ============================================================
   Navigation
   ============================================================ */

function switchView(viewName) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewName + 'View').classList.add('active');
    if (viewName === 'explore' && allCoursesData.length > 0) {
        renderCourseGrid(sortCourses(allCoursesData, activeFilters.sortBy));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
}

function toggleFaq(btn) {
    const item = btn.closest('.faq-item');
    const wasOpen = item.classList.contains('open');
    item.parentElement.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
}

function showError(msg) {
    const banner = document.getElementById('errorBanner');
    const msgEl  = document.getElementById('errorMsg');
    if (!banner || !msgEl) return;
    msgEl.textContent = msg;
    banner.style.display = 'block';
    banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { banner.style.display = 'none'; }, 8000);
}

/* ============================================================
   Bootstrap - single bulk request
   ============================================================ */

window.onload = function () {
    fetch(`${API_BASE_URL}/courses-bulk`)
        .then(r => {
            if (!r.ok) throw new Error('Failed to load courses from server');
            return r.json();
        })
        .then(data => {
            if (!data.success || !Array.isArray(data.courses)) {
                throw new Error('Invalid data received from server');
            }
            allCoursesData = data.courses;
            allCourses     = allCoursesData.map(c => c.course_name);
            coursesLoaded  = true;
            populateCourseDropdowns();
            renderQuickPicks();
            renderCmpPopularGrid();
            initHeroTicker(allCoursesData);
            checkShareParams();
        })
        .catch(err => {
            console.error('Bootstrap error:', err);
            showError('Failed to load courses. Make sure the Flask server is running on port 5000.');
        });
};

// Most popular CAO courses by application volume (source: CAO stats 2024-2025)
const POPULAR_COURSE_NAMES = [
    'Business/Commerce - UCD',
    'Nursing - UCD',
    'Computer Science - UCD',
    'Medicine - UCD',
    'Law - UCD',
    'Psychology - UCD',
];

function renderQuickPicks() {
    const grid = document.getElementById('quickPickGrid');
    if (!grid || allCoursesData.length === 0) return;
    // Use curated popular list, fall back to top ROI if a course isn't in dataset
    const nameSet = new Set(allCoursesData.map(c => c.course_name));
    const popularNames = POPULAR_COURSE_NAMES.filter(n => nameSet.has(n));
    const top = popularNames.length >= 6
        ? popularNames.map(n => allCoursesData.find(c => c.course_name === n))
        : [...allCoursesData].sort((a, b) => b.roi_5_years - a.roi_5_years).slice(0, 6);
    grid.innerHTML = top.map(c => {
        const shortName = c.course_name.includes(' - ') ? c.course_name.split(' - ').slice(0, -1).join(' - ') : c.course_name;
        const enc = c.course_name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const colorCls = fieldColorClass(c.course_name);
        return `<div class="qp-card ${colorCls}" onclick="quickPickCourse('${enc}')" role="button" tabindex="0"
                     onkeydown="if(event.key==='Enter')quickPickCourse('${enc}')">
            <div class="qp-name" title="${shortName}">${shortName}</div>
            <div class="qp-uni">${c.university}</div>
            <div class="qp-stats">
                <div class="qp-stat"><div class="qp-stat-val">${c.roi_5_years}%</div><div class="qp-stat-label">5yr ROI</div></div>
                <div class="qp-divider"></div>
                <div class="qp-stat"><div class="qp-stat-val">€${(c.starting_salary/1000).toFixed(0)}k</div><div class="qp-stat-label">Starting salary</div></div>
            </div>
        </div>`;
    }).join('');
}

/* ============================================================
   Hero stat ticker
   ============================================================ */

function initHeroTicker(courses) {
    const textEl = document.getElementById('heroTickerText');
    if (!textEl || !courses.length) return;

    const shortName = c => c.course_name.includes(' - ')
        ? c.course_name.split(' - ').slice(0, -1).join(' - ')
        : c.course_name;

    const byROI     = [...courses].sort((a, b) => b.roi_5_years - a.roi_5_years);
    const byPayback = [...courses].sort((a, b) => a.payback_years - b.payback_years);
    const byNatComp = courses
        .filter(c => c.analysis && c.analysis.national_comparison)
        .sort((a, b) => b.analysis.national_comparison.after5_vs_average_pct - a.analysis.national_comparison.after5_vs_average_pct);
    const byCao = courses
        .filter(c => c.cao_points)
        .sort((a, b) => a.cao_points - b.cao_points);

    const total  = courses.length;
    const avgROI = Math.round(courses.reduce((sum, c) => sum + c.roi_5_years, 0) / total);

    const facts = [];
    if (byROI[0])     facts.push(`${shortName(byROI[0])} (${byROI[0].university}) has a ${byROI[0].roi_5_years}% 5-year ROI`);
    if (byPayback[0]) facts.push(`${shortName(byPayback[0])} pays back its tuition in just ${byPayback[0].payback_years} years`);
    if (byNatComp[0]) facts.push(`${shortName(byNatComp[0])} grads earn ${byNatComp[0].analysis.national_comparison.after5_vs_average_pct >= 0 ? '+' : ''}${byNatComp[0].analysis.national_comparison.after5_vs_average_pct}% vs the national average after 5 years`);
    if (byCao[0])     facts.push(`${shortName(byCao[0])} needs just ${byCao[0].cao_points} CAO points`);
    facts.push(`Average 5-year ROI across all ${total} courses: ${avgROI}%`);

    if (!facts.length) return;

    let i = 0;
    function show() {
        textEl.textContent = facts[i % facts.length];
        textEl.classList.remove('ht-anim');
        void textEl.offsetWidth;
        textEl.classList.add('ht-anim');
        i++;
    }
    show();
    if (facts.length > 1) setInterval(show, 5000);
}

/* ============================================================
   CAO key dates countdown (desktop side rail)
   ============================================================ */

const CAO_KEY_DATES = [
    { date: '2026-07-01T17:00:00', title: 'Change of Mind deadline', sub: 'Last chance to reorder/change CAO course choices' },
    { date: '2026-08-21T10:00:00', title: 'Leaving Cert results', sub: 'Results released via the candidate portal' },
    { date: '2026-08-22T00:00:00', title: 'CAO Round 1 offers', sub: 'First round college offers issued' },
    { date: '2026-08-26T17:00:00', title: 'Round 1 acceptance deadline', sub: 'Last date to accept your Round 1 offer' },
    { date: '2026-09-02T00:00:00', title: 'CAO Round 2 offers', sub: 'Second round offers issued (if applicable)' },
];

function renderCaoDatesWidget() {
    const list = document.getElementById('caoDatesList');
    if (!list) return;

    const now = new Date();
    const upcoming = CAO_KEY_DATES
        .map(d => ({ ...d, daysLeft: Math.ceil((new Date(d.date) - now) / (1000 * 60 * 60 * 24)) }))
        .filter(d => d.daysLeft >= 0)
        .slice(0, 3);

    if (!upcoming.length) {
        list.innerHTML = '<div class="cao-dates-empty">No upcoming CAO deadlines right now. Check back closer to the next admissions cycle.</div>';
        return;
    }

    list.innerHTML = upcoming.map(d => `
        <div class="cao-date-item">
            <div class="cao-date-days">${d.daysLeft}<span>${d.daysLeft === 1 ? 'day' : 'days'}</span></div>
            <div class="cao-date-info">
                <div class="cao-date-title">${d.title}</div>
                <div class="cao-date-sub">${d.sub}</div>
            </div>
        </div>
    `).join('');
}

function scheduleCaoDatesRefresh() {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const msUntilMidnight = nextMidnight - now;

    setTimeout(function tick() {
        renderCaoDatesWidget();
        setInterval(renderCaoDatesWidget, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
}

function quickPickCourse(course) {
    document.getElementById('course').value = course;
    document.getElementById('resultsPlaceholder').style.display = 'none';
    calculateROI();
}

function populateCourseDropdowns() {
    const dd = document.getElementById('course');
    allCourses.forEach(name => dd.add(new Option(name, name)));
}

/* ============================================================
   DOMContentLoaded - wire controls
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

    initCompareSearch();
    renderCaoDatesWidget();
    scheduleCaoDatesRefresh();

    // Search
    initSearchBox({
        inputId: 'courseSearch',
        dropId:  'searchDrop',
        clearId: 'clearSearch',
        onPick:  pickFromSearch,
        excludeFn: () => []
    });
});

/* ============================================================
   Search
   ============================================================ */

// Lets users type a full university name and still match the
// short suffix used in course keys (e.g. "Computer Science - UCD").
const UNI_ALIASES = {
    'university college dublin': 'UCD', 'ucd': 'UCD',
    'trinity college dublin': 'TCD', 'trinity': 'TCD', 'tcd': 'TCD',
    'university college cork': 'UCC', 'cork': 'UCC', 'ucc': 'UCC',
    'university of limerick': 'UL', 'limerick': 'UL',
    'university of galway': 'Galway', 'nuig': 'Galway', 'galway': 'Galway',
    'maynooth university': 'Maynooth', 'maynooth': 'Maynooth', 'nuim': 'Maynooth',
    'dublin city university': 'DCU', 'dcu': 'DCU',
    'tu dublin': 'TU Dublin', 'technological university dublin': 'TU Dublin',
    'royal college of surgeons': 'RCSI', 'rcsi': 'RCSI',
};

function resolveUniAlias(query) {
    const lq = query.toLowerCase().trim();
    if (lq.length < 3) return null; // avoid noisy matches while the user is still typing
    for (const [alias, abbr] of Object.entries(UNI_ALIASES)) {
        if (alias.includes(lq) || lq.includes(alias)) return abbr;
    }
    return null;
}

function searchCourses(query) {
    const lq = query.toLowerCase();
    const direct = allCourses.filter(c => c.toLowerCase().includes(lq));
    const aliasAbbr = resolveUniAlias(query);
    if (!aliasAbbr) return direct;
    const aliasMatches = allCourses.filter(c => c.endsWith(` - ${aliasAbbr}`));
    // merge, direct matches first, no duplicates
    const seen = new Set(direct);
    aliasMatches.forEach(c => { if (!seen.has(c)) { direct.push(c); seen.add(c); } });
    return direct;
}

/**
 * Generic, reusable search box: handles input, debounced filtering,
 * keyboard navigation (Up/Down/Enter/Escape), click-outside-to-close,
 * and ARIA combobox attributes. Used by both the course search and
 * the compare search so behaviour stays consistent everywhere.
 */
function initSearchBox({ inputId, dropId, clearId, onPick, excludeFn, renderItem }) {
    const input = document.getElementById(inputId);
    const drop  = document.getElementById(dropId);
    const clearBtn = clearId ? document.getElementById(clearId) : null;
    if (!input || !drop) return;

    let results = [];
    let activeIndex = -1;
    let debounceTimer = null;

    function close() {
        drop.style.display = 'none';
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        activeIndex = -1;
    }

    function highlight(idx) {
        const items = drop.querySelectorAll('.search-item');
        items.forEach(it => it.classList.remove('active'));
        if (idx >= 0 && items[idx]) {
            items[idx].classList.add('active');
            items[idx].scrollIntoView({ block: 'nearest' });
            input.setAttribute('aria-activedescendant', items[idx].id);
        } else {
            input.removeAttribute('aria-activedescendant');
        }
        activeIndex = idx;
    }

    function runSearch(q) {
        const excluded = excludeFn ? excludeFn() : [];
        results = searchCourses(q).filter(c => !excluded.includes(c)).slice(0, 8);

        if (results.length === 0) {
            drop.innerHTML = `<div class="search-empty">No courses match "${q.replace(/</g, '&lt;')}"</div>`;
            drop.style.display = 'block';
            input.setAttribute('aria-expanded', 'true');
            activeIndex = -1;
            return;
        }

        const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(${escapedQ})`, 'gi');

        drop.innerHTML = results.map((course, i) => {
            if (renderItem) return renderItem(course, re, i, dropId);
            const uni  = course.includes(' - ') ? course.split(' - ').pop() : '';
            const safe = course.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const hl   = safe.replace(re, m => `<mark>${m}</mark>`);
            return `<div class="search-item" id="${dropId}-opt-${i}" data-idx="${i}" role="option">
                <div>${hl}</div>
                ${uni ? `<div class="search-meta">${uni}</div>` : ''}
            </div>`;
        }).join('');
        drop.style.display = 'block';
        input.setAttribute('aria-expanded', 'true');
        activeIndex = -1;

        drop.querySelectorAll('.search-item').forEach((el, i) => {
            el.addEventListener('click', () => { onPick(results[i]); close(); });
        });
    }

    input.addEventListener('input', function () {
        const q = this.value.trim();
        if (clearBtn) clearBtn.style.display = q.length ? 'flex' : 'none';
        clearTimeout(debounceTimer);
        if (q.length === 0) { close(); return; }
        debounceTimer = setTimeout(() => runSearch(q), 80);
    });

    input.addEventListener('keydown', function (e) {
        const visible = drop.style.display === 'block';
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!visible || results.length === 0) return;
            highlight(Math.min(activeIndex + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!visible || results.length === 0) return;
            highlight(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'Enter') {
            if (visible && activeIndex >= 0 && results[activeIndex]) {
                e.preventDefault();
                onPick(results[activeIndex]);
                close();
            }
        } else if (e.key === 'Escape') {
            close();
        }
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            input.value = '';
            clearBtn.style.display = 'none';
            close();
            input.focus();
        });
    }

    document.addEventListener('click', function (e) {
        if (!input.contains(e.target) && !drop.contains(e.target)) close();
    });
}

function pickFromSearch(course) {
    const select = document.getElementById('course');
    select.value = course;
    // brief visual confirmation so the choice is obvious on mobile,
    // where the long listbox may be scrolled out of view
    Array.from(select.options).forEach(o => o.selected = o.value === course);
    select.classList.add('select-flash');
    setTimeout(() => select.classList.remove('select-flash'), 600);
    if (typeof select.scrollIntoView === 'function') {
        const selectedOpt = Array.from(select.options).find(o => o.value === course);
        if (selectedOpt) selectedOpt.scrollIntoView({ block: 'center' });
    }
    document.getElementById('courseSearch').value = '';
    const clearBtn = document.getElementById('clearSearch');
    if (clearBtn) clearBtn.style.display = 'none';
    document.getElementById('searchDrop').style.display = 'none';
}

/* ============================================================
   University filter (pills in calculator)
   ============================================================ */

function filterByUni(evt, uni) {
    const dd = document.getElementById('course');
    Array.from(dd.options).forEach(opt => {
        opt.style.display = opt.value.endsWith(` - ${uni}`) ? '' : 'none';
    });
    document.querySelectorAll('#uniPills .pill').forEach(b => b.classList.remove('on'));
    evt.currentTarget.classList.add('on');
    dd.value = '';
    dd.selectedIndex = -1;
}

function showAllCourses(evt) {
    Array.from(document.getElementById('course').options).forEach(opt => { opt.style.display = ''; });
    document.querySelectorAll('#uniPills .pill').forEach(b => b.classList.remove('on'));
    evt.currentTarget.classList.add('on');
    document.getElementById('course').value = '';
}

/* ============================================================
   Calculate ROI (single course)
   ============================================================ */

/* ── Email capture ───────────────────────────────────────── */

let subShown = false;

function maybeShowSubModal() {
    if (subShown) return;
    if (localStorage.getItem('sub_done')) return;
    const dismissed = localStorage.getItem('sub_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;
    subShown = true;
    setTimeout(() => {
        document.getElementById('subModal')?.classList.add('visible');
        document.getElementById('subOverlay')?.classList.add('visible');
    }, 2500);
}

function closeSubModal() {
    document.getElementById('subModal')?.classList.remove('visible');
    document.getElementById('subOverlay')?.classList.remove('visible');
    localStorage.setItem('sub_dismissed', Date.now());
}

function handleSubscribe(e, source) {
    e.preventDefault();
    const form = e.target;
    const email = form.querySelector('input[type="email"]').value.trim();
    const msgEl = document.getElementById(source === 'modal' ? 'modalSubMsg' : 'footerSubMsg');
    const btn = form.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.textContent = 'Sending…';

    fetch(`${API_BASE_URL}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('sub_done', '1');
            form.innerHTML = '<p class="sub-success">✓ You\'re on the list!</p>';
            if (source === 'modal') {
                setTimeout(closeSubModal, 1800);
            }
        } else {
            if (msgEl) msgEl.textContent = data.error || 'Something went wrong.';
            btn.disabled = false;
            btn.textContent = source === 'modal' ? 'Notify me' : 'Notify me';
        }
    })
    .catch(() => {
        if (msgEl) msgEl.textContent = 'Could not connect. Please try again.';
        btn.disabled = false;
        btn.textContent = 'Notify me';
    });
}

function setLiving(btn) {
    livingSituation = btn.dataset.val;
    document.querySelectorAll('.living-btn').forEach(b => b.classList.toggle('active', b === btn));
    const hints = { renting: '~€18,000/yr · rent, food, transport &amp; bills (Dublin higher)', home: '~€5,000/yr · food, transport, books &amp; personal spend' };
    const hint = document.getElementById('livingHint');
    if (hint) hint.innerHTML = hints[livingSituation];
    if (currentCourseData) calculateROI();
}

function calculateROI() {
    if (!coursesLoaded) { showError('Courses are still loading. Please wait a moment.'); return; }

    const course = document.getElementById('course').value;
    if (!course) { showError('Please select a course first.'); return; }

    const url = `${API_BASE_URL}/calculate?course=${encodeURIComponent(course)}&living=${livingSituation}`;

    const btn = document.getElementById('calcBtn');
    if (btn) { btn.textContent = 'Calculating…'; btn.disabled = true; }

    fetch(url)
        .then(r => {
            if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Server error'); });
            return r.json();
        })
        .then(data => {
            if (!data.success) throw new Error(data.error || 'Calculation failed');

            currentCourseData = data.data;
            displaySingleResult(currentCourseData);
            maybeShowSubModal();
        })
        .catch(err => {
            console.error(err);
            showError(err.message || 'Failed to calculate.');
        })
        .finally(() => {
            if (btn) { btn.textContent = 'Calculate ROI'; btn.disabled = false; }
        });
}

/* ============================================================
   Display Single Result
   ============================================================ */

function ratingDots(value, max) {
    const filled = Math.round(value);
    return Array.from({ length: max }, (_, i) =>
        `<span class="rdot ${i < filled ? 'rdot-on' : ''}"></span>`
    ).join('');
}

function careerStatIcon(key) {
    const icons = {
        employment:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
        satisfaction:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
        security:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        remote:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
        study:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
        internship:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        growth:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
        balance:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`,
    };
    return icons[key] || '';
}

function displaySingleResult(d) {
    const ph = document.getElementById('resultsPlaceholder');
    const el = document.getElementById('results');
    if (ph) ph.style.display = 'none';
    el.style.display = 'block';
    el.classList.remove('fade-in-up');
    void el.offsetWidth; // restart animation
    el.classList.add('fade-in-up');

    const salaryIncrease = Math.round(((d.salary_after_5_years - d.starting_salary) / d.starting_salary) * 100);
    const roi            = d.roi_5_years;

    const colorCls   = fieldColorClass(d.course_name);
    const accentColor = { 'field-tech':'#2563eb','field-health':'#16a34a','field-business':'#7c3aed','field-law':'#b45309','field-engineering':'#0891b2','field-education':'#db2777','field-arts':'#ea580c','field-default':'#64748b' }[colorCls] || '#2563eb';
    const fieldLabel  = { 'field-tech':'Technology','field-health':'Healthcare','field-business':'Business','field-law':'Law','field-engineering':'Engineering','field-education':'Education','field-arts':'Arts & Humanities','field-default':'Academic' }[colorCls] || 'Academic';

    const roiRating   = d.analysis ? d.analysis.roi_rating : (roi > 400 ? 'Excellent' : roi > 250 ? 'Good' : 'Fair');
    const roiBadgeClass = roi > 400 ? 'badge-green' : roi > 250 ? 'badge-blue' : 'badge-amber';

    // Career section
    let careerHTML = '';
    if (d.course_data) {
        const cd = d.course_data;
        const employers = (cd.top_employers || []).map(e => `<span class="rv2-employer-tag">${e}</span>`).join('');
        const roles     = (cd.typical_roles  || []).map(r => `<span class="rv2-role-chip">${r}</span>`).join('');

        careerHTML = `
        <div class="rv2-section">
            <div class="rv2-section-title">Career snapshot</div>
            <div class="rv2-career-grid">
                <div class="rv2-career-stat">
                    <div class="rv2-cs-icon" style="background:${accentColor}18;color:${accentColor}">${careerStatIcon('employment')}</div>
                    <div><div class="rv2-cs-val" style="color:${accentColor}">${cd.employment_rate}%</div><div class="rv2-cs-label">Employed within 9 months</div></div>
                </div>
                <div class="rv2-career-stat">
                    <div class="rv2-cs-icon" style="background:${accentColor}18;color:${accentColor}">${careerStatIcon('satisfaction')}</div>
                    <div><div class="rv2-cs-val">${ratingDots(cd.graduate_satisfaction, 5)}</div><div class="rv2-cs-label">Graduate satisfaction</div></div>
                </div>
                <div class="rv2-career-stat">
                    <div class="rv2-cs-icon" style="background:${accentColor}18;color:${accentColor}">${careerStatIcon('security')}</div>
                    <div><div class="rv2-cs-val">${cd.job_security}</div><div class="rv2-cs-label">Job security</div></div>
                </div>
                <div class="rv2-career-stat">
                    <div class="rv2-cs-icon" style="background:${accentColor}18;color:${accentColor}">${careerStatIcon('remote')}</div>
                    <div><div class="rv2-cs-val">${cd.remote_work_availability}</div><div class="rv2-cs-label">Remote work</div></div>
                </div>
                <div class="rv2-career-stat">
                    <div class="rv2-cs-icon" style="background:${accentColor}18;color:${accentColor}">${careerStatIcon('balance')}</div>
                    <div><div class="rv2-cs-val">${ratingDots(cd.work_life_balance, 5)}</div><div class="rv2-cs-label">Work-life balance</div></div>
                </div>
                <div class="rv2-career-stat">
                    <div class="rv2-cs-icon" style="background:${accentColor}18;color:${accentColor}">${careerStatIcon('study')}</div>
                    <div><div class="rv2-cs-val">${cd.further_study_rate}%</div><div class="rv2-cs-label">Pursue postgrad</div></div>
                </div>
                ${cd.internship_opportunities ? `
                <div class="rv2-career-stat">
                    <div class="rv2-cs-icon" style="background:${accentColor}18;color:${accentColor}">${careerStatIcon('internship')}</div>
                    <div><div class="rv2-cs-val">${cd.internship_opportunities.split(' - ')[0]}</div><div class="rv2-cs-label">Internships</div></div>
                </div>` : ''}
                ${cd.industry_growth_rate ? `
                <div class="rv2-career-stat">
                    <div class="rv2-cs-icon" style="background:${accentColor}18;color:${accentColor}">${careerStatIcon('growth')}</div>
                    <div><div class="rv2-cs-val">${cd.industry_growth_rate}</div><div class="rv2-cs-label">Industry growth</div></div>
                </div>` : ''}
            </div>
        </div>

        ${employers ? `
        <div class="rv2-section">
            <div class="rv2-section-title">Top employers</div>
            <div class="rv2-employer-wrap">${employers}</div>
        </div>` : ''}

        ${roles ? `
        <div class="rv2-section">
            <div class="rv2-section-title">Typical roles</div>
            <div class="rv2-roles-wrap">${roles}</div>
        </div>` : ''}
        `;
    }

    const nat = d.analysis && d.analysis.national_comparison;

    const shortName = d.course_name.includes(' - ') ? d.course_name.split(' - ').slice(0,-1).join(' - ') : d.course_name;

    const html = `
    <div class="rv2" style="--accent:${accentColor}">

        <!-- Gradient banner -->
        <div class="rv2-banner" style="background:linear-gradient(135deg,${accentColor}d0 0%,${accentColor} 100%)">
            <div class="rv2-banner-inner">
                <span class="rv2-field-pill">${fieldLabel}</span>
                <div class="rv2-course-name">${shortName}</div>
                <div class="rv2-university">${d.university}</div>
                ${d.cao_points ? `<div class="rv2-cao-pill">CAO ${d.cao_points} points <span class="rv2-cao-meta">· ${d.cao_code} · ${d.cao_points_year} R1</span></div>` : ''}
            </div>
            <div class="rv2-banner-roi">
                <div class="rv2-roi-label">5-yr ROI</div>
                <div class="rv2-roi-num" id="roiCounter">0<span class="rv2-roi-pct">%</span></div>
                <span class="result-roi-badge badge-white">${roiRating}</span>
            </div>
        </div>

        <!-- Key stats row -->
        <div class="rv2-key-stats">
            <div class="rv2-key-stat">
                <div class="rv2-ks-icon" style="background:${accentColor}14;color:${accentColor}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                </div>
                <div class="rv2-ks-value">€${(d.total_cost/1000).toFixed(0)}k</div>
                <div class="rv2-ks-label">Total cost</div>
                <div class="rv2-ks-sub">Fees + ${d.living_situation === 'home' ? 'home' : 'rent'} × ${d.course_length} yrs</div>
            </div>
            <div class="rv2-key-stat">
                <div class="rv2-ks-icon" style="background:${accentColor}14;color:${accentColor}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div class="rv2-ks-value">€${(d.starting_salary/1000).toFixed(0)}k</div>
                <div class="rv2-ks-label">Starting salary</div>
                <div class="rv2-ks-sub">€${Math.round(d.starting_salary/12).toLocaleString()}/mo</div>
            </div>
            <div class="rv2-key-stat">
                <div class="rv2-ks-icon" style="background:${accentColor}14;color:${accentColor}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div class="rv2-ks-value" style="color:${accentColor}">${d.payback_years.toFixed(1)} yr</div>
                <div class="rv2-ks-label">Payback period</div>
                <div class="rv2-ks-sub">to recover cost</div>
            </div>
        </div>

        <!-- Insight -->
        ${d.analysis ? `
        <div class="rv2-insight" style="border-left-color:${accentColor};background:${accentColor}0a">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" aria-hidden="true" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>${d.analysis.recommendation}</span>
        </div>` : ''}

        <!-- Salary progression -->
        <div class="rv2-section">
            <div class="rv2-section-title">Salary progression</div>
            <div class="rv2-salary-track">
                <div class="rv2-sal-node">
                    <div class="rv2-sal-dot" style="border-color:${accentColor}40"></div>
                    <div class="rv2-sal-year">Year 1</div>
                    <div class="rv2-sal-amount">€${(d.starting_salary/1000).toFixed(0)}k</div>
                </div>
                <div class="rv2-sal-line" style="background:linear-gradient(90deg,${accentColor}30,${accentColor})"></div>
                <div class="rv2-sal-growth-badge" style="background:${accentColor};color:#fff">+${salaryIncrease}%</div>
                <div class="rv2-sal-line" style="background:linear-gradient(90deg,${accentColor},${accentColor}30)"></div>
                <div class="rv2-sal-node">
                    <div class="rv2-sal-dot" style="background:${accentColor};border-color:${accentColor}"></div>
                    <div class="rv2-sal-year">After 5 years</div>
                    <div class="rv2-sal-amount" style="color:${accentColor}">€${(d.salary_after_5_years/1000).toFixed(0)}k</div>
                </div>
            </div>
        </div>

        <!-- Chart -->
        <div class="rv2-section">
            <div class="rv2-section-title">Investment vs 5-year earnings</div>
            <div class="chart-wrap">
                <canvas id="investmentChart" role="img" aria-label="Bar chart comparing investment to 5-year earnings"></canvas>
            </div>
        </div>

        ${careerHTML}

        <!-- National wage comparison -->
        ${nat ? `
        <div class="rv2-nat-compare" style="background:linear-gradient(135deg,${accentColor}14,${accentColor}06);border-color:${accentColor}20">
            <div class="rv2-lt-label">How this compares to Irish wages</div>
            <div class="rv2-nat-row">
                <div class="rv2-nat-row-top">
                    <span>Starting salary vs national median (€${(nat.median_wage/1000).toFixed(0)}k)</span>
                    <span class="rv2-nat-pct" style="color:${accentColor}">${nat.start_vs_median_pct >= 0 ? '+' : ''}${nat.start_vs_median_pct}%</span>
                </div>
                <div class="rv2-nat-track">
                    <div class="rv2-nat-fill" style="width:${Math.min(100, Math.max(4, (d.starting_salary / (Math.max(d.starting_salary, nat.median_wage) * 1.1)) * 100))}%;background:${accentColor}"></div>
                    <div class="rv2-nat-marker" style="left:${Math.min(100, (nat.median_wage / (Math.max(d.starting_salary, nat.median_wage) * 1.1)) * 100)}%"></div>
                </div>
            </div>
            <div class="rv2-nat-row">
                <div class="rv2-nat-row-top">
                    <span>Salary after 5 yrs vs national average (€${(nat.average_wage/1000).toFixed(0)}k)</span>
                    <span class="rv2-nat-pct" style="color:${accentColor}">${nat.after5_vs_average_pct >= 0 ? '+' : ''}${nat.after5_vs_average_pct}%</span>
                </div>
                <div class="rv2-nat-track">
                    <div class="rv2-nat-fill" style="width:${Math.min(100, Math.max(4, (d.salary_after_5_years / (Math.max(d.salary_after_5_years, nat.average_wage) * 1.1)) * 100))}%;background:${accentColor}"></div>
                    <div class="rv2-nat-marker" style="left:${Math.min(100, (nat.average_wage / (Math.max(d.salary_after_5_years, nat.average_wage) * 1.1)) * 100)}%"></div>
                </div>
            </div>
            <div class="rv2-lt-sub">The marker shows where the national figure sits on the bar. Source: CSO Earnings &amp; Labour Costs 2025.</div>
        </div>` : ''}

        <!-- Share button -->
        <div class="rv2-share-row">
            <button class="rv2-share-btn" onclick="shareResult()" id="shareBtn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share this result
            </button>
            <span class="rv2-share-toast" id="shareToast">Link copied!</span>
        </div>

    </div>`;

    el.innerHTML = html;
    animateCounter('roiCounter', roi, '%');
    requestAnimationFrame(() => createInvestmentChart(d, accentColor));
    if (window.innerWidth < 768) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
}

/* ============================================================
   Share result
   ============================================================ */

function checkShareParams() {
    const params = new URLSearchParams(window.location.search);
    const course = params.get('course');
    const living = params.get('living');
    if (!course) return;
    if (living === 'home' || living === 'renting') {
        livingSituation = living;
        document.querySelectorAll('.living-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.val === living);
        });
        const hint = document.getElementById('livingHint');
        if (hint) hint.textContent = living === 'home' ? '~€5,000/yr · food, transport & bills (parents cover rent)' : '~€18,000/yr · rent, food, transport & bills (Dublin higher)';
    }
    const dd = document.getElementById('course');
    if (dd) {
        for (let i = 0; i < dd.options.length; i++) {
            if (dd.options[i].value === course) { dd.selectedIndex = i; break; }
        }
    }
    calculateROI();
}

function shareResult() {
    if (!currentCourseData) return;
    const course = currentCourseData.course_name;
    const living = currentCourseData.living_situation || livingSituation;
    const url = `${window.location.origin}/?course=${encodeURIComponent(course)}&living=${encodeURIComponent(living)}`;
    navigator.clipboard.writeText(url).then(() => {
        const toast = document.getElementById('shareToast');
        if (toast) {
            toast.classList.add('visible');
            setTimeout(() => toast.classList.remove('visible'), 2200);
        }
    }).catch(() => {
        prompt('Copy this link:', url);
    });
}

/* ============================================================
   Animated counter
   ============================================================ */

function animateCounter(elementId, target, suffix, duration = 900) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const startTime = performance.now();

    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3);
        const current  = Math.round(target * eased);
        el.innerHTML   = current + `<span style="font-size:0.55em;vertical-align:baseline;">${suffix}</span>`;
        if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

/* ============================================================
   Investment Chart
   ============================================================ */

function createInvestmentChart(data, accent) {
    const canvas = document.getElementById('investmentChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (investmentChartInstance) {
        investmentChartInstance.destroy();
        investmentChartInstance = null;
    }

    const ac = accent || '#2563eb';
    const totalCost = data.total_cost;
    const earnings  = data.annual_net_income * 5;
    const profit    = earnings - totalCost;

    const chartDefaults = {
        font: { family: "'Inter', -apple-system, sans-serif" },
    };

    investmentChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['You Invest', 'You Earn (5 yrs)', 'Net Profit'],
            datasets: [{
                data: [totalCost, earnings, profit],
                backgroundColor: [`#94a3b820`, `${ac}28`, `${ac}50`],
                borderColor:     ['#94a3b8', ac, ac],
                borderWidth: 2,
                borderRadius: 10,
                borderSkipped: false,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#fff',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    titleColor: '#0f172a',
                    bodyColor: '#475569',
                    padding: 12,
                    cornerRadius: 8,
                    titleFont: { size: 13, weight: '600', family: "'Inter', sans-serif" },
                    bodyFont: { size: 13, family: "'Inter', sans-serif" },
                    callbacks: { label: ctx => '  €' + ctx.parsed.y.toLocaleString() },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => '€' + (v / 1000) + 'k', font: { size: 11, family: "'Inter', sans-serif" }, color: '#94a3b8' },
                    grid: { color: '#f1f5f9' },
                    border: { display: false },
                },
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { font: { size: 12, weight: '600', family: "'Inter', sans-serif" }, color: '#475569' },
                },
            },
        },
    });
}

/* ============================================================
   Browse - filters
   ============================================================ */

function toggleField(button) {
    button.classList.toggle('on');
    applyFilters();
}

function applyFilters() {
    document.querySelectorAll('.qs-chip').forEach(b => b.classList.remove('on'));

    activeFilters.universities = Array.from(document.querySelectorAll('.chip-check input:checked')).map(cb => cb.value);
    activeFilters.fields       = Array.from(document.querySelectorAll('.chip[data-field].on')).map(b => b.dataset.field);
    activeFilters.sortBy       = document.getElementById('sortBy')?.value || 'roi-desc';

    let filtered = [...allCoursesData];

    if (activeFilters.universities.length > 0) {
        filtered = filtered.filter(c => activeFilters.universities.some(u => c.course_name.endsWith(` - ${u}`)));
    }

    if (activeFilters.fields.length > 0) {
        filtered = filtered.filter(c => {
            const field = c.course_name.split(' - ')[0];
            return activeFilters.fields.some(f => field.toLowerCase().includes(f.toLowerCase()));
        });
    }

    renderCourseGrid(sortCourses(filtered, activeFilters.sortBy));
}

function sortCourses(courses, sortBy) {
    const s = [...courses];
    switch (sortBy) {
        case 'roi-desc':     s.sort((a, b) => b.roi_5_years   - a.roi_5_years);   break;
        case 'roi-asc':      s.sort((a, b) => a.roi_5_years   - b.roi_5_years);   break;
        case 'payback-asc':  s.sort((a, b) => a.payback_years - b.payback_years); break;
        case 'payback-desc': s.sort((a, b) => b.payback_years - a.payback_years); break;
        case 'cost-asc':     s.sort((a, b) => a.total_cost    - b.total_cost);    break;
        case 'cost-desc':    s.sort((a, b) => b.total_cost    - a.total_cost);    break;
        case 'name':         s.sort((a, b) => a.course_name.localeCompare(b.course_name)); break;
    }
    return s;
}

function resetFilters() {
    document.querySelectorAll('.chip-check input').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('.chip[data-field]').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.qs-chip').forEach(b => b.classList.remove('on'));
    const sortEl = document.getElementById('sortBy');
    if (sortEl) sortEl.value = 'roi-desc';
    activeFilters = { universities: [], fields: [], sortBy: 'roi-desc' };
    renderCourseGrid(allCoursesData);
}

function showTop5(type) {
    document.querySelectorAll('.chip-check input').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('.chip[data-field]').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.qs-chip').forEach(b => b.classList.remove('on'));
    event.currentTarget.classList.add('on');

    const sortKey = type === 'roi' ? 'roi-desc' : type === 'payback' ? 'payback-asc' : 'cost-asc';
    renderCourseGrid(sortCourses(allCoursesData, sortKey).slice(0, 5));
    document.getElementById('courseGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const FIELD_COLORS = [
    { keywords: ['computer science','software','cybersecurity','artificial intelligence','data science','data analytics'], cls: 'field-tech' },
    { keywords: ['nursing','medicine','pharmacy','physiotherapy','occupational therapy','speech','radiography','dentistry','biomedical','veterinary'], cls: 'field-health' },
    { keywords: ['business','commerce','finance','business analytics','actuarial','economics'], cls: 'field-business' },
    { keywords: ['law'], cls: 'field-law' },
    { keywords: ['engineering'], cls: 'field-engineering' },
    { keywords: ['education','teaching'], cls: 'field-education' },
    { keywords: ['psychology','social work','communications','architecture'], cls: 'field-arts' },
];

function fieldColorClass(courseName) {
    const lower = courseName.toLowerCase();
    for (const { keywords, cls } of FIELD_COLORS) {
        if (keywords.some(k => lower.includes(k))) return cls;
    }
    return 'field-default';
}

function renderCourseGrid(courses) {
    const grid     = document.getElementById('courseGrid');
    const noResult = document.getElementById('noResults');
    const countEl  = document.getElementById('resultsCount');
    if (!grid) return;

    if (countEl) {
        const total = allCoursesData.length;
        countEl.textContent = courses.length === total
            ? `Showing all ${total} courses`
            : `Showing ${courses.length} of ${total} courses`;
    }

    if (courses.length === 0) {
        grid.style.display = 'none';
        if (noResult) noResult.style.display = 'flex';
        return;
    }

    grid.style.display = '';
    if (noResult) noResult.style.display = 'none';

    grid.innerHTML = courses.map((c, i) => {
        const badgeClass = c.roi_5_years > 400 ? 'badge-green' : c.roi_5_years > 300 ? 'badge-blue' : 'badge-amber';
        const roiRating  = c.analysis ? c.analysis.roi_rating : (c.roi_5_years > 400 ? 'Excellent' : c.roi_5_years > 300 ? 'Good' : 'Fair');
        const enc        = c.course_name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const shortName  = c.course_name.includes(' - ') ? c.course_name.split(' - ').slice(0, -1).join(' - ') : c.course_name;
        const colorCls   = fieldColorClass(c.course_name);
        const delay      = Math.min(i, 12) * 30;

        return `
        <div class="course-card ${colorCls} fade-in-up" style="animation-delay:${delay}ms" role="listitem" onclick="selectCourseFromGrid('${enc}')" tabindex="0" aria-label="Select ${c.course_name}"
             onkeydown="if(event.key==='Enter')selectCourseFromGrid('${enc}')">
            <div class="cc-top">
                <div>
                    <div class="cc-name">${shortName}</div>
                    <div class="cc-uni">${c.university}</div>
                    ${c.cao_points ? `<div class="cc-cao">${c.cao_points} points <span class="cc-cao-year">· CAO ${c.cao_points_year}</span></div>` : ''}
                </div>
                <span class="cc-badge ${badgeClass}">${roiRating}</span>
            </div>
            <div class="cc-stats">
                <div class="cc-stat">
                    <div class="cc-stat-label">5yr ROI</div>
                    <div class="cc-stat-val">${c.roi_5_years}%</div>
                </div>
                <div class="cc-stat">
                    <div class="cc-stat-label">Payback</div>
                    <div class="cc-stat-val">${c.payback_years.toFixed(1)}y</div>
                </div>
                <div class="cc-stat">
                    <div class="cc-stat-label">Cost</div>
                    <div class="cc-stat-val">€${(c.total_cost / 1000).toFixed(0)}k</div>
                </div>
                <div class="cc-stat">
                    <div class="cc-stat-label">Start Sal.</div>
                    <div class="cc-stat-val">€${(c.starting_salary / 1000).toFixed(0)}k</div>
                </div>
            </div>
        </div>`;
    }).join('');
}

function selectCourseFromGrid(course) {
    // Switch to calculator
    const calcBtn = document.querySelector('.nav-btn[onclick*="calculator"]');
    if (calcBtn) calcBtn.click();
    setTimeout(() => {
        document.getElementById('course').value = course;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(calculateROI, 150);
    }, 100);
}

/* ============================================================
   Compare - search + chip UI
   ============================================================ */

let compareSelectedCourses = [];

function initCompareSearch() {
    initSearchBox({
        inputId: 'compareSearch',
        dropId:  'compareSearchDrop',
        onPick:  addToCompare,
        excludeFn: () => compareSelectedCourses,
        renderItem: (course, re, i, dropId) => {
            const parts = course.includes(' - ') ? course.split(' - ') : [course, ''];
            const uni   = parts[parts.length - 1];
            const name  = parts.slice(0, -1).join(' - ') || course;
            const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeUni  = uni.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const hlName   = safeName.replace(re, m => `<mark>${m}</mark>`);
            const hlUni    = safeUni.replace(re, m => `<mark>${m}</mark>`);
            return `<div class="search-item" id="${dropId}-opt-${i}" data-idx="${i}" role="option" style="display:flex;flex-direction:column;gap:2px;padding:9px 14px">
                <span class="search-item-name">${hlName}</span>
                <span class="search-item-uni">${hlUni}</span>
            </div>`;
        }
    });
}

function addToCompare(course) {
    if (compareSelectedCourses.includes(course)) return;
    if (compareSelectedCourses.length >= 5) { showError('Maximum 5 courses. Remove one first.'); return; }
    compareSelectedCourses.push(course);
    document.getElementById('compareSearch').value = '';
    document.getElementById('compareSearchDrop').style.display = 'none';
    renderCompareChips();
    renderCmpPopularGrid();
}

function removeFromCompare(course) {
    compareSelectedCourses = compareSelectedCourses.filter(c => c !== course);
    renderCompareChips();
    renderCmpPopularGrid();
}

const FIELD_HEX_MAP = { 'field-tech':'#2563eb','field-health':'#16a34a','field-business':'#7c3aed','field-law':'#b45309','field-engineering':'#0891b2','field-education':'#db2877','field-arts':'#ea580c','field-default':'#64748b' };
const FIELD_LABEL_MAP = { 'field-tech':'Technology','field-health':'Healthcare','field-business':'Business','field-law':'Law','field-engineering':'Engineering','field-education':'Education','field-arts':'Arts','field-default':'Academic' };

function accentForCourse(name) { return FIELD_HEX_MAP[fieldColorClass(name)] || '#2563eb'; }

function renderCompareChips() {
    const container  = document.getElementById('compareSelected');
    const hint       = document.getElementById('compareHint');
    const btn        = document.getElementById('compareBtn');
    const sugBox     = document.getElementById('cmpSuggestions');
    const n          = compareSelectedCourses.length;
    const remaining  = 5 - n;

    // Chips for selected courses
    const chipsHTML = compareSelectedCourses.map(course => {
        const parts    = course.includes(' - ') ? course.split(' - ') : [course, ''];
        const uni      = parts[parts.length - 1];
        const name     = parts.slice(0, -1).join(' - ') || course;
        const enc      = course.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const ac       = accentForCourse(course);
        return `<div class="cmp-chip" style="border-color:${ac}50;background:${ac}0c;color:${ac}">
            <span class="cmp-chip-dot" style="background:${ac}"></span>
            <div class="cmp-chip-body">
                <span class="cmp-chip-name" title="${course}">${name}</span>
                <span class="cmp-chip-uni">${uni}</span>
            </div>
            <button class="cmp-chip-remove" onclick="removeFromCompare('${enc}')" aria-label="Remove ${name}" style="color:${ac}80">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>`;
    }).join('');

    // Empty slot indicators
    const slotsHTML = remaining > 0 && n > 0 ? Array.from({length: Math.min(remaining, 3)}).map(() =>
        `<div class="cmp-slot-empty">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add course
        </div>`
    ).join('') : '';

    container.innerHTML = chipsHTML + slotsHTML;

    // Hint text
    hint.textContent = n === 0 ? 'Add at least 2 courses to compare.'
                     : n === 1 ? 'Add 1 more course to continue.'
                     : n >= 2  ? `${n} courses selected — ready to compare.` : '';

    // Compare button
    btn.disabled = n < 2;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg> Compare ${n >= 2 ? n + ' courses' : ''}`;

    // Suggestions: popular courses not yet selected
    if (sugBox) {
        const popular = POPULAR_COURSE_NAMES.filter(c => !compareSelectedCourses.includes(c));
        if (popular.length > 0 && n < 5) {
            sugBox.innerHTML = '<span class="cmp-sug-label">Quick add:</span>' +
                popular.slice(0, 4).map(c => {
                    const parts  = c.includes(' - ') ? c.split(' - ') : [c, ''];
                    const uni    = parts[parts.length - 1];
                    const name   = parts.slice(0, -1).join(' - ') || c;
                    const enc    = c.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    const ac     = accentForCourse(c);
                    return `<button class="cmp-sug-chip" onclick="addToCompare('${enc}')" style="border-color:${ac}40;color:${ac}" title="${c}">
                        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${ac};flex-shrink:0"></span>${name} <span style="font-weight:400;opacity:0.65">· ${uni}</span>
                    </button>`;
                }).join('');
        } else {
            sugBox.innerHTML = '';
        }
    }
}

const POPULAR_COMPARE_COURSES = [
    'Computer Science - UCD',
    'Business/Commerce - UCD',
    'Nursing - UCC',
    'Medicine - UCD',
    'Law - UCD',
    'Psychology - UCD',
    'Engineering - UCD',
    'Pharmacy - UCC',
    'Architecture - UCD',
    'Social Work - UCC',
    'Education (Primary) - UCD',
    'Arts - UCD',
];

function renderCmpPopularGrid() {
    const grid = document.getElementById('cmpPopularGrid');
    if (!grid || allCoursesData.length === 0) return;
    const nameSet = new Set(allCoursesData.map(c => c.course_name));
    // Use curated list, fill remainder with top ROI courses not already in list
    let picks = POPULAR_COMPARE_COURSES.filter(n => nameSet.has(n));
    if (picks.length < 8) {
        const extra = [...allCoursesData]
            .sort((a, b) => b.roi_5_years - a.roi_5_years)
            .map(c => c.course_name)
            .filter(n => !picks.includes(n));
        picks = [...picks, ...extra].slice(0, 12);
    }
    function refreshGrid() {
        grid.innerHTML = picks.map(fullName => {
            const parts = fullName.includes(' - ') ? fullName.split(' - ') : [fullName, ''];
            const uni   = parts[parts.length - 1];
            const name  = parts.slice(0, -1).join(' - ') || fullName;
            const ac    = accentForCourse(fullName);
            const enc   = fullName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const added = compareSelectedCourses.includes(fullName);
            return `<button class="cmp-popular-card${added ? ' already-added' : ''}"
                style="border-left-color:${ac};border-color:${ac}30;border-left-color:${ac}"
                onclick="addToCompare('${enc}');renderCmpPopularGrid()"
                ${added ? 'disabled' : ''}>
                <div class="cmp-popular-card-body">
                    <div class="cmp-popular-card-name">${name}</div>
                    <div class="cmp-popular-card-uni">${uni}</div>
                </div>
                <div class="cmp-popular-card-add" style="color:${ac}">
                    ${added
                        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
                        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
                    }
                </div>
            </button>`;
        }).join('');
    }
    refreshGrid();
}

/* ============================================================
   Compare Multiple Courses
   ============================================================ */

function compareMultipleCourses() {
    if (!coursesLoaded) { showError('Courses are still loading.'); return; }

    const selected = compareSelectedCourses;
    if (selected.length < 2) { showError('Select at least 2 courses to compare.'); return; }
    if (selected.length > 5) { showError('Select a maximum of 5 courses.'); return; }

    fetch(`${API_BASE_URL}/compare-multiple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses: selected }),
    })
        .then(r => {
            if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Server error'); });
            return r.json();
        })
        .then(data => {
            if (!data.success) throw new Error(data.error || 'Comparison failed');
            displayComparisonResults(data);
        })
        .catch(err => { console.error(err); showError(err.message); });
}

function displayComparisonResults(data) {
    const { winners, courses } = data;

    // Column headers — one per course with coloured gradient banner
    const colHeaders = courses.map(c => {
        const ac    = accentForCourse(c.course_name);
        const fl    = FIELD_LABEL_MAP[fieldColorClass(c.course_name)] || 'Academic';
        const short = c.course_name.includes(' - ') ? c.course_name.split(' - ').slice(0,-1).join(' - ') : c.course_name;
        const winCount = Object.values(winners).filter(w => w === c.course_name).length;
        return `<th class="cmp-col-head">
            <div class="cmp-col-banner" style="background:linear-gradient(135deg,${ac}cc,${ac})">
                <div class="cmp-col-field-pill">${fl}</div>
                <div class="cmp-col-name">${short}</div>
                <div class="cmp-col-uni">${c.university}</div>
                ${winCount > 0 ? `<div class="cmp-col-wins">${winCount} win${winCount>1?'s':''}</div>` : ''}
            </div>
        </th>`;
    }).join('');

    // Metric rows
    const metrics = [
        { label:'Total cost',       key:'total_cost',          fmt: v => '€'+(v/1000).toFixed(0)+'k',   winner: winners.lowest_cost,     badge:'Lowest cost',    section:'financial' },
        { label:'Starting salary',  key:'starting_salary',     fmt: v => '€'+(v/1000).toFixed(0)+'k',   winner: winners.highest_salary,  badge:'Highest salary', section:'financial' },
        { label:'Salary after 5yr', key:'salary_after_5_years',fmt: v => '€'+(v/1000).toFixed(0)+'k',   winner: null,                    badge:'',               section:'financial' },
        { label:'Payback period',   key:'payback_years',       fmt: v => v.toFixed(1)+' yr',            winner: winners.fastest_payback, badge:'Fastest payback',section:'roi' },
        { label:'5-year ROI',       key:'roi_5_years',         fmt: v => v+'%',                         winner: winners.best_roi,        badge:'Best ROI',       section:'roi' },
        { label:'Tuition per year', key:'tuition_per_year',    fmt: v => '€'+(v/1000).toFixed(1)+'k',   winner: null,                    badge:'',               section:'details' },
        { label:'Duration',         key:'course_length',       fmt: v => v+' yr'+( v>1?'s':''),         winner: null,                    badge:'',               section:'details' },
    ];

    let lastSection = '';
    const metricRows = metrics.map(m => {
        const sectionBreak = m.section !== lastSection;
        lastSection = m.section;
        const cells = courses.map(c => {
            const ac       = accentForCourse(c.course_name);
            const isWinner = m.winner && c.course_name === m.winner;
            return `<td class="cmp-cell${isWinner?' cmp-cell-win':''}" style="${isWinner?`--win-ac:${ac}`:''}">
                <span class="cmp-cell-val">${m.fmt(c[m.key])}</span>
                ${isWinner ? `<span class="cmp-win-badge" style="background:${ac}18;color:${ac};border-color:${ac}35">${m.badge}</span>` : ''}
            </td>`;
        }).join('');
        return `<tr${sectionBreak&&lastSection!=='financial'?' class="cmp-section-start"':''}><td class="cmp-row-label">${m.label}</td>${cells}</tr>`;
    }).join('');

    const tableHTML = `
    <div class="cmp-table-wrap">
        <table class="cmp-table">
            <thead><tr><th class="cmp-label-col"></th>${colHeaders}</tr></thead>
            <tbody>${metricRows}</tbody>
        </table>
    </div>`;

    const chartsHTML = `
    <div class="cmp-charts-section">
        <div class="cmp-charts-title">Visual comparison</div>
        <div class="chart-grid">
            <div class="chart-box"><div class="chart-label">5-Year ROI (%)</div><div style="height:200px"><canvas id="compROI"></canvas></div></div>
            <div class="chart-box"><div class="chart-label">Starting Salary (€)</div><div style="height:200px"><canvas id="compSalary"></canvas></div></div>
            <div class="chart-box"><div class="chart-label">Payback Period (yrs)</div><div style="height:200px"><canvas id="compPayback"></canvas></div></div>
            <div class="chart-box"><div class="chart-label">Cost vs 5-yr Earnings</div><div style="height:200px"><canvas id="compCostEarnings"></canvas></div></div>
        </div>
    </div>`;

    const el = document.getElementById('comparisonResults');
    el.innerHTML = tableHTML + chartsHTML;

    el.style.display = 'block';
    requestAnimationFrame(() => buildComparisonCharts(courses));
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildComparisonCharts(courses) {
    if (typeof Chart === 'undefined') return;
    const labels = courses.map(c => c.course_name.split(' - ')[0]);
    const FIELD_HEX = { 'field-tech':'#2563eb','field-health':'#16a34a','field-business':'#7c3aed','field-law':'#b45309','field-engineering':'#0891b2','field-education':'#db2777','field-arts':'#ea580c','field-default':'#64748b' };
    const colors = courses.map(c => FIELD_HEX[fieldColorClass(c.course_name)] || '#2563eb');
    const bg     = colors.map(c => c + '30');
    const interFont = { family: "'Inter', -apple-system, sans-serif" };

    const sharedTooltip = {
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        titleColor: '#0f172a',
        bodyColor: '#475569',
        padding: 12,
        cornerRadius: 8,
        titleFont: { size: 12, weight: '600', ...interFont },
        bodyFont: { size: 12, ...interFont },
    };

    const sharedScales = (yFmt) => ({
        y: {
            beginAtZero: true,
            ticks: { callback: yFmt, font: { size: 11, ...interFont }, color: '#94a3b8' },
            grid: { color: '#f1f5f9' },
            border: { display: false },
        },
        x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 11, ...interFont }, color: '#475569', maxRotation: 30 },
        },
    });

    const makeBar = (id, data, yFmt, ttFmt) => {
        const c = document.getElementById(id);
        if (!c) return;
        new Chart(c, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: bg, borderColor: colors, borderWidth: 2, borderRadius: 10, borderSkipped: false }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { ...sharedTooltip, callbacks: { label: ctx => '  ' + ttFmt(ctx.parsed.y) } },
                },
                scales: sharedScales(yFmt),
            },
        });
    };

    makeBar('compROI',     courses.map(c => c.roi_5_years),    v => v + '%',               v => v + '% ROI');
    makeBar('compPayback', courses.map(c => c.payback_years),  v => v + 'y',               v => v.toFixed(1) + ' yrs payback');
    makeBar('compSalary',  courses.map(c => c.starting_salary),v => '€' + (v/1000) + 'k', v => '€' + v.toLocaleString());

    const ce = document.getElementById('compCostEarnings');
    if (ce) {
        new Chart(ce, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Total Cost',     data: courses.map(c => c.total_cost),           backgroundColor: '#94a3b820', borderColor: '#94a3b8', borderWidth: 2, borderRadius: 10, borderSkipped: false },
                    { label: '5-yr Net Earn.', data: courses.map(c => c.annual_net_income * 5), backgroundColor: '#16a34a28', borderColor: '#16a34a', borderWidth: 2, borderRadius: 10, borderSkipped: false },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top', labels: { font: { size: 11, ...interFont }, color: '#475569', padding: 16 } },
                    tooltip: { ...sharedTooltip, callbacks: { label: ctx => '  ' + ctx.dataset.label + ': €' + ctx.parsed.y.toLocaleString() } },
                },
                scales: sharedScales(v => '€' + (v / 1000) + 'k'),
            },
        });
    }
}

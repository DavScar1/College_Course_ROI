/* ============================================================
   CollegeROI Ireland — Main Script
   ============================================================ */

'use strict';

// State
let allCourses     = [];
let allCoursesData = [];
let investmentChartInstance = null;
let coursesLoaded  = false;
let currentCourseData = null;
let activeFilters  = { universities: [], fields: [], sortBy: 'roi-desc' };

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:5000'
    : '';

const STORAGE_KEYS = {
    LAST_COURSE:        'roi_calc_last_course',
    USE_CUSTOM_TUITION: 'roi_calc_use_custom_tuition',
    CUSTOM_TUITION:     'roi_calc_custom_tuition',
    ENABLE_PART_TIME:   'roi_calc_enable_part_time',
    PART_TIME_HOURS:    'roi_calc_part_time_hours',
};

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
}

function toggleCard(bodyId, headId) {
    const body = document.getElementById(bodyId);
    const head = document.getElementById(headId);
    body.classList.toggle('open');
    head.classList.toggle('open');
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
   Bootstrap — single bulk request
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
            loadSavedPreferences();
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
   Preferences (localStorage)
   ============================================================ */

function savePreferences() {
    const course = document.getElementById('course').value;
    if (course) localStorage.setItem(STORAGE_KEYS.LAST_COURSE, course);
    localStorage.setItem(STORAGE_KEYS.USE_CUSTOM_TUITION, document.getElementById('useCustomTuition').checked);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_TUITION,     document.getElementById('customTuition').value);
    localStorage.setItem(STORAGE_KEYS.ENABLE_PART_TIME,   document.getElementById('enablePartTime').checked);
    localStorage.setItem(STORAGE_KEYS.PART_TIME_HOURS,    document.getElementById('partTimeHours').value);
}

function loadSavedPreferences() {
    const lastCourse    = localStorage.getItem(STORAGE_KEYS.LAST_COURSE);
    const useCustom     = localStorage.getItem(STORAGE_KEYS.USE_CUSTOM_TUITION) === 'true';
    const customTuition = localStorage.getItem(STORAGE_KEYS.CUSTOM_TUITION);
    const enablePT      = localStorage.getItem(STORAGE_KEYS.ENABLE_PART_TIME) === 'true';
    const ptHours       = localStorage.getItem(STORAGE_KEYS.PART_TIME_HOURS);

    if (lastCourse) {
        document.getElementById('course').value = lastCourse;
        const notice = document.getElementById('prefNotice');
        if (notice) notice.style.display = 'flex';
    }
    if (useCustom) {
        document.getElementById('useCustomTuition').checked = true;
        document.getElementById('tuitionReveal').style.display = 'block';
        if (customTuition) document.getElementById('customTuition').value = customTuition;
    }
    if (enablePT) {
        document.getElementById('enablePartTime').checked = true;
        document.getElementById('partTimeReveal').style.display = 'block';
        if (ptHours) {
            document.getElementById('partTimeHours').value = ptHours;
            document.getElementById('hoursDisplay').textContent = ptHours;
            updatePartTimeCalculations();
        }
    }
}

function clearPrefs() {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    document.getElementById('course').value                = '';
    document.getElementById('useCustomTuition').checked   = false;
    document.getElementById('tuitionReveal').style.display = 'none';
    document.getElementById('customTuition').value         = '';
    document.getElementById('enablePartTime').checked      = false;
    document.getElementById('partTimeReveal').style.display = 'none';
    document.getElementById('partTimeHours').value         = 10;
    document.getElementById('hoursDisplay').textContent    = '10';
    const notice = document.getElementById('prefNotice');
    if (notice) notice.style.display = 'none';
    // Reset results
    document.getElementById('results').innerHTML = '';
    document.getElementById('resultsPlaceholder').style.display = 'block';
}

/* ============================================================
   DOMContentLoaded — wire controls
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

    initCompareSearch();

    // Custom tuition toggle
    document.getElementById('useCustomTuition').addEventListener('change', function () {
        document.getElementById('tuitionReveal').style.display = this.checked ? 'block' : 'none';
    });

    // Part-time toggle
    document.getElementById('enablePartTime').addEventListener('change', function () {
        document.getElementById('partTimeReveal').style.display = this.checked ? 'block' : 'none';
        if (this.checked) updatePartTimeCalculations();
    });

    // Sliders
    document.getElementById('partTimeHours').addEventListener('input', function () {
        document.getElementById('hoursDisplay').textContent = this.value;
        updatePartTimeCalculations();
    });

    document.getElementById('hourlyRate').addEventListener('input', function () {
        document.getElementById('rateDisplay').textContent = parseFloat(this.value).toFixed(2);
        updatePartTimeCalculations();
    });

    // Search
    const searchInput = document.getElementById('courseSearch');
    const searchDrop  = document.getElementById('searchDrop');
    const clearBtn    = document.getElementById('clearSearch');

    if (searchInput && searchDrop) {
        searchInput.addEventListener('input', function () {
            const q = this.value.trim();
            if (q.length > 0) {
                if (clearBtn) clearBtn.style.display = 'flex';
                showSearchDrop(searchCourses(q), q);
            } else {
                if (clearBtn) clearBtn.style.display = 'none';
                searchDrop.style.display = 'none';
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                searchInput.value = '';
                clearBtn.style.display = 'none';
                searchDrop.style.display = 'none';
                searchInput.focus();
            });
        }

        document.addEventListener('click', function (e) {
            if (!searchInput.contains(e.target) && !searchDrop.contains(e.target)) {
                searchDrop.style.display = 'none';
            }
        });
    }
});

/* ============================================================
   Search
   ============================================================ */

function searchCourses(query) {
    const lq = query.toLowerCase();
    return allCourses.filter(c => c.toLowerCase().includes(lq));
}

function showSearchDrop(results, query) {
    const el = document.getElementById('searchDrop');
    if (!el) return;

    if (results.length === 0) {
        el.innerHTML = '<div style="padding:12px 14px;font-size:14px;color:var(--faint);text-align:center;">No courses found</div>';
        el.style.display = 'block';
        return;
    }

    const escapedQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escapedQ, 'gi');

    let html = '';
    results.slice(0, 8).forEach(course => {
        const uni  = course.includes(' - ') ? course.split(' - ').pop() : '';
        const safe = course.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const hl   = safe.replace(re, m => `<mark>${m}</mark>`);
        const enc  = course.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        html += `<div class="search-item" onclick="pickFromSearch('${enc}')" role="option">
            <div>${hl}</div>
            ${uni ? `<div class="search-meta">${uni}</div>` : ''}
        </div>`;
    });

    el.innerHTML = html;
    el.style.display = 'block';
}

function pickFromSearch(course) {
    document.getElementById('course').value = course;
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

function calculateROI() {
    if (!coursesLoaded) { showError('Courses are still loading. Please wait a moment.'); return; }

    const course = document.getElementById('course').value;
    if (!course) { showError('Please select a course first.'); return; }

    let url = `${API_BASE_URL}/calculate?course=${encodeURIComponent(course)}`;

    const useCustom = document.getElementById('useCustomTuition').checked;
    if (useCustom) {
        const val = document.getElementById('customTuition').value;
        if (val) url += `&tuition=${encodeURIComponent(val)}`;
    }

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

            // Apply part-time adjustment client-side
            if (document.getElementById('enablePartTime').checked) {
                const hours      = parseInt(document.getElementById('partTimeHours').value);
                const rate       = parseFloat(document.getElementById('hourlyRate').value);
                const totalEarned = hours * rate * 30 * currentCourseData.course_length;
                const origCost   = currentCourseData.total_cost;
                currentCourseData.total_cost         = Math.max(0, origCost - totalEarned);
                currentCourseData.original_cost      = origCost;
                currentCourseData.part_time_earnings = totalEarned;
                currentCourseData.payback_years      = currentCourseData.total_cost / currentCourseData.annual_net_income;
            }

            displaySingleResult(currentCourseData);
            savePreferences();
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
   Part-time calculations
   ============================================================ */

function updatePartTimeCalculations() {
    const hours = parseInt(document.getElementById('partTimeHours').value);
    const rate  = parseFloat(document.getElementById('hourlyRate').value);
    const weekly  = hours * rate;
    const annual  = weekly * 30;
    const courseLen = currentCourseData ? currentCourseData.course_length : 4;
    const total   = annual * courseLen;

    document.getElementById('weeklyIncome').textContent   = '€' + Math.round(weekly).toLocaleString();
    document.getElementById('partTimeIncome').textContent = '€' + Math.round(annual).toLocaleString();
    document.getElementById('partTimeTotal').textContent  = '€' + Math.round(total).toLocaleString();
    document.getElementById('costReduction').textContent  = '€' + Math.round(total).toLocaleString();
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

    const salaryIncrease = Math.round(((d.salary_after_5_years - d.starting_salary) / d.starting_salary) * 100);
    const roi            = d.roi_5_years;

    const colorCls   = fieldColorClass(d.course_name);
    const accentColor = { 'field-tech':'#2563eb','field-health':'#16a34a','field-business':'#7c3aed','field-law':'#b45309','field-engineering':'#0891b2','field-education':'#db2777','field-arts':'#ea580c','field-default':'#64748b' }[colorCls] || '#2563eb';

    const roiRating   = d.analysis ? d.analysis.roi_rating : (roi > 400 ? 'Excellent' : roi > 250 ? 'Good' : 'Fair');
    const roiBadgeClass = roi > 400 ? 'badge-green' : roi > 250 ? 'badge-blue' : 'badge-amber';

    // Custom tuition / part-time pills
    let customPills = '';
    if (document.getElementById('useCustomTuition').checked) {
        const v = document.getElementById('customTuition').value;
        if (v) customPills += `<span class="rv2-pill">Custom tuition: €${parseFloat(v).toLocaleString()}/yr</span>`;
    }
    if (document.getElementById('enablePartTime').checked && d.part_time_earnings) {
        const h = document.getElementById('partTimeHours').value;
        const r = document.getElementById('hourlyRate').value;
        customPills += `<span class="rv2-pill">Part-time: ${h}h/wk @ €${parseFloat(r).toFixed(2)}/hr</span>`;
    }

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

    const lifetime = d.analysis && d.analysis.lifetime;

    const shortName = d.course_name.includes(' - ') ? d.course_name.split(' - ').slice(0,-1).join(' - ') : d.course_name;

    const html = `
    <div class="rv2" style="--accent:${accentColor}">

        <!-- ROI hero (includes course name) -->
        <div class="rv2-roi-hero" style="border-left:4px solid ${accentColor};background:${accentColor}07">
            <div class="rv2-hero-left">
                <div class="rv2-course-name">${shortName}</div>
                <div class="rv2-university">${d.university}</div>
                ${customPills ? `<div class="rv2-pills" style="margin-top:10px">${customPills}</div>` : ''}
                <div class="rv2-roi-label" style="margin-top:20px">5-Year Return on Investment</div>
                <div class="rv2-roi-num" id="roiCounter" style="color:${accentColor}">0<span class="rv2-roi-pct">%</span></div>
                <div class="rv2-roi-tags">
                    <span class="result-roi-badge ${roiBadgeClass}">${roiRating}</span>
                    ${d.analysis ? `<span class="rv2-payback-tag">${d.analysis.payback_label}</span>` : ''}
                </div>
            </div>
            <div class="rv2-key-stats">
                <div class="rv2-key-stat">
                    <div class="rv2-ks-value">€${(d.total_cost/1000).toFixed(0)}k</div>
                    <div class="rv2-ks-label">Total cost</div>
                    <div class="rv2-ks-sub">€${(d.tuition_per_year/1000).toFixed(1)}k/yr × ${d.course_length} yrs</div>
                </div>
                <div class="rv2-ks-divider"></div>
                <div class="rv2-key-stat">
                    <div class="rv2-ks-value">€${(d.starting_salary/1000).toFixed(0)}k</div>
                    <div class="rv2-ks-label">Starting salary</div>
                    <div class="rv2-ks-sub">€${Math.round(d.starting_salary/12).toLocaleString()}/mo</div>
                </div>
                <div class="rv2-ks-divider"></div>
                <div class="rv2-key-stat">
                    <div class="rv2-ks-value" style="color:${accentColor}">${d.payback_years.toFixed(1)} yr</div>
                    <div class="rv2-ks-label">Payback period</div>
                    <div class="rv2-ks-sub">to recover cost</div>
                </div>
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

        <!-- Lifetime -->
        ${lifetime ? `
        <div class="rv2-lifetime" style="background:linear-gradient(135deg,${accentColor}14,${accentColor}06);border-color:${accentColor}20">
            <div class="rv2-lt-label">30-year career estimate</div>
            <div class="rv2-lt-amount" style="color:${accentColor}">€${(lifetime.total_earnings/1_000_000).toFixed(2)}M</div>
            <div class="rv2-lt-sub">${lifetime.times_earned_back}x your total investment returned over a career</div>
        </div>` : ''}

    </div>`;

    el.innerHTML = html;
    animateCounter('roiCounter', roi, '%');
    requestAnimationFrame(() => createInvestmentChart(d, accentColor));
    if (window.innerWidth < 768) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
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
   Browse — filters
   ============================================================ */

function toggleField(button) {
    button.classList.toggle('on');
    applyFilters();
}

function applyFilters() {
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
    const sortEl = document.getElementById('sortBy');
    if (sortEl) sortEl.value = 'roi-desc';
    activeFilters = { universities: [], fields: [], sortBy: 'roi-desc' };
    renderCourseGrid(allCoursesData);
}

function showTop5(type) {
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
    if (!grid) return;

    if (courses.length === 0) {
        grid.style.display = 'none';
        if (noResult) noResult.style.display = 'flex';
        return;
    }

    grid.style.display = '';
    if (noResult) noResult.style.display = 'none';

    grid.innerHTML = courses.map(c => {
        const badgeClass = c.roi_5_years > 400 ? 'badge-green' : c.roi_5_years > 300 ? 'badge-blue' : 'badge-amber';
        const roiRating  = c.analysis ? c.analysis.roi_rating : (c.roi_5_years > 400 ? 'Excellent' : c.roi_5_years > 300 ? 'Good' : 'Fair');
        const enc        = c.course_name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const shortName  = c.course_name.includes(' - ') ? c.course_name.split(' - ').slice(0, -1).join(' - ') : c.course_name;
        const colorCls   = fieldColorClass(c.course_name);

        return `
        <div class="course-card ${colorCls}" role="listitem" onclick="selectCourseFromGrid('${enc}')" tabindex="0" aria-label="Select ${c.course_name}"
             onkeydown="if(event.key==='Enter')selectCourseFromGrid('${enc}')">
            <div class="cc-top">
                <div>
                    <div class="cc-name">${shortName}</div>
                    <div class="cc-uni">${c.university}</div>
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
   Compare — search + chip UI
   ============================================================ */

let compareSelectedCourses = [];

function initCompareSearch() {
    const input = document.getElementById('compareSearch');
    const drop  = document.getElementById('compareSearchDrop');
    if (!input || !drop) return;

    input.addEventListener('input', function () {
        const q = this.value.trim();
        if (q.length === 0) { drop.style.display = 'none'; return; }
        const results = allCourses.filter(c => c.toLowerCase().includes(q.toLowerCase()) && !compareSelectedCourses.includes(c));
        if (results.length === 0) {
            drop.innerHTML = '<div style="padding:12px 14px;font-size:14px;color:var(--faint);text-align:center;">No courses found</div>';
            drop.style.display = 'block';
            return;
        }
        const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(escapedQ, 'gi');
        drop.innerHTML = results.slice(0, 8).map(course => {
            const safe = course.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const hl   = safe.replace(re, m => `<mark>${m}</mark>`);
            const enc  = course.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `<div class="search-item" onclick="addToCompare('${enc}')" role="option">${hl}</div>`;
        }).join('');
        drop.style.display = 'block';
    });

    document.addEventListener('click', function (e) {
        if (!input.contains(e.target) && !drop.contains(e.target)) drop.style.display = 'none';
    });
}

function addToCompare(course) {
    if (compareSelectedCourses.includes(course)) return;
    if (compareSelectedCourses.length >= 5) { showError('Maximum 5 courses. Remove one first.'); return; }
    compareSelectedCourses.push(course);
    document.getElementById('compareSearch').value = '';
    document.getElementById('compareSearchDrop').style.display = 'none';
    renderCompareChips();
}

function removeFromCompare(course) {
    compareSelectedCourses = compareSelectedCourses.filter(c => c !== course);
    renderCompareChips();
}

function renderCompareChips() {
    const container = document.getElementById('compareSelected');
    const hint      = document.getElementById('compareHint');
    const btn       = document.getElementById('compareBtn');
    const n         = compareSelectedCourses.length;

    container.innerHTML = compareSelectedCourses.map(course => {
        const shortName = course.includes(' - ') ? course.split(' - ').slice(0, -1).join(' - ') : course;
        const enc       = course.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<div class="compare-chip">
            <span class="compare-chip-name" title="${course}">${shortName}</span>
            <button class="compare-chip-remove" onclick="removeFromCompare('${enc}')" aria-label="Remove ${shortName}">&times;</button>
        </div>`;
    }).join('');

    hint.textContent = n === 0 ? 'Select at least 2 courses above.'
                     : n === 1 ? 'Add 1 more course to compare.'
                     : `${n} courses selected. Click Compare to see results.`;
    btn.disabled = n < 2;
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

    const winnerRows = [
        winners.best_roi        ? `<div class="data-row"><span class="dr-label winner-label"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg> Best ROI</span><span class="dr-value">${winners.best_roi.split(' - ')[0]}</span></div>` : '',
        winners.fastest_payback ? `<div class="data-row"><span class="dr-label winner-label"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Fastest Payback</span><span class="dr-value">${winners.fastest_payback.split(' - ')[0]}</span></div>` : '',
        winners.lowest_cost     ? `<div class="data-row"><span class="dr-label winner-label"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Lowest Cost</span><span class="dr-value">${winners.lowest_cost.split(' - ')[0]}</span></div>` : '',
        winners.highest_salary  ? `<div class="data-row"><span class="dr-label winner-label"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7"/></svg> Highest Salary</span><span class="dr-value">${winners.highest_salary.split(' - ')[0]}</span></div>` : '',
    ].filter(Boolean).join('');

    const cardsHTML = courses.map(c => {
        const isWinner = Object.values(winners).includes(c.course_name);
        return `
        <div class="card" style="${isWinner ? 'border-color:var(--blue);border-width:2px;' : ''}">
            <div class="card-body">
                <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border);">
                    <div style="font-size:15px;font-weight:700;color:var(--text);">${c.course_name.split(' - ')[0]}
                        ${isWinner ? '<span class="result-roi-badge badge-green" style="font-size:10px;margin-left:6px;">WINNER</span>' : ''}
                    </div>
                    <div style="font-size:12px;color:var(--faint);margin-top:2px;">${c.university}</div>
                </div>
                <div class="data-rows">
                    <div class="data-row">
                        <span class="dr-label">Total Cost</span>
                        <span class="dr-value ${c.course_name === winners.lowest_cost ? 'good' : ''}">€${c.total_cost.toLocaleString()}</span>
                    </div>
                    <div class="data-row">
                        <span class="dr-label">Starting Salary</span>
                        <span class="dr-value ${c.course_name === winners.highest_salary ? 'good' : ''}">€${c.starting_salary.toLocaleString()}</span>
                    </div>
                    <div class="data-row">
                        <span class="dr-label">After 5 Years</span>
                        <span class="dr-value">€${c.salary_after_5_years.toLocaleString()}</span>
                    </div>
                    <div class="data-row">
                        <span class="dr-label">Payback</span>
                        <span class="dr-value ${c.course_name === winners.fastest_payback ? 'good' : ''}">${c.payback_years.toFixed(1)} yrs</span>
                    </div>
                    <div class="data-row">
                        <span class="dr-label">5-Year ROI</span>
                        <span class="dr-value ${c.course_name === winners.best_roi ? 'good' : ''}">${c.roi_5_years}%</span>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');

    const el = document.getElementById('comparisonResults');
    el.innerHTML = `
        <div class="card" style="border-left:3px solid var(--blue);">
            <div class="card-head"><span class="card-title">Winners by Category</span></div>
            <div class="card-body"><div class="data-rows">${winnerRows}</div></div>
        </div>

        <div class="card" style="margin-top:16px;">
            <div class="card-head"><span class="card-title">Visual Comparison</span></div>
            <div class="card-body">
                <div class="chart-grid">
                    <div class="chart-box"><div class="chart-label">ROI (5 Years %)</div><div style="height:220px;"><canvas id="compROI"></canvas></div></div>
                    <div class="chart-box"><div class="chart-label">Payback Period (Years)</div><div style="height:220px;"><canvas id="compPayback"></canvas></div></div>
                    <div class="chart-box"><div class="chart-label">Starting Salary (€)</div><div style="height:220px;"><canvas id="compSalary"></canvas></div></div>
                    <div class="chart-box"><div class="chart-label">Cost vs 5-yr Earnings</div><div style="height:220px;"><canvas id="compCostEarnings"></canvas></div></div>
                </div>
            </div>
        </div>

        <div class="compare-grid" style="margin-top:16px;">${cardsHTML}</div>
    `;

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

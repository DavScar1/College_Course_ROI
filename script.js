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

function displaySingleResult(d) {
    const ph = document.getElementById('resultsPlaceholder');
    const el = document.getElementById('results');
    if (ph) ph.style.display = 'none';
    el.style.display = 'block';

    const salaryIncrease = Math.round(((d.salary_after_5_years - d.starting_salary) / d.starting_salary) * 100);
    const roi            = d.roi_5_years;

    // ROI badge colour
    const roiBadgeClass = roi > 400 ? 'badge-green' : roi > 250 ? 'badge-blue' : 'badge-amber';
    const roiRating     = d.analysis ? d.analysis.roi_rating : (roi > 400 ? 'Excellent' : roi > 250 ? 'Good' : 'Fair');

    // Customisation badges
    let customNote = '';
    if (document.getElementById('useCustomTuition').checked) {
        const v = document.getElementById('customTuition').value;
        if (v) customNote += `<span class="result-roi-badge badge-blue">Custom tuition: €${parseFloat(v).toLocaleString()}/yr</span>`;
    }
    if (document.getElementById('enablePartTime').checked && d.part_time_earnings) {
        const h = document.getElementById('partTimeHours').value;
        const r = document.getElementById('hourlyRate').value;
        customNote += `<span class="result-roi-badge badge-blue">Part-time: ${h}h/wk @ €${parseFloat(r).toFixed(2)}/hr</span>`;
    }

    // Career insight section
    let careerHTML = '';
    if (d.course_data) {
        const cd = d.course_data;
        const progPct  = { 'Excellent': 100, 'Very Good': 85, 'Good': 70, 'Fair': 50 }[cd.career_progression] || 60;
        const skillPct = { 'Very High': 100, 'High': 75, 'Medium': 50, 'Low': 25 }[cd.skills_demand] || 50;

        const employers = (cd.top_employers || []).map(e => `<span class="tag">${e}</span>`).join('');
        const roles     = (cd.typical_roles || []).map(r => `<div class="data-row"><span class="dr-label">→</span><span class="dr-value">${r}</span></div>`).join('');

        careerHTML = `
        <div class="result-section">
            <div class="section-label">Career Overview</div>

            <div class="data-rows">
                <div class="data-row">
                    <span class="dr-label">Employment Rate</span>
                    <span class="dr-value good">${cd.employment_rate}% within 9 months</span>
                </div>
                <div class="data-row">
                    <span class="dr-label">Student Rating</span>
                    <span class="dr-value">${cd.graduate_satisfaction} / 5 ★</span>
                </div>
                <div class="data-row">
                    <span class="dr-label">Job Security</span>
                    <span class="dr-value good">${cd.job_security}</span>
                </div>
                <div class="data-row">
                    <span class="dr-label">Remote Work</span>
                    <span class="dr-value">${cd.remote_work_availability}</span>
                </div>
                <div class="data-row">
                    <span class="dr-label">Further Study</span>
                    <span class="dr-value">${cd.further_study_rate}% pursue postgrad</span>
                </div>
                ${cd.internship_opportunities ? `<div class="data-row"><span class="dr-label">Internships</span><span class="dr-value good">${cd.internship_opportunities}</span></div>` : ''}
                ${cd.industry_growth_rate ? `<div class="data-row"><span class="dr-label">Industry Growth</span><span class="dr-value good">${cd.industry_growth_rate}</span></div>` : ''}
            </div>
        </div>

        <div class="result-section">
            <div class="section-label">Skills & Progression</div>

            <div class="prog-wrap">
                <div class="prog-header">
                    <span class="prog-label">Work-Life Balance</span>
                    <span class="prog-val">${cd.work_life_balance} / 5</span>
                </div>
                <div class="prog-track"><div class="prog-fill" style="width:${(cd.work_life_balance / 5) * 100}%"></div></div>
            </div>
            <div class="prog-wrap">
                <div class="prog-header">
                    <span class="prog-label">Career Progression</span>
                    <span class="prog-val">${cd.career_progression}</span>
                </div>
                <div class="prog-track"><div class="prog-fill green" style="width:${progPct}%"></div></div>
            </div>
            <div class="prog-wrap">
                <div class="prog-header">
                    <span class="prog-label">Skills Demand</span>
                    <span class="prog-val">${cd.skills_demand}</span>
                </div>
                <div class="prog-track"><div class="prog-fill" style="width:${skillPct}%"></div></div>
            </div>
        </div>

        ${employers ? `
        <div class="result-section">
            <div class="section-label">Top Employers</div>
            <div class="tag-wrap">${employers}</div>
        </div>` : ''}

        ${roles ? `
        <div class="result-section">
            <div class="section-label">Typical Roles</div>
            <div class="data-rows">${roles}</div>
        </div>` : ''}
        `;
    }

    const lifetime = d.analysis && d.analysis.lifetime;

    const html = `
    <div class="result-card">

        <!-- Course header -->
        <div class="result-head">
            <div class="result-course">${d.course_name}</div>
            <div class="result-uni">${d.university}</div>
            ${customNote ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">${customNote}</div>` : ''}
        </div>

        <!-- Big ROI -->
        <div class="result-roi-block">
            <div class="result-roi-label">5-Year Return on Investment</div>
            <div class="result-roi-num" id="roiCounter">0<span style="font-size:0.55em;vertical-align:baseline;">%</span></div>
            <div class="result-roi-tag">
                <span class="result-roi-badge ${roiBadgeClass}">${roiRating}</span>
                ${d.analysis ? `<span class="roi-payback-label">${d.analysis.payback_label}</span>` : ''}
            </div>
        </div>

        <!-- 3-stat row -->
        <div class="result-stats">
            <div class="result-stat">
                <div class="rs-label">Total Cost</div>
                <div class="rs-value">€${(d.total_cost / 1000).toFixed(0)}k</div>
                <div class="rs-sub">€${(d.tuition_per_year / 1000).toFixed(1)}k/yr × ${d.course_length} yrs</div>
            </div>
            <div class="result-stat">
                <div class="rs-label">Starting Salary</div>
                <div class="rs-value">€${(d.starting_salary / 1000).toFixed(0)}k</div>
                <div class="rs-sub">€${Math.round(d.starting_salary / 12).toLocaleString()}/mo</div>
            </div>
            <div class="result-stat">
                <div class="rs-label">Payback</div>
                <div class="rs-value">${d.payback_years.toFixed(1)} yr</div>
                <div class="rs-sub">to recover cost</div>
            </div>
        </div>

        <!-- Insight -->
        ${d.analysis ? `
        <div class="result-section">
            <div class="insight-box">${d.analysis.recommendation}</div>
        </div>` : ''}

        <!-- Salary Progression -->
        <div class="result-section">
            <div class="section-label">Salary Progression</div>
            <div class="salary-row">
                <div class="sal-item">
                    <div class="sal-label">Year 1</div>
                    <div class="sal-value">€${(d.starting_salary / 1000).toFixed(0)}k</div>
                </div>
                <div class="sal-arrow">
                    <svg width="32" height="16" viewBox="0 0 32 16" fill="none" aria-hidden="true">
                        <path d="M0 8 H24 M18 2 L24 8 L18 14" stroke="#d1d5db" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="sal-item">
                    <div class="sal-label">After 5 Years</div>
                    <div class="sal-value green">€${(d.salary_after_5_years / 1000).toFixed(0)}k</div>
                    <div class="sal-change">+${salaryIncrease}%</div>
                </div>
            </div>
        </div>

        <!-- Chart -->
        <div class="result-section">
            <div class="section-label">Investment vs 5-Year Earnings</div>
            <div class="chart-wrap">
                <canvas id="investmentChart" role="img" aria-label="Bar chart comparing investment to 5-year earnings"></canvas>
            </div>
        </div>

        ${careerHTML}

        <!-- Lifetime -->
        ${lifetime ? `
        <div class="result-section">
            <div class="section-label">30-Year Career Estimate</div>
            <div class="lifetime-row">
                <div class="lifetime-num">€${(lifetime.total_earnings / 1_000_000).toFixed(2)}M</div>
                <div class="lifetime-desc">lifetime earnings, ${lifetime.times_earned_back}x your investment returned</div>
            </div>
        </div>` : ''}

    </div>`;

    el.innerHTML = html;

    // Animate ROI counter
    animateCounter('roiCounter', roi, '%');

    // Draw chart
    requestAnimationFrame(() => createInvestmentChart(d));

    // Scroll to results on mobile
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

function createInvestmentChart(data) {
    const canvas = document.getElementById('investmentChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (investmentChartInstance) {
        investmentChartInstance.destroy();
        investmentChartInstance = null;
    }

    const totalCost = data.total_cost;
    const earnings  = data.annual_net_income * 5;
    const profit    = earnings - totalCost;

    investmentChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['You Invest', 'You Earn (5 yrs)', 'Net Profit'],
            datasets: [{
                data: [totalCost, earnings, profit],
                backgroundColor: ['rgba(220,38,38,0.7)', 'rgba(37,99,235,0.7)', 'rgba(22,163,74,0.8)'],
                borderColor:     ['#dc2626', '#2563eb', '#16a34a'],
                borderWidth: 2,
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(17,24,39,0.92)',
                    padding: 10,
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 13 },
                    callbacks: { label: ctx => '€' + ctx.parsed.y.toLocaleString() },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => '€' + (v / 1000) + 'k', font: { size: 12 } },
                    grid: { color: 'rgba(0,0,0,0.04)' },
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 12, weight: '600' } },
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
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#7c3aed'];

    const makeBar = (id, data, yFmt, ttFmt) => {
        const c = document.getElementById(id);
        if (!c) return;
        new Chart(c, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, courses.length), borderRadius: 6 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ttFmt(ctx.parsed.y) } },
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: yFmt, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                },
            },
        });
    };

    makeBar('compROI',     courses.map(c => c.roi_5_years),    v => v + '%',               v => v + '% ROI');
    makeBar('compPayback', courses.map(c => c.payback_years),  v => v + 'y',               v => v.toFixed(1) + ' years');
    makeBar('compSalary',  courses.map(c => c.starting_salary),v => '€' + (v/1000) + 'k', v => '€' + v.toLocaleString());

    const ce = document.getElementById('compCostEarnings');
    if (ce) {
        new Chart(ce, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Total Cost',      data: courses.map(c => c.total_cost),            backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 6 },
                    { label: '5-yr Net Earn.', data: courses.map(c => c.annual_net_income * 5),  backgroundColor: 'rgba(22,163,74,0.75)', borderRadius: 6 },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top', labels: { font: { size: 11 } } },
                    tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': €' + ctx.parsed.y.toLocaleString() } },
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => '€' + (v / 1000) + 'k', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                },
            },
        });
    }
}

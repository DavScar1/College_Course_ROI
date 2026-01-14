// Global variables
let allCourses = [];
let allCoursesData = [];
let salaryChartInstance = null;
let investmentChartInstance = null;
let comparisonChartInstance = null;
let coursesLoaded = false;
let currentCourseData = null;
let activeFilters = {
    universities: [],
    fields: [],
    sortBy: 'roi-desc'
};

// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:5000'
    : '';

// LocalStorage keys
const STORAGE_KEYS = {
    LAST_COURSE: 'roi_calc_last_course',
    USE_CUSTOM_TUITION: 'roi_calc_use_custom_tuition',
    CUSTOM_TUITION: 'roi_calc_custom_tuition',
    ENABLE_PART_TIME: 'roi_calc_enable_part_time',
    PART_TIME_HOURS: 'roi_calc_part_time_hours'
};

// View switching
function switchView(viewName) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    event.target.classList.add('active');
    
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(viewName + 'View').classList.add('active');
    
    hideAllResults();
    
    if (viewName === 'explore' && allCoursesData.length > 0) {
        renderCourseGrid(allCoursesData);
    }
}

// Toggle collapsible sections
function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const header = event.currentTarget;
    
    if (section.classList.contains('expanded')) {
        section.classList.remove('expanded');
        header.classList.remove('expanded');
    } else {
        section.classList.add('expanded');
        header.classList.add('expanded');
    }
}

// Main calculate function
function calculateROI() {
    const calculatorForm = document.getElementById('calculatorForm');
    if (calculatorForm) {
        const event = new Event('submit');
        calculatorForm.dispatchEvent(event);
    }
}

function hideAllResults() {
    const resultsDiv = document.getElementById('results');
    const placeholder = document.getElementById('resultsPlaceholder');
    const comparisonResults = document.getElementById('comparisonResults');
    const error = document.getElementById('error');
    
    if (resultsDiv) resultsDiv.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
    if (comparisonResults) comparisonResults.style.display = 'none';
    if (error) error.style.display = 'none';
}

function setLoading(buttonElement, isLoading) {
    if (isLoading) {
        buttonElement.dataset.originalText = buttonElement.textContent;
        buttonElement.textContent = 'Loading...';
        buttonElement.disabled = true;
    } else {
        buttonElement.textContent = buttonElement.dataset.originalText || 'Calculate';
        buttonElement.disabled = false;
    }
}

function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('error').style.display = 'block';
    document.getElementById('error').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Custom Tuition Toggle
document.addEventListener('DOMContentLoaded', function() {
    const useCustomTuitionCheckbox = document.getElementById('useCustomTuition');
    const customTuitionFields = document.getElementById('customTuitionFields');
    
    useCustomTuitionCheckbox.addEventListener('change', function() {
        if (this.checked) {
            customTuitionFields.style.display = 'block';
        } else {
            customTuitionFields.style.display = 'none';
        }
    });
    
    // Part-time work toggle
    const enablePartTimeCheckbox = document.getElementById('enablePartTime');
    const partTimeFields = document.getElementById('partTimeFields');
    
    enablePartTimeCheckbox.addEventListener('change', function() {
        if (this.checked) {
            partTimeFields.style.display = 'block';
            updatePartTimeCalculations();
        } else {
            partTimeFields.style.display = 'none';
        }
    });
    
    // Part-time hours slider
    const partTimeHoursSlider = document.getElementById('partTimeHours');
    const hoursDisplay = document.getElementById('hoursDisplay');
    
    partTimeHoursSlider.addEventListener('input', function() {
        hoursDisplay.textContent = this.value;
        updatePartTimeCalculations();
    });
    
    // Hourly rate slider
    const hourlyRateSlider = document.getElementById('hourlyRate');
    const rateDisplay = document.getElementById('rateDisplay');
    
    hourlyRateSlider.addEventListener('input', function() {
        rateDisplay.textContent = parseFloat(this.value).toFixed(2);
        updatePartTimeCalculations();
    });
    
    // Search functionality
    const searchInput = document.getElementById('courseSearch');
    const searchResults = document.getElementById('searchResults');
    const clearSearchBtn = document.getElementById('clearSearch');
    
    searchInput.addEventListener('input', function() {
        const query = this.value.trim();
        
        if (query.length > 0) {
            clearSearchBtn.style.display = 'flex';
            const results = searchCourses(query);
            displaySearchResults(results, query);
        } else {
            clearSearchBtn.style.display = 'none';
            searchResults.style.display = 'none';
        }
    });
    
    clearSearchBtn.addEventListener('click', function() {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        searchResults.style.display = 'none';
        searchInput.focus();
    });
    
    // Close search results when clicking outside
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });
});

// Search courses
function searchCourses(query) {
    const lowerQuery = query.toLowerCase();
    return allCourses.filter(course => 
        course.toLowerCase().includes(lowerQuery)
    );
}

// Display search results
function displaySearchResults(results, query) {
    const searchResults = document.getElementById('searchResults');
    
    if (results.length === 0) {
        searchResults.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--gray-500);">No courses found</div>';
        searchResults.style.display = 'block';
        return;
    }
    
    const lowerQuery = query.toLowerCase();
    let html = '';
    
    results.slice(0, 8).forEach(course => {
        const parts = course.split(' - ');
        const field = parts[0];
        const university = parts[1];
        
        // Highlight matching text
        const highlightedCourse = course.replace(new RegExp(query, 'gi'), match => `<mark>${match}</mark>`);
        
        html += `
            <div class="search-result-item" onclick="selectCourseFromSearch('${course.replace(/'/g, "\\'")}')">
                <div>${highlightedCourse}</div>
                <div class="search-result-meta">${university}</div>
            </div>
        `;
    });
    
    searchResults.innerHTML = html;
    searchResults.style.display = 'block';
    
    console.log('Search dropdown displayed with', results.length, 'results');
}

// Select course from search
function selectCourseFromSearch(course) {
    document.getElementById('course').value = course;
    document.getElementById('courseSearch').value = '';
    document.getElementById('clearSearch').style.display = 'none';
    document.getElementById('searchResults').style.display = 'none';
}

// Filter by university (quick filter)
function filterByUniversity(uni) {
    const dropdown = document.getElementById('course');
    const options = Array.from(dropdown.options);
    
    // Update active button
    document.querySelectorAll('.filter-pills .pill').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Show only selected university
    options.forEach(option => {
        if (option.value.includes(` - ${uni}`)) {
            option.style.display = 'block';
        } else {
            option.style.display = 'none';
        }
    });
    
    // Clear selection
    dropdown.value = '';
}

// Show all courses
function showAllCourses() {
    const dropdown = document.getElementById('course');
    const options = Array.from(dropdown.options);
    
    // Update active button
    document.querySelectorAll('.filter-pills .pill').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Show all
    options.forEach(option => {
        option.style.display = 'block';
    });
    
    // Clear selection
    dropdown.value = '';
}

// Toggle field filter (Explore tab)
function toggleFieldFilter(button) {
    button.classList.toggle('active');
    applyFilters();
}

// Apply all filters (Explore tab)
function applyFilters() {
    // Get selected universities from checkboxes
    const universityCheckboxes = document.querySelectorAll('.chip-checkbox input[type="checkbox"]');
    activeFilters.universities = Array.from(universityCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
    // Get selected fields from active buttons
    const fieldButtons = document.querySelectorAll('.chip-btn.active');
    activeFilters.fields = Array.from(fieldButtons).map(btn => btn.dataset.field);
    
    // Get sort option
    const sortSelect = document.getElementById('sortBy');
    if (sortSelect) {
        activeFilters.sortBy = sortSelect.value;
    }
    
    // Filter courses
    let filtered = [...allCoursesData];
    
    // Apply university filter
    if (activeFilters.universities.length > 0) {
        filtered = filtered.filter(course => {
            return activeFilters.universities.some(uni => {
                // Check if course name contains the university abbreviation
                return course.course_name.includes(` - ${uni}`);
            });
        });
    }
    
    // Apply field filter
    if (activeFilters.fields.length > 0) {
        filtered = filtered.filter(course => {
            return activeFilters.fields.some(field => {
                // Check if course name starts with the field
                const courseName = course.course_name.split(' - ')[0];
                return courseName.includes(field) || field.includes(courseName);
            });
        });
    }
    
    // Sort courses
    filtered = sortCourses(filtered, activeFilters.sortBy);
    
    // Render
    renderCourseGrid(filtered);
}

// Sort courses
function sortCourses(courses, sortBy) {
    const sorted = [...courses];
    
    switch(sortBy) {
        case 'roi-desc':
            sorted.sort((a, b) => b.roi_5_years - a.roi_5_years);
            break;
        case 'roi-asc':
            sorted.sort((a, b) => a.roi_5_years - b.roi_5_years);
            break;
        case 'payback-asc':
            sorted.sort((a, b) => a.payback_years - b.payback_years);
            break;
        case 'payback-desc':
            sorted.sort((a, b) => b.payback_years - a.payback_years);
            break;
        case 'cost-asc':
            sorted.sort((a, b) => a.total_cost - b.total_cost);
            break;
        case 'cost-desc':
            sorted.sort((a, b) => b.total_cost - a.total_cost);
            break;
        case 'name':
            sorted.sort((a, b) => a.course_name.localeCompare(b.course_name));
            break;
    }
    
    return sorted;
}

// Reset all filters
function resetFilters() {
    // Uncheck all university checkboxes
    document.querySelectorAll('.chip-checkbox input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    // Deactivate all field buttons
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Reset sort
    document.getElementById('sortBy').value = 'roi-desc';
    
    // Clear filters and rerender
    activeFilters = {
        universities: [],
        fields: [],
        sortBy: 'roi-desc'
    };
    
    renderCourseGrid(allCoursesData);
}

// Show Top 5 (Explore tab)
function showTop5(type) {
    let sorted = [...allCoursesData];
    
    switch(type) {
        case 'roi':
            sorted.sort((a, b) => b.roi_5_years - a.roi_5_years);
            break;
        case 'payback':
            sorted.sort((a, b) => a.payback_years - b.payback_years);
            break;
        case 'cost':
            sorted.sort((a, b) => a.total_cost - b.total_cost);
            break;
    }
    
    renderCourseGrid(sorted.slice(0, 5));
    
    // Scroll to grid
    document.getElementById('courseGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Render course grid (Explore tab)
function renderCourseGrid(courses) {
    const grid = document.getElementById('courseGrid');
    const noResults = document.getElementById('noResults');
    
    if (courses.length === 0) {
        grid.style.display = 'none';
        noResults.style.display = 'flex';
        return;
    }
    
    grid.style.display = 'grid';
    noResults.style.display = 'none';
    
    let html = '';
    
    courses.forEach(course => {
        const roiClass = course.roi_5_years > 400 ? 'excellent' : 
                        course.roi_5_years > 300 ? 'good' : 'fair';
        
        const roiBadgeClass = course.roi_5_years > 400 ? 'badge-success' : 
                              course.roi_5_years > 300 ? 'badge-info' : 'badge-warning';
        
        html += `
            <div class="course-card-item" onclick="selectCourseFromGrid('${course.course_name.replace(/'/g, "\\'")}')">
                <div class="course-card-header">
                    <div class="course-card-title">${course.course_name.split(' - ')[0]}</div>
                    <div class="course-card-subtitle">${course.university}</div>
                </div>
                
                <div class="course-stats">
                    <div class="course-stat">
                        <div class="course-stat-label">ROI (5yr)</div>
                        <div class="course-stat-value">${course.roi_5_years}%</div>
                    </div>
                    <div class="course-stat">
                        <div class="course-stat-label">Payback</div>
                        <div class="course-stat-value">${course.payback_years.toFixed(1)}y</div>
                    </div>
                    <div class="course-stat">
                        <div class="course-stat-label">Total Cost</div>
                        <div class="course-stat-value">€${(course.total_cost / 1000).toFixed(0)}k</div>
                    </div>
                    <div class="course-stat">
                        <div class="course-stat-label">Start Salary</div>
                        <div class="course-stat-value">€${(course.starting_salary / 1000).toFixed(0)}k</div>
                    </div>
                </div>
                
                <div class="badges">
                    <span class="badge ${roiBadgeClass}">${course.analysis.roi_rating} ROI</span>
                </div>
            </div>
        `;
    });
    
    grid.innerHTML = html;
}

// Select course from grid
function selectCourseFromGrid(course) {
    switchView('calculator');
    document.getElementById('course').value = course;
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Trigger calculation after a brief delay
    setTimeout(() => {
        calculateROI();
    }, 300);
}

// Calculate part-time earnings
function updatePartTimeCalculations() {
    const hours = parseInt(document.getElementById('partTimeHours').value);
    const hourlyRate = parseFloat(document.getElementById('hourlyRate').value);
    const weeksPerYear = 30; // Account for holidays/exams (not full 52 weeks)
    
    const weeklyIncome = hours * hourlyRate;
    const annualIncome = weeklyIncome * weeksPerYear;
    
    // Get course length if available
    const courseSelect = document.getElementById('course');
    let courseLength = 4; // Default
    
    if (currentCourseData) {
        courseLength = currentCourseData.course_length;
    }
    
    const totalIncome = annualIncome * courseLength;
    
    document.getElementById('weeklyIncome').textContent = '€' + Math.round(weeklyIncome).toLocaleString();
    document.getElementById('partTimeIncome').textContent = '€' + Math.round(annualIncome).toLocaleString();
    document.getElementById('partTimeTotal').textContent = '€' + Math.round(totalIncome).toLocaleString();
    document.getElementById('costReduction').textContent = '€' + Math.round(totalIncome).toLocaleString();
}

// Save preferences to localStorage
function savePreferences() {
    const course = document.getElementById('course').value;
    const useCustomTuition = document.getElementById('useCustomTuition').checked;
    const customTuition = document.getElementById('customTuition').value;
    const enablePartTime = document.getElementById('enablePartTime').checked;
    const partTimeHours = document.getElementById('partTimeHours').value;
    
    if (course) {
        localStorage.setItem(STORAGE_KEYS.LAST_COURSE, course);
    }
    localStorage.setItem(STORAGE_KEYS.USE_CUSTOM_TUITION, useCustomTuition);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_TUITION, customTuition);
    localStorage.setItem(STORAGE_KEYS.ENABLE_PART_TIME, enablePartTime);
    localStorage.setItem(STORAGE_KEYS.PART_TIME_HOURS, partTimeHours);
}

// Load saved preferences
function loadSavedPreferences() {
    const lastCourse = localStorage.getItem(STORAGE_KEYS.LAST_COURSE);
    const useCustomTuition = localStorage.getItem(STORAGE_KEYS.USE_CUSTOM_TUITION) === 'true';
    const customTuition = localStorage.getItem(STORAGE_KEYS.CUSTOM_TUITION);
    const enablePartTime = localStorage.getItem(STORAGE_KEYS.ENABLE_PART_TIME) === 'true';
    const partTimeHours = localStorage.getItem(STORAGE_KEYS.PART_TIME_HOURS);
    
    if (lastCourse) {
        const courseSelect = document.getElementById('course');
        courseSelect.value = lastCourse;
        document.getElementById('savedPreferencesNotice').style.display = 'flex';
    }
    
    if (useCustomTuition) {
        document.getElementById('useCustomTuition').checked = true;
        document.getElementById('customTuitionFields').style.display = 'block';
        if (customTuition) {
            document.getElementById('customTuition').value = customTuition;
        }
    }
    
    if (enablePartTime) {
        document.getElementById('enablePartTime').checked = true;
        document.getElementById('partTimeFields').style.display = 'block';
        if (partTimeHours) {
            document.getElementById('partTimeHours').value = partTimeHours;
            document.getElementById('hoursDisplay').textContent = partTimeHours;
            updatePartTimeCalculations();
        }
    }
}

// Clear saved preferences
function clearSavedPreferences() {
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
    
    document.getElementById('course').value = '';
    document.getElementById('useCustomTuition').checked = false;
    document.getElementById('customTuitionFields').style.display = 'none';
    document.getElementById('customTuition').value = '';
    document.getElementById('enablePartTime').checked = false;
    document.getElementById('partTimeFields').style.display = 'none';
    document.getElementById('partTimeHours').value = 10;
    document.getElementById('hoursDisplay').textContent = '10';
    document.getElementById('savedPreferencesNotice').style.display = 'none';
    
    hideAllResults();
}

// Fetch all courses when page loads
window.onload = function() {
    fetch(`${API_BASE_URL}/courses`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load courses from server');
            }
            return response.json();
        })
        .then(data => {
            if (!data.courses || !Array.isArray(data.courses)) {
                throw new Error('Invalid course data received');
            }
            
            allCourses = data.courses;
            coursesLoaded = true;
            
            const dropdown = document.getElementById('course');
            data.courses.forEach(course => {
                const option = document.createElement('option');
                option.value = course;
                option.text = course;
                dropdown.appendChild(option);
            });
            
            const multiDropdown = document.getElementById('coursesMultiple');
            data.courses.forEach(course => {
                const option = document.createElement('option');
                option.value = course;
                option.text = course;
                multiDropdown.appendChild(option);
            });
            
            // Load all course data for filtering
            loadAllCoursesData();
            
            // Load saved preferences after courses are loaded
            loadSavedPreferences();
        })
        .catch(error => {
            console.error('Error loading courses:', error);
            showError('Failed to load courses. Make sure the Flask server is running on port 5000.');
        });
};

// Load all courses data with calculations
function loadAllCoursesData() {
    const promises = allCourses.map(course => 
        fetch(`${API_BASE_URL}/calculate?course=${encodeURIComponent(course)}`)
            .then(response => response.json())
            .then(data => data.success ? data.data : null)
            .catch(() => null)
    );
    
    Promise.all(promises).then(results => {
        allCoursesData = results.filter(r => r !== null);
    });
}

// Single course calculation with customization
document.addEventListener('DOMContentLoaded', function() {
    const form = document.createElement('form');
    form.id = 'calculatorForm';
    form.style.display = 'none';
    document.body.appendChild(form);
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!coursesLoaded) {
            showError('Courses are still loading. Please wait a moment and try again.');
            return;
        }
        
        const courseInput = document.getElementById('course');
        const course = courseInput ? courseInput.value : '';
        
        if (!course) {
            showError('Please select a course');
            return;
        }
        
        // Build URL with custom parameters
        let url = `${API_BASE_URL}/calculate?course=${encodeURIComponent(course)}`;
        
        const useCustomTuition = document.getElementById('useCustomTuition');
        if (useCustomTuition && useCustomTuition.checked) {
            const customTuition = document.getElementById('customTuition').value;
            if (customTuition) {
                url += `&tuition=${customTuition}`;
            }
        }
        
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.error || 'Server error occurred');
                    });
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    currentCourseData = data.data;
                    
                    // Apply part-time work adjustments if enabled
                    const enablePartTime = document.getElementById('enablePartTime');
                    if (enablePartTime && enablePartTime.checked) {
                        const hours = parseInt(document.getElementById('partTimeHours').value);
                        const hourlyRate = parseFloat(document.getElementById('hourlyRate').value);
                        const weeksPerYear = 30;
                        const annualIncome = hours * hourlyRate * weeksPerYear;
                        const totalPartTimeEarnings = annualIncome * currentCourseData.course_length;
                        
                        // Adjust total cost
                        const originalCost = currentCourseData.total_cost;
                        currentCourseData.total_cost = Math.max(0, originalCost - totalPartTimeEarnings);
                        currentCourseData.original_cost = originalCost;
                        currentCourseData.part_time_earnings = totalPartTimeEarnings;
                        
                        // Recalculate payback
                        const originalPayback = currentCourseData.payback_years;
                        currentCourseData.payback_years = currentCourseData.total_cost / currentCourseData.annual_net_income;
                        currentCourseData.original_payback = originalPayback;
                    }
                    
                    displaySingleResult(currentCourseData);
                    
                    // Save preferences
                    savePreferences();
                } else {
                    showError(data.error || 'Calculation failed');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showError(error.message || 'Failed to calculate. Make sure Flask is running.');
            });
    });
});

function displaySingleResult(d) {
    // Hide placeholder, show results
    document.getElementById('resultsPlaceholder').style.display = 'none';
    document.getElementById('results').style.display = 'block';
    
    // Build the results HTML
    let customizationHTML = '';
    let hasCustomization = false;
    
    const useCustomTuition = document.getElementById('useCustomTuition').checked;
    if (useCustomTuition) {
        const customTuition = document.getElementById('customTuition').value;
        if (customTuition) {
            customizationHTML += `<div class="badge badge-info">Custom tuition: €${parseFloat(customTuition).toLocaleString()}/year</div>`;
            hasCustomization = true;
        }
    }
    
    const enablePartTime = document.getElementById('enablePartTime').checked;
    if (enablePartTime && d.part_time_earnings) {
        const hours = document.getElementById('partTimeHours').value;
        const rate = document.getElementById('hourlyRate').value;
        customizationHTML += `<div class="badge badge-info">Part-time: ${hours} hrs/week at €${parseFloat(rate).toFixed(2)}/hr</div>`;
        hasCustomization = true;
    }
    
    const paybackBadgeClass = d.analysis.payback_emoji === '🟢' ? 'badge-success' : 
                             d.analysis.payback_emoji === '🟡' ? 'badge-warning' : 'badge-warning';
    
    // NEW: Build additional statistics section if course_data exists
    let additionalStatsHTML = '';
    if (d.course_data) {
        const cd = d.course_data;
        
        additionalStatsHTML = `
        <!-- Career Snapshot Section -->
        <div style="margin-top: 32px; padding-top: 32px; border-top: 2px solid var(--gray-200);">
            <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 24px; color: var(--gray-900); display: flex; align-items: center; gap: 8px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                Career Insights
            </h3>
            
            <!-- Quick Stats Grid -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
                <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); padding: 20px; border-radius: 12px; text-align: center;">
                    <div style="font-size: 36px; font-weight: 700; color: #1e40af; margin-bottom: 4px;">${cd.employment_rate}%</div>
                    <div style="font-size: 13px; color: #1e40af; font-weight: 600;">Employment Rate</div>
                    <div style="font-size: 11px; color: #3b82f6; margin-top: 4px;">within 9 months</div>
                </div>
                
                <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 20px; border-radius: 12px; text-align: center;">
                    <div style="font-size: 36px; font-weight: 700; color: #92400e; margin-bottom: 4px;">${cd.graduate_satisfaction}</div>
                    <div style="font-size: 13px; color: #92400e; font-weight: 600;">Student Rating</div>
                    <div style="font-size: 11px; color: #b45309; margin-top: 4px;">out of 5 ⭐</div>
                </div>
                
                <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); padding: 20px; border-radius: 12px; text-align: center;">
                    <div style="font-size: 36px; font-weight: 700; color: #065f46; margin-bottom: 4px;">${cd.job_security}</div>
                    <div style="font-size: 13px; color: #065f46; font-weight: 600;">Job Security</div>
                    <div style="font-size: 11px; color: #047857; margin-top: 4px;">stability rating 🛡️</div>
                </div>
            </div>

            <!-- Visual Rating Bars -->
            <div style="background: var(--gray-50); padding: 24px; border-radius: 12px; margin-bottom: 24px;">
                <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 20px; color: var(--gray-900);">Quality of Life Indicators</h4>
                
                <div style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 13px; font-weight: 500; color: var(--gray-700);">Work-Life Balance</span>
                        <span style="font-size: 13px; font-weight: 700; color: var(--primary);">${cd.work_life_balance}/5</span>
                    </div>
                    <div style="background: var(--gray-200); height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #3b82f6, #2563eb); width: ${(cd.work_life_balance / 5) * 100}%; height: 100%;"></div>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 13px; font-weight: 500; color: var(--gray-700);">Career Progression</span>
                        <span style="font-size: 13px; font-weight: 700; color: var(--primary);">${cd.career_progression}</span>
                    </div>
                    <div style="background: var(--gray-200); height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #10b981, #059669); width: ${cd.career_progression === 'Excellent' ? 100 : cd.career_progression === 'Very Good' ? 85 : cd.career_progression === 'Good' ? 70 : 50}%; height: 100%;"></div>
                    </div>
                </div>
                
                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 13px; font-weight: 500; color: var(--gray-700);">Skills Demand</span>
                        <span style="font-size: 13px; font-weight: 700; color: var(--primary);">${cd.skills_demand}</span>
                    </div>
                    <div style="background: var(--gray-200); height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #f59e0b, #d97706); width: ${cd.skills_demand === 'Very High' ? 100 : cd.skills_demand === 'High' ? 75 : 50}%; height: 100%;"></div>
                    </div>
                </div>
            </div>

            <!-- Two Column Layout -->
            <div style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 20px; margin-bottom: 24px;">
                <!-- Work Environment -->
                <div style="background: white; border: 2px solid var(--gray-200); padding: 20px; border-radius: 12px;">
                    <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 16px; color: var(--gray-900); display: flex; align-items: center; gap: 8px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                        Work Environment
                    </h4>
                    <div style="space-y: 12px;">
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 12px; color: var(--gray-600); margin-bottom: 4px;">Remote Work</div>
                            <div style="font-size: 16px; font-weight: 600; color: var(--gray-900);">${cd.remote_work_availability}</div>
                        </div>
                        ${cd.avg_class_size ? `
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 12px; color: var(--gray-600); margin-bottom: 4px;">Class Size</div>
                            <div style="font-size: 16px; font-weight: 600; color: var(--gray-900);">${cd.avg_class_size} students</div>
                        </div>
                        ` : ''}
                        ${cd.industry_growth_rate ? `
                        <div>
                            <div style="font-size: 12px; color: var(--gray-600); margin-bottom: 4px;">Industry Growth</div>
                            <div style="font-size: 16px; font-weight: 600; color: #059669;">${cd.industry_growth_rate}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Study & Opportunities -->
                <div style="background: white; border: 2px solid var(--gray-200); padding: 20px; border-radius: 12px;">
                    <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 16px; color: var(--gray-900); display: flex; align-items: center; gap: 8px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                            <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                        </svg>
                        Study & Opportunities
                    </h4>
                    <div style="space-y: 12px;">
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 12px; color: var(--gray-600); margin-bottom: 4px;">Further Study Rate</div>
                            <div style="font-size: 16px; font-weight: 600; color: var(--gray-900);">${cd.further_study_rate}% pursue postgrad</div>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 12px; color: var(--gray-600); margin-bottom: 4px;">International Opportunities</div>
                            <div style="font-size: 16px; font-weight: 600; color: var(--gray-900);">${cd.international_opportunities}</div>
                        </div>
                        ${cd.internship_opportunities ? `
                        <div>
                            <div style="font-size: 12px; color: var(--gray-600); margin-bottom: 4px;">Internships</div>
                            <div style="font-size: 14px; font-weight: 600; color: #059669;">${cd.internship_opportunities}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>

            <!-- Salary Range (if available) -->
            ${cd.startup_salary_range ? `
            <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); padding: 20px; border-radius: 12px; border: 2px solid #86efac; margin-bottom: 24px;">
                <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 12px; color: #065f46; display: flex; align-items: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                    Expected Starting Salary Range
                </h4>
                <div style="display: flex; justify-content: space-around; align-items: center;">
                    <div style="text-align: center;">
                        <div style="font-size: 12px; color: #047857; margin-bottom: 4px;">MINIMUM</div>
                        <div style="font-size: 28px; font-weight: 700; color: #065f46;">€${(cd.startup_salary_range.min / 1000).toFixed(0)}k</div>
                    </div>
                    <div style="font-size: 24px; color: #059669;">→</div>
                    <div style="text-align: center;">
                        <div style="font-size: 12px; color: #047857; margin-bottom: 4px;">MAXIMUM</div>
                        <div style="font-size: 28px; font-weight: 700; color: #065f46;">€${(cd.startup_salary_range.max / 1000).toFixed(0)}k</div>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- Top Employers -->
            <div style="background: white; border: 2px solid var(--gray-200); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 16px; color: var(--gray-900); display: flex; align-items: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                    Top Graduate Employers
                </h4>
                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                    ${cd.top_employers.map(emp => `
                        <span style="background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid var(--gray-300); color: var(--gray-800);">${emp}</span>
                    `).join('')}
                </div>
            </div>

            <!-- Career Paths -->
            <div style="background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); padding: 24px; border-radius: 12px; border: 2px solid #e9d5ff;">
                <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 16px; color: #6b21a8; display: flex; align-items: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                    </svg>
                    Common Career Paths
                </h4>
                <div style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
                    ${cd.typical_roles.map(role => `
                        <div style="display: flex; align-items: center; gap: 10px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #e9d5ff;">
                            <span style="color: #7c3aed; font-size: 18px; font-weight: 700;">→</span>
                            <span style="color: var(--gray-800); font-weight: 500; font-size: 14px;">${role}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        `;
    }
    
    const html = `
        <div class="results-header">
            <h2>${d.course_name}</h2>
            <p>${d.university}</p>
        </div>
        
        ${hasCustomization ? `<div class="badges" style="margin-bottom: 24px;">${customizationHTML}</div>` : ''}
        
        <!-- Hero ROI Section -->
        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 40px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #93c5fd;">
            <div style="text-align: center; margin-bottom: 32px;">
                <div style="font-size: 12px; color: #3b82f6; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">5-Year Return on Investment</div>
                <div style="font-size: 64px; font-weight: 800; color: #1e40af; letter-spacing: -0.03em; line-height: 1;">${d.roi_5_years}%</div>
            </div>
            
            <div style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px;">
                <div style="text-align: center; padding: 24px; background: white; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">TOTAL COST</div>
                    <div style="font-size: 32px; font-weight: 700; color: #111827;">€${(d.total_cost / 1000).toFixed(0)}k</div>
                    <div style="font-size: 11px; color: #9ca3af; margin-top: 6px;">€${(d.tuition_per_year / 1000).toFixed(1)}k/year × ${d.course_length} years</div>
                </div>
                
                <div style="text-align: center; padding: 24px; background: white; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">STARTING SALARY</div>
                    <div style="font-size: 32px; font-weight: 700; color: #111827;">€${(d.starting_salary / 1000).toFixed(0)}k</div>
                    <div style="font-size: 11px; color: #9ca3af; margin-top: 6px;">€${Math.round(d.starting_salary / 12).toLocaleString()}/month</div>
                </div>
                
                <div style="text-align: center; padding: 24px; background: white; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">PAYBACK PERIOD</div>
                    <div style="font-size: 32px; font-weight: 700; color: #111827;">${d.payback_years.toFixed(1)}</div>
                    <div style="font-size: 11px; color: #9ca3af; margin-top: 6px;">years to recover</div>
                </div>
            </div>
        </div>

        <!-- Key Insight Box -->
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 20px; border-radius: 10px; border: 1px solid #fbbf24; margin-bottom: 24px;">
            <div style="display: flex; align-items: start; gap: 12px;">
                <div style="width: 24px; height: 24px; flex-shrink: 0;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#92400e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 6px;">Key Insight</div>
                    <div style="font-size: 14px; color: #78350f; line-height: 1.6;">${d.analysis.recommendation}</div>
                </div>
            </div>
        </div>

        <!-- Salary Progression Visual -->
        <div style="background: white; border: 2px solid var(--gray-200); padding: 24px; border-radius: 12px; margin-bottom: 24px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 20px; color: var(--gray-900); display: flex; align-items: center; gap: 8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                Salary Progression
            </h3>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 11px; color: var(--gray-600); margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">STARTING</div>
                    <div style="font-size: 28px; font-weight: 700; color: var(--gray-900);">€${(d.starting_salary / 1000).toFixed(0)}k</div>
                    <div style="font-size: 11px; color: var(--gray-500);">Year 1</div>
                </div>
                <div style="flex: 0 0 60px; text-align: center;">
                    <svg width="60" height="24" viewBox="0 0 60 24" fill="none">
                        <path d="M0 12 L50 12 M40 4 L50 12 L40 20" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 11px; color: var(--gray-600); margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">AFTER 5 YEARS</div>
                    <div style="font-size: 28px; font-weight: 700; color: #059669;">€${(d.salary_after_5_years / 1000).toFixed(0)}k</div>
                    <div style="font-size: 11px; color: #047857;">+${Math.round(((d.salary_after_5_years - d.starting_salary) / d.starting_salary) * 100)}% increase</div>
                </div>
            </div>
        </div>

        <!-- Investment Chart -->
        <div style="background: white; border: 2px solid var(--gray-200); padding: 24px; border-radius: 12px; margin-bottom: 24px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 20px; color: var(--gray-900); display: flex; align-items: center; gap: 8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
                Investment vs Returns (5 Years)
            </h3>
            <div style="height: 280px;">
                <canvas id="investmentChart"></canvas>
            </div>
        </div>
        
        ${additionalStatsHTML}
        
        <!-- Lifetime Earnings -->
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #6b21a8 100%); color: white; padding: 32px; border-radius: 12px; text-align: center; margin-top: 24px;">
            <div style="font-size: 13px; opacity: 0.9; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                    <polyline points="17 6 23 6 23 12"></polyline>
                </svg>
                Lifetime Earnings Potential
            </div>
            <div style="font-size: 48px; font-weight: 800; margin: 12px 0; letter-spacing: -0.02em;">€${(d.analysis.lifetime.total_earnings / 1000000).toFixed(2)}M</div>
            <div style="font-size: 15px; opacity: 0.9; font-weight: 500;">Over a 30-year career, you'll earn ${d.analysis.lifetime.times_earned_back}x your investment back</div>
        </div>
    `;
    
    document.getElementById('results').innerHTML = html;
    
    // Create investment chart
    setTimeout(() => {
        createInvestmentChart(d);
    }, 100);
}

function createInvestmentChart(data) {
    const canvas = document.getElementById('investmentChart');
    
    if (investmentChartInstance) {
        investmentChartInstance.destroy();
        investmentChartInstance = null;
    }
    
    const ctx = canvas.getContext('2d');
    
    const totalCost = data.total_cost;
    const earnings5y = data.annual_net_income * 5;
    const profit = earnings5y - totalCost;
    
    investmentChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['What You Invest', 'What You Earn (5 yrs)', 'Your Profit'],
            datasets: [{
                data: [totalCost, earnings5y, profit],
                backgroundColor: [
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(34, 197, 94, 0.8)'
                ],
                borderColor: ['#dc2626', '#2563eb', '#16a34a'],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        label: function(context) {
                            return '€' + context.parsed.y.toLocaleString();
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '€' + (value / 1000) + 'k';
                        },
                        font: { size: 12 }
                    },
                    grid: { 
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    }
                },
                x: { 
                    grid: { display: false },
                    ticks: {
                        font: { size: 12, weight: 'bold' }
                    }
                }
            }
        }
    });
}

// Compare multiple courses
function compareMultipleCourses() {
    if (!coursesLoaded) {
        showError('Courses are still loading. Please wait a moment and try again.');
        return;
    }
    
    const select = document.getElementById('coursesMultiple');
    const selected = Array.from(select.selectedOptions).map(option => option.value);
    
    if (selected.length < 2) {
        showError('Please select at least 2 courses to compare');
        return;
    }
    
    if (selected.length > 5) {
        showError('Please select maximum 5 courses');
        return;
    }
    
    fetch(`${API_BASE_URL}/compare-multiple`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ courses: selected })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(err.error || 'Server error occurred');
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            displayComparisonResults(data);
        } else {
            showError(data.error || 'Comparison failed');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showError(error.message || 'Failed to compare. Make sure Flask is running.');
    });
}

function displayComparisonResults(data) {
    const winners = data.winners;
    const courses = data.courses;
    
    // Build winners summary HTML
    let winnersHTML = `
        <div class="card" style="background: #ecfdf5; border-color: #a7f3d0;">
            <div class="card-body">
                <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 16px; color: var(--gray-900);">Winners by Category</h3>
                <div style="display: grid; gap: 12px;">
    `;
    
    if (winners.best_roi) {
        winnersHTML += `
            <div style="display: flex; align-items: center; gap: 10px; font-size: 14px;">
                <span style="font-size: 20px;">🏆</span>
                <strong>Best ROI:</strong> ${winners.best_roi}
            </div>
        `;
    }
    if (winners.fastest_payback) {
        winnersHTML += `
            <div style="display: flex; align-items: center; gap: 10px; font-size: 14px;">
                <span style="font-size: 20px;">⚡</span>
                <strong>Fastest Payback:</strong> ${winners.fastest_payback}
            </div>
        `;
    }
    if (winners.lowest_cost) {
        winnersHTML += `
            <div style="display: flex; align-items: center; gap: 10px; font-size: 14px;">
                <span style="font-size: 20px;">💰</span>
                <strong>Lowest Cost:</strong> ${winners.lowest_cost}
            </div>
        `;
    }
    if (winners.highest_salary) {
        winnersHTML += `
            <div style="display: flex; align-items: center; gap: 10px; font-size: 14px;">
                <span style="font-size: 20px;">💵</span>
                <strong>Highest Starting Salary:</strong> ${winners.highest_salary}
            </div>
        `;
    }
    
    winnersHTML += `
                </div>
            </div>
        </div>
    `;
    
    // Add comparison charts section
    let chartsHTML = `
        <div class="card" style="margin-top: 24px;">
            <div class="card-header">
                <h3 class="card-title">Visual Comparison</h3>
            </div>
            <div class="card-body">
                <div class="chart-grid">
                    <div class="chart-card">
                        <div class="chart-title">ROI Comparison (5 Years)</div>
                        <div style="height: 300px;">
                            <canvas id="comparisonROIChart"></canvas>
                        </div>
                    </div>
                    <div class="chart-card">
                        <div class="chart-title">Payback Period (Years)</div>
                        <div style="height: 300px;">
                            <canvas id="comparisonPaybackChart"></canvas>
                        </div>
                    </div>
                </div>
                <div class="chart-grid" style="margin-top: 20px;">
                    <div class="chart-card">
                        <div class="chart-title">Starting Salary Comparison</div>
                        <div style="height: 300px;">
                            <canvas id="comparisonSalaryChart"></canvas>
                        </div>
                    </div>
                    <div class="chart-card">
                        <div class="chart-title">Total Cost vs 5-Year Earnings</div>
                        <div style="height: 300px;">
                            <canvas id="comparisonCostEarningsChart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add additional stats comparison if course_data exists
    let additionalStatsHTML = '';
    const hasAdditionalData = courses.some(c => c.course_data);
    
    if (hasAdditionalData) {
        additionalStatsHTML = `
        <div class="card" style="margin-top: 24px;">
            <div class="card-header">
                <h3 class="card-title">📊 Additional Statistics Comparison</h3>
            </div>
            <div class="card-body">
                <div class="chart-grid">
                    <div class="chart-card">
                        <div class="chart-title">Employment Rate (%)</div>
                        <div style="height: 300px;">
                            <canvas id="comparisonEmploymentChart"></canvas>
                        </div>
                    </div>
                    <div class="chart-card">
                        <div class="chart-title">Graduate Satisfaction (out of 5)</div>
                        <div style="height: 300px;">
                            <canvas id="comparisonSatisfactionChart"></canvas>
                        </div>
                    </div>
                </div>
                <div class="chart-grid" style="margin-top: 20px;">
                    <div class="chart-card">
                        <div class="chart-title">Job Security Rating</div>
                        <div style="height: 300px;">
                            <canvas id="comparisonJobSecurityChart"></canvas>
                        </div>
                    </div>
                    <div class="chart-card">
                        <div class="chart-title">Work-Life Balance Rating</div>
                        <div style="height: 300px;">
                            <canvas id="comparisonWorkLifeChart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }
    
    // Build comparison cards
    let cardsHTML = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-top: 24px;">';
    
    courses.forEach(course => {
        const isWinner = Object.values(winners).includes(course.course_name);
        const paybackBadgeClass = course.payback_years < 1.5 ? 'badge-success' : 
                                  course.payback_years < 2.5 ? 'badge-warning' : 'badge-warning';
        const roiBadgeClass = course.roi_5_years > 400 ? 'badge-success' : 
                             course.roi_5_years > 300 ? 'badge-info' : 'badge-warning';
        
        // Build additional stats section for each course card
        let courseAdditionalStats = '';
        if (course.course_data) {
            const cd = course.course_data;
            courseAdditionalStats = `
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--gray-200);">
                    <h5 style="font-size: 13px; font-weight: 600; color: var(--gray-700); margin-bottom: 12px;">📊 Career Metrics</h5>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--gray-600);">Employment:</span>
                            <strong>${cd.employment_rate}%</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--gray-600);">Job Security:</span>
                            <strong>${cd.job_security}/5</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--gray-600);">Satisfaction:</span>
                            <strong>${cd.graduate_satisfaction}/5</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--gray-600);">Work-Life:</span>
                            <strong>${cd.work_life_balance}/5</strong>
                        </div>
                    </div>
                    
                    ${cd.industry_growth_rate ? `
                        <div style="margin-top: 12px; padding: 10px; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 6px; border: 1px solid #a7f3d0;">
                            <div style="font-size: 11px; color: #065f46; font-weight: 600; margin-bottom: 4px;">📈 INDUSTRY GROWTH</div>
                            <div style="font-size: 13px; color: #047857; font-weight: 700;">${cd.industry_growth_rate}</div>
                        </div>
                    ` : ''}
                    
                    ${cd.avg_class_size ? `
                        <div style="margin-top: 8px; padding: 8px; background: var(--gray-50); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 12px; color: var(--gray-600);">👥 Class Size:</span>
                            <strong style="font-size: 12px;">${cd.avg_class_size} students</strong>
                        </div>
                    ` : ''}
                    
                    ${cd.internship_opportunities ? `
                        <div style="margin-top: 8px; padding: 8px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe;">
                            <div style="font-size: 11px; color: #1e40af; font-weight: 600; margin-bottom: 2px;">💼 Internships</div>
                            <div style="font-size: 11px; color: #1d4ed8;">${cd.internship_opportunities}</div>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--gray-100);">
                        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                            <span style="color: var(--gray-600);">Skills Demand:</span>
                            <strong style="color: var(--gray-900);">${cd.skills_demand}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px;">
                            <span style="color: var(--gray-600);">Remote Work:</span>
                            <strong style="color: var(--gray-900);">${cd.remote_work_availability}</strong>
                        </div>
                    </div>
                </div>
            `;
        }
        
        cardsHTML += `
            <div class="card" style="background: var(--white); ${isWinner ? 'border: 2px solid var(--success);' : ''}">
                <div class="card-body">
                    <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--gray-200);">
                        <h4 style="font-size: 17px; font-weight: 600; color: var(--gray-900); margin-bottom: 4px;">
                            ${course.course_name}
                            ${isWinner ? '<span class="badge badge-success" style="margin-left: 8px;">WINNER</span>' : ''}
                        </h4>
                        <p style="font-size: 14px; color: var(--gray-600);">${course.university}</p>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--gray-100);">
                            <span style="font-size: 13px; color: var(--gray-600); font-weight: 500;">Total Cost</span>
                            <span style="font-size: 15px; color: var(--gray-900); font-weight: 600; ${course.course_name === winners.lowest_cost ? 'color: var(--success);' : ''}">
                                €${course.total_cost.toLocaleString()}
                            </span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--gray-100);">
                            <span style="font-size: 13px; color: var(--gray-600); font-weight: 500;">Starting Salary</span>
                            <span style="font-size: 15px; color: var(--gray-900); font-weight: 600; ${course.course_name === winners.highest_salary ? 'color: var(--success);' : ''}">
                                €${course.starting_salary.toLocaleString()}
                            </span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--gray-100);">
                            <span style="font-size: 13px; color: var(--gray-600); font-weight: 500;">After 5 Years</span>
                            <span style="font-size: 15px; color: var(--gray-900); font-weight: 600;">
                                €${course.salary_after_5_years.toLocaleString()}
                            </span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--gray-100);">
                            <span style="font-size: 13px; color: var(--gray-600); font-weight: 500;">Payback Period</span>
                            <span style="font-size: 15px; color: var(--gray-900); font-weight: 600; ${course.course_name === winners.fastest_payback ? 'color: var(--success);' : ''}">
                                ${course.payback_years.toFixed(1)} years
                            </span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; padding: 10px 0;">
                            <span style="font-size: 13px; color: var(--gray-600); font-weight: 500;">5-Year ROI</span>
                            <span style="font-size: 15px; color: var(--gray-900); font-weight: 600; ${course.course_name === winners.best_roi ? 'color: var(--success);' : ''}">
                                ${course.roi_5_years}%
                            </span>
                        </div>
                    </div>
                    
                    <div class="badges" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--gray-200);">
                        <span class="badge ${paybackBadgeClass}">${course.analysis.payback_label}</span>
                        <span class="badge ${roiBadgeClass}">${course.analysis.roi_rating} ROI</span>
                    </div>
                    
                    ${courseAdditionalStats}
                </div>
            </div>
        `;
    });
    
    cardsHTML += '</div>';
    
    const comparisonResults = document.getElementById('comparisonResults');
    comparisonResults.innerHTML = winnersHTML + chartsHTML + additionalStatsHTML + cardsHTML;
    comparisonResults.style.display = 'block';
    
    // Create all charts after DOM is updated
    setTimeout(() => {
        createComparisonCharts(courses);
    }, 100);
    
    // Scroll to results
    comparisonResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Create comparison charts
function createComparisonCharts(courses) {
    const labels = courses.map(c => c.course_name.split(' - ')[0]);
    const colors = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed'];
    
    // ROI Comparison Chart
    const roiCanvas = document.getElementById('comparisonROIChart');
    if (roiCanvas) {
        new Chart(roiCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '5-Year ROI (%)',
                    data: courses.map(c => c.roi_5_years),
                    backgroundColor: colors.slice(0, courses.length),
                    borderRadius: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.parsed.y + '% ROI';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Payback Period Chart
    const paybackCanvas = document.getElementById('comparisonPaybackChart');
    if (paybackCanvas) {
        new Chart(paybackCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Payback Period (years)',
                    data: courses.map(c => c.payback_years),
                    backgroundColor: colors.slice(0, courses.length),
                    borderRadius: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.parsed.y.toFixed(1) + ' years';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value + 'y';
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Starting Salary Chart
    const salaryCanvas = document.getElementById('comparisonSalaryChart');
    if (salaryCanvas) {
        new Chart(salaryCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Starting Salary (€)',
                    data: courses.map(c => c.starting_salary),
                    backgroundColor: colors.slice(0, courses.length),
                    borderRadius: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return '€' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '€' + (value / 1000) + 'k';
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Cost vs Earnings Chart (Grouped Bar)
    const costEarningsCanvas = document.getElementById('comparisonCostEarningsChart');
    if (costEarningsCanvas) {
        new Chart(costEarningsCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Total Cost',
                        data: courses.map(c => c.total_cost),
                        backgroundColor: 'rgba(220, 53, 69, 0.7)',
                        borderRadius: 6,
                    },
                    {
                        label: '5-Year Earnings',
                        data: courses.map(c => c.annual_net_income * 5),
                        backgroundColor: 'rgba(5, 150, 105, 0.7)',
                        borderRadius: 6,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': €' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '€' + (value / 1000) + 'k';
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Additional stats charts (only if data exists)
    const hasAdditionalData = courses.some(c => c.course_data);
    
    if (hasAdditionalData) {
        // Employment Rate Chart
        const employmentCanvas = document.getElementById('comparisonEmploymentChart');
        if (employmentCanvas) {
            new Chart(employmentCanvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Employment Rate (%)',
                        data: courses.map(c => c.course_data ? c.course_data.employment_rate : 0),
                        backgroundColor: colors.slice(0, courses.length),
                        borderRadius: 8,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // Graduate Satisfaction Chart
        const satisfactionCanvas = document.getElementById('comparisonSatisfactionChart');
        if (satisfactionCanvas) {
            new Chart(satisfactionCanvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Graduate Satisfaction (out of 5)',
                        data: courses.map(c => c.course_data ? c.course_data.graduate_satisfaction : 0),
                        backgroundColor: colors.slice(0, courses.length),
                        borderRadius: 8,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 5,
                            ticks: {
                                callback: function(value) {
                                    return value + '/5';
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // Job Security Chart
        const jobSecurityCanvas = document.getElementById('comparisonJobSecurityChart');
        if (jobSecurityCanvas) {
            new Chart(jobSecurityCanvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Job Security (out of 5)',
                        data: courses.map(c => c.course_data ? c.course_data.job_security : 0),
                        backgroundColor: colors.slice(0, courses.length),
                        borderRadius: 8,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 5,
                            ticks: {
                                callback: function(value) {
                                    return value + '/5';
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // Work-Life Balance Chart
        const workLifeCanvas = document.getElementById('comparisonWorkLifeChart');
        if (workLifeCanvas) {
            new Chart(workLifeCanvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Work-Life Balance (out of 5)',
                        data: courses.map(c => c.course_data ? c.course_data.work_life_balance : 0),
                        backgroundColor: colors.slice(0, courses.length),
                        borderRadius: 8,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 5,
                            ticks: {
                                callback: function(value) {
                                    return value + '/5';
                                }
                            }
                        }
                    }
                }
            });
        }
    }
}
from flask import Flask, request, jsonify, send_file, redirect
import sys
import os
import re
import traceback
import json as json_module

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'logic'))

try:
    from roi_calculator import calculate_roi, get_available_courses
    from course_data import COURSE_DATA
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

app = Flask(__name__, static_folder='.')

SITE_URL = 'https://roicollege.ie'


def slugify_course(course_name):
    slug = course_name.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    return slug.strip('-')


def find_course_by_slug(slug):
    for name in COURSE_DATA.keys():
        if slugify_course(name) == slug:
            return name
    return None

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin', '')
    response.headers['Access-Control-Allow-Origin'] = origin or '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return '', 204

# ---------------------------------------------------------------------------
# Module-level cache  (computed once on first request, reused for all)
# ---------------------------------------------------------------------------

_cache = {
    'bulk_data': None,   # dict[course_name -> result dict]
    'avg_roi': None,
    'avg_payback': None,
}

COURSE_DATA_FIELDS = [
    'employment_rate', 'graduate_satisfaction', 'job_security',
    'work_life_balance', 'career_progression', 'top_employers',
    'typical_roles', 'skills_demand', 'remote_work_availability',
    'further_study_rate', 'international_opportunities',
    'industry_growth_rate', 'avg_class_size', 'internship_opportunities',
    'startup_salary_range',
]


def _build_cache():
    bulk = {}
    rois, paybacks = [], []

    for name in COURSE_DATA.keys():
        try:
            result = calculate_roi(name)
            result = analyze_course(result)

            cd = COURSE_DATA[name]
            result['course_data'] = {k: cd.get(k) for k in COURSE_DATA_FIELDS}

            rois.append(result['roi_5_years'])
            paybacks.append(result['payback_years'])
            bulk[name] = result
        except Exception as e:
            print(f"Warning: could not cache {name}: {e}")

    avg_roi = sum(rois) / len(rois) if rois else 0
    avg_payback = sum(paybacks) / len(paybacks) if paybacks else 0

    for result in bulk.values():
        _attach_comparison(result, avg_roi, avg_payback)

    _cache['bulk_data'] = bulk
    _cache['avg_roi'] = avg_roi
    _cache['avg_payback'] = avg_payback


def get_cache():
    if _cache['bulk_data'] is None:
        _build_cache()
    return _cache


def _attach_comparison(result, avg_roi, avg_payback):
    roi_diff = ((result['roi_5_years'] - avg_roi) / avg_roi * 100) if avg_roi else 0
    payback_diff = ((avg_payback - result['payback_years']) / avg_payback * 100) if avg_payback else 0

    roi_status = 'above' if roi_diff > 20 else ('below' if roi_diff < -20 else 'average')
    roi_emoji = '📈' if roi_status == 'above' else ('📉' if roi_status == 'below' else '📊')

    payback_status = 'faster' if payback_diff > 15 else ('slower' if payback_diff < -15 else 'average')
    payback_emoji = '⚡' if payback_status == 'faster' else ('⏱️' if payback_status == 'slower' else '📊')

    result['comparison'] = {
        'roi_diff': round(abs(roi_diff), 0),
        'roi_status': roi_status,
        'roi_emoji': roi_emoji,
        'payback_diff': round(abs(payback_diff), 0),
        'payback_status': payback_status,
        'payback_emoji': payback_emoji,
        'avg_roi': round(avg_roi, 1),
        'avg_payback': round(avg_payback, 1),
    }

# ---------------------------------------------------------------------------
# Analysis helpers (unchanged logic, same as before)
# ---------------------------------------------------------------------------

def analyze_course(result):
    payback = result['payback_years']
    if payback < 1.5:
        payback_label, payback_emoji, payback_description = 'Fast payback', '🟢', "You'll recover your investment quickly"
    elif payback < 2.5:
        payback_label, payback_emoji, payback_description = 'Medium payback', '🟡', 'Reasonable time to recover investment'
    else:
        payback_label, payback_emoji, payback_description = 'Slow payback', '🔴', 'Takes longer to recover investment'

    roi = result['roi_5_years']
    if roi > 400:
        roi_rating, roi_stars, roi_emoji = 'Excellent', 5, '⭐⭐⭐⭐⭐'
    elif roi > 300:
        roi_rating, roi_stars, roi_emoji = 'Very Good', 4, '⭐⭐⭐⭐'
    elif roi > 200:
        roi_rating, roi_stars, roi_emoji = 'Good', 3, '⭐⭐⭐'
    else:
        roi_rating, roi_stars, roi_emoji = 'Fair', 2, '⭐⭐'

    course_type = result['course_name'].split(' - ')[0]
    if roi > 400 and payback < 1.5:
        recommendation = 'One of the best investments in Irish education. Fast payback and excellent returns.'
    elif course_type == 'Medicine':
        recommendation = 'Longer course (6 years) but strong career prospects. High lifetime earnings potential.'
    elif payback < 1.2:
        recommendation = 'Fastest payback in our analysis. You\'ll recover your investment quickly.'
    elif roi > 500:
        recommendation = 'Outstanding ROI. High demand field with strong salary growth.'
    elif payback > 2:
        recommendation = 'Slower to recover investment, but still provides positive returns over time.'
    else:
        recommendation = f'Solid choice with {payback_label.lower()} and {roi_rating.lower()} ROI.'

    # National wage comparison (CSO Earnings & Labour Costs, 2025)
    NATIONAL_MEDIAN_WAGE = 38000   # median annual earnings, all employees
    NATIONAL_AVERAGE_WAGE = 52600  # mean annual earnings, all employees

    start_vs_median_pct = (result['starting_salary'] / NATIONAL_MEDIAN_WAGE - 1) * 100
    after5_vs_average_pct = (result['salary_after_5_years'] / NATIONAL_AVERAGE_WAGE - 1) * 100

    result['analysis'] = {
        'payback_label': payback_label,
        'payback_emoji': payback_emoji,
        'payback_description': payback_description,
        'roi_rating': roi_rating,
        'roi_stars': roi_stars,
        'roi_emoji': roi_emoji,
        'recommendation': recommendation,
        'national_comparison': {
            'median_wage': NATIONAL_MEDIAN_WAGE,
            'average_wage': NATIONAL_AVERAGE_WAGE,
            'start_vs_median_pct': round(start_vs_median_pct, 0),
            'after5_vs_average_pct': round(after5_vs_average_pct, 0),
        },
    }
    return result


def suggest_alternative(result, bulk):
    try:
        current_course = result['course_name']
        course_field = current_course.split(' - ')[0]
        current_roi = result['roi_5_years']
        current_cost = result['total_cost']

        similar = [
            v for k, v in bulk.items()
            if course_field in k and k != current_course
        ][:3]

        suggestions = []
        for s in similar:
            if s['roi_5_years'] > current_roi * 1.1:
                suggestions.append({
                    'course': s['course_name'],
                    'reason': f"has {s['roi_5_years'] - current_roi:.0f}% higher ROI",
                    'priority': 'high',
                    'emoji': '🎯',
                })
            elif s['total_cost'] < current_cost * 0.9 and s['roi_5_years'] > current_roi * 0.95:
                cost_saving = current_cost - s['total_cost']
                suggestions.append({
                    'course': s['course_name'],
                    'reason': f"costs €{cost_saving:,.0f} less with similar ROI",
                    'priority': 'medium',
                    'emoji': '💰',
                })

        if not suggestions:
            result['suggestion'] = {
                'has_suggestion': False,
                'text': 'This is already one of the top options in this field.',
                'emoji': '✅',
            }
        else:
            best = suggestions[0]
            result['suggestion'] = {
                'has_suggestion': True,
                'text': f"Consider '{best['course']}' — it {best['reason']}",
                'emoji': best['emoji'],
            }
    except Exception as e:
        print(f"Warning: could not generate suggestion: {e}")
        result['suggestion'] = None
    return result

# ---------------------------------------------------------------------------
# Routes — static files
# ---------------------------------------------------------------------------

@app.route('/')
def home():
    try:
        return send_file('index.html')
    except FileNotFoundError:
        return jsonify({'error': 'index.html not found'}), 404

@app.route('/calculator')
def calculator_page():
    return home()

@app.route('/quiz', strict_slashes=False)
def quiz_page():
    try:
        return send_file('quiz.html')
    except FileNotFoundError:
        return jsonify({'error': 'quiz.html not found'}), 404

@app.route('/style.css')
def serve_css():
    try:
        return send_file('style.css', mimetype='text/css')
    except FileNotFoundError:
        return jsonify({'error': 'style.css not found'}), 404

@app.route('/script.js')
def serve_js():
    try:
        return send_file('script.js', mimetype='application/javascript')
    except FileNotFoundError:
        return jsonify({'error': 'script.js not found'}), 404

@app.route('/favicon.svg')
def favicon_svg():
    try:
        return send_file('favicon.svg', mimetype='image/svg+xml')
    except FileNotFoundError:
        return jsonify({'error': 'favicon.svg not found'}), 404


@app.route('/favicon.ico')
def favicon_ico():
    try:
        return send_file('favicon.svg', mimetype='image/svg+xml')
    except FileNotFoundError:
        return jsonify({'error': 'favicon.svg not found'}), 404


@app.route('/og-image.png')
def og_image():
    try:
        return send_file('og-image.png', mimetype='image/png')
    except FileNotFoundError:
        return jsonify({'error': 'og-image.png not found'}), 404


@app.route('/robots.txt')
def robots():
    return (
        'User-agent: *\nAllow: /\nSitemap: https://roicollege.ie/sitemap.xml',
        200,
        {'Content-Type': 'text/plain'},
    )


@app.route('/sitemap.xml')
def sitemap():
    from datetime import date
    today = date.today().isoformat()

    static_pages = [
        ('/', '1.0', 'weekly'),
        ('/quiz', '0.9', 'monthly'),
        ('/blog', '0.9', 'weekly'),
        ('/all-courses', '0.8', 'monthly'),
    ]

    def url_entry(loc, priority, changefreq, lastmod=today):
        return (
            f'  <url>\n'
            f'    <loc>{loc}</loc>\n'
            f'    <lastmod>{lastmod}</lastmod>\n'
            f'    <changefreq>{changefreq}</changefreq>\n'
            f'    <priority>{priority}</priority>\n'
            f'  </url>\n'
        )

    urls = ''.join(url_entry(f'{SITE_URL}{path}', priority, changefreq)
                   for path, priority, changefreq in static_pages)

    blog_dir = os.path.join(os.path.dirname(__file__), 'blog')
    for filename in sorted(os.listdir(blog_dir)):
        if filename.endswith('.html') and filename != 'index.html':
            slug = filename[:-len('.html')]
            urls += url_entry(f'{SITE_URL}/blog/{slug}', '0.8', 'monthly')

    for name in COURSE_DATA.keys():
        urls += url_entry(f'{SITE_URL}/course/{slugify_course(name)}', '0.7', 'monthly')

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{urls}</urlset>"""

    return xml, 200, {'Content-Type': 'application/xml'}

@app.route('/blog', strict_slashes=False)
def blog_index():
    try:
        return send_file('blog/index.html')
    except FileNotFoundError:
        return 'Blog not found', 404

@app.route('/blog/<post_slug>', strict_slashes=False)
def blog_post(post_slug):
    try:
        return send_file(f'blog/{post_slug}.html')
    except FileNotFoundError:
        return 'Post not found', 404

# ---------------------------------------------------------------------------
# Routes — API
# ---------------------------------------------------------------------------

@app.route('/api')
def api_status():
    return jsonify({
        'status': 'online',
        'message': 'Irish College ROI Calculator API',
        'version': '2.0.0',
        'endpoints': {
            '/': 'Calculator web interface',
            '/api': 'API status',
            '/courses': 'List all course names',
            '/courses-bulk': 'All courses with pre-calculated data (fast)',
            '/calculate': 'Calculate ROI for a specific course (GET ?course=NAME)',
            '/compare-multiple': 'Compare multiple courses (POST JSON)',
        },
        'total_courses': len(COURSE_DATA),
    })


@app.route('/courses')
def courses():
    try:
        course_list = get_available_courses()
        return jsonify({
            'success': True,
            'total_courses': len(course_list),
            'courses': sorted(course_list),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/courses-bulk')
def courses_bulk():
    """Return all pre-calculated course data in a single request."""
    try:
        cache = get_cache()
        return jsonify({
            'success': True,
            'total_courses': len(cache['bulk_data']),
            'courses': list(cache['bulk_data'].values()),
            'avg_roi': cache['avg_roi'],
            'avg_payback': cache['avg_payback'],
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/calculate')
def calculate():
    course_name = request.args.get('course')
    if not course_name:
        return jsonify({
            'success': False,
            'error': "Missing 'course' parameter. Usage: /calculate?course=COURSE_NAME",
        }), 400

    custom_tuition = request.args.get('tuition', type=float)
    custom_years = request.args.get('years', type=int)

    try:
        result = calculate_roi(
            course_name=course_name,
            tuition_per_year=custom_tuition,
            course_length=custom_years,
        )
        result = analyze_course(result)

        cache = get_cache()
        _attach_comparison(result, cache['avg_roi'], cache['avg_payback'])
        result = suggest_alternative(result, cache['bulk_data'])

        if course_name in COURSE_DATA:
            cd = COURSE_DATA[course_name]
            result['course_data'] = {k: cd.get(k) for k in COURSE_DATA_FIELDS}

        return jsonify({'success': True, 'data': result})

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Calculation failed: {str(e)}'}), 500


@app.route('/compare-multiple', methods=['POST', 'OPTIONS'])
def compare_multiple():
    if request.method == 'OPTIONS':
        return '', 204

    try:
        data = request.get_json()
        if not data or 'courses' not in data:
            return jsonify({'success': False, 'error': "Missing 'courses' in request body"}), 400

        course_list = data['courses']
        if not isinstance(course_list, list):
            return jsonify({'success': False, 'error': "'courses' must be an array"}), 400
        if len(course_list) < 2:
            return jsonify({'success': False, 'error': 'Provide at least 2 courses to compare'}), 400
        if len(course_list) > 5:
            return jsonify({'success': False, 'error': 'Maximum 5 courses can be compared'}), 400

        cache = get_cache()
        results, errors = [], []

        for name in course_list:
            try:
                result = calculate_roi(name)
                result = analyze_course(result)
                _attach_comparison(result, cache['avg_roi'], cache['avg_payback'])
                if name in COURSE_DATA:
                    cd = COURSE_DATA[name]
                    result['course_data'] = {k: cd.get(k) for k in [
                        'employment_rate', 'graduate_satisfaction', 'job_security',
                        'work_life_balance', 'industry_growth_rate', 'avg_class_size',
                        'internship_opportunities', 'skills_demand', 'remote_work_availability',
                    ]}
                results.append(result)
            except ValueError as e:
                errors.append({'course': name, 'error': str(e)})
            except Exception as e:
                errors.append({'course': name, 'error': f'Failed to calculate: {str(e)}'})

        if not results:
            return jsonify({'success': False, 'error': 'No valid courses found', 'errors': errors}), 400

        winners = {}
        if len(results) >= 2:
            winners = {
                'best_roi': max(results, key=lambda x: x['roi_5_years'])['course_name'],
                'fastest_payback': min(results, key=lambda x: x['payback_years'])['course_name'],
                'lowest_cost': min(results, key=lambda x: x['total_cost'])['course_name'],
                'highest_salary': max(results, key=lambda x: x['starting_salary'])['course_name'],
            }

        response = {
            'success': True,
            'total_compared': len(results),
            'courses': results,
            'winners': winners,
        }
        if errors:
            response['errors'] = errors
        return jsonify(response)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Comparison failed: {str(e)}'}), 500

# ---------------------------------------------------------------------------
# SEO pages — shared head / header / breadcrumb helpers
# ---------------------------------------------------------------------------

# Shared <style> rules for server-rendered content pages (course pages,
# all-courses index). Mirrors the classes used in blog/*.html so these pages
# look like a native part of the site without duplicating style.css.
PAGE_STYLES = """    <style>
        .blog-header-link {
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: var(--radius-sm);
            font-size: 13px;
            font-weight: 500;
            color: var(--muted);
            text-decoration: none;
            transition: color 0.15s, background 0.15s;
        }
        .blog-header-link:hover { color: var(--text); background: var(--bg); }
        .blog-header-link.active { color: var(--blue); font-weight: 600; background: var(--blue-bg); }

        .post-wrap { max-width: 760px; margin: 0 auto; padding: 32px 16px 80px; }

        .post-back {
            display: inline-flex; align-items: center; gap: 6px;
            color: var(--muted); text-decoration: none; font-size: 13px;
            font-weight: 500; margin-bottom: 4px; transition: color 0.15s;
        }
        .post-back:hover { color: var(--blue); }

        .post-hero { margin-bottom: 32px; }

        .post-tag {
            display: inline-flex; align-items: center; gap: 5px;
            background: var(--blue-bg); color: var(--blue); font-size: 11px;
            font-weight: 600; padding: 4px 10px; border-radius: 100px;
            text-transform: uppercase; letter-spacing: 0.05em;
            margin-bottom: 14px; border: 1px solid var(--blue-border);
        }

        .post-title {
            font-size: 28px; font-weight: 700; color: var(--text);
            letter-spacing: -0.025em; line-height: 1.3; margin-bottom: 8px;
        }

        .post-sub { font-size: 15px; color: var(--muted); }

        .post-body { font-size: 16px; color: var(--text); line-height: 1.8; margin-top: 24px; }
        .post-body p { margin-bottom: 18px; color: #334155; }
        .post-body h2 {
            font-size: 18px; font-weight: 700; color: var(--text);
            letter-spacing: -0.015em; margin: 32px 0 12px;
        }
        .post-body strong { color: var(--text); font-weight: 600; }
        .post-body ul { margin: 0 0 18px 20px; color: #334155; }
        .post-body li { margin-bottom: 6px; }

        .stat-row {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 12px; margin: 24px 0;
        }
        .stat-box {
            background: var(--surface); border: 1px solid var(--border);
            border-radius: var(--radius); padding: 18px 16px;
            text-align: center; box-shadow: var(--shadow);
        }
        .stat-box-value {
            font-size: 22px; font-weight: 700; color: var(--blue);
            letter-spacing: -0.03em; display: block; line-height: 1; margin-bottom: 6px;
        }
        .stat-box-label { font-size: 12px; color: var(--muted); display: block; }

        .post-callout {
            background: var(--blue-bg); border: 1px solid var(--blue-border);
            border-left: 3px solid var(--blue); border-radius: var(--radius);
            padding: 16px 20px; margin: 24px 0; font-size: 15px;
            color: var(--text); line-height: 1.6;
        }

        .post-cta {
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
            border: 1px solid var(--blue-border); border-radius: var(--radius);
            padding: 28px 24px; margin: 36px 0 28px;
        }
        .post-cta-title { font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
        .post-cta p { font-size: 14px; color: var(--muted); margin-bottom: 18px !important; }
        .post-cta-btn {
            display: inline-flex; align-items: center; gap: 7px;
            background: var(--blue); color: white; padding: 11px 20px;
            border-radius: var(--radius-sm); text-decoration: none;
            font-size: 14px; font-weight: 600; transition: background 0.15s;
            border: none; cursor: pointer;
        }
        .post-cta-btn:hover { background: var(--blue-hover); }

        .post-footer-nav {
            display: flex; align-items: center; justify-content: space-between;
            gap: 16px; padding-top: 24px; border-top: 1px solid var(--border); flex-wrap: wrap;
        }

        .course-list { columns: 2; column-gap: 32px; list-style: none; padding: 0; margin: 0; }
        .course-list li { break-inside: avoid; margin-bottom: 6px; }
        .course-list a {
            display: block; padding: 8px 10px; border-radius: var(--radius-sm);
            color: var(--text); text-decoration: none; font-size: 14px; transition: background 0.15s;
        }
        .course-list a:hover { background: var(--bg); color: var(--blue); }
        .course-list .course-uni { color: var(--muted); font-size: 12px; }

        @media (max-width: 600px) {
            .stat-row { grid-template-columns: repeat(3, 1fr); gap: 8px; }
            .stat-box { padding: 14px 8px; }
            .stat-box-value { font-size: 18px; }
            .course-list { columns: 1; }
        }
    </style>"""


def render_head(title, description, path, og_type='website', extra_head=''):
    """Build the <head> contents shared by server-rendered pages."""
    url = f'{SITE_URL}{path}'
    return f"""    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <meta name="description" content="{description}">
    <link rel="canonical" href="{url}">
    <link rel="alternate" hreflang="en-ie" href="{url}">
    <link rel="alternate" hreflang="x-default" href="{url}">
    <meta name="google-site-verification" content="REPLACE_WITH_YOUR_VERIFICATION_CODE">
    <meta property="og:type" content="{og_type}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:url" content="{url}">
    <meta property="og:image" content="{SITE_URL}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title}">
    <meta name="twitter:description" content="{description}">
    <meta name="twitter:image" content="{SITE_URL}/og-image.png">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
{extra_head}{PAGE_STYLES}"""


def render_header(active=''):
    def cls(name):
        return 'blog-header-link active' if name == active else 'blog-header-link'

    return f"""<header class="header">
    <div class="header-inner">
      <a class="logo" href="/">
        <svg class="logo-cap" viewBox="0 0 40 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M20 4L2 13l18 9 18-9-18-9z" fill="#2563eb"/>
          <path d="M8 17.5v7c0 2.5 5.4 4.5 12 4.5s12-2 12-4.5v-7L20 22l-12-4.5z" fill="#2563eb" opacity="0.75"/>
          <rect x="35" y="13" width="2.5" height="9" rx="1.25" fill="#2563eb"/>
          <circle cx="36.25" cy="23" r="2" fill="#2563eb"/>
        </svg>
        <div>
          <div class="logo-name">CollegeROI Ireland</div>
          <div class="logo-sub">Course investment calculator</div>
        </div>
      </a>
      <div style="display:flex;align-items:center;gap:4px;">
        <a href="/" class="{cls('calculator')}">Calculator</a>
        <a href="/all-courses" class="{cls('courses')}">Browse</a>
        <a href="/blog" class="{cls('blog')}">Blog</a>
      </div>
    </div>
  </header>"""


def render_breadcrumb(items):
    """items: list of (label, path_or_None). The last item with path=None is the current page."""
    crumb_html = []
    schema_items = []
    for i, (label, path) in enumerate(items, start=1):
        if path:
            crumb_html.append(f'<a href="{path}">{label}</a>')
            schema_items.append(
                f'{{"@type":"ListItem","position":{i},"name":"{label}","item":"{SITE_URL}{path}"}}'
            )
        else:
            crumb_html.append(f'<span class="crumb-current">{label}</span>')
            schema_items.append(f'{{"@type":"ListItem","position":{i},"name":"{label}"}}')

    html = '<nav class="breadcrumb" aria-label="Breadcrumb">' + \
        '<span class="crumb-sep">/</span>'.join(crumb_html) + '</nav>'

    schema = (
        '<script type="application/ld+json">\n'
        '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":['
        + ','.join(schema_items) +
        ']}\n</script>'
    )
    return html, schema


# ---------------------------------------------------------------------------
# SEO pages — routes
# ---------------------------------------------------------------------------

@app.route('/course/<course_slug>', strict_slashes=False)
def course_page(course_slug):
    course_name = find_course_by_slug(course_slug)
    if not course_name:
        return 'Course not found', 404

    result = calculate_roi(course_name)
    result = analyze_course(result)
    cd = COURSE_DATA.get(course_name, {})

    course_title, school_code = course_name.rsplit(' - ', 1)
    university = cd.get('university', school_code)
    safe_name = json_module.dumps(course_name)

    title = f"{course_title} ({school_code}) ROI &amp; Salary | CollegeROI"
    description = (
        f"Is {course_title} at {university} worth it? Starting salary "
        f"€{result['starting_salary']:,}, 5-year ROI {result['roi_5_years']}%, "
        f"payback in {result['payback_years']} years. Free Irish college ROI calculator."
    )

    breadcrumb_html, breadcrumb_schema = render_breadcrumb([
        ('Home', '/'),
        ('Browse Courses', '/all-courses'),
        (f'{course_title} ({school_code})', None),
    ])

    course_schema = f"""<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Course",
  "name": {json_module.dumps(course_title)},
  "description": {json_module.dumps(description)},
  "provider": {{
    "@type": "CollegeOrUniversity",
    "name": {json_module.dumps(university)}
  }},
  "url": "{SITE_URL}/course/{course_slug}"
}}
</script>"""

    top_employers = cd.get('top_employers') or []
    typical_roles = cd.get('typical_roles') or []
    employment_rate = cd.get('employment_rate')
    career_progression = cd.get('career_progression')
    skills_demand = cd.get('skills_demand')
    cao_points = result.get('cao_points')
    cao_code = result.get('cao_code')

    extra_paragraphs = ''
    if employment_rate or career_progression or skills_demand:
        bits = []
        if employment_rate:
            bits.append(f"a graduate employment rate of around {employment_rate}%")
        if career_progression:
            bits.append(f"{career_progression.lower()} career progression")
        if skills_demand:
            bits.append(f"{skills_demand.lower()} demand for these skills in Ireland")
        extra_paragraphs += f"<p>{course_title} graduates from {university} report {', '.join(bits)}.</p>\n"

    if typical_roles:
        roles_li = ''.join(f'<li>{role}</li>' for role in typical_roles[:6])
        extra_paragraphs += f"<h2>Typical roles after graduating</h2>\n<ul>{roles_li}</ul>\n"

    if top_employers:
        extra_paragraphs += f"<p><strong>Common employers</strong> for {course_title} graduates include {', '.join(top_employers[:5])}.</p>\n"

    cao_line = ''
    if cao_points:
        cao_line = f"<p>The most recent CAO points requirement for this course"
        if cao_code:
            cao_line += f" ({cao_code})"
        cao_line += f" was <strong>{cao_points}</strong> ({result.get('cao_points_year', '')}).</p>\n"

    nat = result['analysis']['national_comparison']
    national_paragraph = (
        f"<p>By comparison, the median annual wage across all Irish employees is "
        f"€{nat['median_wage']:,}, and the average (mean) wage is €{nat['average_wage']:,}. "
        f"{course_title} graduates from {university} start "
        f"{'above' if nat['start_vs_median_pct'] >= 0 else 'below'} the national median, "
        f"and after 5 years earn roughly {abs(nat['after5_vs_average_pct']):.0f}% "
        f"{'more' if nat['after5_vs_average_pct'] >= 0 else 'less'} than the national average.</p>"
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
{render_head(title, description, f'/course/{course_slug}', og_type='article')}
{course_schema}
{breadcrumb_schema}
</head>
<body>
  {render_header('courses')}

  <div class="post-wrap">
    {breadcrumb_html}

    <div class="post-hero">
      <div class="post-tag">{university}</div>
      <h1 class="post-title">{course_title}</h1>
      <div class="post-sub">{university} &middot; {result['course_length']}-year course</div>
    </div>

    <div class="post-body">
      <div class="stat-row">
        <div class="stat-box">
          <span class="stat-box-value">&euro;{result['starting_salary']:,}</span>
          <span class="stat-box-label">Starting salary</span>
        </div>
        <div class="stat-box">
          <span class="stat-box-value">{result['roi_5_years']}%</span>
          <span class="stat-box-label">5-year ROI</span>
        </div>
        <div class="stat-box">
          <span class="stat-box-value">{result['payback_years']}y</span>
          <span class="stat-box-label">Payback period</span>
        </div>
      </div>

      <p>Based on a total estimated cost of <strong>&euro;{result['total_cost']:,.0f}</strong> over
      {result['course_length']} years, {course_title} at {university} has a 5-year ROI of
      <strong>{result['roi_5_years']}%</strong>, with graduates earning around
      <strong>&euro;{result['salary_after_5_years']:,.0f}</strong> after 5 years in the workforce.</p>

      {cao_line}
      {extra_paragraphs}

      <div class="post-callout">{result['analysis']['recommendation']}</div>

      {national_paragraph}

      <div class="post-cta">
        <div class="post-cta-title">See the full breakdown</div>
        <p>Open {course_title} ({school_code}) in the ROI calculator for the full salary, cost and comparison breakdown.</p>
        <button class="post-cta-btn" onclick='localStorage.setItem("roi_calc_last_course", {safe_name}); window.location.href="/";'>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Open the ROI Calculator
        </button>
      </div>

      <div class="post-footer-nav">
        <a href="/all-courses" class="post-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          All courses
        </a>
        <a href="/blog" class="post-back" style="margin-bottom:0;">Read our blog &rarr;</a>
      </div>
    </div>
  </div>
</body>
</html>"""
    return html


@app.route('/all-courses', strict_slashes=False)
def courses_index():
    items = ''
    for name in COURSE_DATA.keys():
        course_title, school_code = name.rsplit(' - ', 1)
        university = COURSE_DATA[name].get('university', school_code)
        items += (
            f'<li><a href="/course/{slugify_course(name)}">{course_title} ({school_code})'
            f'<br><span class="course-uni">{university}</span></a></li>\n'
        )

    title = "All Irish College Courses: ROI, Salary &amp; Payback | CollegeROI"
    description = (
        "Browse ROI, starting salary, 5-year salary and payback period for 70+ Irish "
        "university courses across UCD, Trinity, DCU, UCC, Galway, UL, Maynooth and more."
    )

    breadcrumb_html, breadcrumb_schema = render_breadcrumb([
        ('Home', '/'),
        ('Browse Courses', None),
    ])

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
{render_head(title, description, '/all-courses')}
{breadcrumb_schema}
</head>
<body>
  {render_header('courses')}

  <div class="post-wrap">
    {breadcrumb_html}

    <div class="post-hero">
      <div class="post-tag">{len(COURSE_DATA)}+ courses</div>
      <h1 class="post-title">All Irish College Courses</h1>
      <div class="post-sub">ROI, salary and payback data for every course in the calculator</div>
    </div>

    <div class="post-body">
      <p>Click any course below for its ROI, starting salary and payback details, or
      use the <a href="/">full calculator</a> to compare courses side by side.</p>

      <ul class="course-list">{items}</ul>

      <div class="post-footer-nav">
        <a href="/" class="post-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to calculator
        </a>
        <a href="/blog" class="post-back" style="margin-bottom:0;">Read our blog &rarr;</a>
      </div>
    </div>
  </div>
</body>
</html>"""
    return html


@app.route('/search')
def course_search():
    query = (request.args.get('q') or '').strip().lower()
    if not query:
        return redirect('/')

    for name in COURSE_DATA.keys():
        if query in name.lower():
            return redirect(f'/course/{slugify_course(name)}')

    return redirect('/all-courses')

# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found',
        'available_endpoints': ['/', '/api', '/courses', '/courses-bulk', '/calculate', '/compare-multiple'],
    }), 404

@app.errorhandler(500)
def server_error(e):
    traceback.print_exc()
    return jsonify({'success': False, 'error': 'Internal server error'}), 500

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    print('=' * 70)
    print('Irish College ROI Calculator — v2.0')
    print('=' * 70)
    print(f'\nLoaded {len(COURSE_DATA)} courses')
    print('Building course cache...')
    get_cache()
    print('Cache ready.')
    print('\nServer: http://127.0.0.1:5000')
    print('=' * 70)

    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, port=port, host='0.0.0.0')

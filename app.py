from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import sys
import os
import traceback

# Import logic modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'logic'))

try:
    from roi_calculator import calculate_roi, get_available_courses
    from course_data import COURSE_DATA
except ImportError as e:
    print(f"❌ Error importing modules: {e}")
    print("Make sure roi_calculator.py and course_data.py are in the logic/ folder")
    sys.exit(1)

app = Flask(__name__, static_folder='.')

# IMPROVED CORS Configuration
CORS(app, 
     resources={
         r"/*": {
             "origins": ["http://localhost:*", "http://127.0.0.1:*"],
             "methods": ["GET", "POST", "OPTIONS"],
             "allow_headers": ["Content-Type"],
             "expose_headers": ["Content-Type"],
             "supports_credentials": False
         }
     })

# Additional CORS headers for all responses
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    if origin:
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS,PUT,DELETE'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

# Handle OPTIONS requests for CORS preflight
@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return '', 204

def analyze_course(result):
    """Add smart analysis to course results"""
    
    # 1. Payback Speed Analysis
    payback = result['payback_years']
    if payback < 1.5:
        payback_label = "Fast payback"
        payback_emoji = "🟢"
        payback_description = "You'll recover your investment quickly"
    elif payback < 2.5:
        payback_label = "Medium payback"
        payback_emoji = "🟡"
        payback_description = "Reasonable time to recover investment"
    else:
        payback_label = "Slow payback"
        payback_emoji = "🔴"
        payback_description = "Takes longer to recover investment"
    
    # 2. ROI Rating
    roi = result['roi_5_years']
    if roi > 400:
        roi_rating = "Excellent"
        roi_stars = 5
        roi_emoji = "⭐⭐⭐⭐⭐"
    elif roi > 300:
        roi_rating = "Very Good"
        roi_stars = 4
        roi_emoji = "⭐⭐⭐⭐"
    elif roi > 200:
        roi_rating = "Good"
        roi_stars = 3
        roi_emoji = "⭐⭐⭐"
    else:
        roi_rating = "Fair"
        roi_stars = 2
        roi_emoji = "⭐⭐"
    
    # 3. Smart Recommendation
    course_type = result['course_name'].split(' - ')[0]
    
    if roi > 400 and payback < 1.5:
        recommendation = f"One of the best investments in Irish education. Fast payback and excellent returns."
    elif course_type == "Medicine":
        recommendation = f"Longer course (6 years) but strong career prospects. High lifetime earnings potential."
    elif payback < 1.2:
        recommendation = f"Fastest payback in our analysis. You'll recover your investment quickly."
    elif roi > 500:
        recommendation = f"Outstanding ROI. High demand field with strong salary growth."
    elif payback > 2:
        recommendation = f"Slower to recover investment, but still provides positive returns over time."
    else:
        recommendation = f"Solid choice with {payback_label.lower()} and {roi_rating.lower()} ROI."
    
    # 4. Lifetime Value (30 year career)
    career_years = 30
    year_5_salary = result['salary_after_5_years']
    lifetime_earnings = 0
    
    # First 5 years (linear growth)
    lifetime_earnings += (result['starting_salary'] + year_5_salary) / 2 * 5
    
    # Years 6-30 (3% annual growth)
    for year in range(6, career_years + 1):
        lifetime_earnings += year_5_salary * (1.03 ** (year - 5))
    
    lifetime_profit = lifetime_earnings - result['total_cost']
    lifetime_roi = (lifetime_profit / result['total_cost']) * 100
    times_earned_back = lifetime_earnings / result['total_cost']
    
    # Add analysis to result
    result['analysis'] = {
        'payback_label': payback_label,
        'payback_emoji': payback_emoji,
        'payback_description': payback_description,
        'roi_rating': roi_rating,
        'roi_stars': roi_stars,
        'roi_emoji': roi_emoji,
        'recommendation': recommendation,
        'lifetime': {
            'total_earnings': round(lifetime_earnings, 0),
            'profit': round(lifetime_profit, 0),
            'roi': round(lifetime_roi, 0),
            'times_earned_back': round(times_earned_back, 1)
        }
    }
    
    return result

def add_comparison_context(result):
    """Compare this course to averages across all courses"""
    
    try:
        all_courses = get_available_courses()
        all_rois = []
        all_paybacks = []
        
        for course in all_courses:
            data = calculate_roi(course)
            all_rois.append(data['roi_5_years'])
            all_paybacks.append(data['payback_years'])
        
        avg_roi = sum(all_rois) / len(all_rois)
        avg_payback = sum(all_paybacks) / len(all_paybacks)
        
        # Calculate differences
        roi_diff = ((result['roi_5_years'] - avg_roi) / avg_roi) * 100
        payback_diff = ((avg_payback - result['payback_years']) / avg_payback) * 100
        
        # Determine if this course is above/below average
        if roi_diff > 20:
            roi_status = "above"
            roi_emoji = "📈"
        elif roi_diff < -20:
            roi_status = "below"
            roi_emoji = "📉"
        else:
            roi_status = "average"
            roi_emoji = "📊"
        
        if payback_diff > 15:
            payback_status = "faster"
            payback_emoji = "⚡"
        elif payback_diff < -15:
            payback_status = "slower"
            payback_emoji = "⏱️"
        else:
            payback_status = "average"
            payback_emoji = "📊"
        
        result['comparison'] = {
            'roi_diff': round(abs(roi_diff), 0),
            'roi_status': roi_status,
            'roi_emoji': roi_emoji,
            'payback_diff': round(abs(payback_diff), 0),
            'payback_status': payback_status,
            'payback_emoji': payback_emoji,
            'avg_roi': round(avg_roi, 1),
            'avg_payback': round(avg_payback, 1)
        }
    except Exception as e:
        print(f"Warning: Could not add comparison context: {e}")
        result['comparison'] = None
    
    return result

def suggest_alternative(result):
    """Suggest better alternatives if they exist"""
    
    try:
        current_course = result['course_name']
        course_field = current_course.split(' - ')[0]
        current_roi = result['roi_5_years']
        current_cost = result['total_cost']
        
        # Find similar courses (same field, different university)
        all_courses = get_available_courses()
        similar_courses = [c for c in all_courses if course_field in c and c != current_course]
        
        suggestions = []
        
        for similar in similar_courses[:3]:  # Limit to 3 suggestions
            similar_data = calculate_roi(similar)
            
            # Is it significantly better ROI?
            if similar_data['roi_5_years'] > current_roi * 1.1:
                suggestions.append({
                    'course': similar,
                    'reason': f"has {similar_data['roi_5_years'] - current_roi:.0f}% higher ROI",
                    'priority': 'high',
                    'emoji': '🎯'
                })
            
            # Is it significantly cheaper with similar ROI?
            elif similar_data['total_cost'] < current_cost * 0.9 and similar_data['roi_5_years'] > current_roi * 0.95:
                cost_saving = current_cost - similar_data['total_cost']
                suggestions.append({
                    'course': similar,
                    'reason': f"costs €{cost_saving:,.0f} less with similar ROI",
                    'priority': 'medium',
                    'emoji': '💰'
                })
        
        # Create suggestion message
        if not suggestions:
            result['suggestion'] = {
                'has_suggestion': False,
                'text': "This is already one of the top options in this field.",
                'emoji': '✅'
            }
        else:
            best = suggestions[0]
            result['suggestion'] = {
                'has_suggestion': True,
                'text': f"Consider '{best['course']}' - it {best['reason']}",
                'emoji': best['emoji']
            }
    except Exception as e:
        print(f"Warning: Could not generate suggestions: {e}")
        result['suggestion'] = None
    
    return result

# ==================== ROUTES ====================

@app.route('/')
def home():
    return jsonify({
        "status": "online",
        "message": "Irish College ROI Calculator API",
        "version": "1.0.0",
        "endpoints": {
            "/": "API status and documentation",
            "/courses": "List all available courses",
            "/calculate": "Calculate ROI for a specific course (GET with ?course=NAME)",
            "/compare-multiple": "Compare multiple courses (POST with JSON)",
            "/calculator": "Open the web calculator interface"
        },
        "total_courses": len(COURSE_DATA)
    })

@app.route('/calculator')
def calculator_page():
    """Serve the HTML calculator page"""
    try:
        return send_file('index.html')
    except FileNotFoundError:
        return jsonify({
            "error": "Calculator page not found. Make sure index.html is in the same directory as app.py"
        }), 404
    except Exception as e:
        return jsonify({"error": f"Could not load calculator page: {str(e)}"}), 500

@app.route('/quiz')
def quiz_page():
    """Serve the quiz page"""
    try:
        return send_file('quiz.html')
    except FileNotFoundError:
        return jsonify({
            "error": "Quiz page not found. Make sure quiz.html is in the same directory as app.py"
        }), 404
    except Exception as e:
        return jsonify({"error": f"Could not load quiz page: {str(e)}"}), 500

@app.route('/style.css')
def serve_css():
    """Serve the CSS file"""
    try:
        return send_file('style.css', mimetype='text/css')
    except FileNotFoundError:
        return jsonify({"error": "CSS file not found"}), 404

@app.route('/script.js')
def serve_js():
    """Serve the JavaScript file"""
    try:
        return send_file('script.js', mimetype='application/javascript')
    except FileNotFoundError:
        return jsonify({"error": "JavaScript file not found"}), 404

@app.route('/courses')
def courses():
    """List all available courses"""
    try:
        course_list = get_available_courses()
        return jsonify({
            "success": True,
            "total_courses": len(course_list),
            "courses": sorted(course_list)
        })
    except Exception as e:
        print(f"Error in /courses: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"Failed to load courses: {str(e)}"
        }), 500

@app.route('/calculate')
def calculate():
    """Calculate ROI for a single course"""
    course_name = request.args.get('course')
    
    if not course_name:
        return jsonify({
            "success": False,
            "error": "Missing 'course' parameter. Usage: /calculate?course=COURSE_NAME"
        }), 400
    
    custom_tuition = request.args.get('tuition', type=float)
    custom_years = request.args.get('years', type=int)
    
    try:
        result = calculate_roi(
            course_name=course_name,
            tuition_per_year=custom_tuition,
            course_length=custom_years
        )
        
        # Add all analysis features
        result = analyze_course(result)
        result = add_comparison_context(result)
        result = suggest_alternative(result)
        
        # Add the raw course data for additional fields
        if course_name in COURSE_DATA:
            course_data = COURSE_DATA[course_name]
            result['course_data'] = {
                'employment_rate': course_data.get('employment_rate'),
                'graduate_satisfaction': course_data.get('graduate_satisfaction'),
                'job_security': course_data.get('job_security'),
                'work_life_balance': course_data.get('work_life_balance'),
                'career_progression': course_data.get('career_progression'),
                'top_employers': course_data.get('top_employers'),
                'typical_roles': course_data.get('typical_roles'),
                'skills_demand': course_data.get('skills_demand'),
                'remote_work_availability': course_data.get('remote_work_availability'),
                'further_study_rate': course_data.get('further_study_rate'),
                'international_opportunities': course_data.get('international_opportunities'),
                'industry_growth_rate': course_data.get('industry_growth_rate'),
                'avg_class_size': course_data.get('avg_class_size'),
                'internship_opportunities': course_data.get('internship_opportunities'),
                'startup_salary_range': course_data.get('startup_salary_range')
            }
        
        return jsonify({
            "success": True,
            "data": result
        })
    except ValueError as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 404
    except Exception as e:
        print(f"Error in /calculate: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"Calculation failed: {str(e)}"
        }), 500

@app.route('/compare-multiple', methods=['POST', 'OPTIONS'])
def compare_multiple():
    """Compare multiple courses - expects JSON body with course names"""
    
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.get_json()
        
        if not data or 'courses' not in data:
            return jsonify({
                "success": False,
                "error": "Missing 'courses' in request body. Send JSON: {\"courses\": [\"Course 1\", \"Course 2\"]}"
            }), 400
        
        course_list = data['courses']
        
        if not isinstance(course_list, list):
            return jsonify({
                "success": False,
                "error": "'courses' must be an array"
            }), 400
        
        if len(course_list) < 2:
            return jsonify({
                "success": False,
                "error": "Please provide at least 2 courses to compare"
            }), 400
        
        if len(course_list) > 5:
            return jsonify({
                "success": False,
                "error": "Maximum 5 courses can be compared at once"
            }), 400
        
        results = []
        errors = []
        
        for course_name in course_list:
            try:
                result = calculate_roi(course_name)
                result = analyze_course(result)
                result = add_comparison_context(result)
                
                # Add course data
                if course_name in COURSE_DATA:
                    course_data = COURSE_DATA[course_name]
                    result['course_data'] = {
                        'employment_rate': course_data.get('employment_rate'),
                        'graduate_satisfaction': course_data.get('graduate_satisfaction'),
                        'job_security': course_data.get('job_security'),
                        'work_life_balance': course_data.get('work_life_balance'),
                        'industry_growth_rate': course_data.get('industry_growth_rate'),
                        'avg_class_size': course_data.get('avg_class_size'),
                        'internship_opportunities': course_data.get('internship_opportunities')
                    }
                
                results.append(result)
            except ValueError as e:
                errors.append({
                    "course": course_name,
                    "error": str(e)
                })
            except Exception as e:
                errors.append({
                    "course": course_name,
                    "error": f"Failed to calculate: {str(e)}"
                })
        
        if not results:
            return jsonify({
                "success": False,
                "error": "No valid courses found",
                "errors": errors
            }), 400
        
        # Determine winners for each category
        if len(results) >= 2:
            best_roi = max(results, key=lambda x: x['roi_5_years'])
            fastest_payback = min(results, key=lambda x: x['payback_years'])
            lowest_cost = min(results, key=lambda x: x['total_cost'])
            highest_salary = max(results, key=lambda x: x['starting_salary'])
            
            winners = {
                'best_roi': best_roi['course_name'],
                'fastest_payback': fastest_payback['course_name'],
                'lowest_cost': lowest_cost['course_name'],
                'highest_salary': highest_salary['course_name']
            }
        else:
            winners = {}
        
        response = {
            "success": True,
            "total_compared": len(results),
            "courses": results,
            "winners": winners
        }
        
        if errors:
            response["errors"] = errors
        
        return jsonify(response)
    
    except Exception as e:
        print(f"Error in /compare-multiple: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"Comparison failed: {str(e)}"
        }), 500

# Global error handlers
@app.errorhandler(404)
def not_found(e):
    return jsonify({
        "success": False,
        "error": "Endpoint not found",
        "available_endpoints": ["/", "/courses", "/calculate", "/compare-multiple", "/calculator"]
    }), 404

@app.errorhandler(500)
def server_error(e):
    print(f"Server error: {e}")
    traceback.print_exc()
    return jsonify({
        "success": False,
        "error": "Internal server error. Check server logs for details."
    }), 500

@app.errorhandler(Exception)
def handle_exception(e):
    print(f"Unhandled exception: {e}")
    traceback.print_exc()
    return jsonify({
        "success": False,
        "error": str(e)
    }), 500

if __name__ == '__main__':
    print("=" * 70)
    print("🚀 Irish College ROI Calculator API")
    print("=" * 70)
    print(f"\n✅ Loaded {len(COURSE_DATA)} courses from database")
    print("\nServer starting at: http://127.0.0.1:5000")
    print("\n📱 Available endpoints:")
    print("  - http://127.0.0.1:5000/")
    print("  - http://127.0.0.1:5000/calculator  <- OPEN THIS FOR WEB INTERFACE")
    print("  - http://127.0.0.1:5000/courses")
    print("  - http://127.0.0.1:5000/calculate?course=Computer Science - UCD")
    print("  - http://127.0.0.1:5000/compare-multiple (POST)")
    print("\n" + "=" * 70)
    
    app.run(debug=True, port=5000, host='0.0.0.0')
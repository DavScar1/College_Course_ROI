# test_calculator.py
# Automated tests for ROI calculator

from roi_calculator import calculate_roi, compare_courses, get_available_courses
from course_data import COURSE_DATA

def test_basic_calculation():
    """Test that basic calculation returns expected structure"""
    result = calculate_roi("Computer Science - UCD")
    
    # Check all expected keys exist
    expected_keys = [
        "course_name", "university", "total_cost", "starting_salary",
        "annual_net_income", "salary_after_5_years", "payback_years",
        "roi_5_years", "lifetime_roi", "course_length", "tuition_per_year"
    ]
    
    for key in expected_keys:
        assert key in result, f"Missing key: {key}"
    
    # Check types
    assert isinstance(result["total_cost"], float)
    assert isinstance(result["starting_salary"], int)
    assert isinstance(result["payback_years"], float)
    assert isinstance(result["roi_5_years"], float)
    
    # Check reasonable values
    assert result["total_cost"] > 0, "Total cost should be positive"
    assert result["starting_salary"] > 20000, "Starting salary seems too low"
    assert result["payback_years"] > 0, "Payback period should be positive"
    assert result["payback_years"] < 20, "Payback period seems unreasonably high"
    
    print("✓ Basic calculation test passed")


def test_all_courses():
    """Test that all courses in COURSE_DATA can be calculated"""
    courses = get_available_courses()
    
    for course in courses:
        try:
            result = calculate_roi(course)
            assert result["course_name"] == course
            assert result["roi_5_years"] is not None
        except Exception as e:
            print(f"✗ Failed for {course}: {e}")
            raise
    
    print(f"✓ All {len(courses)} courses calculate successfully")


def test_custom_tuition():
    """Test that custom tuition values work correctly"""
    course = "Engineering - TCD"
    
    # Default tuition
    result1 = calculate_roi(course)
    default_cost = result1["total_cost"]
    
    # Custom tuition (double the default)
    custom_tuition = result1["tuition_per_year"] * 2
    result2 = calculate_roi(course, tuition_per_year=custom_tuition)
    
    assert result2["total_cost"] == default_cost * 2, "Custom tuition not applied correctly"
    assert result2["payback_years"] > result1["payback_years"], "Higher cost should increase payback"
    
    print("✓ Custom tuition test passed")


def test_comparison():
    """Test course comparison functionality"""
    courses = [
        "Computer Science - UCD",
        "Engineering - UCD",
        "Business/Commerce - UCD"
    ]
    
    results = compare_courses(courses)
    
    assert len(results) == 3, "Should return 3 results"
    
    # Check that results are sorted by ROI (descending)
    for i in range(len(results) - 1):
        assert results[i]["roi_5_years"] >= results[i+1]["roi_5_years"], \
            "Results not sorted by ROI"
    
    print("✓ Comparison test passed")


def test_payback_logic():
    """Test that payback calculation is logical"""
    for course_name in get_available_courses():
        result = calculate_roi(course_name)
        
        # Payback should equal: total_cost / net_annual_income
        expected_payback = result["total_cost"] / result["annual_net_income"]
        actual_payback = result["payback_years"]
        
        # Allow small rounding difference
        assert abs(expected_payback - actual_payback) < 0.1, \
            f"{course_name}: Payback calculation mismatch"
    
    print("✓ Payback logic test passed")


def test_medicine_course_length():
    """Test that medicine courses have correct 6-year length"""
    medicine_courses = [c for c in get_available_courses() if "Medicine" in c]
    
    for course in medicine_courses:
        result = calculate_roi(course)
        assert result["course_length"] == 6, \
            f"{course} should be 6 years, got {result['course_length']}"
    
    print("✓ Medicine course length test passed")


def test_roi_reasonableness():
    """Test that ROI values are reasonable"""
    for course_name in get_available_courses():
        result = calculate_roi(course_name)
        
        # ROI should be positive (education is worth it!)
        assert result["roi_5_years"] > 0, \
            f"{course_name} has negative ROI: {result['roi_5_years']}%"
        
        # ROI should be under 1000% (sanity check)
        assert result["roi_5_years"] < 1000, \
            f"{course_name} has unrealistic ROI: {result['roi_5_years']}%"
        
        # Payback should be under 10 years for most courses
        if result["payback_years"] > 10:
            print(f"  ⚠ Warning: {course_name} has {result['payback_years']}y payback")
    
    print("✓ ROI reasonableness test passed")


def test_error_handling():
    """Test that invalid inputs raise appropriate errors"""
    try:
        calculate_roi("Fake Course Name")
        assert False, "Should have raised ValueError for invalid course"
    except ValueError as e:
        assert "not found" in str(e)
    
    print("✓ Error handling test passed")


def run_all_tests():
    """Run all tests"""
    print("=" * 70)
    print("RUNNING AUTOMATED TESTS")
    print("=" * 70)
    print()
    
    test_basic_calculation()
    test_all_courses()
    test_custom_tuition()
    test_comparison()
    test_payback_logic()
    test_medicine_course_length()
    test_roi_reasonableness()
    test_error_handling()
    
    print()
    print("=" * 70)
    print("✅ ALL TESTS PASSED!")
    print("=" * 70)


if __name__ == "__main__":
    run_all_tests()
#!/usr/bin/env python3
"""
CallGuard API Backend Testing Suite
Tests all API endpoints for the call blocking application
"""

import requests
import json
import sys
from datetime import datetime
import time

# Backend URL from frontend/.env
BASE_URL = "https://stoppubbysi-staging.preview.emergentagent.com/api"

class CallGuardAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.test_results = []
        self.created_ids = {
            'categories': [],
            'spam_numbers': [],
            'call_history': []
        }
    
    def log_test(self, test_name, success, message, response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        self.test_results.append({
            'test': test_name,
            'success': success,
            'message': message,
            'response_data': response_data
        })
    
    def test_health_check(self):
        """Test GET /api/health"""
        try:
            response = self.session.get(f"{self.base_url}/health", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if 'status' in data and data['status'] == 'healthy':
                    self.log_test("Health Check", True, f"API is healthy - {data}")
                else:
                    self.log_test("Health Check", False, f"Unexpected response format: {data}")
            else:
                self.log_test("Health Check", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Health Check", False, f"Connection error: {str(e)}")
    
    def test_get_categories(self):
        """Test GET /api/categories - should return 11 default categories"""
        try:
            response = self.session.get(f"{self.base_url}/categories", timeout=10)
            if response.status_code == 200:
                categories = response.json()
                if len(categories) >= 11:
                    # Check for expected default categories
                    category_ids = [cat.get('id') for cat in categories]
                    expected_ids = ['commercial', 'energy', 'insurance', 'telecom', 'realestate', 
                                  'banking', 'survey', 'scam', 'cpf', 'renovation', 'other']
                    
                    missing_ids = [cid for cid in expected_ids if cid not in category_ids]
                    if not missing_ids:
                        self.log_test("Get Categories", True, f"Found {len(categories)} categories including all defaults")
                    else:
                        self.log_test("Get Categories", False, f"Missing default categories: {missing_ids}")
                else:
                    self.log_test("Get Categories", False, f"Expected 11+ categories, got {len(categories)}")
            else:
                self.log_test("Get Categories", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Categories", False, f"Error: {str(e)}")
    
    def test_create_category(self):
        """Test POST /api/categories"""
        try:
            category_data = {
                "name": "Test Category",
                "description": "Test description for automated testing",
                "color": "#FF0000"
            }
            response = self.session.post(f"{self.base_url}/categories", 
                                       json=category_data, timeout=10)
            if response.status_code == 200:
                created_category = response.json()
                if 'id' in created_category and created_category['name'] == category_data['name']:
                    self.created_ids['categories'].append(created_category['id'])
                    self.log_test("Create Category", True, f"Created category: {created_category['name']}")
                else:
                    self.log_test("Create Category", False, f"Invalid response format: {created_category}")
            else:
                self.log_test("Create Category", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Create Category", False, f"Error: {str(e)}")
    
    def test_get_spam_numbers(self):
        """Test GET /api/spam-numbers - should return 20+ default numbers"""
        try:
            response = self.session.get(f"{self.base_url}/spam-numbers", timeout=10)
            if response.status_code == 200:
                spam_numbers = response.json()
                if len(spam_numbers) >= 20:
                    self.log_test("Get Spam Numbers", True, f"Found {len(spam_numbers)} spam numbers")
                else:
                    self.log_test("Get Spam Numbers", False, f"Expected 20+ spam numbers, got {len(spam_numbers)}")
            else:
                self.log_test("Get Spam Numbers", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Spam Numbers", False, f"Error: {str(e)}")
    
    def test_filter_spam_numbers_by_category(self):
        """Test GET /api/spam-numbers?category_id=cpf"""
        try:
            response = self.session.get(f"{self.base_url}/spam-numbers?category_id=cpf", timeout=10)
            if response.status_code == 200:
                cpf_numbers = response.json()
                # Should have CPF numbers like +33949000000
                cpf_found = any(num.get('phone_number') == '+33949000000' for num in cpf_numbers)
                if cpf_found:
                    self.log_test("Filter Spam Numbers (CPF)", True, f"Found {len(cpf_numbers)} CPF spam numbers")
                else:
                    self.log_test("Filter Spam Numbers (CPF)", False, f"Expected CPF number +33949000000 not found")
            else:
                self.log_test("Filter Spam Numbers (CPF)", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Filter Spam Numbers (CPF)", False, f"Error: {str(e)}")
    
    def test_add_spam_number(self):
        """Test POST /api/spam-numbers"""
        try:
            spam_data = {
                "phone_number": "+33600000000",
                "category_id": "commercial",
                "description": "Test spam number for automated testing"
            }
            response = self.session.post(f"{self.base_url}/spam-numbers", 
                                       json=spam_data, timeout=10)
            if response.status_code == 200:
                created_spam = response.json()
                if 'id' in created_spam and created_spam['phone_number'] == spam_data['phone_number']:
                    self.created_ids['spam_numbers'].append(created_spam['id'])
                    self.log_test("Add Spam Number", True, f"Added spam number: {created_spam['phone_number']}")
                else:
                    self.log_test("Add Spam Number", False, f"Invalid response format: {created_spam}")
            else:
                self.log_test("Add Spam Number", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Add Spam Number", False, f"Error: {str(e)}")
    
    def test_check_number(self):
        """Test GET /api/check-number/{phone} with known spam number"""
        try:
            # Test with known CPF spam number
            test_number = "+33949000000"
            response = self.session.get(f"{self.base_url}/check-number/{test_number}", timeout=10)
            if response.status_code == 200:
                check_result = response.json()
                if check_result.get('is_spam') == True:
                    self.log_test("Check Number (Spam)", True, f"Correctly identified {test_number} as spam")
                else:
                    self.log_test("Check Number (Spam)", False, f"Failed to identify known spam number: {check_result}")
            else:
                self.log_test("Check Number (Spam)", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Check Number (Spam)", False, f"Error: {str(e)}")
    
    def test_get_call_history(self):
        """Test GET /api/call-history"""
        try:
            response = self.session.get(f"{self.base_url}/call-history", timeout=10)
            if response.status_code == 200:
                history = response.json()
                self.log_test("Get Call History", True, f"Retrieved {len(history)} call history entries")
            else:
                self.log_test("Get Call History", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Call History", False, f"Error: {str(e)}")
    
    def test_log_blocked_call(self):
        """Test POST /api/call-history"""
        try:
            call_data = {
                "phone_number": "+33777777777",
                "category_id": "scam",
                "notes": "Test blocked call for automated testing"
            }
            response = self.session.post(f"{self.base_url}/call-history", 
                                       json=call_data, timeout=10)
            if response.status_code == 200:
                logged_call = response.json()
                if 'id' in logged_call and logged_call['phone_number'] == call_data['phone_number']:
                    self.created_ids['call_history'].append(logged_call['id'])
                    self.log_test("Log Blocked Call", True, f"Logged call from: {logged_call['phone_number']}")
                else:
                    self.log_test("Log Blocked Call", False, f"Invalid response format: {logged_call}")
            else:
                self.log_test("Log Blocked Call", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Log Blocked Call", False, f"Error: {str(e)}")
    
    def test_get_settings(self):
        """Test GET /api/settings"""
        try:
            response = self.session.get(f"{self.base_url}/settings", timeout=10)
            if response.status_code == 200:
                settings = response.json()
                expected_keys = ['block_unknown_numbers', 'notifications_enabled', 'auto_block_spam']
                if all(key in settings for key in expected_keys):
                    self.log_test("Get Settings", True, f"Retrieved settings: {settings}")
                else:
                    self.log_test("Get Settings", False, f"Missing expected settings keys: {settings}")
            else:
                self.log_test("Get Settings", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Settings", False, f"Error: {str(e)}")
    
    def test_update_settings(self):
        """Test PUT /api/settings"""
        try:
            settings_data = {
                "block_unknown_numbers": True
            }
            response = self.session.put(f"{self.base_url}/settings", 
                                      json=settings_data, timeout=10)
            if response.status_code == 200:
                updated_settings = response.json()
                if updated_settings.get('block_unknown_numbers') == True:
                    self.log_test("Update Settings", True, f"Updated settings successfully")
                else:
                    self.log_test("Update Settings", False, f"Settings not updated correctly: {updated_settings}")
            else:
                self.log_test("Update Settings", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Update Settings", False, f"Error: {str(e)}")
    
    def test_get_statistics(self):
        """Test GET /api/statistics"""
        try:
            response = self.session.get(f"{self.base_url}/statistics", timeout=10)
            if response.status_code == 200:
                stats = response.json()
                expected_keys = ['total_blocked_today', 'total_blocked_week', 'total_blocked_month', 
                               'total_blocked_all', 'total_spam_numbers', 'top_categories']
                if all(key in stats for key in expected_keys):
                    self.log_test("Get Statistics", True, f"Statistics: {stats}")
                else:
                    self.log_test("Get Statistics", False, f"Missing expected statistics keys: {stats}")
            else:
                self.log_test("Get Statistics", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Statistics", False, f"Error: {str(e)}")
    
    def test_sync_database(self):
        """Test POST /api/sync-database"""
        try:
            response = self.session.post(f"{self.base_url}/sync-database", timeout=15)
            if response.status_code == 200:
                sync_result = response.json()
                if 'message' in sync_result and 'new_numbers_added' in sync_result:
                    self.log_test("Sync Database", True, f"Sync completed: {sync_result}")
                else:
                    self.log_test("Sync Database", False, f"Invalid sync response: {sync_result}")
            else:
                self.log_test("Sync Database", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Sync Database", False, f"Error: {str(e)}")
    
    def test_delete_operations(self):
        """Test DELETE operations for cleanup"""
        # Delete created spam number
        if self.created_ids['spam_numbers']:
            try:
                spam_id = self.created_ids['spam_numbers'][0]
                response = self.session.delete(f"{self.base_url}/spam-numbers/{spam_id}", timeout=10)
                if response.status_code == 200:
                    self.log_test("Delete Spam Number", True, f"Deleted spam number {spam_id}")
                else:
                    self.log_test("Delete Spam Number", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test("Delete Spam Number", False, f"Error: {str(e)}")
        
        # Delete created call history
        if self.created_ids['call_history']:
            try:
                call_id = self.created_ids['call_history'][0]
                response = self.session.delete(f"{self.base_url}/call-history/{call_id}", timeout=10)
                if response.status_code == 200:
                    self.log_test("Delete Call History", True, f"Deleted call history {call_id}")
                else:
                    self.log_test("Delete Call History", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test("Delete Call History", False, f"Error: {str(e)}")
    
    def run_all_tests(self):
        """Run all API tests"""
        print(f"🚀 Starting CallGuard API Tests")
        print(f"📡 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Core functionality tests
        self.test_health_check()
        self.test_get_categories()
        self.test_create_category()
        self.test_get_spam_numbers()
        self.test_filter_spam_numbers_by_category()
        self.test_add_spam_number()
        self.test_check_number()
        self.test_get_call_history()
        self.test_log_blocked_call()
        self.test_get_settings()
        self.test_update_settings()
        self.test_get_statistics()
        self.test_sync_database()
        
        # Cleanup tests
        self.test_delete_operations()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result['success'])
        total = len(self.test_results)
        
        print(f"✅ Passed: {passed}/{total}")
        print(f"❌ Failed: {total - passed}/{total}")
        
        if total - passed > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"   ❌ {result['test']}: {result['message']}")
        
        return passed == total

if __name__ == "__main__":
    tester = CallGuardAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)
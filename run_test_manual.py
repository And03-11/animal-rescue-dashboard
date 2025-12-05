import sys
import os

# Redirect stdout/stderr to file
sys.stdout = open('test_output_utf8.txt', 'w', encoding='utf-8')
sys.stderr = sys.stdout

# Add root to path
sys.path.insert(0, os.getcwd())

try:
    # We need to make sure 'backend' is treated as a package if needed, 
    # but since we are at root, 'backend.tests' works if backend has __init__.py
    # or we can import from file path.
    # Let's try standard import.
    from backend.tests import test_search
    print("Imported test_search successfully")
    
    # Run the test function
    # I need to mock dependencies manually since pytest fixtures won't run
    from app.main import app
    from app.api.v1.endpoints.search import get_data_service, get_mailchimp_service, get_brevo_service
    
    class DummyDataService:
        def get_donor_by_email(self, email: str):
            return {"donor": None, "donations": []}

    class DummyMailchimpService:
        def get_contact_tags(self, email: str):
            return []

    class DummyBrevoService:
        def get_contact_details(self, email: str):
            return None
            
    app.dependency_overrides[get_data_service] = lambda: DummyDataService()
    app.dependency_overrides[get_mailchimp_service] = lambda: DummyMailchimpService()
    app.dependency_overrides[get_brevo_service] = lambda: DummyBrevoService()
    
    print("Running test_search_not_found_returns_404...")
    test_search.test_search_not_found_returns_404()
    print("test_search_not_found_returns_404 passed")
    
    print("Running test_search_found_on_mailchimp_and_brevo...")
    test_search.test_search_found_on_mailchimp_and_brevo()
    print("test_search_found_on_mailchimp_and_brevo passed")
    
except Exception as e:
    print(f"Test failed: {e}")
    import traceback
    traceback.print_exc()

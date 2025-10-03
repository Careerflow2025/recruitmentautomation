#!/usr/bin/env python3
"""
Test login directly with Supabase Auth API
"""

import requests
import json

# Supabase credentials
SUPABASE_URL = "https://lfoapqybmhxctqdqxxoa.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmb2FwcXlibWh4Y3RxZHF4eG9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyODQ1MDIsImV4cCI6MjA3NDg2MDUwMn0.TOVqF_SqyXNzEPOhdey9E3kTHM8m2tOnQ2HwVmbUXX0"

def test_login(email, password):
    """Test login with given credentials"""

    headers = {
        "apikey": ANON_KEY,
        "Content-Type": "application/json"
    }

    print(f"[INFO] Testing login for {email}")

    # Try to login
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers=headers,
        json={
            "email": email,
            "password": password
        }
    )

    print(f"[DEBUG] Status Code: {response.status_code}")
    print(f"[DEBUG] Response: {response.text}")

    if response.status_code == 200:
        data = response.json()
        print("[SUCCESS] Login successful!")
        print(f"Access Token: {data.get('access_token', 'N/A')[:50]}...")
        print(f"User ID: {data.get('user', {}).get('id', 'N/A')}")
        return True
    else:
        print(f"[ERROR] Login failed: {response.text}")
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("Testing Supabase Auth Login")
    print("=" * 50)

    # Test with the password we just set
    test_login("admin@test.com", "Test123456!")
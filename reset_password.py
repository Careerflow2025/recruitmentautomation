#!/usr/bin/env python3
"""
Reset password for a user in Supabase
"""

import requests
import json

# Supabase credentials from .env.local
SUPABASE_URL = "https://lfoapqybmhxctqdqxxoa.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmb2FwcXlibWh4Y3RxZHF4eG9hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTI4NDUwMiwiZXhwIjoyMDc0ODYwNTAyfQ.ZUjowbmJqIkc0peFhtO73F7CYQnnaxdsHfbrGP4IN0o"

def reset_password(email, new_password):
    """Reset password for a user by email"""

    # Headers for API requests
    headers = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }

    print(f"[INFO] Resetting password for {email}")

    # First, get the user ID by email
    response = requests.get(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=headers
    )

    if response.status_code != 200:
        print(f"[ERROR] Failed to fetch users: {response.text}")
        return

    data = response.json()

    # Handle different response formats
    if isinstance(data, dict):
        users = data.get('users', [])
    elif isinstance(data, list):
        users = data
    else:
        print(f"[ERROR] Unexpected response format: {type(data)}")
        return

    # Find the user with the matching email
    target_user = None
    for user in users:
        if isinstance(user, dict) and user.get('email') == email:
            target_user = user
            break

    if not target_user:
        print(f"[ERROR] User with email {email} not found")
        return

    user_id = target_user.get('id')
    print(f"[INFO] Found user ID: {user_id}")

    # Update the user's password
    update_response = requests.put(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers=headers,
        json={
            "password": new_password
        }
    )

    if update_response.status_code == 200:
        print(f"[SUCCESS] Password reset for {email}")
        print(f"New password: {new_password}")
        print("\n✅ You can now login with:")
        print(f"   Email: {email}")
        print(f"   Password: {new_password}")
    else:
        print(f"[ERROR] Failed to reset password: {update_response.text}")

if __name__ == "__main__":
    # Reset password for admin@test.com
    reset_password("admin@test.com", "Test123456!")
#!/usr/bin/env python3
"""
Fix authentication issue by setting email_confirmed_at for all users
"""

import requests
import json
from datetime import datetime

# Supabase credentials from .env.local
SUPABASE_URL = "https://lfoapqybmhxctqdqxxoa.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmb2FwcXlibWh4Y3RxZHF4eG9hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTI4NDUwMiwiZXhwIjoyMDc0ODYwNTAyfQ.ZUjowbmJqIkc0peFhtO73F7CYQnnaxdsHfbrGP4IN0o"

def fix_email_confirmation():
    """List all users and fix their email confirmation status"""

    # Headers for API requests
    headers = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }

    print("[SEARCH] Fetching all users...")

    # List all users
    response = requests.get(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=headers
    )

    if response.status_code != 200:
        print(f"[ERROR] Failed to fetch users: {response.text}")
        return

    data = response.json()
    print(f"[DEBUG] Response type: {type(data)}")

    # Handle different response formats
    if isinstance(data, dict):
        users = data.get('users', [])
    elif isinstance(data, list):
        users = data
    else:
        users = []

    # Debug first item
    if users and len(users) > 0:
        print(f"[DEBUG] First item type: {type(users[0])}")
        if isinstance(users[0], dict):
            print(f"[DEBUG] Keys: {users[0].keys()}")

    print(f"[SUCCESS] Found {len(users)} users")

    fixed_count = 0
    already_confirmed = 0
    errors = 0

    # Fix each user
    for user in users:
        # Handle if user is a dict
        if isinstance(user, dict):
            email = user.get('email', 'unknown')
            user_id = user.get('id')
            email_confirmed = user.get('email_confirmed_at')
        else:
            # Skip if not a dict
            print(f"[WARNING] Unexpected user format: {user}")
            continue

        if not email_confirmed:
            print(f"[FIXING] Fixing user: {email}")

            # Update user to set email_confirmed_at
            update_response = requests.put(
                f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers=headers,
                json={
                    "email_confirmed_at": datetime.utcnow().isoformat() + "Z"
                }
            )

            if update_response.status_code == 200:
                print(f"[FIXED] Fixed {email}")
                fixed_count += 1
            else:
                print(f"[ERROR] Failed to fix {email}: {update_response.text}")
                errors += 1
        else:
            print(f"[OK] {email} already confirmed")
            already_confirmed += 1

    print("\n" + "=" * 50)
    print("Summary:")
    print(f"  Fixed: {fixed_count} users")
    print(f"  Already confirmed: {already_confirmed} users")
    if errors > 0:
        print(f"  Errors: {errors}")
    print("=" * 50)
    print("\nAuthentication fix complete! You should now be able to log in.")

if __name__ == "__main__":
    fix_email_confirmation()
# --- Archivo: backend/app/db/inspect_users.py ---
import sqlite3

conn = sqlite3.connect("backend/app/app.db")
cursor = conn.cursor()

print("📋 Usuarios registrados:")
try:
    cursor.execute("SELECT id, email, hashed_password FROM users;")
    rows = cursor.fetchall()
    if not rows:
        print("❌ No hay usuarios.")
    for row in rows:
        print(f"🧑 ID: {row[0]} | Email: {row[1]}\n🔐 Hash: {row[2]}\n")
except Exception as e:
    print("⚠️ Error:", e)

conn.close()

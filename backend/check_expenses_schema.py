from utils.db import get_db

conn = get_db()
with conn.cursor() as cursor:
    cursor.execute("DESCRIBE expenses")
    cols = cursor.fetchall()
    print("Expenses columns:")
    for c in cols:
        print(f" - {c['Field']}: {c['Type']} (Null: {c['Null']}, Default: {c['Default']})")
conn.close()

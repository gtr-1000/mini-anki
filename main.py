
import csv
import io
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, jsonify, render_template, request, Response

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "mini_anki.db"


def now_utc():
    return datetime.now(timezone.utc)


def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL,
                translation TEXT NOT NULL,
                example TEXT NOT NULL DEFAULT '',
                interval_days INTEGER NOT NULL DEFAULT 0,
                due_at TEXT,
                created_at TEXT
            )
        """)

        columns = {
            row["name"]
            for row in db.execute("PRAGMA table_info(cards)").fetchall()
        }

        migrations = {
            "interval_days":
                "ALTER TABLE cards ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 0",
            "due_at":
                "ALTER TABLE cards ADD COLUMN due_at TEXT",
            "created_at":
                "ALTER TABLE cards ADD COLUMN created_at TEXT",
        }

        for column, sql in migrations.items():
            if column not in columns:
                db.execute(sql)

        db.execute("""
            UPDATE cards
            SET created_at = ?
            WHERE created_at IS NULL
        """, (now_utc().isoformat(),))


def serialize_card(row):
    return dict(row)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/cards", methods=["GET"])
def list_cards():
    due_only = request.args.get("due") == "1"
    now = now_utc().isoformat()

    query = """
        SELECT id, word, translation, example,
               interval_days, due_at, created_at
        FROM cards
    """

    if due_only:
        query += " WHERE due_at IS NULL OR due_at <= ?"
        params = (now,)
    else:
        params = ()

    query += " ORDER BY id"

    with get_db() as db:
        rows = db.execute(query, params).fetchall()

    return jsonify([serialize_card(row) for row in rows])


@app.route("/api/cards", methods=["POST"])
def create_card():
    data = request.get_json(silent=True) or {}

    word = str(data.get("word", "")).strip()
    translation = str(data.get("translation", "")).strip()
    example = str(data.get("example", "")).strip()

    if not word or not translation:
        return jsonify({
            "error": "Palavra e tradução são obrigatórias."
        }), 400

    with get_db() as db:
        cursor = db.execute("""
            INSERT INTO cards
                (word, translation, example, interval_days, due_at, created_at)
            VALUES (?, ?, ?, 0, NULL, ?)
        """, (word, translation, example, now_utc().isoformat()))

        card = db.execute("""
            SELECT id, word, translation, example,
                   interval_days, due_at, created_at
            FROM cards WHERE id = ?
        """, (cursor.lastrowid,)).fetchone()

    return jsonify(serialize_card(card)), 201


@app.route("/api/cards/<int:card_id>", methods=["PUT"])
def update_card(card_id):
    data = request.get_json(silent=True) or {}

    word = str(data.get("word", "")).strip()
    translation = str(data.get("translation", "")).strip()
    example = str(data.get("example", "")).strip()

    if not word or not translation:
        return jsonify({
            "error": "Palavra e tradução são obrigatórias."
        }), 400

    with get_db() as db:
        cursor = db.execute("""
            UPDATE cards
            SET word = ?, translation = ?, example = ?
            WHERE id = ?
        """, (word, translation, example, card_id))

        if cursor.rowcount == 0:
            return jsonify({"error": "Cartão não encontrado."}), 404

        card = db.execute("""
            SELECT id, word, translation, example,
                   interval_days, due_at, created_at
            FROM cards WHERE id = ?
        """, (card_id,)).fetchone()

    return jsonify(serialize_card(card))


@app.route("/api/cards/<int:card_id>", methods=["DELETE"])
def delete_card(card_id):
    with get_db() as db:
        cursor = db.execute(
            "DELETE FROM cards WHERE id = ?",
            (card_id,)
        )

        if cursor.rowcount == 0:
            return jsonify({"error": "Cartão não encontrado."}), 404

    return jsonify({"message": "Cartão excluído."})


@app.route("/api/cards/<int:card_id>/review", methods=["POST"])
def review_card(card_id):
    data = request.get_json(silent=True) or {}
    result = data.get("result")

    if result not in ("correct", "wrong"):
        return jsonify({
            "error": "O resultado deve ser correct ou wrong."
        }), 400

    now = now_utc()

    with get_db() as db:
        card = db.execute("""
            SELECT id, interval_days
            FROM cards
            WHERE id = ?
        """, (card_id,)).fetchone()

        if card is None:
            return jsonify({"error": "Cartão não encontrado."}), 404

        old_interval = card["interval_days"] or 0

        if result == "wrong":
            new_interval = 0
            due_at = now + timedelta(minutes=1)
        elif old_interval == 0:
            new_interval = 1
            due_at = now + timedelta(days=1)
        elif old_interval == 1:
            new_interval = 3
            due_at = now + timedelta(days=3)
        else:
            new_interval = old_interval * 2
            due_at = now + timedelta(days=new_interval)

        db.execute("""
            UPDATE cards
            SET interval_days = ?, due_at = ?
            WHERE id = ?
        """, (new_interval, due_at.isoformat(), card_id))

    return jsonify({
        "id": card_id,
        "interval_days": new_interval,
        "due_at": due_at.isoformat()
    })


@app.route("/api/export.csv", methods=["GET"])
def export_csv():
    output = io.StringIO(newline="")
    writer = csv.writer(output)

    writer.writerow(["word", "translation", "example"])

    with get_db() as db:
        cards = db.execute("""
            SELECT word, translation, example
            FROM cards ORDER BY id
        """).fetchall()

    for card in cards:
        writer.writerow([
            card["word"],
            card["translation"],
            card["example"]
        ])

    return Response(
        "\ufeff" + output.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition":
                "attachment; filename=mini-anki-cards.csv"
        }
    )


@app.route("/api/import.csv", methods=["POST"])
def import_csv():
    uploaded = request.files.get("file")

    if uploaded is None or not uploaded.filename:
        return jsonify({"error": "Selecione um arquivo CSV."}), 400

    try:
        content = uploaded.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(content))

        required = {"word", "translation"}
        headers = set(reader.fieldnames or [])

        if not required.issubset(headers):
            return jsonify({
                "error": "O CSV precisa ter as colunas word e translation."
            }), 400

        imported = 0

        with get_db() as db:
            for row in reader:
                word = (row.get("word") or "").strip()
                translation = (row.get("translation") or "").strip()
                example = (row.get("example") or "").strip()

                if not word or not translation:
                    continue

                db.execute("""
                    INSERT INTO cards
                        (word, translation, example,
                         interval_days, due_at, created_at)
                    VALUES (?, ?, ?, 0, NULL, ?)
                """, (
                    word,
                    translation,
                    example,
                    now_utc().isoformat()
                ))

                imported += 1

        return jsonify({
            "imported": imported,
            "message": f"{imported} cartão(ões) importado(s)."
        })

    except (UnicodeDecodeError, csv.Error):
        return jsonify({
            "error": "Não foi possível ler o CSV. Use UTF-8."
        }), 400


if __name__ == "__main__":
    init_db()
    app.run(debug=True)

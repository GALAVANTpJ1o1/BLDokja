import os
import re

from flask import Flask, flash, jsonify, render_template, request, redirect, url_for
import random
import sqlite3

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "letter-pair-trainer-dev-key")

DB_NAME = "letterpairs.db"
SPEFFZ_LETTERS = [chr(i) for i in range(ord("A"), ord("X") + 1)]
TOTAL_PAIRS = len(SPEFFZ_LETTERS) * (len(SPEFFZ_LETTERS) - 1)
WORD_MAX_LENGTH = 80
API_TOKEN = os.environ.get("API_TOKEN", "").strip()
ALLOWED_API_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_API_ORIGINS", "*").split(",")
    if origin.strip()
]
DEFAULT_MEMO_SETTINGS = {
    "corner_length": 8,
    "edge_length": 10,
    "letter_time_ms": 3000,
    "phase_time_ms": 5000,
}


def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def normalize_pair(value):
    return (value or "").strip().upper()


def normalize_word(value):
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def validate_pair(pair):
    if len(pair) != 2:
        return "Letter pair must contain exactly two letters."
    if pair[0] == pair[1]:
        return "Letter pair cannot use the same letter twice."
    if any(letter not in SPEFFZ_LETTERS for letter in pair):
        return "Letter pair must use letters A through X."
    return None


def validate_word(word):
    if not word:
        return "Word is required."
    if len(word) > WORD_MAX_LENGTH:
        return f"Word must be {WORD_MAX_LENGTH} characters or fewer."
    return None


def row_to_word(row):
    return {
        "id": row["id"],
        "pair": row["pair"],
        "word": row["word"],
        "count": row["count"],
    }


def get_words_for_pair(pair):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, pair, word, count
        FROM pair_words
        WHERE pair=?
        ORDER BY count DESC, word ASC
        """,
        (pair,),
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def save_pair_word(pair, word, increment_existing=True):
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT id, count
        FROM pair_words
        WHERE pair=? AND word=?
        """,
        (pair, word),
    )
    existing = cur.fetchone()

    if existing:
        if increment_existing:
            cur.execute(
                """
                UPDATE pair_words
                SET count=count+1
                WHERE id=?
                """,
                (existing["id"],),
            )
        word_id = existing["id"]
    else:
        cur.execute(
            """
            INSERT INTO pair_words(pair, word, count)
            VALUES (?, ?, 1)
            """,
            (pair, word),
        )
        word_id = cur.lastrowid

    conn.commit()
    cur.execute(
        """
        SELECT id, pair, word, count
        FROM pair_words
        WHERE id=?
        """,
        (word_id,),
    )
    saved = cur.fetchone()
    conn.close()
    return saved, existing is not None


def validate_pair_word_input(pair_value, word_value):
    pair = normalize_pair(pair_value)
    word = normalize_word(word_value)
    error = validate_pair(pair) or validate_word(word)
    return pair, word, error


def wants_json():
    return request.path.startswith("/api/")


def mutation_authorized():
    if not API_TOKEN:
        return True
    return request.headers.get("Authorization", "") == f"Bearer {API_TOKEN}"


@app.after_request
def add_api_headers(response):
    if request.path.startswith("/api/"):
        origin = request.headers.get("Origin")
        if "*" in ALLOWED_API_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = "*"
        elif origin in ALLOWED_API_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    return response


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS pair_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT NOT NULL,
        word TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        UNIQUE(pair, word)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS memo_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        difficulty TEXT NOT NULL,
        corners_expected TEXT NOT NULL,
        edges_expected TEXT NOT NULL,
        corners_answer TEXT NOT NULL,
        edges_answer TEXT NOT NULL,
        correct_letters INTEGER NOT NULL,
        total_letters INTEGER NOT NULL,
        accuracy REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """)

    for key, value in DEFAULT_MEMO_SETTINGS.items():
        cur.execute(
            "INSERT OR IGNORE INTO app_settings(key, value) VALUES (?, ?)",
            (key, str(value)),
        )

    conn.commit()
    conn.close()


def generate_pair():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT DISTINCT pair FROM pair_words")
    learned = {row[0] for row in cur.fetchall()}

    conn.close()

    all_pairs = []

    for a in SPEFFZ_LETTERS:
        for b in SPEFFZ_LETTERS:
            if a != b:
                all_pairs.append(a + b)

    unseen = [p for p in all_pairs if p not in learned]

    if unseen and random.random() < 0.7:
        return random.choice(unseen)

    return random.choice(all_pairs)


def clamp_int(value, default, minimum, maximum):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))


def seconds_to_ms(value, default_ms):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default_ms
    return int(round(number * 1000))


def get_memo_settings():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM app_settings")
    rows = {row["key"]: row["value"] for row in cur.fetchall()}
    conn.close()

    settings = {
        "corner_length": clamp_int(
            rows.get("corner_length"),
            DEFAULT_MEMO_SETTINGS["corner_length"],
            1,
            48,
        ),
        "edge_length": clamp_int(
            rows.get("edge_length"),
            DEFAULT_MEMO_SETTINGS["edge_length"],
            1,
            48,
        ),
        "letter_time_ms": clamp_int(
            rows.get("letter_time_ms"),
            DEFAULT_MEMO_SETTINGS["letter_time_ms"],
            250,
            10000,
        ),
        "phase_time_ms": clamp_int(
            rows.get("phase_time_ms"),
            DEFAULT_MEMO_SETTINGS["phase_time_ms"],
            0,
            30000,
        ),
    }

    settings["letter_time_seconds"] = round(settings["letter_time_ms"] / 1000, 2)
    settings["phase_time_seconds"] = round(settings["phase_time_ms"] / 1000, 2)
    return settings


def save_memo_settings(form):
    letter_time_ms = seconds_to_ms(
        form.get("letter_time_seconds"),
        DEFAULT_MEMO_SETTINGS["letter_time_ms"],
    )
    phase_time_ms = seconds_to_ms(
        form.get("phase_time_seconds"),
        DEFAULT_MEMO_SETTINGS["phase_time_ms"],
    )

    settings = {
        "corner_length": clamp_int(form.get("corner_length"), 8, 1, 48),
        "edge_length": clamp_int(form.get("edge_length"), 10, 1, 48),
        "letter_time_ms": clamp_int(letter_time_ms, 3000, 250, 10000),
        "phase_time_ms": clamp_int(phase_time_ms, 5000, 0, 30000),
    }

    conn = get_db()
    cur = conn.cursor()
    for key, value in settings.items():
        cur.execute(
            """
            INSERT OR REPLACE INTO app_settings(key, value)
            VALUES (?, ?)
            """,
            (key, str(value)),
        )
    conn.commit()
    conn.close()

    return settings


def generate_realistic_memo_sequence(length):
    sequence = []
    unused = SPEFFZ_LETTERS[:]
    random.shuffle(unused)

    while len(sequence) < length:
        if not unused:
            unused = SPEFFZ_LETTERS[:]
            random.shuffle(unused)

        remaining_length = length - len(sequence)
        cycle_length = min(random.randint(2, 5), remaining_length, len(unused))

        if cycle_length <= 0:
            break

        for _ in range(cycle_length):
            sequence.append(unused.pop())

    return "".join(sequence)


def normalize_memo_answer(value):
    return "".join(
        letter
        for letter in (value or "").upper()
        if "A" <= letter <= "X"
    )


def count_matching_letters(expected, answer):
    return sum(
        1
        for index, letter in enumerate(expected)
        if index < len(answer) and answer[index] == letter 
    )


def chunk_pairs(sequence):
    return [sequence[index:index + 2] for index in range(0, len(sequence), 2)]


def get_top_words_for_pairs(pairs):
    clean_pairs = [pair for pair in pairs if len(pair) == 2]
    if not clean_pairs:
        return {}

    placeholders = ",".join("?" for _ in clean_pairs)
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT pair, word, count
        FROM pair_words
        WHERE pair IN ({placeholders})
        ORDER BY pair ASC, count DESC, word ASC
        """,
        clean_pairs,
    )

    top_words = {}
    for row in cur.fetchall():
        if row["pair"] not in top_words:
            top_words[row["pair"]] = row["word"]

    conn.close()
    return top_words


def fallback_pair_text(pair):
    return " ".join(pair)


def build_memo_review(sequence):
    pairs = chunk_pairs(sequence)
    top_words = get_top_words_for_pairs(pairs)
    tokens = []

    for pair in pairs:
        if len(pair) == 1:
            tokens.append(pair)
        else:
            tokens.append(top_words.get(pair, fallback_pair_text(pair)))

    return {
        "pairs": " ".join(pairs),
        "sentence": " ".join(tokens),
    }


def build_memo_round(settings):
    return {
        "settings": settings,
        "corners": generate_realistic_memo_sequence(settings["corner_length"]),
        "edges": generate_realistic_memo_sequence(settings["edge_length"]),
    }


def get_memo_stats():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            COUNT(*) AS attempts,
            COALESCE(SUM(correct_letters), 0) AS correct_letters,
            COALESCE(SUM(total_letters), 0) AS total_letters,
            COALESCE(MAX(accuracy), 0) AS best_accuracy
        FROM memo_attempts
    """)
    totals = cur.fetchone()

    cur.execute("""
        SELECT correct_letters, total_letters
        FROM memo_attempts
        ORDER BY id DESC
    """)
    recent = cur.fetchall()

    conn.close()

    streak = 0
    for row in recent:
        if row["correct_letters"] == row["total_letters"]:
            streak += 1
        else:
            break

    total_letters = totals["total_letters"]
    accuracy = (totals["correct_letters"] / total_letters * 100) if total_letters else 0

    return {
        "attempts": totals["attempts"],
        "accuracy": round(accuracy),
        "best_score": round(totals["best_accuracy"] * 100),
        "streak": streak,
    }


@app.route("/")
def index():
    pair = generate_pair()

    return render_template(
        "index.html",
        pair=pair,
        result=None,
        active_page="practice",
    )


@app.route("/submit", methods=["POST"])
def submit():
    pair, word, error = validate_pair_word_input(
        request.form.get("pair"),
        request.form.get("word"),
    )

    if error:
        flash(error, "error")
        return redirect(url_for("index"))

    save_pair_word(pair, word)
    words = get_words_for_pair(pair)
    top = words[0]

    next_pair = generate_pair()

    return render_template(
        "index.html",
        pair=next_pair,
        result={
            "entered": word,
            "pair": pair,
            "top_word": top["word"],
            "top_count": top["count"],
            "words": words,
        },
        active_page="practice",
    )


@app.route("/words/add", methods=["POST"])
def add_word():
    pair, word, error = validate_pair_word_input(
        request.form.get("pair"),
        request.form.get("word"),
    )
    redirect_to = request.form.get("next") or url_for("words")
    if not redirect_to.startswith("/") or redirect_to.startswith("//"):
        redirect_to = url_for("words")

    if error:
        flash(error, "error")
        return redirect(redirect_to)

    saved, existed = save_pair_word(pair, word)
    if existed:
        flash(f"Updated {pair} -> {word}. Uses: {saved['count']}.", "success")
    else:
        flash(f"Added {pair} -> {word}.", "success")

    return redirect(redirect_to)


@app.route("/browse")
def browse():
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT pair, word, count
        FROM pair_words
        ORDER BY pair, count DESC
        """
    )

    rows = cur.fetchall()
    data = {}

    for row in rows:
        pair = row["pair"]

        if pair not in data:
            data[pair] = {
                "word": row["word"],
                "count": row["count"],
            }

    learned_count = len(data)

    conn.close()

    return render_template(
        "browse.html",
        letters=SPEFFZ_LETTERS,
        data=data,
        learned_count=learned_count,
        total_pairs=TOTAL_PAIRS,
        active_page="browse",
    )


@app.route("/pair/<pair>")
def pair_detail(pair):
    clean_pair = normalize_pair(pair)

    pair_error = validate_pair(clean_pair)
    words = [] if pair_error else get_words_for_pair(clean_pair)

    return render_template(
        "pair.html",
        pair=clean_pair,
        words=words,
        pair_error=pair_error,
        active_page="browse",
    )


@app.route("/words")
def words():
    search = request.args.get("q", "").strip()

    conn = get_db()
    cur = conn.cursor()

    if search:
        like_search = f"%{search.lower()}%"
        cur.execute(
            """
            SELECT id, pair, word, count
            FROM pair_words
            WHERE lower(pair) LIKE ? OR lower(word) LIKE ?
            ORDER BY pair ASC, count DESC, word ASC
            """,
            (like_search, like_search),
        )
    else:
        cur.execute(
            """
            SELECT id, pair, word, count
            FROM pair_words
            ORDER BY pair ASC, count DESC, word ASC
            """
        )

    rows = cur.fetchall()
    conn.close()

    return render_template(
        "words.html",
        words=rows,
        search=search,
        active_page="words",
    )


@app.route("/words/<int:word_id>/delete", methods=["POST"])
def delete_word(word_id):
    redirect_to = request.form.get("next") or url_for("words")
    if not redirect_to.startswith("/") or redirect_to.startswith("//"):
        redirect_to = url_for("words")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM pair_words WHERE id=?", (word_id,))
    conn.commit()
    conn.close()

    return redirect(redirect_to)


@app.route("/api/pairs/random")
def api_random_pair():
    return jsonify({"pair": generate_pair()})


@app.route("/api/pairs/<pair>/words")
def api_pair_words(pair):
    clean_pair = normalize_pair(pair)
    error = validate_pair(clean_pair)
    if error:
        return jsonify({"error": error}), 400

    words = [row_to_word(row) for row in get_words_for_pair(clean_pair)]
    return jsonify(
        {
            "pair": clean_pair,
            "top_word": words[0] if words else None,
            "words": words,
        }
    )


@app.route("/api/words", methods=["GET", "POST"])
def api_words():
    if request.method == "GET":
        search = request.args.get("q", "").strip()
        conn = get_db()
        cur = conn.cursor()

        if search:
            like_search = f"%{search.lower()}%"
            cur.execute(
                """
                SELECT id, pair, word, count
                FROM pair_words
                WHERE lower(pair) LIKE ? OR lower(word) LIKE ?
                ORDER BY pair ASC, count DESC, word ASC
                """,
                (like_search, like_search),
            )
        else:
            cur.execute(
                """
                SELECT id, pair, word, count
                FROM pair_words
                ORDER BY pair ASC, count DESC, word ASC
                """
            )

        rows = [row_to_word(row) for row in cur.fetchall()]
        conn.close()
        return jsonify({"words": rows})

    if not mutation_authorized():
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    pair, word, error = validate_pair_word_input(
        payload.get("pair"),
        payload.get("word"),
    )
    if error:
        return jsonify({"error": error}), 400

    saved, existed = save_pair_word(pair, word)
    return jsonify({"word": row_to_word(saved), "existed": existed}), 200 if existed else 201


@app.route("/api/words/<int:word_id>", methods=["DELETE"])
def api_delete_word(word_id):
    if not mutation_authorized():
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM pair_words WHERE id=?", (word_id,))
    existing = cur.fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Word not found"}), 404

    cur.execute("DELETE FROM pair_words WHERE id=?", (word_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": True, "id": word_id})


@app.route("/memo")
def memo_practice():
    settings = get_memo_settings()

    return render_template(
        "memo.html",
        round_data=build_memo_round(settings),
        settings=settings,
        stats=get_memo_stats(),
        result=None,
        active_page="memo",
    )


@app.route("/memo/settings", methods=["POST"])
def memo_settings():
    save_memo_settings(request.form)
    return redirect(url_for("memo_practice"))


@app.route("/memo/score", methods=["POST"])
def memo_score():
    settings = get_memo_settings()
    corners_expected = normalize_memo_answer(request.form.get("corners_expected"))
    edges_expected = normalize_memo_answer(request.form.get("edges_expected"))
    corners_answer = normalize_memo_answer(request.form.get("corners_answer"))
    edges_answer = normalize_memo_answer(request.form.get("edges_answer"))

    edge_correct = count_matching_letters(edges_expected, edges_answer)
    corner_correct = count_matching_letters(corners_expected, corners_answer)
    total_letters = (
        max(len(edges_expected), len(edges_answer))
        + max(len(corners_expected), len(corners_answer))
    )
    correct_letters = edge_correct + corner_correct
    accuracy = correct_letters / total_letters if total_letters else 0

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO memo_attempts (
            difficulty,
            corners_expected,
            edges_expected,
            corners_answer,
            edges_answer,
            correct_letters,
            total_letters,
            accuracy
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "custom",
            corners_expected,
            edges_expected,
            corners_answer,
            edges_answer,
            correct_letters,
            total_letters,
            accuracy,
        ),
    )
    conn.commit()
    conn.close()

    result = {
        "edges": {
            "expected": edges_expected,
            "answer": edges_answer,
            "correct": edges_expected == edges_answer,
            "review": build_memo_review(edges_expected),
        },
        "corners": {
            "expected": corners_expected,
            "answer": corners_answer,
            "correct": corners_expected == corners_answer,
            "review": build_memo_review(corners_expected),
        },
        "correct_letters": correct_letters,
        "total_letters": total_letters,
        "percent": round(accuracy * 100),
    }

    return render_template(
        "memo.html",
        round_data=build_memo_round(settings),
        settings=settings,
        stats=get_memo_stats(),
        result=result,
        active_page="memo",
    )


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

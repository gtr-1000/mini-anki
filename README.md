# 🃏 Mini Anki

**Mini Anki** is a lightweight, simplified web application for language learning and studying using the **Spaced Repetition** method. It allows you to create, review, edit, and delete flashcards, as well as export and import your study decks via CSV files.

---

## 🚀 Features

* **Flashcard Management (CRUD):** Easily create, list, edit, and delete flashcards with custom words, translations, and example sentences.
* **Smart Review System:** A built-in spaced repetition algorithm that calculates the next review interval based on your performance ("Correct" or "Wrong").
* **Due Date Filtering:** An integrated filter to show only flashcards that are due or overdue for review at the current moment.
* **CSV Import & Export:** Back up your decks by downloading a `.csv` file or upload pre-made vocabulary lists instantly.
* **Automated Database Setup:** Powered by SQLite. The application automatically creates the database file and applies necessary table updates/migrations upon startup.

---

## 🧠 Spaced Repetition Algorithm

The system automatically schedules card intervals based on your learning streak:

* **Wrong Answer:** The interval resets to `0` and the card is scheduled to reappear in **1 minute**.
* **First Correct Answer:** The interval is set to **1 day**.
* **Second Consecutive Correct Answer:** The interval increases to **3 days**.
* **Subsequent Streaks:** The current interval **doubles** in size (e.g., 3 days -> 6 days -> 12 days...).

---

## 🛠️ Technologies Used

* **Python 3**
* **Flask** (Web Framework)
* **SQLite3** (Lightweight Relational Database)
* **HTML5 / CSS3 / JavaScript** (Front-end UI)

---

## 📦 Installation & Setup Guide

Follow these steps to set up and run Mini Anki locally on your machine:

### 1. Clone the Repository
Download the project files or use the Git CLI to clone it:
```bash
git clone https://github.com
cd YOUR_REPOSITORY_NAME
```

### 2. Create and Activate a Virtual Environment (venv)
In your terminal, navigate to the project root directory and create the venv:
```bash
# On Windows:
python -m venv venv
venv\Scripts\activate

# On Linux/Mac:
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
With the virtual environment activated, install the required packages:
```bash
pip install -r requirements.txt
```

### 4. Launch the Application
Run the main script to start the local Flask development server:
```bash
python main.py
```

Once executed, the database file `mini_anki.db` will automatically be generated in the root directory. Open your browser and navigate to:
👉 **`http://127.0.0.1:5000`**

---

## 📄 CSV Template for Import

If you want to import flashcards in bulk, make sure your `.csv` file includes the exact headers below (separated by commas):

```csv
word,translation,example
Apple,Maçã,I love to eat apple pies.
Book,Livro,She is reading a good book.
```

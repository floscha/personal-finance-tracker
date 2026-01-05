from pathlib import Path
import json
import hashlib
import csv
import os

import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates


app = FastAPI(title="Personal Finance")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Setup templates
templates = Jinja2Templates(directory="templates")


def get_data_dir() -> Path:
    """Resolve the data directory from environment variables or default to current directory."""
    return Path(os.getenv("PERSONAL_FINANCE_DATA_DIR") or "./example_data")


def load_settings() -> dict:
    """Load settings.json from the data directory if present and return as dict."""
    settings_file = get_data_dir() / "settings.json"
    if settings_file.exists():
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            # If malformed, return empty dict and let caller handle validation
            return {}
    return {}


def get_transactions_file() -> Path:
    """Return the Path to the transactions CSV from env or data dir (optional default for backward compatibility)."""
    return get_data_dir() / "transactions.csv"


def get_annotations_file() -> Path:
    """Return the Path to the annotations CSV inside the data directory (or explicit path via ANNOTATIONS_FILE)."""
    return get_data_dir() / "transaction_annotations.csv"


def create_transaction_hash(row: pd.Series) -> str:
    """Create a unique hash for a transaction row."""
    # Concatenate all row values to create a unique string
    row_string = '|'.join(str(val) for val in row.values)
    # Create SHA256 hash
    return hashlib.sha256(row_string.encode('utf-8')).hexdigest()


def load_transactions(csv_file: str) -> pd.DataFrame:
    """
    Load transactions from CSV file.

    Args:
        csv_file: Path to the CSV file

    Returns:
        DataFrame with transaction data
    """
    # Read CSV file (semicolon-separated)
    df = pd.read_csv(csv_file, sep=';', encoding='utf-8', dtype=str)

    # Apply column aliases from settings.json if provided. The settings file
    # should live in the same directory as the CSV files (data dir) and may
    # contain an "column_aliases" mapping of original_column -> alias_column.
    settings = load_settings()
    aliases = settings.get("column_aliases") if isinstance(settings, dict) else None
    if aliases and isinstance(aliases, dict):
        # Only rename columns that are present in the dataframe
        rename_map = {orig: alias for orig, alias in aliases.items() if orig in df.columns}
        if rename_map:
            df = df.rename(columns=rename_map)

    # Ensure expected columns exist; create optional ones if missing
    expected_columns = ['date', 'amount', 'payer', 'payee', 'purpose']
    for col in expected_columns:
        if col not in df.columns:
            # create missing optional columns as empty strings; required ones will be validated below
            df[col] = ''

    # Validate required columns
    required_columns = ['date', 'amount']
    missing_columns = [col for col in required_columns if col not in df.columns or df[col].isnull().all()]
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}")

    # Parse date column (dayfirst)
    df['date'] = pd.to_datetime(df['date'], dayfirst=True, errors='coerce')

    # Convert German-formatted amount strings to float
    # German format: thousands '.' and decimal ','
    def parse_german_amount(s):
        if pd.isna(s) or s == '':
            return 0.0
        if isinstance(s, (int, float)):
            return float(s)
        # remove dots used as thousands separator, replace comma with dot for decimal
        # handle possible leading minus sign
        try:
            s_clean = s.strip()
            # keep a leading '-' if present
            negative = s_clean.startswith('-')
            if negative:
                s_clean = s_clean[1:]
            s_clean = s_clean.replace('.', '').replace(',', '.')
            val = float(s_clean)
            return -val if negative else val
        except Exception:
            # fallback
            return float(s.replace(',', '.').replace('.', '')) if isinstance(s, str) else float(s)

    df['amount'] = df['amount'].apply(parse_german_amount)

    # Ensure payer/payee/purpose are strings and fill NaN with empty string
    for col in ['payer', 'payee', 'purpose']:
        df[col] = df[col].fillna('').astype(str)

    return df


def load_annotations() -> dict:
    """Load category and comment annotations from CSV file."""
    annotations = {}
    annotations_file = get_annotations_file()
    if annotations_file.exists():
        with open(annotations_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                annotations[row['transaction_hash']] = {
                    'category': row.get('category', ''),
                    'comment': row.get('comment', '')
                }
    return annotations


def save_annotation(transaction_hash: str, category: str = None, comment: str = None):
    """Save or update a category and/or comment annotation."""
    annotations = load_annotations()
    
    # Get existing annotation or create new one
    if transaction_hash not in annotations:
        annotations[transaction_hash] = {'category': '', 'comment': ''}
    
    # Update only provided fields
    if category is not None:
        annotations[transaction_hash]['category'] = category
    if comment is not None:
        annotations[transaction_hash]['comment'] = comment
    
    # Write all annotations back to CSV file
    annotations_file = get_annotations_file()
    annotations_file.parent.mkdir(parents=True, exist_ok=True)
    with open(annotations_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['transaction_hash', 'category', 'comment'])
        for hash_val, data in annotations.items():
            writer.writerow([hash_val, data['category'], data['comment']])


def get_monthly_summary(df: pd.DataFrame) -> pd.DataFrame:
    """Calculate monthly income and expenses summary."""
    # Add Year-Month column for grouping
    df['YearMonth'] = df['date'].dt.to_period('M')
    
    # Calculate income (amounts > 0) and expenses (amounts < 0) per month
    monthly_summary = df.groupby('YearMonth').apply(
        lambda x: pd.Series({
            'Income': x[x['amount'] > 0]['amount'].sum(),
            'Expenses': x[x['amount'] < 0]['amount'].sum(),
            'Net': x['amount'].sum()
        }),
        include_groups=False
    ).reset_index()
    
    # Sort chronologically
    monthly_summary = monthly_summary.sort_values('YearMonth')
    
    return monthly_summary


def prepare_chart_data(monthly_summary: pd.DataFrame) -> str:
    """Prepare data for D3.js chart as JSON."""
    # Convert Period to string for JSON serialization
    monthly_summary['MonthStr'] = monthly_summary['YearMonth'].astype(str)
    
    # Prepare data structure for D3
    chart_data = []
    for _, row in monthly_summary.iterrows():
        chart_data.append({
            'month': row['MonthStr'],
            'income': float(row['Income']),
            'expenses': float(row['Expenses']),  # Keep as negative values
            'net': float(row['Net'])
        })
    
    return json.dumps(chart_data)


def prepare_transaction_details(df: pd.DataFrame) -> str:
    """Prepare transaction details grouped by month for JSON."""
    # Add Year-Month column for grouping
    df['YearMonth'] = df['date'].dt.to_period('M').astype(str)
    
    # Load existing annotations
    annotations = load_annotations()
    
    # Group transactions by month and type
    transaction_details = {}
    
    for month in df['YearMonth'].unique():
        month_data = df[df['YearMonth'] == month]
        
        # Get income transactions
        income_transactions = month_data[month_data['amount'] > 0].copy()
        income_list = []
        for _, row in income_transactions.iterrows():
            tx_hash = create_transaction_hash(row)
            annotation = annotations.get(tx_hash, {'category': '', 'comment': ''})
            income_list.append({
                'hash': tx_hash,
                'date': row['date'].strftime('%m-%d'),
                'amount': float(row['amount']),
                'payer': str(row.get('payer', '')) if 'payer' in row else '',
                'purpose': str(row.get('purpose', '')) if 'purpose' in row else '',
                'category': annotation['category'],
                'comment': annotation['comment']
            })
        
        # Get expense transactions
        expense_transactions = month_data[month_data['amount'] < 0].copy()
        expense_list = []
        for _, row in expense_transactions.iterrows():
            tx_hash = create_transaction_hash(row)
            annotation = annotations.get(tx_hash, {'category': '', 'comment': ''})
            expense_list.append({
                'hash': tx_hash,
                'date': row['date'].strftime('%m-%d'),
                'amount': float(row['amount']),
                'payee': str(row.get('payee', '')) if 'payee' in row else '',
                'purpose': str(row.get('purpose', '')) if 'purpose' in row else '',
                'category': annotation['category'],
                'comment': annotation['comment']
            })
        
        transaction_details[month] = {
            'income': income_list,
            'expenses': expense_list
        }
    
    return json.dumps(transaction_details)


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Main page showing the monthly aggregates chart."""
    try:
        # Resolve transactions file from environment or data directory
        csv_file = get_transactions_file()
        
        if not Path(csv_file).exists():
            raise HTTPException(
                status_code=404, 
                detail=f"CSV file '{csv_file}' not found"
            )
        
        df = load_transactions(csv_file)
        monthly_summary = get_monthly_summary(df)
        chart_data = prepare_chart_data(monthly_summary)
        transaction_details = prepare_transaction_details(df)
        
        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "chart_data": chart_data,
                "transaction_details": transaction_details
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing data: {str(e)}")


@app.get("/api/summary")
async def get_summary():
    """API endpoint to get monthly summary as JSON."""
    try:
        # Resolve transactions file from environment or data directory
        csv_file = get_transactions_file()
        
        if not Path(csv_file).exists():
            raise HTTPException(
                status_code=404, 
                detail=f"CSV file '{csv_file}' not found"
            )
        
        df = load_transactions(csv_file)
        monthly_summary = get_monthly_summary(df)
        
        # Convert to JSON-serializable format
        result = {
            "total_transactions": len(df),
            "date_range": {
                "start": str(monthly_summary['YearMonth'].min()),
                "end": str(monthly_summary['YearMonth'].max())
            },
            "totals": {
                "income": float(monthly_summary['Income'].sum()),
                "expenses": float(monthly_summary['Expenses'].sum()),
                "net": float(monthly_summary['Net'].sum())
            },
            "monthly_data": [
                {
                    "month": str(row['YearMonth']),
                    "income": float(row['Income']),
                    "expenses": float(row['Expenses']),
                    "net": float(row['Net'])
                }
                for _, row in monthly_summary.iterrows()
            ]
        }
        
        return result
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing data: {str(e)}")


@app.post("/api/category")
async def set_category(request: Request):
    """API endpoint to save a category for a transaction."""
    try:
        data = await request.json()
        transaction_hash = data.get('hash')
        category = data.get('category')
        
        if not transaction_hash or not category:
            raise HTTPException(status_code=400, detail="Missing hash or category")
        
        save_annotation(transaction_hash, category=category)
        
        return {"status": "success", "hash": transaction_hash, "category": category}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving category: {str(e)}")


@app.post("/api/comment")
async def set_comment(request: Request):
    """API endpoint to save a comment for a transaction."""
    try:
        data = await request.json()
        transaction_hash = data.get('hash')
        comment = data.get('comment')
        
        if not transaction_hash:
            raise HTTPException(status_code=400, detail="Missing hash")
        
        save_annotation(transaction_hash, comment=comment)
        
        return {"status": "success", "hash": transaction_hash, "comment": comment}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving comment: {str(e)}")

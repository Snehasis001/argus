import nbformat as nbf
import os

nb = nbf.v4.new_notebook()

# Cell 1: Markdown title & introduction
cell1_md = """# Argus: Data Cleaning & Preprocessing Pipeline
This notebook implements the complete data ingestion and cleaning pipeline for the **IBM Transactions for Anti-Money Laundering (AML)** dataset (`HI-Small_Trans.csv`).

### Objectives:
1. **Load Raw Data & Deduplicate**: Ingest the raw transactions and eliminate duplicate rows.
2. **Date & Time Standardization**: Parse transaction timestamps into real datetime objects.
3. **Scoping Subset**: Filter down to a high-signal subgraph (Bank 119) yielding ~30,000 transactions and ~3,800 accounts with 129 ground-truth laundering cases.
4. **Static FX Normalization**: Standardize multi-currency amounts to USD using a fixed FX rate matrix.
5. **Bridge the Narration-Text Gap**: Synthesize realistic free-text payment narrations (weighted templates: explicit business terms for legitimate payments vs. evasive, vague phrasing for laundering transactions).
6. **Feature Engineering for Accounts**: Derive `accounts.csv` with unique composite IDs, running balance estimates, account age, and activity metrics.
7. **Export Seed Data**: Save clean `transactions.csv` and `accounts.csv` into `data/seed/`.
"""

# Cell 2: Imports & Configuration
cell2_code = """import os
import random
import numpy as np
import pandas as pd

# Set random seed for full determinism and reproducibility
np.random.seed(42)
random.seed(42)

RAW_CSV_PATH = os.path.join("..", "data", "raw", "HI-Small_Trans.csv") if os.path.exists(os.path.join("..", "data", "raw", "HI-Small_Trans.csv")) else os.path.join("data", "raw", "HI-Small_Trans.csv")
SEED_DIR = os.path.join("data", "seed") if os.path.exists("data") else os.path.join("..", "data", "seed")
os.makedirs(SEED_DIR, exist_ok=True)

OUTPUT_TRANSACTIONS_CSV = os.path.join(SEED_DIR, "transactions.csv")
OUTPUT_ACCOUNTS_CSV = os.path.join(SEED_DIR, "accounts.csv")

print(f"Raw data path: {RAW_CSV_PATH}")
print(f"Seed output dir: {SEED_DIR}")
"""

# Cell 3: Markdown for Step 1-3
cell3_md = """## 1. Load Data, Deduplicate, and Scope to Target Subgraph
The full `HI-Small` dataset contains over 5 million transactions. Loading and visualizing millions of transactions inside a development environment or local MongoDB creates needless memory strain without adding pedagogical value.

As a **deliberate scoping decision**, we isolate transactions involving **Bank 119**. This creates a self-contained, interconnected network of **~3,790 accounts** and **~29,890 transactions** while capturing **129 verified ground-truth laundering transactions** featuring key topology patterns (fan-in, fan-out, cycles).
"""

# Cell 4: Code for Loading & Scoping
cell4_code = """TARGET_BANK = 119
chunks = []
chunksize = 500000

print(f"Reading raw data and filtering for Bank {TARGET_BANK}...")
for chunk in pd.read_csv(RAW_CSV_PATH, chunksize=chunksize):
    mask = (chunk['From Bank'] == TARGET_BANK) | (chunk['To Bank'] == TARGET_BANK)
    if mask.any():
        chunks.append(chunk[mask])

df = pd.concat(chunks, ignore_index=True)
print(f"Initial row count: {len(df):,}")

# Drop exact duplicate rows
initial_len = len(df)
df = df.drop_duplicates()
print(f"Dropped {initial_len - len(df)} duplicate rows. Retained: {len(df):,}")

# Parse timestamp into a real datetime column and order chronologically
df['Timestamp'] = pd.to_datetime(df['Timestamp'], format='%Y/%m/%d %H:%M')
df = df.sort_values('Timestamp').reset_index(drop=True)
print(f"Date range: {df['Timestamp'].min()} to {df['Timestamp'].max()}")
"""

# Cell 5: Markdown for Step 4 & 5
cell5_md = """## 2. Currency Normalization & Synthetic Narration Generation

### A. Static FX Conversion
Instead of complicating the prototype with live external FX APIs, we employ a static conversion table reflecting typical exchange rates during the September 2022 dataset timeframe:
- 1 EUR = $1.08 USD
- 1 GBP = $1.25 USD
- 1 BTC = $20,000 USD, etc.

### B. The Narration-Text Gap
The IBM synthetic dataset is strictly tabular. Real-world financial intelligence investigations rely heavily on transaction memos/narrations. We synthesize narrations using weighted template pools:
- **Legitimate Pool**: Explicit notes with vendor names, invoice IDs, salary distributions, and rent payments.
- **Laundering Pool**: Vague, evasive, or informal notes (e.g., *"Payment as discussed"*, *"Consulting fee"*, *"Urgent settlement"*, *"Misc"*).
"""

# Cell 6: Code for FX and Narrations
cell6_code = """# 1. Fixed static FX conversion rates to USD
STATIC_FX_TO_USD = {
    'US Dollar': 1.00,
    'Euro': 1.08,
    'UK Pound': 1.25,
    'Swiss Franc': 1.10,
    'Canadian Dollar': 0.74,
    'Australian Dollar': 0.65,
    'Yen': 0.0067,
    'Yuan': 0.14,
    'Rupee': 0.012,
    'Shekel': 0.27,
    'Brazil Real': 0.20,
    'Mexican Peso': 0.059,
    'Saudi Riyal': 0.27,
    'Ruble': 0.011,
    'Bitcoin': 20000.00
}

# 2. Template pools
LEGIT_TEMPLATES = [
    "Salary payment - {month}",
    "Invoice #{inv_num} payment",
    "Rent transfer - {month}",
    "Utility bill payment",
    "Vendor settlement: {vendor}",
    "Client payment for services rendered",
    "Monthly payroll distribution",
    "Office supplies reimbursement",
    "Cloud infrastructure hosting fee",
    "Software subscription license renewal",
    "Health insurance group premium",
    "Quarterly corporate tax remittance",
    "Commercial equipment lease payment",
    "Groceries and household essentials",
    "School tuition installment",
    "Quarterly dividend distribution",
    "Logistics and shipping charges",
    "Legal and compliance advisory fee",
    "Marketing campaign retainer - {month}",
    "Hardware procurement - order #{inv_num}"
]

LAUNDERING_TEMPLATES = [
    "Payment as discussed",
    "Consulting fee",
    "Gift transfer",
    "Misc",
    "Urgent settlement",
    "Personal loan return",
    "Settlement per agreement",
    "Services",
    "Funds transfer",
    "Private agreement fee",
    "Discretionary payout",
    "Advance payment",
    "Project expense reimbursement",
    "Advisory settlement",
    "Transfer",
    "Special consulting retainer",
    "Balance reconciliation",
    "Intermediary fee",
    "Per mutual understanding",
    "Direct disbursement"
]

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
VENDORS = ["Apex Logistics", "Omega Tech", "Vertex Supplies", "Global Fleet", "Summit Media", "Delta Services", "BlueSky Corp"]

def generate_narration(is_laundering):
    if is_laundering == 1:
        return random.choice(LAUNDERING_TEMPLATES)
    else:
        template = random.choice(LEGIT_TEMPLATES)
        return template.format(month=random.choice(MONTHS), inv_num=random.randint(1000, 9999), vendor=random.choice(VENDORS))

# Construct composite account keys (Node identifiers)
df['from_account_id'] = df['From Bank'].astype(str) + "_" + df['Account'].astype(str)
df['to_account_id'] = df['To Bank'].astype(str) + "_" + df['Account.1'].astype(str)

# Calculate USD equivalents
df['amount_paid_usd'] = df.apply(
    lambda r: round(r['Amount Paid'] * STATIC_FX_TO_USD.get(r['Payment Currency'], 1.0), 2), axis=1
)
df['amount_received_usd'] = df.apply(
    lambda r: round(r['Amount Received'] * STATIC_FX_TO_USD.get(r['Receiving Currency'], 1.0), 2), axis=1
)
df['amount_usd'] = df['amount_paid_usd']

# Synthesize narrations
df['narration'] = [generate_narration(val) for val in df['Is Laundering']]
df['transaction_id'] = [f"TX_{i+1:06d}" for i in range(len(df))]

# Format final transactions dataframe
transactions_df = df[[
    'transaction_id',
    'Timestamp',
    'from_account_id',
    'to_account_id',
    'From Bank',
    'To Bank',
    'Amount Paid',
    'Payment Currency',
    'Amount Received',
    'Receiving Currency',
    'amount_usd',
    'Payment Format',
    'Is Laundering',
    'narration'
]].rename(columns={
    'Timestamp': 'timestamp',
    'From Bank': 'from_bank',
    'To Bank': 'to_bank',
    'Amount Paid': 'amount_paid_orig',
    'Payment Currency': 'payment_currency',
    'Amount Received': 'amount_received_orig',
    'Receiving Currency': 'receiving_currency',
    'Payment Format': 'payment_format',
    'Is Laundering': 'is_laundering'
})

print(f"Transactions sample preview:")
print(transactions_df[['transaction_id', 'amount_usd', 'payment_format', 'is_laundering', 'narration']].head())
"""

# Cell 7: Markdown for Step 6: Accounts
cell7_md = """## 3. Account Aggregation & Feature Engineering (`accounts.csv`)
Graph nodes represent unique accounts. We compute:
- First and last transaction timestamps
- Account age in days
- Running balance estimates (grounded by baseline operating reserves + net inflow/outflow)
- In/Out transaction volumes and velocity
- Historical flag indicating whether the account participated in a labeled laundering event
"""

# Cell 8: Code for Accounts
cell8_code = """from_accs = transactions_df[['from_account_id', 'from_bank', 'timestamp', 'amount_usd', 'is_laundering']].copy()
from_accs.columns = ['account_id', 'bank_id', 'timestamp', 'amount_usd', 'is_laundering']
from_accs['direction'] = 'sent'

to_accs = transactions_df[['to_account_id', 'to_bank', 'timestamp', 'amount_usd', 'is_laundering']].copy()
to_accs.columns = ['account_id', 'bank_id', 'timestamp', 'amount_usd', 'is_laundering']
to_accs['direction'] = 'received'

combined = pd.concat([from_accs, to_accs], ignore_index=True)
account_groups = combined.groupby('account_id')

acc_stats = []
reference_end_time = transactions_df['timestamp'].max()

for acc_id, group in account_groups:
    bank_id = group['bank_id'].iloc[0]
    first_seen = group['timestamp'].min()
    last_seen = group['timestamp'].max()
    
    sent_rows = group[group['direction'] == 'sent']
    recv_rows = group[group['direction'] == 'received']
    
    total_sent = round(sent_rows['amount_usd'].sum(), 2)
    total_recv = round(recv_rows['amount_usd'].sum(), 2)
    sent_count = len(sent_rows)
    recv_count = len(recv_rows)
    
    account_age_days = max(1, round((reference_end_time - first_seen).total_seconds() / 86400, 2))
    net_flow = total_recv - total_sent
    baseline_capital = max(1000.0, round(total_sent * 1.2, 2))
    running_balance = round(baseline_capital + net_flow, 2)
    is_illicit_touch = int((group['is_laundering'] == 1).any())
    
    acc_stats.append({
        'account_id': acc_id,
        'bank_id': bank_id,
        'first_seen': first_seen,
        'last_seen': last_seen,
        'account_age_days': account_age_days,
        'running_balance_estimate': running_balance,
        'total_sent_usd': total_sent,
        'total_received_usd': total_recv,
        'sent_tx_count': sent_count,
        'received_tx_count': recv_count,
        'total_tx_count': sent_count + recv_count,
        'is_laundering_involved': is_illicit_touch
    })

accounts_df = pd.DataFrame(acc_stats).sort_values('total_tx_count', ascending=False).reset_index(drop=True)
print(f"Accounts preview:")
print(accounts_df.head())
"""

# Cell 9: Markdown for Step 7: Export
cell9_md = """## 4. Exporting Seed Data
Write the final structured tables to `data/seed/` ready for MongoDB seeding and ML model training.
"""

# Cell 10: Code for Export
cell10_code = """transactions_df.to_csv(OUTPUT_TRANSACTIONS_CSV, index=False)
accounts_df.to_csv(OUTPUT_ACCOUNTS_CSV, index=False)

print(f"Export Complete!")
print(f"Transactions: {OUTPUT_TRANSACTIONS_CSV} ({len(transactions_df):,} records, {transactions_df['is_laundering'].sum():,} illicit)")
print(f"Accounts:     {OUTPUT_ACCOUNTS_CSV} ({len(accounts_df):,} unique accounts, {accounts_df['is_laundering_involved'].sum():,} flagged)")
"""

nb.cells = [
    nbf.v4.new_markdown_cell(cell1_md),
    nbf.v4.new_code_cell(cell2_code),
    nbf.v4.new_markdown_cell(cell3_md),
    nbf.v4.new_code_cell(cell4_code),
    nbf.v4.new_markdown_cell(cell5_md),
    nbf.v4.new_code_cell(cell6_code),
    nbf.v4.new_markdown_cell(cell7_md),
    nbf.v4.new_code_cell(cell8_code),
    nbf.v4.new_markdown_cell(cell9_md),
    nbf.v4.new_code_cell(cell10_code)
]

notebook_path = os.path.join("data", "data_cleaning.ipynb")
with open(notebook_path, "w", encoding="utf-8") as f:
    nbf.write(nb, f)

print(f"Jupyter Notebook successfully written to {notebook_path}")
